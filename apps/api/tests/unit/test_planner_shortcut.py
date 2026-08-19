"""A UI click already names its tool, so the planner model must stay out of it.

Every button in the web app submits the command DSL verbatim (`/inspect
person_04`, `/expand person_04 1`). Routing those through the planner costs a
model round trip per click, which is the difference between a graph that
responds instantly and one that stalls for seconds.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import uuid4

import pytest

from operation_nexus.ai.graph.investigation_graph import build_investigation_graph
from operation_nexus.ai.tools.registry import ToolResult
from operation_nexus.domain.investigation.contracts import (
    InvestigationAnswer,
    InvestigationIntent,
    InvestigationPlan,
)
from operation_nexus.infrastructure.azure_openai.fake import (
    FakeChatModel,
    FakeEmbeddingProvider,
)


class _EmptyRepository:
    async def inspect_entity(self, *, entity_id: str, round: int) -> ToolResult:
        return ToolResult()

    async def find_shared_entities(
        self, *, entity_ids: list[str], via: list[str] | None, round: int
    ) -> ToolResult:
        return ToolResult()

    async def find_path(self, *, from_id: str, to_id: str, max_hops: int, round: int) -> ToolResult:
        return ToolResult()

    async def expand_neighborhood(self, *, entity_id: str, hops: int, round: int) -> ToolResult:
        return ToolResult()

    async def timeline(
        self,
        *,
        entity_id: str,
        from_ts: datetime | None,
        to_ts: datetime | None,
        round: int,
    ) -> ToolResult:
        return ToolResult()

    async def semantic_evidence_search(
        self, *, query_embedding: list[float] | None, top_k: int, round: int, query: str = ""
    ) -> ToolResult:
        return ToolResult()

    async def challenge_hypothesis(
        self, *, hypothesis: str, entity_ids: list[str], round: int
    ) -> ToolResult:
        return ToolResult()


class _CountingChatModel(FakeChatModel):
    """Counts how often each structured schema is actually asked for."""

    def __init__(self, counts: dict[str, int], **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self.counts = counts

    def with_structured_output(self, schema: type[Any]) -> _CountingChatModel:
        clone = _CountingChatModel(self.counts, plan=self.plan, answer=self.answer)
        clone._schema = schema
        return clone

    async def ainvoke(self, messages: Any) -> Any:
        key = "answer" if self._schema is InvestigationAnswer else "plan"
        self.counts[key] = self.counts.get(key, 0) + 1
        return await super().ainvoke(messages)


async def _run(question: str, counts: dict[str, int]) -> None:
    graph = build_investigation_graph(
        chat_model=_CountingChatModel(  # type: ignore[arg-type]
            counts,
            answer=InvestigationAnswer(answer="ok", caveats=[]),
        ),
        repository=_EmptyRepository(),
        embedder=FakeEmbeddingProvider(dimensions=8),
    )
    await graph.ainvoke(
        {
            "team_id": str(uuid4()),
            "question": question,
            "current_round": 3,
            "credits_available": 500,
            "known_entities": {},
        }
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "command",
    [
        "/inspect person_04",
        "/expand person_04 1",
        "/shared person_01,person_03",
        "/timeline person_04",
    ],
)
async def test_dsl_command_skips_the_planner_model(command: str) -> None:
    counts: dict[str, int] = {}
    await _run(command, counts)
    assert counts.get("plan", 0) == 0, f"{command} should not need the planner"


@pytest.mark.asyncio
async def test_free_text_still_reaches_the_planner() -> None:
    counts: dict[str, int] = {}
    await _run("quem compartilha aparelho com a Isabela?", counts)
    assert counts.get("plan", 0) == 1


def test_parser_leaves_free_text_to_the_model() -> None:
    """The shortcut must trigger on commands only, never on a real question."""
    from operation_nexus.ai.deterministic import parse_investigation_command

    assert (
        parse_investigation_command("quem transferiu dinheiro?").intent
        is InvestigationIntent.OUT_OF_SCOPE
    )
    plan: InvestigationPlan = parse_investigation_command("/inspect person_04")
    assert plan.intent is not InvestigationIntent.OUT_OF_SCOPE
    assert len(plan.tool_calls) == 1
