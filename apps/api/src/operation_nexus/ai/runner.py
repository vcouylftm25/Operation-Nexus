"""InvestigationRunner implementations wired by the API lifespan.

`DeterministicInvestigationRunner` (AI_ENABLED=false) is always importable.
`LangGraphInvestigationRunner` imports LangGraph lazily so `uv sync` without
the `ai` extra still boots the API.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from operation_nexus.domain.investigation.contracts import InvestigationResult


class LangGraphInvestigationRunner:
    """Runs the compiled LangGraph state machine for one investigation."""

    def __init__(self, compiled_graph: Any) -> None:
        self._graph = compiled_graph

    async def run(
        self,
        team_id: UUID,
        question: str,
        current_round: int,
        *,
        credits_available: int = 0,
        known_entities: dict[str, str] | None = None,
    ) -> InvestigationResult:
        state = await self._graph.ainvoke(
            {
                "team_id": str(team_id),
                "question": question,
                "current_round": current_round,
                "credits_available": credits_available,
                "known_entities": known_entities or {},
            }
        )
        result = state["result"]
        if isinstance(result, InvestigationResult):
            return result
        return InvestigationResult.model_validate(result)
