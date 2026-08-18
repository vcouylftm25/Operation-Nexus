"""Use case: join a team via its join code, creating a bearer session token."""

from __future__ import annotations

from operation_nexus.application.errors import InvalidJoinCode
from operation_nexus.application.session_tokens import generate_session_token, hash_session_token
from operation_nexus.domain.game.contracts import TeamState
from operation_nexus.infrastructure.postgres.repositories.team_repository import TeamRepository


class JoinTeamResult:
    __slots__ = ("session_token", "team")

    def __init__(self, team: TeamState, session_token: str) -> None:
        self.team = team
        self.session_token = session_token


class JoinTeam:
    def __init__(self, team_repo: TeamRepository) -> None:
        self._team_repo = team_repo

    async def execute(self, join_code: str) -> JoinTeamResult:
        normalized = join_code.strip().upper()
        team = await self._team_repo.get_by_join_code(normalized)
        if team is None:
            raise InvalidJoinCode(join_code)
        token = generate_session_token()
        await self._team_repo.create_session(team.team_id, hash_session_token(token))
        return JoinTeamResult(team=team, session_token=token)
