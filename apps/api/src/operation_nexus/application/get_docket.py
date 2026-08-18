"""Use case: the round-1 docket — visible people, free to browse, paid to inspect."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel

from operation_nexus.application.ports import GraphReader
from operation_nexus.domain.graph.payload import GraphNode
from operation_nexus.infrastructure.postgres.repositories.team_repository import (
    TeamNotFound,
    TeamRepository,
)


class CaseFile(BaseModel):
    id: str
    labels: list[str]
    label_display: str
    occupation: str | None = None
    credit_score: int | None = None
    income_declared: float | None = None
    age: int | None = None
    amount: float | None = None
    product: str | None = None
    status: str | None = None


def case_file_from_node(node: GraphNode) -> CaseFile:
    props = node.properties
    score = props.get("credit_score")
    income = props.get("income_declared")
    age = props.get("age")
    amount = props.get("amount")
    return CaseFile(
        id=node.id,
        labels=list(node.labels),
        label_display=node.label_display,
        occupation=str(props["occupation"]) if props.get("occupation") is not None else None,
        credit_score=int(score) if isinstance(score, int | float) else None,
        income_declared=float(income) if isinstance(income, int | float) else None,
        age=int(age) if isinstance(age, int | float) else None,
        amount=float(amount) if isinstance(amount, int | float) else None,
        product=str(props["product"]) if props.get("product") is not None else None,
        status=str(props["status"]) if props.get("status") is not None else None,
    )


class GetDocket:
    def __init__(
        self,
        team_repo: TeamRepository,
        graph_reader: GraphReader,
    ) -> None:
        self._team_repo = team_repo
        self._graph_reader = graph_reader

    async def execute(self, team_id: UUID) -> list[CaseFile]:
        team = await self._team_repo.get(team_id)
        if team is None:
            raise TeamNotFound(team_id)
        payload = await self._graph_reader.list_case_files(team.current_round)
        files = [case_file_from_node(node) for node in payload.nodes]
        files.sort(key=lambda row: (0 if "Person" in row.labels else 1, row.label_display))
        return files
