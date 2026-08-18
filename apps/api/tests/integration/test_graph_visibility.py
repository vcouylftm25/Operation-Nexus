"""Integration tests against a real Neo4j (testcontainers). CONTRACT.md §0
rule 6: round visibility must be enforced server-side. These tests seed the
tiny `mini_scenario` fixture into a real database and then prove visibility
actually changes what the driver returns — not just what a Cypher string
looks like.

`test_node_visible_from_round_3_is_invisible_at_round_2` is the most
important test in the repository: if round-gating breaks, this is what
catches it.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterator
from pathlib import Path
from typing import Any

import pytest
from neo4j import AsyncManagedTransaction
from testcontainers.neo4j import Neo4jContainer

from operation_nexus.infrastructure.neo4j import query_builder as qb
from operation_nexus.infrastructure.neo4j.driver import Neo4jDriverManager
from operation_nexus.infrastructure.neo4j.repository import GraphRepository
from operation_nexus.infrastructure.neo4j.seeder import load_scenario_from_dir, seed_scenario

pytestmark = pytest.mark.integration

FIXTURE_DIR = Path(__file__).resolve().parents[1] / "fixtures" / "mini_scenario"
_NEO4J_PASSWORD = "nexus_test_password"


@pytest.fixture(scope="module")
def neo4j_container() -> Iterator[Neo4jContainer]:
    with Neo4jContainer("neo4j:2025.06", password=_NEO4J_PASSWORD) as container:
        yield container


@pytest.fixture(scope="module")
async def driver_manager(neo4j_container: Neo4jContainer) -> AsyncIterator[Neo4jDriverManager]:
    uri = neo4j_container.get_connection_url()
    manager = Neo4jDriverManager(uri=uri, user="neo4j", password=_NEO4J_PASSWORD)
    await manager.verify_connectivity()

    scenario = load_scenario_from_dir(FIXTURE_DIR)
    await seed_scenario(scenario, manager, drop=True)

    yield manager

    await manager.close()


@pytest.fixture
def repository(driver_manager: Neo4jDriverManager) -> GraphRepository:
    return GraphRepository(driver_manager)


async def _count_find_path_rows(
    driver_manager: Neo4jDriverManager, from_id: str, to_id: str, current_round: int
) -> int:
    """Runs `query_builder.build_find_path` directly against the driver and
    counts result rows — each row is one path, so this is a precise count of
    "how many visible paths exist", independent of GraphPayload's node/edge
    deduplication."""
    cypher, params = qb.build_find_path(from_id, to_id, current_round)

    async def _work(tx: AsyncManagedTransaction) -> int:
        result = await tx.run(cypher, params)
        rows = [row async for row in result]
        return len(rows)

    return await driver_manager.execute_read(_work)


async def test_node_visible_from_round_3_is_invisible_at_round_2(
    repository: GraphRepository,
) -> None:
    """`account_02` (mini_scenario/entities.json) has visible_from_round=3."""
    payload_round_2 = await repository.inspect_entity("account_02", current_round=2)
    assert not any(node.id == "account_02" for node in payload_round_2.nodes), (
        "account_02 (visible_from_round=3) must not appear at round 2"
    )

    payload_round_3 = await repository.inspect_entity("account_02", current_round=3)
    assert any(node.id == "account_02" for node in payload_round_3.nodes), (
        "account_02 must appear once round >= its visible_from_round"
    )


async def test_relationship_visible_from_round_3_is_invisible_at_round_2(
    repository: GraphRepository,
) -> None:
    """`rel_004` (person_02 OWNS_ACCOUNT account_02) is visible_from_round=3."""
    payload_round_2 = await repository.inspect_entity("person_02", current_round=2)
    assert not any(rel.id == "rel_004" for rel in payload_round_2.relationships)

    payload_round_3 = await repository.inspect_entity("person_02", current_round=3)
    assert any(rel.id == "rel_004" for rel in payload_round_3.relationships)


async def test_find_path_returns_fewer_paths_at_round_1_than_round_4(
    driver_manager: Neo4jDriverManager,
) -> None:
    """person_01 <-> person_02 in the mini fixture: only the shared device
    (device_01) connects them at round 1; by round 4 they're also connected
    via the shared company (round 2+) and via the transaction between their
    bank accounts (round 4)."""
    paths_round_1 = await _count_find_path_rows(driver_manager, "person_01", "person_02", 1)
    paths_round_4 = await _count_find_path_rows(driver_manager, "person_01", "person_02", 4)

    assert paths_round_1 < paths_round_4
    assert paths_round_1 == 1
    assert paths_round_4 == 3


async def test_repository_find_path_reflects_the_same_growth(
    repository: GraphRepository,
) -> None:
    """Same fact, exercised through the GraphRepository / GraphPayload path
    that the rest of the application actually uses."""
    payload_round_1 = await repository.find_path("person_01", "person_02", current_round=1)
    payload_round_4 = await repository.find_path("person_01", "person_02", current_round=4)

    assert len(payload_round_1.relationships) < len(payload_round_4.relationships)
    assert not any(node.id == "account_02" for node in payload_round_1.nodes)
    assert any(node.id == "account_02" for node in payload_round_4.nodes)


async def test_find_shared_entities_respects_round_visibility(
    repository: GraphRepository,
) -> None:
    """device_01 is shared from round 1; company_01 only from round 2."""
    shared_round_1 = await repository.find_shared_entities(
        ["person_01", "person_02"], current_round=1
    )
    shared_ids_round_1 = {node.id for node in shared_round_1.nodes}
    assert "device_01" in shared_ids_round_1
    assert "company_01" not in shared_ids_round_1

    shared_round_2 = await repository.find_shared_entities(
        ["person_01", "person_02"], current_round=2
    )
    shared_ids_round_2 = {node.id for node in shared_round_2.nodes}
    assert "device_01" in shared_ids_round_2
    assert "company_01" in shared_ids_round_2


async def test_semantic_evidence_search_fallback_without_embedding(
    repository: GraphRepository,
) -> None:
    """No embedding given -> falls back to a CONTAINS search (AI_ENABLED=false
    still works). message_01 mentions "cadastro" and is visible from round 2."""
    payload_round_1 = await repository.semantic_evidence_search(
        "cadastro", current_round=1, query_embedding=None
    )
    assert not any(node.id == "message_01" for node in payload_round_1.nodes)

    payload_round_2 = await repository.semantic_evidence_search(
        "cadastro", current_round=2, query_embedding=None
    )
    assert any(node.id == "message_01" for node in payload_round_2.nodes)
    for node in payload_round_2.nodes:
        assert "embedding" not in node.properties


async def test_challenge_hypothesis_returns_empty_when_no_counter_evidence_exists(
    repository: GraphRepository,
) -> None:
    """The mini fixture has no RELATED_TO edge between person_01/person_02, so
    there is no innocent family/colleague explanation to surface — the tool
    must return an empty payload rather than error."""
    payload = await repository.challenge_hypothesis(
        "person_01 and person_02 are colluding",
        ["person_01", "person_02"],
        current_round=4,
    )
    assert payload.nodes == []
    assert payload.relationships == []


def test_stats_reports_node_and_relationship_counts(neo4j_container: Neo4jContainer) -> None:
    """Smoke-checks `collect_stats` (used by `operation-nexus stats`) end to
    end against the same seeded database."""
    import asyncio

    async def _run() -> dict[str, list[dict[str, Any]]]:
        from operation_nexus.infrastructure.neo4j.seeder import collect_stats

        uri = neo4j_container.get_connection_url()
        manager = Neo4jDriverManager(uri=uri, user="neo4j", password=_NEO4J_PASSWORD)
        try:
            await manager.verify_connectivity()
            return await collect_stats(manager)
        finally:
            await manager.close()

    stats = asyncio.run(_run())
    total_nodes = sum(row["count"] for row in stats["nodes"])
    assert total_nodes >= 8  # the 8 core entities, at least (plus evidence/message nodes)
