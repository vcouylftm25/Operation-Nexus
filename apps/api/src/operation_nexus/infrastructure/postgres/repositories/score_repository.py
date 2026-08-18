"""Repository for score events and scoreboards."""

from __future__ import annotations

from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from operation_nexus.domain.game.contracts import ScoreBreakdown, ScoreEvent
from operation_nexus.infrastructure.postgres.models import ScoreEventModel, TeamModel


class ScoreRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def record_events(self, events: list[ScoreEvent]) -> None:
        rows = [
            ScoreEventModel(
                id=uuid4(),
                team_id=event.team_id,
                round_number=event.round,
                rule=event.rule,
                delta=event.delta,
                detail=event.detail,
            )
            for event in events
        ]
        self._session.add_all(rows)
        await self._session.commit()

    async def get_breakdown_for_team(self, team_id: UUID) -> ScoreBreakdown:
        result = await self._session.execute(
            select(ScoreEventModel)
            .where(ScoreEventModel.team_id == team_id)
            .order_by(ScoreEventModel.created_at)
        )
        events = [
            ScoreEvent(
                team_id=row.team_id,
                round=row.round_number,
                rule=row.rule,
                delta=row.delta,
                detail=row.detail,
            )
            for row in result.scalars().all()
        ]
        return ScoreBreakdown(team_id=team_id, events=events, total=sum(e.delta for e in events))

    async def get_scoreboard(self, game_id: UUID) -> list[ScoreBreakdown]:
        team_ids = (
            (await self._session.execute(select(TeamModel.id).where(TeamModel.game_id == game_id)))
            .scalars()
            .all()
        )
        breakdowns = [await self.get_breakdown_for_team(team_id) for team_id in team_ids]
        return sorted(breakdowns, key=lambda b: b.total, reverse=True)
