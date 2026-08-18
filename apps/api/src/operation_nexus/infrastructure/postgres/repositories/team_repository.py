"""Repository for teams, their sessions, credits, phase and guess bookkeeping."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from operation_nexus.domain.game.contracts import TeamState, TeamStatus
from operation_nexus.domain.game.credits import CreditLedger
from operation_nexus.infrastructure.postgres.models import TeamModel, TeamSessionModel


class TeamNotFound(Exception):
    def __init__(self, team_id: UUID) -> None:
        self.team_id = team_id
        super().__init__(f"team not found: {team_id}")


def _team_to_state(row: TeamModel) -> TeamState:
    return TeamState(
        team_id=row.id,
        game_id=row.game_id,
        name=row.name,
        current_round=row.current_round,
        credits_balance=row.credits_balance,
        credits_total_awarded=row.credits_total_awarded,
        status=TeamStatus(row.status),
        attempts_used=row.attempts_used,
        started_at=row.started_at,
        solved_at=row.solved_at,
    )


class TeamRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, game_id: UUID, name: str, starting_credits: int) -> TeamState:
        """Create a team already sitting in phase 1 with its opening credits."""
        # `started_at` is set here rather than left to the column default:
        # sessions don't expire on commit, so a server-generated value would
        # come back as None and the team's clock would never start.
        team = TeamModel(
            id=uuid4(),
            game_id=game_id,
            name=name,
            current_round=1,
            status=TeamStatus.PLAYING.value,
            attempts_used=0,
            credits_balance=starting_credits,
            credits_total_awarded=starting_credits,
            started_at=datetime.now(UTC),
        )
        self._session.add(team)
        await self._session.commit()
        return _team_to_state(team)

    async def get(self, team_id: UUID) -> TeamState | None:
        team = await self._session.get(TeamModel, team_id)
        return None if team is None else _team_to_state(team)

    async def get_by_name(self, game_id: UUID, name: str) -> TeamState | None:
        """Find a team by the name it typed -- this is how a session resumes.

        Matched case-insensitively: a team that registered as "Os Detetives"
        must come back when someone types "os detetives", or the promise that
        your name is your way back in is a lie.
        """
        result = await self._session.execute(
            select(TeamModel).where(
                TeamModel.game_id == game_id,
                func.lower(TeamModel.name) == name.casefold(),
            )
        )
        row = result.scalar_one_or_none()
        return None if row is None else _team_to_state(row)

    async def list_for_game(self, game_id: UUID) -> list[TeamState]:
        result = await self._session.execute(select(TeamModel).where(TeamModel.game_id == game_id))
        return [_team_to_state(row) for row in result.scalars().all()]

    async def _locked(self, team_id: UUID) -> TeamModel:
        result = await self._session.execute(
            select(TeamModel).where(TeamModel.id == team_id).with_for_update()
        )
        row = result.scalar_one_or_none()
        if row is None:
            raise TeamNotFound(team_id)
        return row

    async def charge_credits(self, team_id: UUID, amount: int) -> int:
        """Deduct `amount` credits from the team's balance.

        Raises `InsufficientCredits(required, available)` (bubbles up from
        `CreditLedger.charge`) if the team can't afford it.
        """
        row = await self._locked(team_id)
        ledger = CreditLedger(balance=row.credits_balance, total_awarded=row.credits_total_awarded)
        new_balance = ledger.charge(amount)  # raises InsufficientCredits
        row.credits_balance = new_balance
        await self._session.commit()
        return new_balance

    async def refund_credits(self, team_id: UUID, amount: int) -> int:
        row = await self._locked(team_id)
        ledger = CreditLedger(balance=row.credits_balance, total_awarded=row.credits_total_awarded)
        row.credits_balance = ledger.refund(amount)
        await self._session.commit()
        return row.credits_balance

    async def advance_round(self, team_id: UUID, next_round: int, credits: int) -> TeamState:
        """Move this team into `next_round`, rolling unspent credits forward.

        Only ever moves forward, and re-entering a phase the team already
        reached is a no-op: a double-clicked "avançar" must not hand out the
        grant twice.
        """
        row = await self._locked(team_id)
        if next_round <= row.current_round:
            await self._session.commit()  # release the row lock, change nothing
            return _team_to_state(row)

        ledger = CreditLedger(balance=row.credits_balance, total_awarded=row.credits_total_awarded)
        row.credits_balance = ledger.award_round(next_round, credits)
        row.credits_total_awarded = ledger.total_awarded
        row.current_round = next_round
        await self._session.commit()
        return _team_to_state(row)

    async def record_guess_outcome(
        self, team_id: UUID, *, correct: bool, status: TeamStatus
    ) -> TeamState:
        """Increment the attempt counter and settle the team's status."""
        row = await self._locked(team_id)
        row.attempts_used += 1
        row.status = status.value
        if correct and row.solved_at is None:
            row.solved_at = datetime.now(UTC)
        await self._session.commit()
        return _team_to_state(row)

    async def create_session(self, team_id: UUID, token_hash: str) -> None:
        session_row = TeamSessionModel(id=uuid4(), team_id=team_id, token_hash=token_hash)
        self._session.add(session_row)
        await self._session.commit()

    async def resolve_session_token(self, token_hash: str) -> UUID | None:
        result = await self._session.execute(
            select(TeamSessionModel).where(
                TeamSessionModel.token_hash == token_hash,
                TeamSessionModel.revoked_at.is_(None),
            )
        )
        row = result.scalar_one_or_none()
        return None if row is None else row.team_id
