"""SQLAlchemy 2.0 declarative models for the game engine's Postgres schema.

Neo4j models the investigated world; these tables model the game itself
(CONTRACT.md golden rule #1) -- games, rounds, teams, credits, discoveries,
scores and accusations. Nothing here stores graph structure.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Index, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class GameModel(Base):
    __tablename__ = "games"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    scenario_slug: Mapped[str] = mapped_column(nullable=False)
    status: Mapped[str] = mapped_column(nullable=False, default="PENDING")
    current_round: Mapped[int] = mapped_column(nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(nullable=True)


class RoundModel(Base):
    __tablename__ = "rounds"
    __table_args__ = (UniqueConstraint("game_id", "number", name="uq_rounds_game_number"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    game_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("games.id", ondelete="CASCADE"), nullable=False, index=True
    )
    number: Mapped[int] = mapped_column(nullable=False)
    status: Mapped[str] = mapped_column(nullable=False, default="PENDING")
    credits_awarded: Mapped[int] = mapped_column(nullable=False)
    title: Mapped[str | None] = mapped_column(nullable=True)
    narrative: Mapped[str | None] = mapped_column(nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(nullable=True)


class TeamModel(Base):
    __tablename__ = "teams"
    __table_args__ = (
        UniqueConstraint("game_id", "name", name="uq_teams_game_name"),
        Index("ix_teams_join_code", "join_code", unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    game_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("games.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(nullable=False)
    join_code: Mapped[str] = mapped_column(nullable=False)
    credits_balance: Mapped[int] = mapped_column(nullable=False, default=0)
    credits_total_awarded: Mapped[int] = mapped_column(nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)


class TeamSessionModel(Base):
    __tablename__ = "team_sessions"
    __table_args__ = (Index("ix_team_sessions_token_hash", "token_hash", unique=True),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    team_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(nullable=True)


class InvestigationActionModel(Base):
    __tablename__ = "investigation_actions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    team_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    round_number: Mapped[int] = mapped_column(nullable=False)
    question: Mapped[str] = mapped_column(nullable=False)
    answer_text: Mapped[str] = mapped_column(nullable=False, default="")
    plan: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    answer: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    credits_charged: Mapped[int] = mapped_column(nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)


class DiscoveryModel(Base):
    __tablename__ = "discoveries"
    __table_args__ = (
        UniqueConstraint("team_id", "node_id", name="uq_discoveries_team_node"),
        UniqueConstraint("team_id", "relationship_id", name="uq_discoveries_team_relationship"),
        CheckConstraint(
            "(node_id IS NOT NULL) <> (relationship_id IS NOT NULL)",
            name="ck_discoveries_node_xor_relationship",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    team_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    round_number: Mapped[int] = mapped_column(nullable=False)
    node_id: Mapped[str | None] = mapped_column(nullable=True)
    relationship_id: Mapped[str | None] = mapped_column(nullable=True)
    source_action_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("investigation_actions.id", ondelete="SET NULL"), nullable=True
    )
    discovered_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)


class EvidenceRevealModel(Base):
    """A durable, game-wide record of a host-released evidence item."""

    __tablename__ = "evidence_reveals"
    __table_args__ = (
        UniqueConstraint("game_id", "evidence_id", name="uq_evidence_reveals_game_evidence"),
        Index("ix_evidence_reveals_game_id", "game_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    game_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("games.id", ondelete="CASCADE"), nullable=False
    )
    evidence_id: Mapped[str] = mapped_column(nullable=False)
    round_number: Mapped[int] = mapped_column(nullable=False)
    payload: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False)
    revealed_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)


class ScoreEventModel(Base):
    __tablename__ = "score_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    team_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    round_number: Mapped[int] = mapped_column(nullable=False)
    rule: Mapped[str] = mapped_column(nullable=False)
    delta: Mapped[int] = mapped_column(nullable=False)
    detail: Mapped[str] = mapped_column(nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)


class AccusationModel(Base):
    __tablename__ = "accusations"
    __table_args__ = (Index("ix_accusations_team_id", "team_id", unique=True),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    team_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"), nullable=False
    )
    round_number: Mapped[int] = mapped_column(nullable=False)
    accused_person_ids: Mapped[list[str]] = mapped_column(JSONB, nullable=False)
    coordinator_person_id: Mapped[str] = mapped_column(nullable=False)
    pattern: Mapped[str] = mapped_column(nullable=False)
    evidence_ids: Mapped[list[str]] = mapped_column(JSONB, nullable=False)
    key_relationship_ids: Mapped[list[str]] = mapped_column(JSONB, nullable=False)
    confidence: Mapped[int] = mapped_column(nullable=False)
    rationale: Mapped[str] = mapped_column(nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    scored_at: Mapped[datetime | None] = mapped_column(nullable=True)


class AiRunModel(Base):
    """Records one AI-layer invocation, for cost/latency tracking.

    Owned by the game engine's schema even though the AI layer (which does
    not exist yet) will be the one writing to it -- keeps every table that
    models "the game" in one place.
    """

    __tablename__ = "ai_runs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    team_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    investigation_action_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("investigation_actions.id", ondelete="SET NULL"), nullable=True
    )
    provider: Mapped[str] = mapped_column(nullable=False, default="azure_openai")
    model: Mapped[str] = mapped_column(nullable=False, default="")
    prompt_tokens: Mapped[int | None] = mapped_column(nullable=True)
    completion_tokens: Mapped[int | None] = mapped_column(nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(nullable=True)
    raw_request: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    raw_response: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
