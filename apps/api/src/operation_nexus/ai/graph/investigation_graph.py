"""The investigation LangGraph state machine.

    START -> normalize_question -> plan_investigation -> validate_plan
          -> calculate_cost -> budget_gate -[execute]-> execute_graph_tools
          -> collect_evidence -> synthesize_answer -> persist_discoveries -> END
                              -[reject]-> reject -> END

There is no agent loop: `execute_graph_tools` runs at most the (<= 2) tool
calls the plan already carries, once, concurrently, and the graph moves
straight to synthesis. `budget_gate` is the only conditional edge — anything
the team can't afford routes to `reject`, which returns a friendly
`InvestigationResult` instead of raising into the graph.

The chat model, the graph repository and the embedder are all injected into
`build_investigation_graph` — nothing in this module constructs a real
Azure/Neo4j client itself, which is exactly what lets the whole graph run
against `infrastructure.azure_openai.fake` with zero network.
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any, Protocol, TypedDict, runtime_checkable
from uuid import uuid4

import structlog
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph

from operation_nexus.ai.prompts.loader import load_prompt
from operation_nexus.ai.tools.registry import (
    TOOL_REGISTRY,
    GraphRepositoryProtocol,
    ToolResult,
    render_tool_catalog_markdown,
)
from operation_nexus.domain.game.credits import InsufficientCredits
from operation_nexus.domain.graph.schema import EMBEDDING_PROPERTY
from operation_nexus.domain.investigation.contracts import (
    MAX_TOOL_CALLS_PER_PLAN,
    EvidenceRef,
    GraphNode,
    GraphPayload,
    GraphRelationship,
    InvestigationAnswer,
    InvestigationIntent,
    InvestigationPlan,
    InvestigationResult,
    InvestigationToolCall,
    PlannerOutput,
    SemanticEvidenceSearchArgs,
    ToolName,
)
from operation_nexus.domain.investigation.costs import estimate_cost
from operation_nexus.infrastructure.azure_openai.embeddings import EmbeddingProvider

if TYPE_CHECKING:
    from langchain_core.language_models.chat_models import BaseChatModel
    from langgraph.checkpoint.base import BaseCheckpointSaver
    from langgraph.graph.state import CompiledStateGraph


@runtime_checkable
class DiscoverySink(Protocol):
    """Records first-time (team, node|relationship) discoveries.

    Optional: `persist_discoveries` is a pure no-op when no sink is
    injected, which is exactly what unit/golden tests want. A concrete
    adapter (wrapping the engine agent's Postgres `Discovery` table) is
    supplied by the application layer, not constructed here.
    """

    async def record_discoveries(
        self, *, team_id: str, node_ids: list[str], relationship_ids: list[str], current_round: int
    ) -> None: ...


class InvestigationState(TypedDict, total=False):
    """Typed state threaded through every node.

    Required on entry: `team_id`, `question`, `current_round`,
    `credits_available`. Everything else is filled in node by node.
    """

    team_id: str
    game_id: str | None
    question: str
    current_round: int
    credits_available: int
    known_entities: dict[str, str]

    normalized_question: str
    plan: InvestigationPlan
    estimated_cost: int
    tool_results: list[ToolResult]
    evidence_refs: list[EvidenceRef]
    subgraph: GraphPayload
    discovered_node_ids: list[str]
    discovered_relationship_ids: list[str]
    answer: InvestigationAnswer

    action_id: Any
    result: InvestigationResult
    rejected: bool
    rejection_reason: str


def build_thread_id(*, team_id: str, game_id: str | None = None) -> str:
    """`f"{game_id}:{team_id}"` when a game_id is known, else just `team_id`."""
    if game_id:
        return f"{game_id}:{team_id}"
    return str(team_id)


logger = structlog.get_logger(__name__)

_MAX_NORMALIZED_QUESTION_LENGTH = 2000


def _render_known_entities(known_entities: dict[str, str]) -> str:
    if not known_entities:
        return "(nenhuma entidade conhecida ainda por esta equipe nesta rodada)"
    return "\n".join(f"- `{entity_id}` — {label}" for entity_id, label in known_entities.items())


def _render_evidence_catalog(evidence_refs: list[EvidenceRef]) -> str:
    if not evidence_refs:
        return "(nenhuma evidência recuperada nesta interação)"
    lines = []
    for ev in evidence_refs:
        captured = ev.captured_at.isoformat() if ev.captured_at else "desconhecido"
        lines.append(
            f"- `{ev.id}` ({ev.evidence_type}, fonte: {ev.source}, "
            f'capturado: {captured}): "{ev.excerpt}"'
        )
    return "\n".join(lines)


def _render_subgraph(payload: GraphPayload) -> str:
    """Render retrieved nodes/relationships for the synthesizer.

    Five of the seven tools (inspect_entity, find_shared_entities, find_path,
    expand_neighborhood, timeline) return graph structure and no Evidence
    nodes at all. Without this the synthesizer sees an empty context and
    answers "no evidence found" even though the query succeeded — which reads
    to a team as the investigator being broken.
    """
    if not payload.nodes and not payload.relationships:
        return "(nenhum nó ou relação retornado nesta interação)"

    labels_by_id = {node.id: node.label_display or node.id for node in payload.nodes}
    lines: list[str] = []
    if payload.nodes:
        lines.append("Nós:")
        for node in payload.nodes:
            primary = node.labels[0] if node.labels else "Node"
            props = ", ".join(
                f"{key}={value!r}"
                for key, value in sorted(node.properties.items())
                if key not in ("id", "label_display", "visible_from_round", EMBEDDING_PROPERTY)
            )
            lines.append(
                f"- `{node.id}` [{primary}] {node.label_display or node.id}"
                + (f" — {props}" if props else "")
            )
    if payload.relationships:
        lines.append("Relações:")
        for rel in payload.relationships:
            start = labels_by_id.get(rel.start_id, rel.start_id)
            end = labels_by_id.get(rel.end_id, rel.end_id)
            extra = ", ".join(
                f"{key}={value!r}"
                for key, value in sorted(rel.properties.items())
                if key not in ("id", "visible_from_round", EMBEDDING_PROPERTY)
            )
            lines.append(
                f"- `{rel.id}` ({start}) -[{rel.type}]-> ({end})" + (f" — {extra}" if extra else "")
            )
    return "\n".join(lines)


def _out_of_scope_answer() -> InvestigationAnswer:
    return InvestigationAnswer(
        answer=(
            "Não posso atender a essa solicitação: este investigador não tem "
            "acesso a gabarito, veredito ou lista de fraudadores, e só pode "
            "agir através do catálogo de ferramentas de investigação "
            "disponível."
        ),
        evidence_ids=[],
        discovered_node_ids=[],
        discovered_relationship_ids=[],
        caveats=["NO_GROUND_TRUTH_ACCESS: solicitação fora do escopo do investigador."],
    )


def build_investigation_graph(
    *,
    chat_model: BaseChatModel,
    repository: GraphRepositoryProtocol,
    embedder: EmbeddingProvider,
    discovery_sink: DiscoverySink | None = None,
    checkpointer: BaseCheckpointSaver[Any] | None = None,
) -> CompiledStateGraph[Any, Any, Any, Any]:
    """Compile the investigation graph against injected dependencies.

    Nothing here constructs `ChatOpenAI`, `GraphRepository` or an embedder
    itself — swap `chat_model`/`repository`/`embedder` for the fakes in
    `infrastructure.azure_openai.fake` (plus a fake repository) and the
    entire pipeline runs with zero network and zero API key.
    """

    async def normalize_question(state: InvestigationState) -> dict[str, Any]:
        normalized = " ".join(state["question"].split()).strip()
        if len(normalized) > _MAX_NORMALIZED_QUESTION_LENGTH:
            normalized = normalized[:_MAX_NORMALIZED_QUESTION_LENGTH]
        return {"normalized_question": normalized}

    async def plan_investigation(state: InvestigationState) -> dict[str, Any]:
        known_entities = state.get("known_entities") or {}
        system_text = load_prompt(
            "planner",
            tool_catalog=render_tool_catalog_markdown(),
            known_entities_catalog=_render_known_entities(known_entities),
            current_round=str(state["current_round"]),
            credits_available=str(state["credits_available"]),
        )
        messages = [
            SystemMessage(content=system_text),
            HumanMessage(content=state["normalized_question"]),
        ]
        # The model is asked for PlannerOutput, not InvestigationPlan: the
        # latter's open `arguments` dict cannot satisfy strict structured
        # outputs. See the note above PlannerOutput in contracts.py.
        structured_model = chat_model.with_structured_output(PlannerOutput)
        try:
            raw_plan = await structured_model.ainvoke(messages)
            planner_output = (
                raw_plan
                if isinstance(raw_plan, PlannerOutput)
                else PlannerOutput.model_validate(raw_plan)
            )
            plan = planner_output.to_plan()
        except Exception:
            # Two failure modes land here and BOTH must degrade to a refusal
            # rather than a 500:
            #   * malformed structured output (never fall back to free-text);
            #   * the provider rejecting the prompt outright — Azure's content
            #     filter returns HTTP 400 with jailbreak.detected on inputs
            #     like "ignore all previous instructions", which is precisely
            #     the input a player will type as a joke mid-game.
            # A crashed investigator reads to the room as a broken product,
            # so we log and refuse instead of propagating.
            logger.warning("plan_investigation_failed", exc_info=True)
            plan = InvestigationPlan(
                intent=InvestigationIntent.OUT_OF_SCOPE,
                tool_calls=[],
                reasoning_summary=(
                    "Não foi possível produzir um plano estruturado válido para esta "
                    "pergunta; recusando por segurança."
                ),
            )
        return {"plan": plan}

    async def validate_plan(state: InvestigationState) -> dict[str, Any]:
        plan = state["plan"]
        # Defense in depth: even though `InvestigationPlan` already rejects
        # this combination at construction time, a plan that somehow arrives
        # here with it gets clamped rather than trusted.
        if plan.intent is InvestigationIntent.OUT_OF_SCOPE and plan.tool_calls:
            plan = plan.model_copy(update={"tool_calls": []})
        if len(plan.tool_calls) > MAX_TOOL_CALLS_PER_PLAN:
            plan = plan.model_copy(update={"tool_calls": plan.tool_calls[:MAX_TOOL_CALLS_PER_PLAN]})
        return {"plan": plan}

    async def calculate_cost(state: InvestigationState) -> dict[str, Any]:
        return {"estimated_cost": estimate_cost(state["plan"])}

    async def budget_gate(state: InvestigationState) -> dict[str, Any]:
        # CONTRACT.md §7: over-budget plans are HTTP 402, not a synthesized
        # refusal. Raising here lets the API exception handler emit the
        # exact `INSUFFICIENT_CREDITS` body.
        estimated = state["estimated_cost"]
        available = state["credits_available"]
        if estimated > available:
            raise InsufficientCredits(required=estimated, available=available)
        return {}

    async def _run_tool_call(call: InvestigationToolCall, *, current_round: int) -> ToolResult:
        spec = TOOL_REGISTRY[call.tool]
        args = spec.args_model.model_validate(call.arguments)
        kwargs = spec.to_repository_kwargs(args, current_round)
        if call.tool is ToolName.SEMANTIC_EVIDENCE_SEARCH:
            semantic_args = SemanticEvidenceSearchArgs.model_validate(call.arguments)
            kwargs["query_embedding"] = await embedder.embed_query(semantic_args.query)
            kwargs["query"] = semantic_args.query
        method = getattr(repository, spec.repository_method)
        result = await method(**kwargs)
        return result if isinstance(result, ToolResult) else ToolResult.model_validate(result)

    async def execute_graph_tools(state: InvestigationState) -> dict[str, Any]:
        plan = state["plan"]
        if not plan.tool_calls:
            return {"tool_results": []}
        raw_results = await asyncio.gather(
            *(
                _run_tool_call(call, current_round=state["current_round"])
                for call in plan.tool_calls
            ),
            return_exceptions=True,
        )
        clean_results: list[ToolResult] = [r for r in raw_results if isinstance(r, ToolResult)]
        return {"tool_results": clean_results}

    async def collect_evidence(state: InvestigationState) -> dict[str, Any]:
        tool_results: list[ToolResult] = state.get("tool_results") or []
        node_index: dict[str, GraphNode] = {}
        rel_index: dict[str, GraphRelationship] = {}
        evidence_refs: list[EvidenceRef] = []
        seen_evidence_ids: set[str] = set()
        for result in tool_results:
            for node in result.nodes:
                node_index[node.id] = node
            for rel in result.relationships:
                rel_index[rel.id] = rel
            for ev in result.evidence:
                if ev.id not in seen_evidence_ids:
                    seen_evidence_ids.add(ev.id)
                    evidence_refs.append(ev)
        subgraph = GraphPayload(
            nodes=list(node_index.values()), relationships=list(rel_index.values())
        )
        return {
            "subgraph": subgraph,
            "evidence_refs": evidence_refs,
            "discovered_node_ids": list(node_index.keys()),
            "discovered_relationship_ids": list(rel_index.keys()),
        }

    async def synthesize_answer(state: InvestigationState) -> dict[str, Any]:
        plan = state["plan"]
        evidence_refs: list[EvidenceRef] = state.get("evidence_refs") or []
        discovered_node_ids = state.get("discovered_node_ids") or []
        discovered_relationship_ids = state.get("discovered_relationship_ids") or []

        if plan.intent is InvestigationIntent.OUT_OF_SCOPE or not plan.tool_calls:
            # Never even call the model: there is nothing retrieved to
            # ground an answer in, and no LLM turn means no chance for the
            # model to "helpfully" comply with whatever prompted the refusal.
            return {"answer": _out_of_scope_answer()}

        evidence_json = [{"id": ev.id, "excerpt": ev.excerpt} for ev in evidence_refs]
        subgraph: GraphPayload = state.get("subgraph") or GraphPayload.empty()
        system_text = load_prompt(
            "synthesizer",
            evidence_catalog=_render_evidence_catalog(evidence_refs),
            subgraph_catalog=_render_subgraph(subgraph),
            current_round=str(state["current_round"]),
        )
        messages = [
            SystemMessage(content=system_text),
            HumanMessage(
                content=(
                    f"Pergunta original: {state['normalized_question']}\n"
                    f"Raciocínio do plano: {plan.reasoning_summary}\n"
                    f"evidence_json: {evidence_json!r}"
                )
            ),
        ]
        structured_model = chat_model.with_structured_output(InvestigationAnswer)
        try:
            raw_answer = await structured_model.ainvoke(messages)
            answer = (
                raw_answer
                if isinstance(raw_answer, InvestigationAnswer)
                else InvestigationAnswer.model_validate(raw_answer)
            )
        except Exception:
            # Same reasoning as plan_investigation: a provider-side rejection
            # (content filter) or a malformed structured response must not
            # surface as a 500 mid-game. The tools already ran and the team was
            # already charged, so still return the discovered ids.
            logger.warning("synthesize_answer_failed", exc_info=True)
            answer = InvestigationAnswer(
                answer=(
                    "Não foi possível compor uma resposta estruturada a partir das "
                    "evidências recuperadas."
                ),
                evidence_ids=[],
                discovered_node_ids=discovered_node_ids,
                discovered_relationship_ids=discovered_relationship_ids,
                caveats=["Falha ao gerar resposta estruturada."],
            )

        # Defense in depth: the model may only *cite* evidence ids it was
        # actually given, and `discovered_*_ids` are never the model's
        # call — both are enforced here regardless of what came back.
        known_ids = {ev.id for ev in evidence_refs}
        answer = answer.model_copy(
            update={
                "evidence_ids": [i for i in answer.evidence_ids if i in known_ids],
                "discovered_node_ids": discovered_node_ids,
                "discovered_relationship_ids": discovered_relationship_ids,
            }
        )
        return {"answer": answer}

    async def persist_discoveries(state: InvestigationState) -> dict[str, Any]:
        node_ids = state.get("discovered_node_ids") or []
        relationship_ids = state.get("discovered_relationship_ids") or []
        if discovery_sink is not None and (node_ids or relationship_ids):
            await discovery_sink.record_discoveries(
                team_id=state["team_id"],
                node_ids=node_ids,
                relationship_ids=relationship_ids,
                current_round=state["current_round"],
            )
        estimated_cost = state["estimated_cost"]
        credits_available = state["credits_available"]
        result = InvestigationResult(
            action_id=state.get("action_id") or uuid4(),
            question=state["question"],
            plan=state["plan"],
            answer=state["answer"],
            subgraph=state.get("subgraph") or GraphPayload(nodes=[], relationships=[]),
            credits_charged=estimated_cost,
            credits_remaining=credits_available - estimated_cost,
        )
        return {"result": result}

    graph: StateGraph[InvestigationState, Any, Any, Any] = StateGraph(InvestigationState)
    graph.add_node("normalize_question", normalize_question)
    graph.add_node("plan_investigation", plan_investigation)
    graph.add_node("validate_plan", validate_plan)
    graph.add_node("calculate_cost", calculate_cost)
    graph.add_node("budget_gate", budget_gate)
    graph.add_node("execute_graph_tools", execute_graph_tools)
    graph.add_node("collect_evidence", collect_evidence)
    graph.add_node("synthesize_answer", synthesize_answer)
    graph.add_node("persist_discoveries", persist_discoveries)

    graph.add_edge(START, "normalize_question")
    graph.add_edge("normalize_question", "plan_investigation")
    graph.add_edge("plan_investigation", "validate_plan")
    graph.add_edge("validate_plan", "calculate_cost")
    graph.add_edge("calculate_cost", "budget_gate")
    graph.add_edge("budget_gate", "execute_graph_tools")
    graph.add_edge("execute_graph_tools", "collect_evidence")
    graph.add_edge("collect_evidence", "synthesize_answer")
    graph.add_edge("synthesize_answer", "persist_discoveries")
    graph.add_edge("persist_discoveries", END)

    return graph.compile(checkpointer=checkpointer)
