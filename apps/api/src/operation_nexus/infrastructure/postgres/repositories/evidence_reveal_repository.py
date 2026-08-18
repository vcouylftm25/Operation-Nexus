"""Persistence for host-released, game-wide evidence."""

from __future__ import annotations

from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from operation_nexus.infrastructure.postgres.models import EvidenceRevealModel


class EvidenceRevealRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def record(
        self,
        game_id: UUID,
        evidence_id: str,
        round_number: int,
        payload: dict[str, object],
    ) -> dict[str, object]:
        """Persist once and return the canonical payload for broadcasting."""
        statement = (
            pg_insert(EvidenceRevealModel)
            .values(
                id=uuid4(),
                game_id=game_id,
                evidence_id=evidence_id,
                round_number=round_number,
                payload=payload,
            )
            .on_conflict_do_update(
                constraint="uq_evidence_reveals_game_evidence",
                set_={"payload": payload, "round_number": round_number},
            )
        )
        await self._session.execute(statement)
        await self._session.commit()
        return payload

    async def list_for_game(self, game_id: UUID) -> list[dict[str, object]]:
        result = await self._session.execute(
            select(EvidenceRevealModel)
            .where(EvidenceRevealModel.game_id == game_id)
            .order_by(EvidenceRevealModel.revealed_at, EvidenceRevealModel.evidence_id)
        )
        return [dict(row.payload) for row in result.scalars().all()]
