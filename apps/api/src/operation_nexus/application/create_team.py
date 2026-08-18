"""Use case: create a team within a game, generating a unique join code."""

from __future__ import annotations

from uuid import UUID

from operation_nexus.domain.game.contracts import TeamState
from operation_nexus.domain.game.join_codes import JoinCodeExhausted, generate_join_code
from operation_nexus.infrastructure.postgres.repositories.team_repository import TeamRepository

MAX_JOIN_CODE_ATTEMPTS = 20


class CreateTeam:
    def __init__(self, team_repo: TeamRepository) -> None:
        self._team_repo = team_repo

    async def execute(self, game_id: UUID, name: str) -> TeamState:
        for _ in range(MAX_JOIN_CODE_ATTEMPTS):
            candidate = generate_join_code()
            if not await self._team_repo.join_code_exists(candidate):
                return await self._team_repo.create(game_id, name, candidate)
        raise JoinCodeExhausted(
            f"could not generate a unique join code after {MAX_JOIN_CODE_ATTEMPTS} attempts"
        )
