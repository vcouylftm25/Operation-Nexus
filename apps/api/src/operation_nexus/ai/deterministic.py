"""Command-DSL investigation planner — the AI_ENABLED=false playable path.

The LLM is not on the critical path of the first milestone. Teams still
investigate the same Neo4j graph, spend credits, and discover different
subgraphs; they just address the investigator with explicit tool commands
instead of free-text Portuguese.

This module never loads `ground_truth.yaml` and never writes Cypher.
"""

from __future__ import annotations

import re
from uuid import UUID, uuid4

from operation_nexus.ai.tools.registry import TOOL_REGISTRY, GraphRepositoryProtocol, ToolResult
from operation_nexus.domain.game.credits import InsufficientCredits
from operation_nexus.domain.graph.payload import GraphPayload
from operation_nexus.domain.investigation.contracts import (
    InvestigationAnswer,
    InvestigationIntent,
    InvestigationPlan,
    InvestigationResult,
    InvestigationToolCall,
    ToolName,
)
from operation_nexus.domain.investigation.costs import estimate_cost

_ENTITY_RE = (
    r"(?:person|application|device|phone|email|ip|address|account|company|"
    r"broker|document|evidence|message|transaction)_\d{2,3}"
)
_ENTITY = re.compile(_ENTITY_RE, re.IGNORECASE)

_JAILBREAK = re.compile(
    r"("
    r"ignore\s+(todas\s+as\s+)?(as\s+)?(instru[cç][oõ]es|regras)"
    r"|esquece\s+as\s+instru[cç][oõ]es"
    r"|gabarito"
    r"|ground[_\s-]?truth"
    r"|get_fraudsters"
    r"|get_answer"
    r"|get_ground_truth"
    r"|rank_criminals"
    r"|rank_actual_criminals"
    r"|quem\s+s[aã]o\s+os\s+fraudadores"
    r"|diga\s+quem\s+(é|sao|são)\s+o\s+fraudador"
    r"|\bMATCH\b"
    r"|\bRETURN\b"
    r"|run_cypher"
    r"|execute\s+cypher"
    r")",
    re.IGNORECASE,
)

_COMMAND = re.compile(
    r"^/?(inspect|shared|path|expand|neighborhood|timeline|search|challenge)\b",
    re.IGNORECASE,
)


def _out_of_scope_plan(reason: str) -> InvestigationPlan:
    return InvestigationPlan(
        intent=InvestigationIntent.OUT_OF_SCOPE,
        tool_calls=[],
        reasoning_summary=reason,
    )


def _out_of_scope_answer() -> InvestigationAnswer:
    return InvestigationAnswer(
        answer=(
            "Não tenho acesso ao gabarito. Posso investigar relações e "
            "evidências disponíveis através das ferramentas da paleta "
            "(/inspect, /shared, /path, /expand, /timeline, /search, /challenge)."
        ),
        caveats=["NO_GROUND_TRUTH_ACCESS"],
    )


def _ids(blob: str) -> list[str]:
    return [match.group(0).lower() for match in _ENTITY.finditer(blob)]


def parse_investigation_command(question: str) -> InvestigationPlan:
    """Turn a player question / DSL command into a validated InvestigationPlan.

    Free text that looks like a jailbreak or raw Cypher becomes OUT_OF_SCOPE.
    Unknown free text also becomes OUT_OF_SCOPE — the deterministic path
    refuses to guess a tool, so the UI must emit the command DSL (or the
    operator must flip `AI_ENABLED=true`).
    """
    raw = " ".join(question.split()).strip()
    if not raw:
        return _out_of_scope_plan("Pergunta vazia.")
    if _JAILBREAK.search(raw):
        return _out_of_scope_plan(
            "Pedido fora do escopo do investigador (gabarito, Cypher ou jailbreak)."
        )

    stripped = raw[1:] if raw.startswith("/") else raw
    head = stripped.split(maxsplit=1)
    verb = head[0].lower() if head else ""
    rest = head[1].strip() if len(head) > 1 else ""

    if verb == "inspect":
        ids = _ids(rest)
        if not ids:
            return _out_of_scope_plan(" /inspect exige um entity_id (ex.: person_01).")
        return InvestigationPlan(
            intent=InvestigationIntent.ENTITY_LOOKUP,
            tool_calls=[
                InvestigationToolCall(
                    tool=ToolName.INSPECT_ENTITY,
                    arguments={"entity_id": ids[0]},
                    justification="inspecionar a entidade pedida",
                )
            ],
            reasoning_summary=f"inspect_entity {ids[0]}",
        )

    if verb == "shared":
        ids = _ids(rest)
        if len(ids) < 2:
            return _out_of_scope_plan("/shared exige pelo menos dois entity_ids.")
        return InvestigationPlan(
            intent=InvestigationIntent.CONNECTION_SEARCH,
            tool_calls=[
                InvestigationToolCall(
                    tool=ToolName.FIND_SHARED_ENTITIES,
                    arguments={"entity_ids": ids[:8], "via": None},
                    justification="buscar entidades compartilhadas",
                )
            ],
            reasoning_summary=f"find_shared_entities {ids[:8]}",
        )

    if verb == "path":
        ids = _ids(rest)
        if len(ids) < 2:
            return _out_of_scope_plan("/path exige from_id e to_id.")
        hops_match = re.search(r"\b([1-4])\b", rest[rest.find(ids[1]) + len(ids[1]) :])
        max_hops = int(hops_match.group(1)) if hops_match else 4
        return InvestigationPlan(
            intent=InvestigationIntent.PATH_SEARCH,
            tool_calls=[
                InvestigationToolCall(
                    tool=ToolName.FIND_PATH,
                    arguments={"from_id": ids[0], "to_id": ids[1], "max_hops": max_hops},
                    justification="encontrar caminho visível",
                )
            ],
            reasoning_summary=f"find_path {ids[0]} -> {ids[1]} hops={max_hops}",
        )

    if verb in {"expand", "neighborhood"}:
        ids = _ids(rest)
        if not ids:
            return _out_of_scope_plan("/expand exige um entity_id.")
        hops = 2 if re.search(r"\b2\b", rest) else 1
        return InvestigationPlan(
            intent=InvestigationIntent.NEIGHBORHOOD,
            tool_calls=[
                InvestigationToolCall(
                    tool=ToolName.EXPAND_NEIGHBORHOOD,
                    arguments={"entity_id": ids[0], "hops": hops},
                    justification="expandir vizinhança visível",
                )
            ],
            reasoning_summary=f"expand_neighborhood {ids[0]} hops={hops}",
        )

    if verb == "timeline":
        ids = _ids(rest)
        if not ids:
            return _out_of_scope_plan("/timeline exige um entity_id.")
        return InvestigationPlan(
            intent=InvestigationIntent.TIMELINE,
            tool_calls=[
                InvestigationToolCall(
                    tool=ToolName.TIMELINE,
                    arguments={"entity_id": ids[0], "from_ts": None, "to_ts": None},
                    justification="ordenar eventos visíveis",
                )
            ],
            reasoning_summary=f"timeline {ids[0]}",
        )

    if verb == "search":
        query = rest.strip()
        if not query:
            return _out_of_scope_plan("/search exige um texto.")
        return InvestigationPlan(
            intent=InvestigationIntent.SEMANTIC_SEARCH,
            tool_calls=[
                InvestigationToolCall(
                    tool=ToolName.SEMANTIC_EVIDENCE_SEARCH,
                    arguments={"query": query[:500], "top_k": 5},
                    justification="busca semântica / textual em evidências visíveis",
                )
            ],
            reasoning_summary=f"semantic_evidence_search {query[:80]}",
        )

    if verb == "challenge":
        left, _, right = rest.partition("|")
        hypothesis = left.strip()
        ids = _ids(right if right else rest)
        if not hypothesis or len(ids) < 2:
            return _out_of_scope_plan(
                "/challenge exige `hipótese | id1,id2` (pelo menos duas entidades)."
            )
        return InvestigationPlan(
            intent=InvestigationIntent.HYPOTHESIS_CHALLENGE,
            tool_calls=[
                InvestigationToolCall(
                    tool=ToolName.CHALLENGE_HYPOTHESIS,
                    arguments={"hypothesis": hypothesis[:500], "entity_ids": ids[:8]},
                    justification="procurar contra-evidência visível",
                )
            ],
            reasoning_summary=f"challenge_hypothesis {ids[:8]}",
        )

    if _COMMAND.match(raw):
        return _out_of_scope_plan(f"Comando não reconhecido: {verb!r}.")

    return _out_of_scope_plan(
        "Com AI desligada, use a paleta de comandos (/inspect, /shared, /path, "
        "/expand, /timeline, /search, /challenge)."
    )


def _merge_results(results: list[ToolResult]) -> tuple[GraphPayload, list[ToolResult]]:
    node_index = {}
    rel_index = {}
    for result in results:
        for node in result.nodes:
            node_index[node.id] = node
        for rel in result.relationships:
            rel_index[rel.id] = rel
    payload = GraphPayload(nodes=list(node_index.values()), relationships=list(rel_index.values()))
    return payload, results


def _grounded_answer(
    plan: InvestigationPlan, payload: GraphPayload, results: list[ToolResult]
) -> InvestigationAnswer:
    if plan.intent is InvestigationIntent.OUT_OF_SCOPE or not plan.tool_calls:
        return _out_of_scope_answer()

    evidence = []
    seen: set[str] = set()
    for result in results:
        for ev in result.evidence:
            if ev.id not in seen:
                seen.add(ev.id)
                evidence.append(ev)

    names = [node.label_display or node.id for node in payload.nodes[:16]]
    rel_types = [rel.type for rel in payload.relationships[:16]]
    if names:
        answer = (
            f"Consulta executada ({', '.join(call.tool.value for call in plan.tool_calls)}). "
            f"Nós visíveis: {', '.join(names)}."
        )
        if rel_types:
            answer += f" Relações: {', '.join(rel_types)}."
    else:
        answer = (
            "Nada visível nesta rodada para essa consulta. "
            "Pode ser visibilidade de round, ids inexistentes, ou evidência ainda bloqueada."
        )
    caveats: list[str] = []
    if not payload.nodes:
        caveats.append("EMPTY_RESULT")
    if evidence:
        caveats.append("EVIDENCE_CITED")
    return InvestigationAnswer(
        answer=answer,
        evidence_ids=[ev.id for ev in evidence],
        discovered_node_ids=[node.id for node in payload.nodes],
        discovered_relationship_ids=[rel.id for rel in payload.relationships],
        caveats=caveats,
    )


class DeterministicInvestigationRunner:
    """InvestigationRunner for `AI_ENABLED=false`. Parses the DSL, runs ≤2 tools."""

    def __init__(self, repository: GraphRepositoryProtocol) -> None:
        self._repository = repository

    async def run(
        self,
        team_id: UUID,
        question: str,
        current_round: int,
        *,
        credits_available: int = 0,
        known_entities: dict[str, str] | None = None,
    ) -> InvestigationResult:
        del known_entities
        plan = parse_investigation_command(question)
        cost = estimate_cost(plan)
        if cost > credits_available:
            raise InsufficientCredits(required=cost, available=credits_available)

        results: list[ToolResult] = []
        for call in plan.tool_calls:
            spec = TOOL_REGISTRY[call.tool]
            args = spec.args_model.model_validate(call.arguments)
            kwargs = spec.to_repository_kwargs(args, current_round)
            if call.tool is ToolName.SEMANTIC_EVIDENCE_SEARCH:
                kwargs["query_embedding"] = None
                kwargs["query"] = call.arguments.get("query", "")
            method = getattr(self._repository, spec.repository_method)
            result = await method(**kwargs)
            results.append(
                result if isinstance(result, ToolResult) else ToolResult.model_validate(result)
            )

        payload, results = _merge_results(results)
        answer = _grounded_answer(plan, payload, results)
        remaining = credits_available - cost
        return InvestigationResult(
            action_id=uuid4(),
            question=question,
            plan=plan,
            answer=answer,
            subgraph=payload,
            credits_charged=cost,
            credits_remaining=remaining,
        )
