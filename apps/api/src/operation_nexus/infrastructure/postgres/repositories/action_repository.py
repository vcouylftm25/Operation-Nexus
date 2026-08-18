"""Repository for recorded investigation actions."""

from __future__ import annotations

from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from operation_nexus.infrastructure.postgres.models import InvestigationActionModel


class ActionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def record(
        self,
        team_id: UUID,
        round_number: int,
        question: str,
        answer_text: str,
        credits_charged: int,
        *,
        evidence_ids: list[str] | None = None,
        discovered_node_ids: list[str] | None = None,
        discovered_relationship_ids: list[str] | None = None,
    ) -> UUID:
        action = InvestigationActionModel(
            id=uuid4(),
            team_id=team_id,
            round_number=round_number,
            question=question,
            answer_text=answer_text,
            answer={
                "evidence_ids": evidence_ids or [],
                "discovered_node_ids": discovered_node_ids or [],
                "discovered_relationship_ids": discovered_relationship_ids or [],
            },
            credits_charged=credits_charged,
        )
        self._session.add(action)
        await self._session.commit()
        return action.id

    async def list_for_team(self, team_id: UUID) -> list[UUID]:
        result = await self._session.execute(
            select(InvestigationActionModel.id).where(InvestigationActionModel.team_id == team_id)
        )
        return list(result.scalars().all())
