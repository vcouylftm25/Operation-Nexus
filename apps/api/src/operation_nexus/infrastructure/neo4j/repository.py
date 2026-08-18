"""GraphRepository — one async method per investigation tool (CONTRACT.md §4).

Every method takes `current_round` and returns a `GraphPayload`. Cypher is
never assembled here — it is always produced by `query_builder`, which is the
only module allowed to turn arguments into query text. This module's only
job is: run that query through the driver, and turn the raw records into a
`GraphPayload` via `GraphPayload.from_neo4j_records()` (which strips
`embedding` unconditionally).

`semantic_evidence_search` never calls Azure — it accepts an already
-computed `query_embedding` (the AI agent's responsibility) and falls back to
a `CONTAINS` search when it is `None`, so the tool keeps working with
`AI_ENABLED=false`.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from typing import Any, cast

from neo4j import AsyncManagedTransaction

from operation_nexus.domain.graph.payload import GraphPayload
from operation_nexus.infrastructure.neo4j import query_builder as qb
from operation_nexus.infrastructure.neo4j.driver import Neo4jDriverManager


class GraphRepository:
    def __init__(self, driver_manager: Neo4jDriverManager) -> None:
        self._driver_manager = driver_manager

    async def inspect_entity(self, entity_id: str, current_round: int) -> GraphPayload:
        """Node props + visible 1-hop degree summary."""
        cypher, params = qb.build_inspect_entity(entity_id, current_round)
        return await self._run_read(cypher, params)

    async def find_shared_entities(
        self,
        entity_ids: Sequence[str],
        current_round: int,
        via: Sequence[str] | None = None,
    ) -> GraphPayload:
        """Shared Device/Phone/Email/IP/Address/Account nodes connected to 2+
        of `entity_ids`, optionally restricted to relationship types in `via`."""
        cypher, params = qb.build_find_shared_entities(entity_ids, current_round, via=via)
        return await self._run_read(cypher, params)

    async def find_path(
        self,
        from_id: str,
        to_id: str,
        current_round: int,
        max_hops: int = qb.MAX_HOPS_CAP,
    ) -> GraphPayload:
        """Up to 5 shortest visible paths between `from_id` and `to_id`."""
        cypher, params = qb.build_find_path(from_id, to_id, current_round, max_hops=max_hops)
        return await self._run_read(cypher, params)

    async def expand_neighborhood(
        self,
        entity_id: str,
        current_round: int,
        hops: int = 1,
    ) -> GraphPayload:
        """Subgraph within 1 or 2 visible hops of `entity_id`."""
        cypher, params = qb.build_expand_neighborhood(entity_id, current_round, hops=hops)
        return await self._run_read(cypher, params)

    async def timeline(
        self,
        entity_id: str,
        current_round: int,
        from_ts: datetime | None = None,
        to_ts: datetime | None = None,
    ) -> GraphPayload:
        """Chronologically ordered events touching `entity_id`."""
        cypher, params = qb.build_timeline(entity_id, current_round, from_ts=from_ts, to_ts=to_ts)
        return await self._run_read(cypher, params)

    async def semantic_evidence_search(
        self,
        query: str,
        current_round: int,
        top_k: int = 5,
        query_embedding: Sequence[float] | None = None,
    ) -> GraphPayload:
        """Evidence/Message + graph expansion. `query_embedding` must already
        be computed (this repository never calls Azure); pass `None` to fall
        back to a `CONTAINS` text search."""
        cypher, params = qb.build_semantic_evidence_search(
            query, current_round, top_k=top_k, embedding=query_embedding
        )
        return await self._run_read(cypher, params)

    async def fetch_discovered(
        self,
        node_ids: Sequence[str],
        relationship_ids: Sequence[str],
        current_round: int,
    ) -> GraphPayload:
        """Hydrate ids a team already discovered, still filtered by round."""
        if not node_ids and not relationship_ids:
            return GraphPayload.empty()
        cypher, params = qb.build_fetch_discovered(node_ids, relationship_ids, current_round)
        return await self._run_read(cypher, params)

    async def list_case_files(self, current_round: int) -> GraphPayload:
        """Person + Application nodes visible this round (the starting docket)."""
        cypher, params = qb.build_list_case_files(current_round)
        return await self._run_read(cypher, params)

    async def challenge_hypothesis(
        self,
        hypothesis: str,
        entity_ids: Sequence[str],
        current_round: int,
    ) -> GraphPayload:
        """Only relationships/evidence that WEAKEN `hypothesis` about
        `entity_ids` — e.g. a `RELATED_TO {kind: spouse}` edge that innocently
        explains a shared device. See `query_builder.build_challenge_hypothesis`
        for the exact deterministic pattern."""
        cypher, params = qb.build_challenge_hypothesis(
            entity_ids, current_round, hypothesis=hypothesis
        )
        return await self._run_read(cypher, params)

    async def _run_read(self, cypher: str, params: dict[str, Any]) -> GraphPayload:
        async def _work(tx: AsyncManagedTransaction) -> GraphPayload:
            result = await tx.run(cast(Any, cypher), params)
            records = [record async for record in result]
            return GraphPayload.from_neo4j_records(records)

        return await self._driver_manager.execute_read(_work)
