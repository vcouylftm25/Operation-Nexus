"""Repository for teams, their sessions, credits and accusations."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from operation_nexus.domain.game.contracts import Accusation, FraudPattern, TeamState
from operation_nexus.domain.game.credits import CreditLedger
from operation_nexus.infrastructure.postgres.models import (
    AccusationModel,
    TeamModel,
    TeamSessionModel,
)


class TeamNotFound(Exception):
    def __init__(self, team_id: UUID) -> None:
        self.team_id = team_id
        super().__init__(f"team not found: {team_id}")


class AccusationNotFound(Exception):
    def __init__(self, team_id: UUID) -> None:
        self.team_id = team_id
        super().__init__(f"no accusation submitted for team: {team_id}")


class StoredAccusation:
    """An `Accusation` plus the bookkeeping fields the game engine needs."""

    __slots__ = ("accusation", "round_number", "scored_at")

    def __init__(
        self, accusation: Accusation, round_number: int, scored_at: datetime | None
    ) -> None:
        self.accusation = accusation
        self.round_number = round_number
        self.scored_at = scored_at


def _team_to_state(row: TeamModel) -> TeamState:
    return TeamState(
        team_id=row.id,
        game_id=row.game_id,
        name=row.name,
        join_code=row.join_code,
        current_round=0,
        credits_balance=row.credits_balance,
        credits_total_awarded=row.credits_total_awarded,
    )


class TeamRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, game_id: UUID, name: str, join_code: str) -> TeamState:
        team = TeamModel(
            id=uuid4(),
            game_id=game_id,
            name=name,
            join_code=join_code,
            credits_balance=0,
            credits_total_awarded=0,
        )
        self._session.add(team)
        await self._session.commit()
        return _team_to_state(team)

    async def _get_model(self, team_id: UUID) -> TeamModel:
        team = await self._session.get(TeamModel, team_id)
        if team is None:
            raise TeamNotFound(team_id)
        return team

    async def get(self, team_id: UUID) -> TeamState | None:
        team = await self._session.get(TeamModel, team_id)
        return None if team is None else _team_to_state(team)

    async def get_by_join_code(self, join_code: str) -> TeamState | None:
        result = await self._session.execute(
            select(TeamModel).where(TeamModel.join_code == join_code)
        )
        row = result.scalar_one_or_none()
        return None if row is None else _team_to_state(row)

    async def join_code_exists(self, join_code: str) -> bool:
        result = await self._session.execute(
            select(TeamModel.id).where(TeamModel.join_code == join_code)
        )
        return result.scalar_one_or_none() is not None

    async def list_for_game(self, game_id: UUID) -> list[TeamState]:
        result = await self._session.execute(select(TeamModel).where(TeamModel.game_id == game_id))
        return [_team_to_state(row) for row in result.scalars().all()]

    async def charge_credits(self, team_id: UUID, amount: int) -> int:
        """Deduct `amount` credits from the team's balance.

        Raises `InsufficientCredits(required, available)` (bubbles up from
        `CreditLedger.charge`) if the team can't afford it.
        """
        result = await self._session.execute(
            select(TeamModel).where(TeamModel.id == team_id).with_for_update()
        )
        row = result.scalar_one_or_none()
        if row is None:
            raise TeamNotFound(team_id)

        ledger = CreditLedger(balance=row.credits_balance, total_awarded=row.credits_total_awarded)
        new_balance = ledger.charge(amount)  # raises InsufficientCredits
        row.credits_balance = new_balance
        await self._session.commit()
        return new_balance

    async def refund_credits(self, team_id: UUID, amount: int) -> int:
        result = await self._session.execute(
            select(TeamModel).where(TeamModel.id == team_id).with_for_update()
        )
        row = result.scalar_one_or_none()
        if row is None:
            raise TeamNotFound(team_id)

        ledger = CreditLedger(balance=row.credits_balance, total_awarded=row.credits_total_awarded)
        new_balance = ledger.refund(amount)
        row.credits_balance = new_balance
        await self._session.commit()
        return new_balance

    async def award_round_credits(self, team_id: UUID, round_number: int) -> int:
        """Roll the team's unspent balance forward and add the round's allowance."""
        result = await self._session.execute(
            select(TeamModel).where(TeamModel.id == team_id).with_for_update()
        )
        row = result.scalar_one_or_none()
        if row is None:
            raise TeamNotFound(team_id)

        ledger = CreditLedger(balance=row.credits_balance, total_awarded=row.credits_total_awarded)
        new_balance = ledger.award_round(round_number)
        row.credits_balance = new_balance
        row.credits_total_awarded = ledger.total_awarded
        await self._session.commit()
        return new_balance

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

    async def save_accusation(
        self, team_id: UUID, round_number: int, accusation: Accusation
    ) -> None:
        """Upsert the team's accusation. A team may resubmit until the game
        is finished and scoring has consumed it.
        """
        result = await self._session.execute(
            select(AccusationModel).where(AccusationModel.team_id == team_id)
        )
        row = result.scalar_one_or_none()
        if row is None:
            row = AccusationModel(id=uuid4(), team_id=team_id, round_number=round_number)
            self._session.add(row)

        row.round_number = round_number
        row.accused_person_ids = list(accusation.accused_person_ids)
        row.coordinator_person_id = accusation.coordinator_person_id
        row.pattern = accusation.pattern.value
        row.evidence_ids = list(accusation.evidence_ids)
        row.key_relationship_ids = list(accusation.key_relationship_ids)
        row.confidence = accusation.confidence
        row.rationale = accusation.rationale
        row.submitted_at = datetime.now(UTC)
        row.scored_at = None
        await self._session.commit()

    async def get_accusation(self, team_id: UUID) -> StoredAccusation | None:
        result = await self._session.execute(
            select(AccusationModel).where(AccusationModel.team_id == team_id)
        )
        row = result.scalar_one_or_none()
        if row is None:
            return None
        accusation = Accusation(
            accused_person_ids=list(row.accused_person_ids),
            coordinator_person_id=row.coordinator_person_id,
            pattern=FraudPattern(row.pattern),
            evidence_ids=list(row.evidence_ids),
            key_relationship_ids=list(row.key_relationship_ids),
            confidence=row.confidence,
            rationale=row.rationale,
        )
        return StoredAccusation(
            accusation=accusation, round_number=row.round_number, scored_at=row.scored_at
        )

    async def mark_accusation_scored(self, team_id: UUID) -> None:
        result = await self._session.execute(
            select(AccusationModel).where(AccusationModel.team_id == team_id)
        )
        row = result.scalar_one_or_none()
        if row is None:
            raise AccusationNotFound(team_id)
        row.scored_at = datetime.now(UTC)
        await self._session.commit()
