"""Adapters between the Neo4j GraphRepository and the AI tool protocol.

`GraphRepository` returns `GraphPayload` and takes `current_round`.
`GraphRepositoryProtocol` returns `ToolResult` and takes `round`. This
module is the only translation layer — neither side imports the other.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from operation_nexus.ai.tools.registry import ToolResult
from operation_nexus.domain.graph.payload import GraphPayload
from operation_nexus.domain.investigation.contracts import EvidenceRef, GraphNode, GraphRelationship
from operation_nexus.infrastructure.neo4j.repository import GraphRepository

_EVIDENCE_LABELS = frozenset({"Evidence", "Message"})


def evidence_from_payload(payload: GraphPayload) -> list[EvidenceRef]:
    refs: list[EvidenceRef] = []
    seen: set[str] = set()
    for node in payload.nodes:
        if not _EVIDENCE_LABELS.intersection(node.labels):
            continue
        if node.id in seen:
            continue
        seen.add(node.id)
        content = str(node.properties.get("content") or "")
        captured = _as_datetime(
            node.properties.get("captured_at") or node.properties.get("sent_at")
        )
        refs.append(
            EvidenceRef(
                id=node.id,
                evidence_type=str(
                    node.properties.get("evidence_type")
                    or node.properties.get("channel")
                    or ("message" if "Message" in node.labels else "evidence")
                ),
                excerpt=content[:280],
                source=str(node.properties.get("source") or ""),
                captured_at=captured,
            )
        )
    return refs


def payload_to_tool_result(payload: GraphPayload) -> ToolResult:
    return ToolResult(
        nodes=[GraphNode.model_validate(node.model_dump()) for node in payload.nodes],
        relationships=[
            GraphRelationship.model_validate(rel.model_dump()) for rel in payload.relationships
        ],
        evidence=evidence_from_payload(payload),
    )


def _as_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


class GraphRepositoryToolAdapter:
    """Makes `GraphRepository` look like `GraphRepositoryProtocol`."""

    def __init__(self, repository: GraphRepository) -> None:
        self._repository = repository

    async def inspect_entity(self, *, entity_id: str, round: int) -> ToolResult:
        payload = await self._repository.inspect_entity(entity_id, round)
        return payload_to_tool_result(payload)

    async def find_shared_entities(
        self, *, entity_ids: list[str], via: list[str] | None, round: int
    ) -> ToolResult:
        payload = await self._repository.find_shared_entities(entity_ids, round, via=via)
        return payload_to_tool_result(payload)

    async def find_path(self, *, from_id: str, to_id: str, max_hops: int, round: int) -> ToolResult:
        payload = await self._repository.find_path(from_id, to_id, round, max_hops=max_hops)
        return payload_to_tool_result(payload)

    async def expand_neighborhood(self, *, entity_id: str, hops: int, round: int) -> ToolResult:
        payload = await self._repository.expand_neighborhood(entity_id, round, hops=hops)
        return payload_to_tool_result(payload)

    async def timeline(
        self,
        *,
        entity_id: str,
        from_ts: datetime | None,
        to_ts: datetime | None,
        round: int,
    ) -> ToolResult:
        payload = await self._repository.timeline(entity_id, round, from_ts=from_ts, to_ts=to_ts)
        return payload_to_tool_result(payload)

    async def semantic_evidence_search(
        self,
        *,
        query_embedding: list[float] | None,
        top_k: int,
        round: int,
        query: str = "",
    ) -> ToolResult:
        payload = await self._repository.semantic_evidence_search(
            query, round, top_k=top_k, query_embedding=query_embedding
        )
        return payload_to_tool_result(payload)

    async def challenge_hypothesis(
        self, *, hypothesis: str, entity_ids: list[str], round: int
    ) -> ToolResult:
        payload = await self._repository.challenge_hypothesis(hypothesis, entity_ids, round)
        return payload_to_tool_result(payload)
