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

    async def entity_roster(self, current_round: int) -> dict[str, str]:
        """`{entity_id: display label}` for everything on the table this round.

        Players speak in names ("Roberto Alves"), never in ids ("person_03").
        Without this map the planner cannot turn a question into a tool call
        and falls back to refusing — which reads to a team as the game being
        broken. Round-gated like everything else: a name the team cannot yet
        see is not in here.
        """
        payload = await self._repository.list_case_files(current_round)
        roster: dict[str, str] = {}
        for node in payload.nodes:
            label = node.label_display or str(node.properties.get("name") or node.id)
            primary = node.labels[0] if node.labels else "Node"
            roster[node.id] = f"{label} ({primary})"
        return roster

    async def list_suspects(self, current_round: int) -> dict[str, str]:
        """`{person_id: name}` for everyone who can be accused.

        Only People: a team names a person, so a device or an account must not
        be a legal guess even though both are in the entity roster.
        """
        payload = await self._repository.list_case_files(current_round)
        return {
            node.id: node.label_display or str(node.properties.get("name") or node.id)
            for node in payload.nodes
            if "Person" in node.labels
        }
