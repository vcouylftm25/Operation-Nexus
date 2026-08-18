"""Neo4j-backed GraphReader — hydrates discovered ids into a GraphPayload."""

from __future__ import annotations

from operation_nexus.domain.graph.payload import GraphPayload
from operation_nexus.infrastructure.neo4j.repository import GraphRepository


class Neo4jGraphReader:
    def __init__(self, repository: GraphRepository) -> None:
        self._repository = repository

    async def fetch_subgraph(
        self,
        node_ids: list[str],
        relationship_ids: list[str],
        current_round: int = 4,
    ) -> GraphPayload:
        return await self._repository.fetch_discovered(node_ids, relationship_ids, current_round)

    async def list_case_files(self, current_round: int) -> GraphPayload:
        return await self._repository.list_case_files(current_round)
