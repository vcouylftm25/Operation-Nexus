"""Players speak names; tools take ids. Regression for the missing mapping.

`known_entities` was built as `{node_id: node_id}`, so the planner saw
"person_05 — person_05" and could not resolve "Roberto Alves" to anything.
Every natural-language question degraded to OUT_OF_SCOPE, which reads to a
team as the AI refusing to play.
"""

from __future__ import annotations

import pytest

from operation_nexus.application.graph_reader import Neo4jGraphReader
from operation_nexus.domain.graph.payload import GraphNode, GraphPayload


class _StubRepository:
    def __init__(self, payload: GraphPayload) -> None:
        self._payload = payload
        self.requested_round: int | None = None

    async def list_case_files(self, current_round: int) -> GraphPayload:
        self.requested_round = current_round
        return self._payload


@pytest.mark.asyncio
async def test_roster_maps_ids_to_human_names() -> None:
    repo = _StubRepository(
        GraphPayload(
            nodes=[
                GraphNode(
                    id="person_05",
                    labels=["Person"],
                    properties={"name": "Roberto Alves"},
                    label_display="Roberto Alves",
                )
            ],
            relationships=[],
        )
    )
    roster = await Neo4jGraphReader(repo).entity_roster(1)  # type: ignore[arg-type]

    assert roster["person_05"] == "Roberto Alves (Person)"
    assert roster["person_05"] != "person_05"


@pytest.mark.asyncio
async def test_roster_is_round_gated() -> None:
    """A name the team cannot see yet must not be spendable as a tool argument."""
    repo = _StubRepository(GraphPayload.empty())
    await Neo4jGraphReader(repo).entity_roster(2)  # type: ignore[arg-type]
    assert repo.requested_round == 2
