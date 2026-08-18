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


class Accusation(BaseModel):
    """CONTRACT.md §5 — exact shape of `POST /teams/{team_id}/accusation`."""

    accused_person_ids: list[str]
    coordinator_person_id: str
    pattern: FraudPattern
    evidence_ids: list[str]
    key_relationship_ids: list[str]
    confidence: int = Field(ge=0, le=100)
    rationale: str


class GameStatus(StrEnum):
    PENDING = "PENDING"
    ACTIVE = "ACTIVE"
    FINISHED = "FINISHED"


class RoundStatus(StrEnum):
    """Mirrors `domain.game.rounds.RoundStatus` for use in read-only state."""

    PENDING = "PENDING"
    ACTIVE = "ACTIVE"
    ENDED = "ENDED"


class RoundState(BaseModel):
    game_id: UUID
    number: int
    status: RoundStatus
    credits_awarded: int
    title: str | None = None
    narrative: str | None = None
    duration_seconds: int | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None


class TeamState(BaseModel):
    team_id: UUID
    game_id: UUID
    name: str
    join_code: str
    current_round: int
    credits_balance: int
    credits_total_awarded: int
    discovered_node_ids: list[str] = Field(default_factory=list)
    discovered_relationship_ids: list[str] = Field(default_factory=list)


class GameState(BaseModel):
    game_id: UUID
    scenario_slug: str
    status: GameStatus
    current_round: int
    created_at: datetime
    finished_at: datetime | None = None
    rounds: list[RoundState] = Field(default_factory=list)
    teams: list[TeamState] = Field(default_factory=list)


class ScoreEvent(BaseModel):
    """One scored line item (CONTRACT.md §6) -- what the projector shows."""

    team_id: UUID
    round: int
    rule: str
    delta: int
    detail: str


class ScoreBreakdown(BaseModel):
    team_id: UUID
    events: list[ScoreEvent] = Field(default_factory=list)
    total: int
