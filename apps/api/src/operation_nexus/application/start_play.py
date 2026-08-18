"""Use case: a team enters the game by typing a name.

There is no host, no lobby and no join code. A player types a team name and
starts investigating; typing the *same* name again resumes that team. That is
the whole session-recovery story -- a code written on a whiteboard is the thing
players lose, and a name they chose themselves is the thing they remember.

Because the name is the credential, this is a trust-the-room design: anyone who
guesses a team's name can rejoin it. That is the right trade for a
single-room event and is called out in GAME_DESIGN.md.
"""

from __future__ import annotations

import re
from pathlib import Path

from pydantic import BaseModel

from operation_nexus.application.create_game import load_round_metadata
from operation_nexus.application.errors import InvalidTeamName
from operation_nexus.application.session_tokens import generate_session_token, hash_session_token
from operation_nexus.domain.game.contracts import TeamState
from operation_nexus.domain.game.credits import DEFAULT_ROUND_CREDITS
from operation_nexus.infrastructure.postgres.repositories.game_repository import GameRepository
from operation_nexus.infrastructure.postgres.repositories.team_repository import TeamRepository

MIN_NAME_LENGTH = 2
MAX_NAME_LENGTH = 40

_WHITESPACE = re.compile(r"\s+")


def normalize_team_name(raw: str) -> str:
    """Collapse whitespace so "Os  Detetives " and "Os Detetives" are one team.

    Case is preserved -- teams like seeing their own capitalisation -- but the
    repository matches case-insensitively, so "os detetives" comes back to the
    team that registered as "Os Detetives".
    """
    name = _WHITESPACE.sub(" ", raw or "").strip()
    if len(name) < MIN_NAME_LENGTH:
        raise InvalidTeamName(f"team name must have at least {MIN_NAME_LENGTH} characters")
    if len(name) > MAX_NAME_LENGTH:
        raise InvalidTeamName(f"team name must have at most {MAX_NAME_LENGTH} characters")
    return name


class StartPlayResult(BaseModel):
    team: TeamState
    session_token: str
    resumed: bool


class StartPlay:
    def __init__(
        self,
        team_repo: TeamRepository,
        game_repo: GameRepository,
        scenario_slug: str,
        scenarios_dir: Path | None = None,
    ) -> None:
        self._team_repo = team_repo
        self._game_repo = game_repo
        self._scenario_slug = scenario_slug
        self._scenarios_dir = scenarios_dir

    async def execute(self, raw_name: str) -> StartPlayResult:
        name = normalize_team_name(raw_name)

        game = await self._game_repo.find_open_for_scenario(self._scenario_slug)
        if game is None:
            game = await self._game_repo.create(
                self._scenario_slug,
                rounds_meta=load_round_metadata(self._scenario_slug, self._scenarios_dir),
            )

        existing = await self._team_repo.get_by_name(game.game_id, name)
        if existing is not None:
            team, resumed = existing, True
        else:
            opening_credits = next(
                (r.credits_awarded for r in game.rounds if r.number == 1), DEFAULT_ROUND_CREDITS
            )
            team = await self._team_repo.create(game.game_id, name, opening_credits)
            resumed = False

        # A resumed team gets a fresh token rather than reusing the old one:
        # the previous device may be gone, and old tokens stay valid so a team
        # can keep two tabs open on the same table.
        token = generate_session_token()
        await self._team_repo.create_session(team.team_id, hash_session_token(token))
        return StartPlayResult(team=team, session_token=token, resumed=resumed)
