"""Outbound ports the application layer depends on.

These Protocols decouple use cases from infrastructure. The investigation
runner and graph reader have real implementations wired in `api.deps` at
startup; tests inject fakes.
"""

from __future__ import annotations

from typing import Any, Protocol
from uuid import UUID

from pydantic import BaseModel, Field

from operation_nexus.domain.graph.payload import GraphNode, GraphPayload, GraphRelationship
from operation_nexus.domain.investigation.contracts import InvestigationResult

# --- investigation ----------------------------------------------------------


class AINotEnabled(Exception):
    """Raised when an investigation is attempted while no runner is wired."""


class InvestigationRunner(Protocol):
    """Runs one investigation for a team and returns its outcome."""

    async def run(
        self,
        team_id: UUID,
        question: str,
        current_round: int,
        *,
        credits_available: int = 0,
        known_entities: dict[str, str] | None = None,
    ) -> InvestigationResult: ...


class NullInvestigationRunner:
    """Stand-in used only if lifespan failed to wire a real runner."""

    async def run(
        self,
        team_id: UUID,
        question: str,
        current_round: int,
        *,
        credits_available: int = 0,
        known_entities: dict[str, str] | None = None,
    ) -> InvestigationResult:
        raise AINotEnabled("no investigation runner is wired")


# --- graph reads --------------------------------------------------------------


class GraphReader(Protocol):
    """Resolves already-discovered ids into a GraphPayload."""

    async def fetch_subgraph(
        self,
        node_ids: list[str],
        relationship_ids: list[str],
        current_round: int = 4,
    ) -> GraphPayload: ...

    async def list_case_files(self, current_round: int) -> GraphPayload: ...

    async def entity_roster(self, current_round: int) -> dict[str, str]: ...


class NullGraphReader:
    """Degrades to id-only nodes when Neo4j isn't wired."""

    async def fetch_subgraph(
        self,
        node_ids: list[str],
        relationship_ids: list[str],
        current_round: int = 4,
    ) -> GraphPayload:
        del current_round
        return GraphPayload(
            nodes=[
                GraphNode(id=node_id, labels=[], properties={}, label_display=node_id)
                for node_id in node_ids
            ],
            relationships=[
                GraphRelationship(id=rel_id, type="", start_id="", end_id="", properties={})
                for rel_id in relationship_ids
            ],
        )

    async def list_case_files(self, current_round: int) -> GraphPayload:
        del current_round
        return GraphPayload.empty()

    async def entity_roster(self, current_round: int) -> dict[str, str]:
        del current_round
        return {}


# Kept so existing imports of GraphSubgraph/GraphNodeRef don't explode.
GraphSubgraph = GraphPayload
GraphNodeRef = GraphNode
GraphRelationshipRef = GraphRelationship


# --- realtime events ----------------------------------------------------------


class EventBroadcaster(Protocol):
    """WebSocket broadcast port (CONTRACT.md §9)."""

    async def broadcast_to_game(
        self, game_id: UUID, event_type: str, payload: dict[str, Any]
    ) -> None: ...

    async def broadcast_to_team(
        self, game_id: UUID, team_id: UUID, event_type: str, payload: dict[str, Any]
    ) -> None: ...


class NullBroadcaster:
    """No-op broadcaster for tests."""

    async def broadcast_to_game(
        self, game_id: UUID, event_type: str, payload: dict[str, Any]
    ) -> None:
        return None

    async def broadcast_to_team(
        self, game_id: UUID, team_id: UUID, event_type: str, payload: dict[str, Any]
    ) -> None:
        return None


class InvestigationOutcome(BaseModel):
    """Legacy alias used by a few early tests — prefer InvestigationResult."""

    action_id: UUID
    question: str
    answer_text: str
    evidence_ids: list[str] = Field(default_factory=list)
    discovered_node_ids: list[str] = Field(default_factory=list)
    discovered_relationship_ids: list[str] = Field(default_factory=list)
    caveats: list[str] = Field(default_factory=list)
    credits_charged: int
    credits_remaining: int = 0
