"""`GraphPayload` is the ONLY graph shape crossing the API boundary
(CONTRACT.md §5) and it must never leak `embedding`. These fakes mimic the
*shape* neo4j.graph.Node/Relationship expose (a Mapping of properties plus
`.labels`, or `.type`/`.start_node`/`.end_node`) without importing the neo4j
package — matching the structural Protocols in `payload.py`."""

from __future__ import annotations

from typing import Any

from operation_nexus.domain.graph.payload import GraphPayload


class FakeNode:
    def __init__(self, properties: dict[str, Any], labels: list[str]) -> None:
        self._properties = properties
        self.labels = labels

    def items(self) -> Any:
        return self._properties.items()


class FakeRelationship:
    def __init__(
        self,
        properties: dict[str, Any],
        rel_type: str,
        start_node: FakeNode,
        end_node: FakeNode,
    ) -> None:
        self._properties = properties
        self.type = rel_type
        self.start_node = start_node
        self.end_node = end_node

    def items(self) -> Any:
        return self._properties.items()


class FakeRecord:
    def __init__(self, values: list[Any]) -> None:
        self._values = values

    def values(self) -> list[Any]:
        return self._values


def test_embedding_never_leaks_into_graph_node_properties() -> None:
    node = FakeNode(
        {
            "id": "evidence_01",
            "label_display": "Evidence",
            "content": "some text",
            "embedding": [0.1] * 3072,
        },
        labels=["Evidence"],
    )

    payload = GraphPayload.from_neo4j_records([FakeRecord([node])])

    assert len(payload.nodes) == 1
    graph_node = payload.nodes[0]
    assert "embedding" not in graph_node.properties
    assert graph_node.properties["content"] == "some text"
    assert graph_node.id == "evidence_01"


def test_embedding_never_leaks_through_a_relationship_endpoint() -> None:
    person = FakeNode({"id": "person_01", "label_display": "Person"}, labels=["Person"])
    message = FakeNode(
        {"id": "message_01", "label_display": "Message", "embedding": [0.2] * 3072},
        labels=["Message"],
    )
    rel = FakeRelationship({"id": "rel_001", "visible_from_round": 1}, "SENT_BY", message, person)

    payload = GraphPayload.from_neo4j_records([FakeRecord([rel])])

    message_node = next(n for n in payload.nodes if n.id == "message_01")
    assert "embedding" not in message_node.properties
    assert len(payload.relationships) == 1
    assert payload.relationships[0].start_id == "message_01"
    assert payload.relationships[0].end_id == "person_01"


def test_no_embedding_property_can_ever_appear_anywhere_in_a_payload() -> None:
    """Exhaustive guard: regardless of whether the vector arrived on a node or
    (implausibly) on a relationship, no property dict in the resulting
    payload may ever contain an `embedding` key."""
    node_with_embedding = FakeNode(
        {"id": "evidence_02", "embedding": [1.0, 2.0, 3.0]}, labels=["Evidence"]
    )
    rel = FakeRelationship(
        {"id": "rel_002", "embedding": [9.9]},
        "MENTIONS",
        node_with_embedding,
        FakeNode({"id": "person_02"}, labels=["Person"]),
    )

    payload = GraphPayload.from_neo4j_records([FakeRecord([node_with_embedding, rel])])

    assert payload.nodes, "expected at least one node in the payload"
    assert payload.relationships, "expected at least one relationship in the payload"
    for graph_node in payload.nodes:
        assert "embedding" not in graph_node.properties
    for graph_relationship in payload.relationships:
        assert "embedding" not in graph_relationship.properties


def test_dict_fallback_shape_also_strips_embedding() -> None:
    plain_node = {
        "id": "evidence_03",
        "labels": ["Evidence"],
        "label_display": "Evidence",
        "embedding": [0.5, 0.6],
        "content": "x",
    }

    payload = GraphPayload.from_neo4j_records([FakeRecord([plain_node])])

    assert "embedding" not in payload.nodes[0].properties
    assert payload.nodes[0].properties["content"] == "x"


def test_deduplicates_nodes_by_id_across_records() -> None:
    node = FakeNode({"id": "person_01"}, labels=["Person"])

    payload = GraphPayload.from_neo4j_records([FakeRecord([node]), FakeRecord([node])])

    assert len(payload.nodes) == 1


def test_empty_records_yield_empty_payload() -> None:
    payload = GraphPayload.from_neo4j_records([])
    assert payload.nodes == []
    assert payload.relationships == []
