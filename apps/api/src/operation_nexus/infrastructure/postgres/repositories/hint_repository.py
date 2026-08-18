"""Repository for hints a team has paid to unlock."""

from __future__ import annotations

from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from operation_nexus.infrastructure.postgres.models import HintPurchaseModel


class HintRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def record(
        self, team_id: UUID, hint_id: str, *, round_number: int, credits_charged: int
    ) -> None:
        self._session.add(
            HintPurchaseModel(
                id=uuid4(),
                team_id=team_id,
                hint_id=hint_id,
                round_number=round_number,
                credits_charged=credits_charged,
            )
        )
        await self._session.commit()

    async def list_purchased_ids(self, team_id: UUID) -> set[str]:
        result = await self._session.execute(
            select(HintPurchaseModel.hint_id).where(HintPurchaseModel.team_id == team_id)
        )
        return set(result.scalars().all())

    async def count_for_team(self, team_id: UUID) -> int:
        result = await self._session.execute(
            select(func.count())
            .select_from(HintPurchaseModel)
            .where(HintPurchaseModel.team_id == team_id)
        )
        return int(result.scalar_one())

    async def count_by_team(self, team_ids: list[UUID]) -> dict[UUID, int]:
        """Purchase counts for a whole game, for the leaderboard."""
        if not team_ids:
            return {}
        result = await self._session.execute(
            select(HintPurchaseModel.team_id, func.count())
            .where(HintPurchaseModel.team_id.in_(team_ids))
            .group_by(HintPurchaseModel.team_id)
        )
        return {team_id: int(count) for team_id, count in result.all()}
