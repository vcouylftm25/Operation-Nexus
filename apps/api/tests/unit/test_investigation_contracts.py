"""InvestigationPlan / tool-argument validation — CONTRACT.md §4-§5."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from operation_nexus.domain.investigation.contracts import (
    MAX_TOOL_CALLS_PER_PLAN,
    InspectEntityArgs,
    InvestigationIntent,
    InvestigationPlan,
    InvestigationToolCall,
    ToolName,
)


def _inspect_call(entity_id: str = "person_01") -> InvestigationToolCall:
    return InvestigationToolCall(
        tool=ToolName.INSPECT_ENTITY,
        arguments={"entity_id": entity_id},
        justification="unit-test inspect",
    )


def test_investigation_plan_rejects_more_than_two_tool_calls() -> None:
    assert MAX_TOOL_CALLS_PER_PLAN == 2
    with pytest.raises(ValidationError):
        InvestigationPlan(
            intent=InvestigationIntent.ENTITY_LOOKUP,
            tool_calls=[
                _inspect_call("person_01"),
                _inspect_call("person_02"),
                _inspect_call("person_03"),
            ],
            reasoning_summary="three calls is over the cap",
        )


def test_out_of_scope_cannot_carry_tool_calls() -> None:
    with pytest.raises(ValidationError):
        InvestigationPlan(
            intent=InvestigationIntent.OUT_OF_SCOPE,
            tool_calls=[_inspect_call()],
            reasoning_summary="jailbreak must not execute tools",
        )


def test_out_of_scope_with_empty_tool_calls_is_valid() -> None:
    plan = InvestigationPlan(
        intent=InvestigationIntent.OUT_OF_SCOPE,
        tool_calls=[],
        reasoning_summary="refused",
    )
    assert plan.tool_calls == []


def test_unknown_tool_name_fails_validation() -> None:
    with pytest.raises(ValidationError):
        InvestigationToolCall.model_validate(
            {
                "tool": "get_fraudsters",
                "arguments": {},
                "justification": "must never exist",
            }
        )
    with pytest.raises(ValidationError):
        InvestigationPlan.model_validate(
            {
                "intent": "ENTITY_LOOKUP",
                "tool_calls": [
                    {
                        "tool": "run_cypher",
                        "arguments": {"cypher": "MATCH (n) RETURN n"},
                        "justification": "injection",
                    }
                ],
                "reasoning_summary": "unknown tool",
            }
        )


@pytest.mark.parametrize("entity_id", ["MATCH (n)", "person_X"])
def test_entity_id_regex_rejects_cypher_and_placeholder_ids(entity_id: str) -> None:
    with pytest.raises(ValidationError):
        InspectEntityArgs(entity_id=entity_id)
    with pytest.raises(ValidationError):
        InvestigationToolCall(
            tool=ToolName.INSPECT_ENTITY,
            arguments={"entity_id": entity_id},
            justification="malformed id",
        )
