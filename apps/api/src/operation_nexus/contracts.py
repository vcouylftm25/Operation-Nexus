"""Re-export of the canonical Pydantic contracts (CONTRACT.md §5)."""

from __future__ import annotations

from operation_nexus.domain.game.contracts import (
    FraudPattern,
    GameState,
    GameStatus,
    GuessResult,
    LeaderboardRow,
    RoundState,
    TeamState,
    TeamStatus,
)
from operation_nexus.domain.graph.payload import GraphNode, GraphPayload, GraphRelationship
from operation_nexus.domain.investigation.contracts import (
    EvidenceRef,
    InvestigationAnswer,
    InvestigationIntent,
    InvestigationPlan,
    InvestigationResult,
    InvestigationToolCall,
    ToolName,
)

__all__ = [
    "EvidenceRef",
    "FraudPattern",
    "GameState",
    "GameStatus",
    "GraphNode",
    "GraphPayload",
    "GraphRelationship",
    "GuessResult",
    "InvestigationAnswer",
    "InvestigationIntent",
    "InvestigationPlan",
    "InvestigationResult",
    "InvestigationToolCall",
    "LeaderboardRow",
    "RoundState",
    "TeamState",
    "TeamStatus",
    "ToolName",
]
