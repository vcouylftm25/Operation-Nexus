"""Repository for a team's attempts at naming the fraudster."""

from __future__ import annotations

from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from operation_nexus.infrastructure.postgres.models import GuessAttemptModel


class GuessRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def record(
        self,
        team_id: UUID,
        *,
        attempt_number: int,
        guessed_person_id: str,
        correct: bool,
        round_number: int,
    ) -> None:
        self._session.add(
            GuessAttemptModel(
                id=uuid4(),
                team_id=team_id,
                attempt_number=attempt_number,
                guessed_person_id=guessed_person_id,
                correct=correct,
                round_number=round_number,
            )
        )
        await self._session.commit()

    async def list_guessed_ids(self, team_id: UUID) -> list[str]:
        """Which people this team already named, so the UI can grey them out."""
        result = await self._session.execute(
            select(GuessAttemptModel.guessed_person_id)
            .where(GuessAttemptModel.team_id == team_id)
            .order_by(GuessAttemptModel.attempt_number)
        )
        return list(result.scalars().all())

    async def count_wrong(self, team_id: UUID) -> int:
        result = await self._session.execute(
            select(func.count())
            .select_from(GuessAttemptModel)
            .where(GuessAttemptModel.team_id == team_id, GuessAttemptModel.correct.is_(False))
        )
        return int(result.scalar_one())

    async def count_wrong_by_team(self, team_ids: list[UUID]) -> dict[UUID, int]:
        """Wrong-guess counts for a whole game, for the leaderboard."""
        if not team_ids:
            return {}
        result = await self._session.execute(
            select(GuessAttemptModel.team_id, func.count())
            .where(GuessAttemptModel.team_id.in_(team_ids), GuessAttemptModel.correct.is_(False))
            .group_by(GuessAttemptModel.team_id)
        )
        return {team_id: int(count) for team_id, count in result.all()}
