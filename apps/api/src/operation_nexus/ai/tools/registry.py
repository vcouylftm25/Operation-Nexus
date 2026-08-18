"""The LLM-facing tool registry — the ONLY tools an investigator may call.

Each entry pairs (1) a typed Pydantic arguments model owned by
`domain.investigation.contracts`, (2) a credit-cost function from
`domain.investigation.costs`, (3) the `GraphRepository` method name that
executes it, and (4) a JSON schema generated FROM the arguments model, so
the schema handed to the LLM can never drift from what actually gets
validated.

By construction there is no entry here — and can never be one, short of
editing this file — that ranks, names, or reveals fraud: every tool returns
raw, round-visibility-filtered graph facts (nodes/relationships/evidence),
never a verdict. `test_registry_has_no_forbidden_tools` below is the
regression test that keeps it that way.
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol, runtime_checkable

from pydantic import BaseModel, Field

from operation_nexus.domain.investigation.contracts import (
    ChallengeHypothesisArgs,
    EvidenceRef,
    ExpandNeighborhoodArgs,
    FindPathArgs,
    FindSharedEntitiesArgs,
    GraphNode,
    GraphPayload,
    GraphRelationship,
    InspectEntityArgs,
    SemanticEvidenceSearchArgs,
    TimelineArgs,
    ToolName,
)
from operation_nexus.domain.investigation.costs import tool_call_cost


class ToolResult(BaseModel):
    """Normalized shape every `GraphRepositoryProtocol` method returns.

    Intentionally narrow: raw nodes, relationships and evidence citations
    only. There is structurally no field here for a score, a rank, or a
    fraud verdict.
    """

    nodes: list[GraphNode] = Field(default_factory=list)
    relationships: list[GraphRelationship] = Field(default_factory=list)
    evidence: list[EvidenceRef] = Field(default_factory=list)

    def to_graph_payload(self) -> GraphPayload:
        return GraphPayload(nodes=list(self.nodes), relationships=list(self.relationships))


@runtime_checkable
class GraphRepositoryProtocol(Protocol):
    """Structural contract toward `infrastructure.neo4j.repository.GraphRepository`.

    Declared as a `Protocol` (not imported concretely) so `ai/` never has a
    hard dependency on the graph agent's module landing first, and so the
    entire investigation graph can be exercised against a fake in tests.
    Every method takes the current round explicitly — round-visibility
    filtering (§0.6) is the repository/query builder's job, never the LLM's.
    """

    async def inspect_entity(self, *, entity_id: str, round: int) -> ToolResult: ...

    async def find_shared_entities(
        self, *, entity_ids: list[str], via: list[str] | None, round: int
    ) -> ToolResult: ...

    async def find_path(
        self, *, from_id: str, to_id: str, max_hops: int, round: int
    ) -> ToolResult: ...

    async def expand_neighborhood(self, *, entity_id: str, hops: int, round: int) -> ToolResult: ...

    async def timeline(
        self, *, entity_id: str, from_ts: datetime | None, to_ts: datetime | None, round: int
    ) -> ToolResult: ...

    async def semantic_evidence_search(
        self, *, query_embedding: list[float] | None, top_k: int, round: int, query: str = ""
    ) -> ToolResult: ...

    async def challenge_hypothesis(
        self, *, hypothesis: str, entity_ids: list[str], round: int
    ) -> ToolResult: ...


ArgsToKwargs = Callable[[BaseModel, int], dict[str, Any]]


def _inspect_entity_kwargs(args: BaseModel, round_: int) -> dict[str, Any]:
    assert isinstance(args, InspectEntityArgs)
    return {"entity_id": args.entity_id, "round": round_}


def _find_shared_entities_kwargs(args: BaseModel, round_: int) -> dict[str, Any]:
    assert isinstance(args, FindSharedEntitiesArgs)
    return {
        "entity_ids": list(args.entity_ids),
        "via": [v.value for v in args.via] if args.via else None,
        "round": round_,
    }


def _find_path_kwargs(args: BaseModel, round_: int) -> dict[str, Any]:
    assert isinstance(args, FindPathArgs)
    return {
        "from_id": args.from_id,
        "to_id": args.to_id,
        "max_hops": args.max_hops,
        "round": round_,
    }


def _expand_neighborhood_kwargs(args: BaseModel, round_: int) -> dict[str, Any]:
    assert isinstance(args, ExpandNeighborhoodArgs)
    return {"entity_id": args.entity_id, "hops": args.hops, "round": round_}


def _timeline_kwargs(args: BaseModel, round_: int) -> dict[str, Any]:
    assert isinstance(args, TimelineArgs)
    return {
        "entity_id": args.entity_id,
        "from_ts": args.from_ts,
        "to_ts": args.to_ts,
        "round": round_,
    }


def _semantic_evidence_search_kwargs(args: BaseModel, round_: int) -> dict[str, Any]:
    """`query_embedding` is NOT included here — the graph node embeds
    `args.query` asynchronously (via the injected `EmbeddingProvider`) and
    merges it in, since building an embedding is an async I/O call this
    synchronous kwargs-builder cannot make."""
    assert isinstance(args, SemanticEvidenceSearchArgs)
    return {"top_k": args.top_k, "round": round_, "query": args.query}


def _challenge_hypothesis_kwargs(args: BaseModel, round_: int) -> dict[str, Any]:
    assert isinstance(args, ChallengeHypothesisArgs)
    return {"hypothesis": args.hypothesis, "entity_ids": list(args.entity_ids), "round": round_}


@dataclass(frozen=True)
class ToolSpec:
    name: ToolName
    description: str
    args_model: type[BaseModel]
    repository_method: str
    to_repository_kwargs: ArgsToKwargs
    cost_fn: Callable[[dict[str, Any]], int]

    @property
    def llm_schema(self) -> dict[str, Any]:
        """OpenAI/LangChain function-calling style schema, generated FROM
        `args_model` — this can never drift from what actually validates."""
        return {
            "type": "function",
            "function": {
                "name": self.name.value,
                "description": self.description,
                "parameters": self.args_model.model_json_schema(),
            },
        }


TOOL_REGISTRY: dict[ToolName, ToolSpec] = {
    ToolName.INSPECT_ENTITY: ToolSpec(
        name=ToolName.INSPECT_ENTITY,
        description=(
            "Retorna as propriedades de um nó e um resumo do grau (1 salto) "
            "visível na rodada atual."
        ),
        args_model=InspectEntityArgs,
        repository_method="inspect_entity",
        to_repository_kwargs=_inspect_entity_kwargs,
        cost_fn=lambda arguments: tool_call_cost(ToolName.INSPECT_ENTITY, arguments),
    ),
    ToolName.FIND_SHARED_ENTITIES: ToolSpec(
        name=ToolName.FIND_SHARED_ENTITIES,
        description=(
            "Retorna nós de Device/Phone/Email/IPAddress/Address/BankAccount "
            "compartilhados entre as entidades informadas."
        ),
        args_model=FindSharedEntitiesArgs,
        repository_method="find_shared_entities",
        to_repository_kwargs=_find_shared_entities_kwargs,
        cost_fn=lambda arguments: tool_call_cost(ToolName.FIND_SHARED_ENTITIES, arguments),
    ),
    ToolName.FIND_PATH: ToolSpec(
        name=ToolName.FIND_PATH,
        description="Retorna até 5 caminhos mais curtos visíveis entre duas entidades.",
        args_model=FindPathArgs,
        repository_method="find_path",
        to_repository_kwargs=_find_path_kwargs,
        cost_fn=lambda arguments: tool_call_cost(ToolName.FIND_PATH, arguments),
    ),
    ToolName.EXPAND_NEIGHBORHOOD: ToolSpec(
        name=ToolName.EXPAND_NEIGHBORHOOD,
        description=(
            "Retorna o subgrafo ao redor de uma entidade (1 ou 2 saltos), "
            "respeitando a visibilidade da rodada."
        ),
        args_model=ExpandNeighborhoodArgs,
        repository_method="expand_neighborhood",
        to_repository_kwargs=_expand_neighborhood_kwargs,
        cost_fn=lambda arguments: tool_call_cost(ToolName.EXPAND_NEIGHBORHOOD, arguments),
    ),
    ToolName.TIMELINE: ToolSpec(
        name=ToolName.TIMELINE,
        description="Retorna eventos ordenados cronologicamente relacionados à entidade.",
        args_model=TimelineArgs,
        repository_method="timeline",
        to_repository_kwargs=_timeline_kwargs,
        cost_fn=lambda arguments: tool_call_cost(ToolName.TIMELINE, arguments),
    ),
    ToolName.SEMANTIC_EVIDENCE_SEARCH: ToolSpec(
        name=ToolName.SEMANTIC_EVIDENCE_SEARCH,
        description=(
            "Busca semântica em Evidence/Message (VectorCypher) com expansão "
            "de grafo, respeitando a visibilidade da rodada."
        ),
        args_model=SemanticEvidenceSearchArgs,
        repository_method="semantic_evidence_search",
        to_repository_kwargs=_semantic_evidence_search_kwargs,
        cost_fn=lambda arguments: tool_call_cost(ToolName.SEMANTIC_EVIDENCE_SEARCH, arguments),
    ),
    ToolName.CHALLENGE_HYPOTHESIS: ToolSpec(
        name=ToolName.CHALLENGE_HYPOTHESIS,
        description=(
            "Retorna apenas contra-evidências (evidências que contradizem a "
            "hipótese) para as entidades informadas — nunca uma confirmação."
        ),
        args_model=ChallengeHypothesisArgs,
        repository_method="challenge_hypothesis",
        to_repository_kwargs=_challenge_hypothesis_kwargs,
        cost_fn=lambda arguments: tool_call_cost(ToolName.CHALLENGE_HYPOTHESIS, arguments),
    ),
}


def render_tool_catalog_markdown() -> str:
    """Human-readable tool catalog for the planner prompt, generated FROM
    `TOOL_REGISTRY` — the prompt's tool list can never drift from what is
    actually registered and validated."""
    blocks: list[str] = []
    for spec in TOOL_REGISTRY.values():
        schema = spec.args_model.model_json_schema()
        blocks.append(
            f"- **{spec.name.value}** — {spec.description}\n"
            f"  - parâmetros (JSON Schema): `{json.dumps(schema, ensure_ascii=False)}`"
        )
    return "\n".join(blocks)


_FORBIDDEN_NAMES = (
    "get_fraudsters",
    "get_answer",
    "get_ground_truth",
    "run_cypher",
    "rank_criminals",
    "rank_actual_criminals",
)
_FORBIDDEN_PATTERN = re.compile(
    r"\b(" + "|".join(re.escape(name) for name in _FORBIDDEN_NAMES) + r")\b",
    re.IGNORECASE,
)


def assert_registry_has_no_forbidden_tools() -> None:
    """Raises `AssertionError` if any registered tool smells like a leak.

    Checked against the tool name, its repository method name, and its
    description — the three places a forbidden capability could hide.
    Exercised directly by `tests/unit/test_tool_registry.py`.
    """
    for spec in TOOL_REGISTRY.values():
        haystack = " ".join([spec.name.value, spec.repository_method, spec.description])
        if _FORBIDDEN_PATTERN.search(haystack):
            raise AssertionError(
                f"forbidden pattern found in tool registry entry: {spec.name.value!r}"
            )
