"""LLM-facing investigation contracts (CONTRACT.md §5).

These are the ONLY shapes the investigator model ever produces or consumes.
There is no field anywhere in this module for a verdict, a fraud ranking, a
coordinator, or a pattern — that vocabulary belongs exclusively to
`domain.game.contracts.Accusation`, which this module never imports and
never will. `ground_truth.yaml` is never read here (golden rule §0.4).

Every tool argument is validated against a dedicated typed Pydantic model
(one per `ToolName`) before it can ever reach the query builder — an unknown
tool name fails at the `ToolName` enum boundary, and malformed arguments for
a known tool fail at `InvestigationToolCall` construction. Nothing free-form
ever reaches `infrastructure.neo4j`.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING, Annotated, Any
from uuid import UUID

from pydantic import BaseModel, Field, StringConstraints, model_validator

# --------------------------------------------------------------------------
# GraphPayload/GraphNode/GraphRelationship are owned by the graph agent
# (`domain.graph.payload`). We import them by contract name and re-export
# them (explicit `as` re-export so linters don't flag them as unused) so the
# rest of the `ai`/`domain.investigation` layers have one place to get them
# from. Guarded so our own tests keep passing even if that module hasn't
# landed yet — pyright/static analysis always assumes the real module.
# --------------------------------------------------------------------------
if TYPE_CHECKING:
    from operation_nexus.domain.graph.payload import (
        GraphNode as GraphNode,
    )
    from operation_nexus.domain.graph.payload import (
        GraphPayload as GraphPayload,
    )
    from operation_nexus.domain.graph.payload import (
        GraphRelationship as GraphRelationship,
    )
else:
    try:
        from operation_nexus.domain.graph.payload import (
            GraphNode,
            GraphPayload,
            GraphRelationship,
        )
    except ImportError:  # pragma: no cover - graph agent's module not landed yet

        class GraphNode(BaseModel):  # type: ignore[no-redef]
            """Fallback shim mirroring CONTRACT.md §5 `GraphNode` exactly.

            Used ONLY when `domain.graph.payload` is not yet on disk, so our
            own unit tests can run in isolation. Drop this branch once the
            graph agent's module lands — the `try` above will start winning.
            """

            id: str
            labels: list[str]
            properties: dict[str, Any]
            label_display: str

        class GraphRelationship(BaseModel):  # type: ignore[no-redef]
            """Fallback shim mirroring CONTRACT.md §5 `GraphRelationship`."""

            id: str
            type: str
            start_id: str
            end_id: str
            properties: dict[str, Any]

        class GraphPayload(BaseModel):  # type: ignore[no-redef]
            """Fallback shim mirroring CONTRACT.md §5 `GraphPayload`."""

            nodes: list[GraphNode] = Field(default_factory=list)
            relationships: list[GraphRelationship] = Field(default_factory=list)


# --------------------------------------------------------------------------
# Shared caps (CONTRACT.md §4) — reused by both the argument models below
# and by `ai.tools.registry` when generating LLM-facing JSON schemas, so the
# limits can never drift between validation and what the model is told.
# --------------------------------------------------------------------------
MAX_TOOL_CALLS_PER_PLAN = 2
MAX_HOPS = 4
MAX_TOP_K = 10
MAX_ENTITY_IDS = 8

_ENTITY_ID_PATTERN = (
    r"^(person|application|device|phone|email|ip|address|account|company|"
    r"broker|document|evidence|message|transaction)_\d{2,3}$"
)

EntityId = Annotated[str, StringConstraints(pattern=_ENTITY_ID_PATTERN)]


class InvestigationIntent(StrEnum):
    """What kind of investigative move the planner is making."""

    ENTITY_LOOKUP = "ENTITY_LOOKUP"
    CONNECTION_SEARCH = "CONNECTION_SEARCH"
    PATH_SEARCH = "PATH_SEARCH"
    NEIGHBORHOOD = "NEIGHBORHOOD"
    TIMELINE = "TIMELINE"
    SEMANTIC_SEARCH = "SEMANTIC_SEARCH"
    HYPOTHESIS_CHALLENGE = "HYPOTHESIS_CHALLENGE"
    OUT_OF_SCOPE = "OUT_OF_SCOPE"


class ToolName(StrEnum):
    """The complete, closed set of tools an investigator may call.

    This enum IS the allowlist. There is no `get_fraudsters`, `get_answer`,
    `get_ground_truth`, `run_cypher` or `rank_criminals` — those tools do
    not exist as Python objects anywhere in this codebase, so no plan can
    ever reference them: an unrecognized string here fails Pydantic
    validation before any other code runs.
    """

    INSPECT_ENTITY = "inspect_entity"
    FIND_SHARED_ENTITIES = "find_shared_entities"
    FIND_PATH = "find_path"
    EXPAND_NEIGHBORHOOD = "expand_neighborhood"
    TIMELINE = "timeline"
    SEMANTIC_EVIDENCE_SEARCH = "semantic_evidence_search"
    CHALLENGE_HYPOTHESIS = "challenge_hypothesis"


class SharedEntityKind(StrEnum):
    """Node labels `find_shared_entities` is allowed to pivot through."""

    DEVICE = "Device"
    PHONE = "Phone"
    EMAIL = "Email"
    IP_ADDRESS = "IPAddress"
    ADDRESS = "Address"
    BANK_ACCOUNT = "BankAccount"


# --------------------------------------------------------------------------
# Per-tool argument models (CONTRACT.md §4). Exactly one per `ToolName`,
# referenced by `TOOL_ARGUMENT_MODELS` below so `InvestigationToolCall` can
# validate `arguments` against the right shape.
# --------------------------------------------------------------------------


class InspectEntityArgs(BaseModel):
    """`inspect_entity` — node props + visible 1-hop degree summary."""

    entity_id: EntityId


class FindSharedEntitiesArgs(BaseModel):
    """`find_shared_entities` — shared Device/Phone/Email/IP/Address/Account."""

    entity_ids: Annotated[list[EntityId], Field(min_length=1, max_length=MAX_ENTITY_IDS)]
    via: list[SharedEntityKind] | None = None


class FindPathArgs(BaseModel):
    """`find_path` — up to 5 shortest visible paths between two entities."""

    from_id: EntityId
    to_id: EntityId
    max_hops: Annotated[int, Field(ge=1, le=MAX_HOPS)] = MAX_HOPS


class ExpandNeighborhoodArgs(BaseModel):
    """`expand_neighborhood` — subgraph around an entity, 1 or 2 hops."""

    entity_id: EntityId
    hops: int = Field(ge=1, le=2)

    @model_validator(mode="after")
    def _hops_must_be_one_or_two(self) -> ExpandNeighborhoodArgs:
        if self.hops not in (1, 2):
            raise ValueError("hops must be 1 or 2")
        return self


class TimelineArgs(BaseModel):
    """`timeline` — chronologically ordered visible events for an entity."""

    entity_id: EntityId
    from_ts: datetime | None = None
    to_ts: datetime | None = None


class SemanticEvidenceSearchArgs(BaseModel):
    """`semantic_evidence_search` — Evidence/Message + graph expansion."""

    query: Annotated[str, Field(min_length=1, max_length=500)]
    top_k: Annotated[int, Field(ge=1, le=MAX_TOP_K)] = 5


class ChallengeHypothesisArgs(BaseModel):
    """`challenge_hypothesis` — counter-evidence only, never confirmation."""

    hypothesis: Annotated[str, Field(min_length=3, max_length=500)]
    entity_ids: Annotated[list[EntityId], Field(min_length=1, max_length=MAX_ENTITY_IDS)]


TOOL_ARGUMENT_MODELS: dict[ToolName, type[BaseModel]] = {
    ToolName.INSPECT_ENTITY: InspectEntityArgs,
    ToolName.FIND_SHARED_ENTITIES: FindSharedEntitiesArgs,
    ToolName.FIND_PATH: FindPathArgs,
    ToolName.EXPAND_NEIGHBORHOOD: ExpandNeighborhoodArgs,
    ToolName.TIMELINE: TimelineArgs,
    ToolName.SEMANTIC_EVIDENCE_SEARCH: SemanticEvidenceSearchArgs,
    ToolName.CHALLENGE_HYPOTHESIS: ChallengeHypothesisArgs,
}


class InvestigationToolCall(BaseModel):
    """One planned tool invocation.

    `arguments` stays `dict[str, Any]` (CONTRACT.md §5's exact shape) but is
    never accepted as-is: the `after` validator below parses it through the
    tool's dedicated argument model — normalizing defaults and coercing
    types — then writes the *validated* dump back. An unknown `tool` value
    never reaches this validator at all: it fails at the `ToolName` field
    itself.
    """

    tool: ToolName
    arguments: dict[str, Any]
    justification: str

    @model_validator(mode="after")
    def _validate_arguments_against_tool_schema(self) -> InvestigationToolCall:
        args_model = TOOL_ARGUMENT_MODELS[self.tool]
        try:
            validated = args_model.model_validate(self.arguments)
        except Exception as exc:
            raise ValueError(f"invalid arguments for tool '{self.tool.value}': {exc}") from exc
        self.arguments = validated.model_dump(mode="json")
        return self


class InvestigationPlan(BaseModel):
    """The ONLY artifact the planner produces. No free text, ever."""

    intent: InvestigationIntent
    tool_calls: Annotated[
        list[InvestigationToolCall], Field(max_length=MAX_TOOL_CALLS_PER_PLAN)
    ] = Field(default_factory=list)
    reasoning_summary: str

    @model_validator(mode="after")
    def _out_of_scope_has_no_tool_calls(self) -> InvestigationPlan:
        if self.intent is InvestigationIntent.OUT_OF_SCOPE and self.tool_calls:
            raise ValueError("OUT_OF_SCOPE intent must not carry any tool_calls")
        return self


class EvidenceRef(BaseModel):
    """A citation back to one Evidence/Message node — never the raw node."""

    id: str
    evidence_type: str
    excerpt: str
    source: str
    captured_at: datetime | None = None


class InvestigationAnswer(BaseModel):
    """The synthesizer's structured output — grounded in retrieved evidence only."""

    answer: str
    evidence_ids: list[str] = Field(default_factory=list)
    discovered_node_ids: list[str] = Field(default_factory=list)
    discovered_relationship_ids: list[str] = Field(default_factory=list)
    caveats: list[str] = Field(default_factory=list)


class InvestigationResult(BaseModel):
    """What `POST /teams/{team_id}/investigate` returns."""

    action_id: UUID
    question: str
    plan: InvestigationPlan
    answer: InvestigationAnswer
    subgraph: GraphPayload
    credits_charged: int
    credits_remaining: int
