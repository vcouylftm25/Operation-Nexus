"""Use case: run one investigation for a team.

Charges credits, records the action and any newly-discovered node/relationship
ids, and broadcasts `GRAPH_DISCOVERY` to the owning team (+ host/screen) only.
Depends on the `InvestigationRunner` Protocol — deterministic when
`AI_ENABLED=false`, LangGraph when true.
"""

from __future__ import annotations

from uuid import UUID

from operation_nexus.application.ports import EventBroadcaster, GraphReader, InvestigationRunner
from operation_nexus.domain.investigation.contracts import InvestigationResult
from operation_nexus.infrastructure.postgres.repositories.action_repository import ActionRepository
from operation_nexus.infrastructure.postgres.repositories.discovery_repository import (
    DiscoveryRepository,
)
from operation_nexus.infrastructure.postgres.repositories.team_repository import (
    TeamNotFound,
    TeamRepository,
)


class RecordInvestigation:
    def __init__(
        self,
        team_repo: TeamRepository,
        action_repo: ActionRepository,
        discovery_repo: DiscoveryRepository,
        runner: InvestigationRunner,
        broadcaster: EventBroadcaster,
        graph_reader: GraphReader | None = None,
    ) -> None:
        self._team_repo = team_repo
        self._action_repo = action_repo
        self._discovery_repo = discovery_repo
        self._runner = runner
        self._broadcaster = broadcaster
        self._graph_reader = graph_reader

    async def execute(self, team_id: UUID, question: str) -> InvestigationResult:
        team = await self._team_repo.get(team_id)
        if team is None:
            raise TeamNotFound(team_id)

        current_round = team.current_round
        known_nodes, _known_rels = await self._discovery_repo.list_for_team(team_id)

        # The planner needs human names, not just ids: teams ask about
        # "Roberto Alves", never about "person_03". Start from the round's
        # visible docket, then add anything this team has already discovered.
        # Falling back to `{id: id}` would leave the planner unable to resolve
        # any name and it would refuse every question.
        known_entities: dict[str, str] = {}
        if self._graph_reader is not None:
            known_entities.update(await self._graph_reader.entity_roster(current_round))
            if known_nodes:
                discovered = await self._graph_reader.fetch_subgraph(
                    list(known_nodes), [], current_round
                )
                for node in discovered.nodes:
                    primary = node.labels[0] if node.labels else "Node"
                    known_entities[node.id] = f"{node.label_display or node.id} ({primary})"
        for node_id in known_nodes:
            known_entities.setdefault(node_id, node_id)

        outcome = await self._runner.run(
            team_id,
            question,
            current_round,
            credits_available=team.credits_balance,
            known_entities=known_entities,
        )

        # Budget gate. Raises InsufficientCredits(required, available), mapped
        # by the API layer to HTTP 402 with the exact CONTRACT.md §7 body.
        new_balance = await self._team_repo.charge_credits(team_id, outcome.credits_charged)

        action_id = await self._action_repo.record(
            team_id,
            current_round,
            question,
            outcome.answer.answer,
            outcome.credits_charged,
            evidence_ids=outcome.answer.evidence_ids,
            discovered_node_ids=outcome.answer.discovered_node_ids,
            discovered_relationship_ids=outcome.answer.discovered_relationship_ids,
        )

        new_nodes, new_relationships = await self._discovery_repo.record_new(
            team_id,
            current_round,
            outcome.answer.discovered_node_ids,
            outcome.answer.discovered_relationship_ids,
            source_action_id=action_id,
        )

        if new_nodes or new_relationships:
            await self._broadcaster.broadcast_to_team(
                team.game_id,
                team_id,
                "GRAPH_DISCOVERY",
                {
                    "team_id": str(team_id),
                    "node_ids": new_nodes,
                    "relationship_ids": new_relationships,
                    "discovered": outcome.subgraph.model_dump(mode="json"),
                    "source_action_id": str(action_id),
                },
            )

        return outcome.model_copy(update={"action_id": action_id, "credits_remaining": new_balance})
