"""Use case: read everything a team has discovered so far (`GET /teams/{id}/graph`)."""

from __future__ import annotations

from uuid import UUID

from operation_nexus.application.ports import GraphReader
from operation_nexus.domain.graph.payload import GraphPayload
from operation_nexus.infrastructure.postgres.repositories.discovery_repository import (
    DiscoveryRepository,
)
from operation_nexus.infrastructure.postgres.repositories.game_repository import GameRepository
from operation_nexus.infrastructure.postgres.repositories.team_repository import (
    TeamNotFound,
    TeamRepository,
)


class GetTeamGraph:
    def __init__(
        self,
        discovery_repo: DiscoveryRepository,
        graph_reader: GraphReader,
        team_repo: TeamRepository,
        game_repo: GameRepository,
    ) -> None:
        self._discovery_repo = discovery_repo
        self._graph_reader = graph_reader
        self._team_repo = team_repo
        self._game_repo = game_repo

    async def execute(self, team_id: UUID) -> GraphPayload:
        team = await self._team_repo.get(team_id)
        if team is None:
            raise TeamNotFound(team_id)
        game = await self._game_repo.get(team.game_id)
        current_round = game.current_round if game is not None else 0
        node_ids, relationship_ids = await self._discovery_repo.list_for_team(team_id)
        return await self._graph_reader.fetch_subgraph(node_ids, relationship_ids, current_round)
