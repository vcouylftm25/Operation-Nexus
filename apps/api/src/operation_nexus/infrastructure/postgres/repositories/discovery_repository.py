"""Repository for per-team graph discoveries.

A `Discovery` row is written per (team, node_id | relationship_id), first
time only (CONTRACT.md §7) -- enforced here with `ON CONFLICT DO NOTHING`
against the unique constraints on `(team_id, node_id)` and
`(team_id, relationship_id)`, so re-discovering something already known never
double-counts or double-broadcasts.
"""

from __future__ import annotations

from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from operation_nexus.infrastructure.postgres.models import DiscoveryModel


class DiscoveryRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def record_new(
        self,
        team_id: UUID,
        round_number: int,
        node_ids: list[str],
        relationship_ids: list[str],
        source_action_id: UUID | None = None,
    ) -> tuple[list[str], list[str]]:
        """Insert discoveries, returning only the ones that were newly written."""
        new_nodes: list[str] = []
        new_relationships: list[str] = []

        if node_ids:
            stmt = (
                pg_insert(DiscoveryModel)
                .values(
                    [
                        {
                            "id": uuid4(),
                            "team_id": team_id,
                            "round_number": round_number,
                            "node_id": node_id,
                            "relationship_id": None,
                            "source_action_id": source_action_id,
                        }
                        for node_id in dict.fromkeys(node_ids)
                    ]
                )
                .on_conflict_do_nothing(constraint="uq_discoveries_team_node")
                .returning(DiscoveryModel.node_id)
            )
            result = await self._session.execute(stmt)
            new_nodes = [row for row in result.scalars().all() if row is not None]

        if relationship_ids:
            stmt = (
                pg_insert(DiscoveryModel)
                .values(
                    [
                        {
                            "id": uuid4(),
                            "team_id": team_id,
                            "round_number": round_number,
                            "node_id": None,
                            "relationship_id": relationship_id,
                            "source_action_id": source_action_id,
                        }
                        for relationship_id in dict.fromkeys(relationship_ids)
                    ]
                )
                .on_conflict_do_nothing(constraint="uq_discoveries_team_relationship")
                .returning(DiscoveryModel.relationship_id)
            )
            result = await self._session.execute(stmt)
            new_relationships = [row for row in result.scalars().all() if row is not None]

        await self._session.commit()
        return new_nodes, new_relationships

    async def list_for_team(self, team_id: UUID) -> tuple[list[str], list[str]]:
        result = await self._session.execute(
            select(DiscoveryModel.node_id, DiscoveryModel.relationship_id).where(
                DiscoveryModel.team_id == team_id
            )
        )
        node_ids: list[str] = []
        relationship_ids: list[str] = []
        for node_id, relationship_id in result.all():
            if node_id is not None:
                node_ids.append(node_id)
            if relationship_id is not None:
                relationship_ids.append(relationship_id)
        return node_ids, relationship_ids
