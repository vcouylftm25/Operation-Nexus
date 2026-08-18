"""Game-facing Pydantic contracts (CONTRACT.md §5, §6, §7).

Pure domain module: no framework imports (no FastAPI, no SQLAlchemy). These
are the canonical shapes shared by `application/`, `infrastructure/postgres`
and `api/`.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, Field


class FraudPattern(StrEnum):
    """CONTRACT.md §5 — canonical fraud-pattern enum."""

    IDENTITY_RING = "IDENTITY_RING"
    MULE_ACCOUNTS = "MULE_ACCOUNTS"
    BROKER_COLLUSION = "BROKER_COLLUSION"
    SYNTHETIC_IDENTITIES = "SYNTHETIC_IDENTITIES"
    OTHER = "OTHER"


class GameStatus(StrEnum):
    PENDING = "PENDING"
    ACTIVE = "ACTIVE"
    FINISHED = "FINISHED"


class RoundState(BaseModel):
    """A phase's briefing copy — an immutable catalogue entry, not a state.

    Rounds no longer start or end: each team carries its own `current_round`,
    so a phase has nothing to transition. What survives here is the text and
    the credit grant the scenario declared.
    """

    game_id: UUID
    number: int
    credits_awarded: int
    title: str | None = None
    narrative: str | None = None
    duration_seconds: int | None = None


class TeamStatus(StrEnum):
    """Where a team is in its own, self-paced run."""

    PLAYING = "PLAYING"
    SOLVED = "SOLVED"
    FAILED = "FAILED"


class TeamState(BaseModel):
    """One team's private view of its own run.

    `current_round` lives on the team, not the game: every team walks the
    phases at its own pace, so there is no global lockstep round any more.
    """

    team_id: UUID
    game_id: UUID
    name: str
    current_round: int
    credits_balance: int
    credits_total_awarded: int
    status: TeamStatus = TeamStatus.PLAYING
    attempts_used: int = 0
    started_at: datetime | None = None
    solved_at: datetime | None = None
    discovered_node_ids: list[str] = Field(default_factory=list)
    discovered_relationship_ids: list[str] = Field(default_factory=list)


class GameState(BaseModel):
    """A game is now just a room: a scenario, its phase catalogue, its teams.

    There is no global `current_round` — teams advance independently.
    """

    game_id: UUID
    scenario_slug: str
    status: GameStatus
    created_at: datetime
    finished_at: datetime | None = None
    rounds: list[RoundState] = Field(default_factory=list)
    teams: list[TeamState] = Field(default_factory=list)

    @property
    def total_rounds(self) -> int:
        return len(self.rounds)


class GuessResult(BaseModel):
    """What a team gets back after naming a suspect.

    Deliberately incapable of carrying the answer: there is no person id and
    no name here, only whether *this* team's guess was right and how many
    tries are left. Ground truth stays quarantined even at the moment it is
    consulted (CONTRACT.md §0 rule 4).
    """

    correct: bool
    attempts_used: int
    attempts_remaining: int
    status: TeamStatus
    elapsed_seconds: int
    score: int


class LeaderboardRow(BaseModel):
    """One line of the public ranking (`/screen`). Never names a suspect."""

    team_id: UUID
    team_name: str
    status: TeamStatus
    score: int
    attempts_used: int
    elapsed_seconds: int | None
    current_round: int
