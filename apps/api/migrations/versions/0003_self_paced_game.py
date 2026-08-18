"""self-paced teams: per-team rounds, guesses, purchasable hints

Turns the host-driven, lockstep game into a self-paced one:

  * the round moves from `games` to `teams` -- every team walks the phases at
    its own pace, so there is no global position left to hold;
  * `teams.join_code` goes away: a team is created by typing a name, and typing
    the same name again resumes it;
  * `rounds` becomes an immutable briefing catalogue, so its lifecycle columns
    (status/started_at/ended_at) are dropped;
  * `guess_attempts` and `hint_purchases` back the new verbs;
  * `accusations`, `score_events` and `evidence_reveals` are dropped -- rich
    accusations, rule-based scoring and host-released evidence were all host
    mechanics and no longer exist.

Game data is disposable dev/event state, so columns are added and dropped
without backfill. Resetting means `alembic upgrade head` plus a reseed;
`downgrade()` refuses rather than pretending the deleted rows can come back.

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-18 00:00:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_table("accusations")
    op.drop_table("score_events")
    op.drop_index("ix_evidence_reveals_game_id", table_name="evidence_reveals")
    op.drop_table("evidence_reveals")

    op.drop_column("games", "current_round")

    op.drop_column("rounds", "status")
    op.drop_column("rounds", "started_at")
    op.drop_column("rounds", "ended_at")

    op.drop_index("ix_teams_join_code", table_name="teams")
    op.drop_column("teams", "join_code")
    op.add_column(
        "teams", sa.Column("current_round", sa.Integer(), nullable=False, server_default="1")
    )
    op.add_column(
        "teams", sa.Column("status", sa.String(), nullable=False, server_default="PLAYING")
    )
    op.add_column(
        "teams", sa.Column("attempts_used", sa.Integer(), nullable=False, server_default="0")
    )
    # timestamptz, not timestamp: the ranking subtracts these, and a naive
    # column would force comparing a value read from Postgres against an aware
    # `datetime.now(UTC)` written by the app.
    op.add_column(
        "teams",
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.add_column("teams", sa.Column("solved_at", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "guess_attempts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("team_id", sa.Uuid(), nullable=False),
        sa.Column("attempt_number", sa.Integer(), nullable=False),
        sa.Column("guessed_person_id", sa.String(), nullable=False),
        sa.Column("correct", sa.Boolean(), nullable=False),
        sa.Column("round_number", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["team_id"], ["teams.id"], name="fk_guess_attempts_team_id_teams", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_guess_attempts"),
        sa.UniqueConstraint("team_id", "attempt_number", name="uq_guess_attempts_team_attempt"),
    )
    op.create_index("ix_guess_attempts_team_id", "guess_attempts", ["team_id"])

    op.create_table(
        "hint_purchases",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("team_id", sa.Uuid(), nullable=False),
        sa.Column("hint_id", sa.String(), nullable=False),
        sa.Column("round_number", sa.Integer(), nullable=False),
        sa.Column("credits_charged", sa.Integer(), nullable=False),
        sa.Column(
            "purchased_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["team_id"], ["teams.id"], name="fk_hint_purchases_team_id_teams", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_hint_purchases"),
        sa.UniqueConstraint("team_id", "hint_id", name="uq_hint_purchases_team_hint"),
    )
    op.create_index("ix_hint_purchases_team_id", "hint_purchases", ["team_id"])


def downgrade() -> None:
    raise NotImplementedError(
        "0003 drops the host-era tables (accusations, score_events, evidence_reveals). "
        "Their rows cannot be reconstructed, so there is no honest downgrade: "
        "recreate the database and run `alembic upgrade head` followed by a reseed."
    )
