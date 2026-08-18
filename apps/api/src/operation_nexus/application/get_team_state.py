"""Use case: read a team's own state (`GET /teams/{id}/state`)."""

from __future__ import annotations

from uuid import UUID

from operation_nexus.domain.game.contracts import TeamState
from operation_nexus.infrastructure.postgres.repositories.discovery_repository import (
    DiscoveryRepository,
)
from operation_nexus.infrastructure.postgres.repositories.game_repository import GameRepository
from operation_nexus.infrastructure.postgres.repositories.team_repository import (
    TeamNotFound,
    TeamRepository,
)


class GetTeamState:
    def __init__(
        self,
        team_repo: TeamRepository,
        game_repo: GameRepository,
        discovery_repo: DiscoveryRepository,
    ) -> None:
        self._team_repo = team_repo
        self._game_repo = game_repo
        self._discovery_repo = discovery_repo

    async def execute(self, team_id: UUID) -> TeamState:
        team = await self._team_repo.get(team_id)
        if team is None:
            raise TeamNotFound(team_id)

        game = await self._game_repo.get(team.game_id)
        node_ids, relationship_ids = await self._discovery_repo.list_for_team(team_id)

        return team.model_copy(
            update={
                "current_round": game.current_round if game is not None else 0,
                "discovered_node_ids": node_ids,
                "discovered_relationship_ids": relationship_ids,
            }
        )
