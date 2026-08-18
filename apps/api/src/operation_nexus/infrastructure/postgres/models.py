"""SQLAlchemy 2.0 declarative models for the game engine's Postgres schema.

Neo4j models the investigated world; these tables model the game itself
(CONTRACT.md golden rule #1) -- games, rounds, teams, credits, discoveries,
scores and accusations. Nothing here stores graph structure.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

#: Columns the ranking does arithmetic on are `timestamptz`, so psycopg hands
#: back timezone-aware datetimes and subtracting them can never mix an aware
#: `datetime.now(UTC)` with a naive value read from the database.
_TZ = DateTime(timezone=True)


class Base(DeclarativeBase):
    pass


class GameModel(Base):
    """A room: one scenario, one phase catalogue, many independent teams.

    There is no `current_round` here. Teams are self-paced, so the round lives
    on `teams.current_round` and a game has no lockstep position to hold.
    """

    __tablename__ = "games"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    scenario_slug: Mapped[str] = mapped_column(nullable=False)
    status: Mapped[str] = mapped_column(nullable=False, default="PENDING")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(nullable=True)


class RoundModel(Base):
    """Immutable briefing catalogue, seeded from the scenario's `rounds.yaml`.

    Rounds no longer start or end -- nothing writes to this table after the
    game is created -- so it carries copy and a credit grant, nothing else.
    """

    __tablename__ = "rounds"
    __table_args__ = (UniqueConstraint("game_id", "number", name="uq_rounds_game_number"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    game_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("games.id", ondelete="CASCADE"), nullable=False, index=True
    )
    number: Mapped[int] = mapped_column(nullable=False)
    credits_awarded: Mapped[int] = mapped_column(nullable=False)
    title: Mapped[str | None] = mapped_column(nullable=True)
    narrative: Mapped[str | None] = mapped_column(nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(nullable=True)


class TeamModel(Base):
    """A team is created by typing a name; the same name resumes the session.

    `name` is unique per game precisely so a team that closed the tab can come
    back by typing what it already typed -- there is no join code to lose.
    """

    __tablename__ = "teams"
    __table_args__ = (UniqueConstraint("game_id", "name", name="uq_teams_game_name"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    game_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("games.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(nullable=False)
    current_round: Mapped[int] = mapped_column(nullable=False, default=1)
    status: Mapped[str] = mapped_column(nullable=False, default="PLAYING")
    attempts_used: Mapped[int] = mapped_column(nullable=False, default=0)
    credits_balance: Mapped[int] = mapped_column(nullable=False, default=0)
    credits_total_awarded: Mapped[int] = mapped_column(nullable=False, default=0)
    started_at: Mapped[datetime] = mapped_column(_TZ, server_default=func.now(), nullable=False)
    solved_at: Mapped[datetime | None] = mapped_column(_TZ, nullable=True)
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


class GuessAttemptModel(Base):
    """One shot at naming the fraudster. A team gets three.

    Separate from any richer "accusation" record on purpose: a guess is a
    single person id, and the unique key on `(team_id, attempt_number)` is what
    makes a double-clicked submit idempotent.
    """

    __tablename__ = "guess_attempts"
    __table_args__ = (
        UniqueConstraint("team_id", "attempt_number", name="uq_guess_attempts_team_attempt"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    team_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    attempt_number: Mapped[int] = mapped_column(nullable=False)
    guessed_person_id: Mapped[str] = mapped_column(nullable=False)
    correct: Mapped[bool] = mapped_column(nullable=False)
    round_number: Mapped[int] = mapped_column(nullable=False)
    created_at: Mapped[datetime] = mapped_column(_TZ, server_default=func.now(), nullable=False)


class HintPurchaseModel(Base):
    """A hint a team paid credits to read. Buying twice never charges twice."""

    __tablename__ = "hint_purchases"
    __table_args__ = (UniqueConstraint("team_id", "hint_id", name="uq_hint_purchases_team_hint"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    team_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    hint_id: Mapped[str] = mapped_column(nullable=False)
    round_number: Mapped[int] = mapped_column(nullable=False)
    credits_charged: Mapped[int] = mapped_column(nullable=False)
    purchased_at: Mapped[datetime] = mapped_column(_TZ, server_default=func.now(), nullable=False)


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
