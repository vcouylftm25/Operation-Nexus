"""Use case: a team decides it is ready for the next phase.

Self-paced: nobody else has to be ready. Moving forward rolls unspent credits
into the new phase's grant and widens what the team can see in the graph, and
it is one-way -- a team can't go back to re-read a cheaper phase.
"""

from __future__ import annotations

from uuid import UUID

from operation_nexus.application.errors import NoFurtherPhase, RunAlreadyResolved
from operation_nexus.application.ports import EventBroadcaster
from operation_nexus.domain.game.contracts import RoundState, TeamState, TeamStatus
from operation_nexus.domain.game.rounds import next_round_number
from operation_nexus.infrastructure.postgres.repositories.game_repository import GameRepository
from operation_nexus.infrastructure.postgres.repositories.team_repository import (
    TeamNotFound,
    TeamRepository,
)


class AdvancePhase:
    def __init__(
        self,
        team_repo: TeamRepository,
        game_repo: GameRepository,
        broadcaster: EventBroadcaster,
    ) -> None:
        self._team_repo = team_repo
        self._game_repo = game_repo
        self._broadcaster = broadcaster

    async def execute(self, team_id: UUID) -> tuple[TeamState, RoundState]:
        team = await self._team_repo.get(team_id)
        if team is None:
            raise TeamNotFound(team_id)
        if team.status is not TeamStatus.PLAYING:
            raise RunAlreadyResolved(team_id, team.status.value)

        total_rounds = await self._game_repo.count_rounds(team.game_id)
        try:
            target = next_round_number(team.current_round, total_rounds)
        except ValueError as exc:
            raise NoFurtherPhase(team.current_round) from exc

        briefing = await self._game_repo.require_round(team.game_id, target)
        updated = await self._team_repo.advance_round(team_id, target, briefing.credits_awarded)

        await self._broadcaster.broadcast_to_team(
            team.game_id,
            team_id,
            "PHASE_ADVANCED",
            {
                "team_id": str(team_id),
                "round": updated.current_round,
                "credits_balance": updated.credits_balance,
            },
        )
        return updated, briefing
