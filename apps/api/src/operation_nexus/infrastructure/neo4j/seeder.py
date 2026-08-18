"""Load scenario-as-code files, validate them, and seed Neo4j (CONTRACT.md §10).

Seed order (idempotent — every write is a `MERGE` on `id`):
validate -> constraints -> indexes -> nodes -> relationships -> evidence ->
vector indexes.

This module never imports Azure. `--embeddings` is satisfied by an injected
`EmbeddingProvider` (defined here as a `Protocol`); a concrete implementation
lives in `infrastructure/azure_openai`, owned by the AI agent, and is loaded
lazily and only on request (see `cli.py`).
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol, cast, runtime_checkable

import yaml
from neo4j import AsyncManagedTransaction

from operation_nexus.domain.graph.scenario import (
    EntitySpec,
    EvidenceSpec,
    RelationshipSpec,
    RoundSpec,
    ScenarioError,
    ScenarioMeta,
    ScenarioSpec,
    validate_scenario,
)
from operation_nexus.domain.graph.schema import (
    NodeLabel,
    RelationshipType,
    constraint_statements,
    index_statements,
    vector_index_statements,
)
from operation_nexus.infrastructure.neo4j.driver import Neo4jDriverManager

REQUIRED_SCENARIO_FILES: tuple[str, ...] = (
    "scenario.yaml",
    "entities.json",
    "relationships.json",
    "evidence.json",
    "rounds.yaml",
)
#: Deliberately excluded: `ground_truth.yaml` is quarantined for
#: `domain/game/scoring.py` alone (CONTRACT.md §0 rule 4, §14).


@runtime_checkable
class EmbeddingProvider(Protocol):
    """Injected at the CLI boundary so `--embeddings` can compute vectors for
    `Evidence`/`Message` content without this module ever importing Azure."""

    async def embed(self, texts: Sequence[str]) -> list[list[float]]: ...


class ScenarioValidationError(Exception):
    """Raised by `seed_scenario` when `validate_scenario` finds problems.
    Carries the full structured error list so a caller (CLI, tests) can
    inspect it — the message is already formatted for a human to read."""

    def __init__(self, errors: Sequence[ScenarioError]) -> None:
        self.errors: list[ScenarioError] = list(errors)
        detail = "\n".join(f"  - {error}" for error in self.errors)
        super().__init__(f"scenario failed validation with {len(self.errors)} error(s):\n{detail}")


@dataclass(frozen=True)
class SeedReport:
    entities: int
    relationships: int
    evidence: int


# --------------------------------------------------------------------------
# Loading scenario-as-code files off disk.
# --------------------------------------------------------------------------


def find_repo_root(start: Path | None = None) -> Path:
    """Walk upward from `start` (default: this file) until a directory
    containing `CONTRACT.md` is found — that directory is the monorepo root."""
    current = (start or Path(__file__)).resolve()
    for candidate in (current, *current.parents):
        if (candidate / "CONTRACT.md").is_file():
            return candidate
    raise FileNotFoundError("could not locate the monorepo root (no CONTRACT.md in any parent)")


def resolve_scenario_dir(slug_or_path: str, *, scenarios_root: Path | None = None) -> Path:
    """`slug_or_path` is either a literal directory (used as-is — this is how
    tests point at `tests/fixtures/mini_scenario`) or a slug resolved against
    `<repo_root>/scenarios/<slug>` (CONTRACT.md §10)."""
    candidate = Path(slug_or_path)
    if candidate.is_dir():
        return candidate

    root = scenarios_root if scenarios_root is not None else find_repo_root() / "scenarios"
    resolved = root / slug_or_path
    if not resolved.is_dir():
        raise FileNotFoundError(
            f"no scenario directory for {slug_or_path!r}: tried it as a literal path and as "
            f"{resolved}"
        )
    return resolved


def load_scenario_from_dir(scenario_dir: Path) -> ScenarioSpec:
    """Read `scenario.yaml` / `entities.json` / `relationships.json` /
    `evidence.json` / `rounds.yaml` and parse them into a `ScenarioSpec`.
    Never opens `ground_truth.yaml`."""
    missing = [name for name in REQUIRED_SCENARIO_FILES if not (scenario_dir / name).is_file()]
    if missing:
        raise FileNotFoundError(
            f"scenario directory {scenario_dir} is missing required file(s): {', '.join(missing)}"
        )

    meta = ScenarioMeta.model_validate(_read_yaml(scenario_dir / "scenario.yaml"))
    entities_raw = _read_json(scenario_dir / "entities.json")
    relationships_raw = _read_json(scenario_dir / "relationships.json")
    evidence_raw = _read_json(scenario_dir / "evidence.json")
    rounds_raw = _read_yaml(scenario_dir / "rounds.yaml")

    return ScenarioSpec(
        meta=meta,
        entities=[EntitySpec.model_validate(item) for item in entities_raw.get("entities", [])],
        relationships=[
            RelationshipSpec.model_validate(item)
            for item in relationships_raw.get("relationships", [])
        ],
        evidence=[EvidenceSpec.model_validate(item) for item in evidence_raw.get("evidence", [])],
        rounds=[RoundSpec.model_validate(item) for item in rounds_raw.get("rounds", [])],
    )


def _read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _read_yaml(path: Path) -> dict[str, Any]:
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


# --------------------------------------------------------------------------
# Seeding.
# --------------------------------------------------------------------------


async def seed_scenario(
    scenario: ScenarioSpec,
    driver_manager: Neo4jDriverManager,
    *,
    drop: bool = False,
    embeddings: bool = False,
    embedding_provider: EmbeddingProvider | None = None,
) -> SeedReport:
    """validate -> constraints -> indexes -> nodes -> relationships ->
    evidence -> vector indexes. Fails loudly (`ScenarioValidationError`) on
    any problem `validate_scenario` finds — nothing is written in that case."""
    errors = validate_scenario(scenario)
    if errors:
        raise ScenarioValidationError(errors)

    if embeddings and embedding_provider is None:
        raise ValueError("embeddings=True requires an embedding_provider")

    if drop:
        await _execute_write(driver_manager, "MATCH (n) DETACH DELETE n", {})

    for statement in constraint_statements():
        await _execute_write(driver_manager, statement, {})
    for statement in index_statements():
        await _execute_write(driver_manager, statement, {})

    await _seed_nodes(scenario.entities, driver_manager)
    await _seed_relationships(scenario.relationships, driver_manager)
    await _seed_evidence(
        scenario.evidence,
        scenario.relationships,
        driver_manager,
        embeddings=embeddings,
        embedding_provider=embedding_provider,
    )

    for statement in vector_index_statements():
        await _execute_write(driver_manager, statement, {})

    return SeedReport(
        entities=len(scenario.entities),
        relationships=len(scenario.relationships),
        evidence=len(scenario.evidence),
    )


async def _seed_nodes(entities: Sequence[EntitySpec], driver_manager: Neo4jDriverManager) -> None:
    by_label: dict[NodeLabel, list[dict[str, Any]]] = {}
    for entity in entities:
        by_label.setdefault(entity.label, []).append(
            {
                "id": entity.id,
                "props": {
                    "id": entity.id,
                    "visible_from_round": entity.visible_from_round,
                    "label_display": entity.label_display,
                    **entity.properties,
                },
            }
        )

    # `label.value` is interpolated here — as in query_builder.py, that's only
    # safe because it comes from the NodeLabel enum (already validated by
    # Pydantic when EntitySpec.label was parsed), never from a raw string.
    for label, rows in by_label.items():
        cypher = f"UNWIND $rows AS row MERGE (n:{label.value} {{id: row.id}}) SET n += row.props"
        await _execute_write(driver_manager, cypher, {"rows": rows})


async def _seed_relationships(
    relationships: Sequence[RelationshipSpec], driver_manager: Neo4jDriverManager
) -> None:
    by_type: dict[RelationshipType, list[dict[str, Any]]] = {}
    for rel in relationships:
        by_type.setdefault(rel.type, []).append(
            {
                "id": rel.id,
                "start_id": rel.start_id,
                "end_id": rel.end_id,
                "props": {
                    "id": rel.id,
                    "visible_from_round": rel.visible_from_round,
                    "source": rel.source,
                    "confidence": rel.confidence,
                    "timestamp": rel.timestamp,
                    **rel.properties,
                },
            }
        )

    for rel_type, rows in by_type.items():
        cypher = (
            "UNWIND $rows AS row "
            "MATCH (a {id: row.start_id}), (b {id: row.end_id}) "
            f"MERGE (a)-[r:{rel_type.value} {{id: row.id}}]->(b) "
            "SET r += row.props"
        )
        await _execute_write(driver_manager, cypher, {"rows": rows})


_REL_ID_PATTERN = re.compile(r"^rel_(\d{3})$")


def _assign_synthetic_relationship_ids(
    evidence_items: Sequence[EvidenceSpec],
    existing_relationship_ids: Iterable[str],
) -> list[tuple[str, RelationshipType, str, str]]:
    """Deterministically mint `rel_NNN` ids for the MENTIONS / MENTIONS_ACCOUNT
    / SENT_BY / SENT_TO edges implied by `evidence.json` (CONTRACT.md §14),
    which carries no explicit relationship ids of its own. Deterministic
    given the same scenario data — necessary so re-seeding (`MERGE` on id)
    never creates duplicate edges.
    """
    used_numbers = {
        int(match.group(1))
        for rel_id in existing_relationship_ids
        if (match := _REL_ID_PATTERN.match(rel_id))
    }
    counter = 0
    links: list[tuple[str, RelationshipType, str, str]] = []
    for ev in evidence_items:
        ordered: list[tuple[RelationshipType, str]] = []
        if ev.sent_by:
            ordered.append((RelationshipType.SENT_BY, ev.sent_by))
        ordered.extend((RelationshipType.SENT_TO, target) for target in ev.sent_to)
        ordered.extend((RelationshipType.MENTIONS, target) for target in ev.mentions)
        ordered.extend(
            (RelationshipType.MENTIONS_ACCOUNT, target) for target in ev.mentions_accounts
        )
        for rel_type, target_id in ordered:
            counter += 1
            while counter in used_numbers:
                counter += 1
            used_numbers.add(counter)
            links.append((f"rel_{counter:03d}", rel_type, ev.id, target_id))
    return links


async def _seed_evidence(
    evidence_items: Sequence[EvidenceSpec],
    relationships: Sequence[RelationshipSpec],
    driver_manager: Neo4jDriverManager,
    *,
    embeddings: bool,
    embedding_provider: EmbeddingProvider | None,
) -> None:
    if not evidence_items:
        return

    embedding_vectors: dict[str, list[float]] = {}
    if embeddings and embedding_provider is not None:
        texts = [ev.content for ev in evidence_items]
        vectors = await embedding_provider.embed(texts)
        if len(vectors) != len(evidence_items):
            raise ValueError(
                "embedding_provider.embed() returned "
                f"{len(vectors)} vectors for {len(evidence_items)} texts"
            )
        embedding_vectors = dict(zip((ev.id for ev in evidence_items), vectors, strict=True))

    by_label: dict[NodeLabel, list[dict[str, Any]]] = {}
    for ev in evidence_items:
        label = ev.node_label
        props: dict[str, Any] = {
            "id": ev.id,
            "visible_from_round": ev.visible_from_round,
            "label_display": ev.label_display,
            "content": ev.content,
            "source": ev.source,
        }
        if label is NodeLabel.EVIDENCE:
            props["captured_at"] = ev.captured_at
            props["evidence_type"] = ev.evidence_type or ""
        else:
            # CONTRACT.md §14's evidence.json field is `captured_at` for both
            # kinds; §3's schema names Message's required timestamp property
            # `sent_at`. This is the one place that translation happens.
            props["sent_at"] = ev.captured_at
            props["channel"] = ev.channel or ""

        if ev.id in embedding_vectors:
            props["embedding"] = embedding_vectors[ev.id]

        by_label.setdefault(label, []).append({"id": ev.id, "props": props})

    for label, rows in by_label.items():
        cypher = f"UNWIND $rows AS row MERGE (n:{label.value} {{id: row.id}}) SET n += row.props"
        await _execute_write(driver_manager, cypher, {"rows": rows})

    existing_ids = [rel.id for rel in relationships]
    links = _assign_synthetic_relationship_ids(evidence_items, existing_ids)
    visible_from_round = {ev.id: ev.visible_from_round for ev in evidence_items}

    by_type: dict[RelationshipType, list[dict[str, Any]]] = {}
    for rel_id, rel_type, start_id, end_id in links:
        by_type.setdefault(rel_type, []).append(
            {
                "id": rel_id,
                "start_id": start_id,
                "end_id": end_id,
                "props": {
                    "id": rel_id,
                    "visible_from_round": visible_from_round[start_id],
                    "source": "scenario_evidence_link",
                    "confidence": 1.0,
                },
            }
        )

    for rel_type, rows in by_type.items():
        cypher = (
            "UNWIND $rows AS row "
            "MATCH (a {id: row.start_id}), (b {id: row.end_id}) "
            f"MERGE (a)-[r:{rel_type.value} {{id: row.id}}]->(b) "
            "SET r += row.props"
        )
        await _execute_write(driver_manager, cypher, {"rows": rows})


async def _execute_write(
    driver_manager: Neo4jDriverManager, cypher: str, params: Mapping[str, Any]
) -> None:
    async def _work(tx: AsyncManagedTransaction) -> None:
        await tx.run(cast(Any, cypher), dict(params))

    await driver_manager.execute_write(_work)


# --------------------------------------------------------------------------
# Stats (for `operation-nexus stats`).
# --------------------------------------------------------------------------


async def collect_stats(driver_manager: Neo4jDriverManager) -> dict[str, list[dict[str, Any]]]:
    """Node/relationship counts per label (or type), per round."""

    async def _work(tx: AsyncManagedTransaction) -> dict[str, list[dict[str, Any]]]:
        node_result = await tx.run(
            "MATCH (n) RETURN labels(n) AS labels, n.visible_from_round AS round, count(*) AS count"
        )
        node_rows = [record.data() async for record in node_result]

        rel_result = await tx.run(
            "MATCH ()-[r]->() "
            "RETURN type(r) AS type, r.visible_from_round AS round, count(*) AS count"
        )
        rel_rows = [record.data() async for record in rel_result]
        return {"nodes": node_rows, "relationships": rel_rows}

    return await driver_manager.execute_read(_work)
