"""Investigation tool credit costs (CONTRACT.md §4) — the single cost dict.

`ai.tools.registry` and `ai.graph.investigation_graph` both import
`tool_call_cost`/`estimate_cost` from here rather than hardcoding numbers, so
there is exactly one place the game's economy is defined.
"""

from __future__ import annotations

from typing import Any

from operation_nexus.domain.investigation.contracts import InvestigationPlan, ToolName

#: Base credit cost per tool. `EXPAND_NEIGHBORHOOD`'s entry is the 1-hop
#: price — `tool_call_cost` applies the 2-hop premium (20) below.
TOOL_COSTS: dict[ToolName, int] = {
    ToolName.INSPECT_ENTITY: 5,
    ToolName.FIND_SHARED_ENTITIES: 10,
    ToolName.FIND_PATH: 15,
    ToolName.EXPAND_NEIGHBORHOOD: 15,
    ToolName.TIMELINE: 10,
    ToolName.SEMANTIC_EVIDENCE_SEARCH: 20,
    ToolName.CHALLENGE_HYPOTHESIS: 25,
}

_EXPAND_NEIGHBORHOOD_TWO_HOP_COST = 20


def tool_call_cost(tool: ToolName, arguments: dict[str, Any]) -> int:
    """Cost of a single tool call, accounting for `expand_neighborhood`'s hop premium."""
    if tool is ToolName.EXPAND_NEIGHBORHOOD and int(arguments.get("hops", 1)) == 2:
        return _EXPAND_NEIGHBORHOOD_TWO_HOP_COST
    return TOOL_COSTS[tool]


def estimate_cost(plan: InvestigationPlan) -> int:
    """Total credit cost of every tool call in `plan` (at most 2, per §4)."""
    return sum(tool_call_cost(call.tool, call.arguments) for call in plan.tool_calls)
