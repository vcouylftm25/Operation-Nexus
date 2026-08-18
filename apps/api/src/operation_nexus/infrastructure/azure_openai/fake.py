"""Zero-network stand-ins for Azure chat + embeddings.

Used by unit/golden tests and by `AI_ENABLED=false` seed paths that still
want a vector-shaped property without calling Azure. Nothing here talks to
the network or reads `ground_truth.yaml`.
"""

from __future__ import annotations

import hashlib
from collections.abc import Sequence
from typing import Any

from operation_nexus.domain.graph.schema import EMBEDDING_DIMENSIONS
from operation_nexus.domain.investigation.contracts import (
    InvestigationAnswer,
    InvestigationIntent,
    InvestigationPlan,
)


class FakeEmbeddingProvider:
    """Deterministic hash-based vectors. Stable across processes, no I/O."""

    def __init__(self, dimensions: int = EMBEDDING_DIMENSIONS) -> None:
        self.dimensions = dimensions

    def _vector(self, text: str) -> list[float]:
        digest = hashlib.sha256(text.encode("utf-8")).digest()
        values: list[float] = []
        block = digest
        while len(values) < self.dimensions:
            block = hashlib.sha256(block).digest()
            values.extend((byte / 255.0) * 2.0 - 1.0 for byte in block)
        return values[: self.dimensions]

    async def embed(self, texts: Sequence[str]) -> list[list[float]]:
        return [self._vector(text) for text in texts]

    async def embed_query(self, text: str) -> list[float]:
        return self._vector(text)


class FakeChatModel:
    """Minimal structured-output chat stand-in.

    Returns a canned `InvestigationPlan` / `InvestigationAnswer` so
    `build_investigation_graph` can be exercised with zero network. Not a
    full LangChain `BaseChatModel` — the graph only needs
    `with_structured_output(...).ainvoke(...)`.
    """

    def __init__(
        self,
        *,
        plan: InvestigationPlan | None = None,
        answer: InvestigationAnswer | None = None,
    ) -> None:
        self.plan = plan or InvestigationPlan(
            intent=InvestigationIntent.OUT_OF_SCOPE,
            tool_calls=[],
            reasoning_summary="fake chat model: no live LLM configured",
        )
        self.answer = answer or InvestigationAnswer(
            answer="fake chat model: nenhuma evidência sintetizada.",
            caveats=["FAKE_CHAT_MODEL"],
        )
        self._schema: type[Any] | None = None

    def with_structured_output(self, schema: type[Any]) -> FakeChatModel:
        clone = FakeChatModel(plan=self.plan, answer=self.answer)
        clone._schema = schema
        return clone

    async def ainvoke(self, messages: Any) -> Any:
        del messages
        if self._schema is InvestigationAnswer:
            return self.answer
        return self.plan
