"""The one graph shape allowed to cross the API boundary (CONTRACT.md §5).

`GraphPayload` and its `from_neo4j_records()` constructor are the only place
where a raw Neo4j record is turned into something the rest of the system may
touch. Embeddings are stripped here, unconditionally, before anything else
happens to the data — the frontend, the LLM and the API layer must never see
a 3072-float vector.

This module does not import the `neo4j` package. It only relies on the
*shape* of Neo4j's graph types (a Node behaves like a read-only mapping of
properties plus `.labels`; a Relationship adds `.type`/`.start_node`/
`.end_node`; a Path adds `.nodes`/`.relationships`) via structural `Protocol`s,
so it stays a framework-free domain module while remaining able to consume
real driver objects handed to it by `infrastructure/neo4j`.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any, Protocol, cast, runtime_checkable

from pydantic import BaseModel, ConfigDict

from operation_nexus.domain.graph.schema import EMBEDDING_PROPERTY


class GraphNode(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str
    labels: list[str]
    properties: dict[str, Any]
    label_display: str


class GraphRelationship(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str
    type: str
    start_id: str
    end_id: str
    properties: dict[str, Any]


class GraphPayload(BaseModel):
    """The ONLY graph shape crossing the API boundary. Maps 1:1 to what the
    frontend feeds into NVL."""

    nodes: list[GraphNode] = []
    relationships: list[GraphRelationship] = []

    @classmethod
    def empty(cls) -> GraphPayload:
        return cls(nodes=[], relationships=[])

    @classmethod
    def from_neo4j_records(cls, records: Iterable[Any]) -> GraphPayload:
        """Flatten an iterable of Neo4j records (or bare Nodes/Relationships/
        Paths, or lists thereof) into a de-duplicated GraphPayload.

        Nodes and relationships are de-duplicated by their own `id` property
        (not Neo4j's internal element id). `embedding` is stripped from every
        property dict, unconditionally — this is the one function in the
        codebase that is allowed to see it.
        """
        nodes: dict[str, GraphNode] = {}
        relationships: dict[str, GraphRelationship] = {}

        for record in records:
            for value in _record_values(record):
                _collect(value, nodes, relationships)

        return cls(nodes=list(nodes.values()), relationships=list(relationships.values()))


def _record_values(record: Any) -> Iterable[Any]:
    """A neo4j `Record` supports `.values()`; fall back to treating the record
    itself as a single value (useful in tests, where a plain list is passed)."""
    values = getattr(record, "values", None)
    if callable(values):
        return list(cast(Iterable[Any], values()))
    return [record]


@runtime_checkable
class _EntityLike(Protocol):
    def items(self) -> Iterable[tuple[str, Any]]: ...


@runtime_checkable
class _NodeLike(_EntityLike, Protocol):
    labels: Any  # frozenset[str]-like


@runtime_checkable
class _RelationshipLike(_EntityLike, Protocol):
    type: str
    start_node: _NodeLike
    end_node: _NodeLike


@runtime_checkable
class _PathLike(Protocol):
    nodes: Iterable[_NodeLike]
    relationships: Iterable[_RelationshipLike]


def _jsonable(value: Any) -> Any:
    """Coerce driver-native values into something Pydantic can serialize.

    The Neo4j driver returns its own temporal and spatial types
    (`neo4j.time.DateTime`, `Date`, `Time`, `Duration`, `spatial.Point`).
    They reach us inside node/relationship properties and would blow up at
    response-serialization time — after the query already succeeded, which
    makes it look like a graph failure rather than a marshalling one. Anything
    exposing `to_native()` is converted; ISO strings are emitted for temporals.
    """
    to_native = getattr(value, "to_native", None)
    if callable(to_native):
        native: Any = to_native()
        isoformat = getattr(native, "isoformat", None)
        return isoformat() if callable(isoformat) else native
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    if isinstance(value, Mapping):
        return {key: _jsonable(item) for key, item in value.items()}
    return value


def _strip_embedding(properties: Mapping[str, Any]) -> dict[str, Any]:
    return {key: _jsonable(value) for key, value in properties.items() if key != EMBEDDING_PROPERTY}


def _collect(
    value: Any,
    nodes: dict[str, GraphNode],
    relationships: dict[str, GraphRelationship],
) -> None:
    if value is None:
        return

    if isinstance(value, list | tuple | set | frozenset):
        for item in value:
            _collect(item, nodes, relationships)
        return

    # Order matters: check Path before Node/Relationship since a Path has
    # neither `.items()` nor `.labels`/`.type`, so this is unambiguous.
    if isinstance(value, _PathLike) and not isinstance(value, _EntityLike):
        for node in value.nodes:
            _collect(node, nodes, relationships)
        for rel in value.relationships:
            _collect(rel, nodes, relationships)
        return

    if isinstance(value, _RelationshipLike) and not isinstance(value, _NodeLike):
        _collect_relationship(value, nodes, relationships)
        return

    if isinstance(value, _NodeLike):
        _collect_node(value, nodes)
        return

    if isinstance(value, Mapping):
        # Already a plain dict — either a pre-shaped node/relationship (as used
        # by unit tests that don't want to build real neo4j.graph objects) or
        # an opaque scalar map we have no business interpreting further.
        if "labels" in value and "id" in value:
            properties = {k: v for k, v in value.items() if k not in ("labels",)}
            _store_node(properties, list(value["labels"]), nodes)
        elif "type" in value and "start_id" in value and "end_id" in value:
            rel_id = str(value["id"])
            relationships[rel_id] = GraphRelationship(
                id=rel_id,
                type=str(value["type"]),
                start_id=str(value["start_id"]),
                end_id=str(value["end_id"]),
                properties=_strip_embedding(value.get("properties", {})),
            )
        return


def _collect_node(node: _NodeLike, nodes: dict[str, GraphNode]) -> None:
    properties = dict(node.items())
    labels = [str(label) for label in node.labels]
    _store_node(properties, labels, nodes)


def _store_node(
    properties: Mapping[str, Any], labels: list[str], nodes: dict[str, GraphNode]
) -> None:
    node_id = str(properties["id"])
    sorted_labels = sorted(str(label) for label in labels)
    label_display = str(
        properties.get("label_display") or (sorted_labels[0] if sorted_labels else "")
    )
    nodes[node_id] = GraphNode(
        id=node_id,
        labels=sorted_labels,
        properties=_strip_embedding(properties),
        label_display=label_display,
    )


def _collect_relationship(
    rel: _RelationshipLike, nodes: dict[str, GraphNode], relationships: dict[str, GraphRelationship]
) -> None:
    properties = dict(rel.items())
    rel_id = str(properties["id"])
    _collect_node(rel.start_node, nodes)
    _collect_node(rel.end_node, nodes)
    relationships[rel_id] = GraphRelationship(
        id=rel_id,
        type=str(rel.type),
        start_id=str(dict(rel.start_node.items())["id"]),
        end_id=str(dict(rel.end_node.items())["id"]),
        properties=_strip_embedding(properties),
    )
