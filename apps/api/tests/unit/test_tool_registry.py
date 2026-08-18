"""The LLM-facing registry is the allowlist — CONTRACT.md §4."""

from __future__ import annotations

from operation_nexus.ai.tools.registry import TOOL_REGISTRY, assert_registry_has_no_forbidden_tools
from operation_nexus.domain.investigation.contracts import InspectEntityArgs, ToolName

_CONTRACT_TOOLS = (
    ToolName.INSPECT_ENTITY,
    ToolName.FIND_SHARED_ENTITIES,
    ToolName.FIND_PATH,
    ToolName.EXPAND_NEIGHBORHOOD,
    ToolName.TIMELINE,
    ToolName.SEMANTIC_EVIDENCE_SEARCH,
    ToolName.CHALLENGE_HYPOTHESIS,
)

_FORBIDDEN_NAMES = (
    "get_fraudsters",
    "get_answer",
    "get_ground_truth",
    "run_cypher",
    "rank_criminals",
)


def test_registry_contains_exactly_the_seven_contract_tools() -> None:
    assert len(TOOL_REGISTRY) == 7
    assert set(TOOL_REGISTRY) == set(_CONTRACT_TOOLS) == set(ToolName)


def test_assert_registry_has_no_forbidden_tools_passes() -> None:
    assert_registry_has_no_forbidden_tools()


def test_forbidden_tool_names_are_not_in_the_registry() -> None:
    registered_names = {name.value for name in TOOL_REGISTRY}
    registered_methods = {spec.repository_method for spec in TOOL_REGISTRY.values()}
    enum_values = {name.value for name in ToolName}
    for forbidden in _FORBIDDEN_NAMES:
        assert forbidden not in registered_names
        assert forbidden not in registered_methods
        assert forbidden not in enum_values


def test_llm_schema_is_generated_from_the_pydantic_args_model() -> None:
    spec = TOOL_REGISTRY[ToolName.INSPECT_ENTITY]
    schema = spec.llm_schema
    parameters = schema["function"]["parameters"]

    assert schema["type"] == "function"
    assert schema["function"]["name"] == ToolName.INSPECT_ENTITY.value
    assert parameters == InspectEntityArgs.model_json_schema()
    assert "entity_id" in parameters["properties"]

    for tool_name, tool_spec in TOOL_REGISTRY.items():
        generated = tool_spec.llm_schema["function"]["parameters"]
        assert generated == tool_spec.args_model.model_json_schema()
        assert tool_spec.llm_schema["function"]["name"] == tool_name.value
