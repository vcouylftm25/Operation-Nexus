"""`/teams` routes -- everything a team does inside its own run."""

from __future__ import annotations

from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from operation_nexus.api.connection_manager import ConnectionManager
from operation_nexus.api.deps import (
    get_connection_manager,
    get_graph_reader,
    get_investigation_runner,
    get_scenarios_dir,
    get_session,
    require_matching_team,
    require_team,
)
from operation_nexus.application.advance_phase import AdvancePhase
from operation_nexus.application.buy_hint import BuyHint, ListHints
from operation_nexus.application.get_docket import CaseFile, GetDocket
from operation_nexus.application.get_team_graph import GetTeamGraph
from operation_nexus.application.get_team_state import GetTeamState
from operation_nexus.application.hints import HintCard
from operation_nexus.application.ports import GraphReader, InvestigationRunner
from operation_nexus.application.record_investigation import RecordInvestigation
from operation_nexus.application.submit_guess import SubmitGuess
from operation_nexus.domain.game.contracts import GuessResult, RoundState, TeamState
from operation_nexus.domain.graph.payload import GraphPayload
from operation_nexus.domain.investigation.contracts import InvestigationResult
from operation_nexus.infrastructure.postgres.repositories.action_repository import ActionRepository
from operation_nexus.infrastructure.postgres.repositories.discovery_repository import (
    DiscoveryRepository,
)
from operation_nexus.infrastructure.postgres.repositories.game_repository import GameRepository
from operation_nexus.infrastructure.postgres.repositories.guess_repository import GuessRepository
from operation_nexus.infrastructure.postgres.repositories.hint_repository import HintRepository
from operation_nexus.infrastructure.postgres.repositories.team_repository import TeamRepository

router = APIRouter(prefix="/teams", tags=["teams"])


class InvestigateRequest(BaseModel):
    question: str


class AdvancePhaseResponse(BaseModel):
    team: TeamState
    briefing: RoundState


class BuyHintResponse(BaseModel):
    hint: HintCard
    credits_balance: int


class GuessRequest(BaseModel):
    person_id: str


class Suspect(BaseModel):
    id: str
    name: str
    already_guessed: bool


@router.get("/{team_id}/state")
async def get_team_state(
    team_id: UUID,
    session: AsyncSession = Depends(get_session),
    authenticated_team_id: UUID = Depends(require_team),
) -> TeamState:
    require_matching_team(team_id, authenticated_team_id)
    use_case = GetTeamState(TeamRepository(session), DiscoveryRepository(session))
    return await use_case.execute(team_id)


@router.post("/{team_id}/advance")
async def advance_phase(
    team_id: UUID,
    session: AsyncSession = Depends(get_session),
    authenticated_team_id: UUID = Depends(require_team),
    connection_manager: ConnectionManager = Depends(get_connection_manager),
) -> AdvancePhaseResponse:
    require_matching_team(team_id, authenticated_team_id)
    use_case = AdvancePhase(TeamRepository(session), GameRepository(session), connection_manager)
    team, briefing = await use_case.execute(team_id)
    return AdvancePhaseResponse(team=team, briefing=briefing)


@router.post("/{team_id}/investigate")
async def investigate(
    team_id: UUID,
    body: InvestigateRequest,
    session: AsyncSession = Depends(get_session),
    authenticated_team_id: UUID = Depends(require_team),
    connection_manager: ConnectionManager = Depends(get_connection_manager),
    runner: InvestigationRunner = Depends(get_investigation_runner),
    graph_reader: GraphReader = Depends(get_graph_reader),
) -> InvestigationResult:
    require_matching_team(team_id, authenticated_team_id)
    use_case = RecordInvestigation(
        TeamRepository(session),
        ActionRepository(session),
        DiscoveryRepository(session),
        runner,
        connection_manager,
        graph_reader=graph_reader,
    )
    return await use_case.execute(team_id, body.question)


@router.get("/{team_id}/hints")
async def list_hints(
    team_id: UUID,
    session: AsyncSession = Depends(get_session),
    authenticated_team_id: UUID = Depends(require_team),
    scenarios_dir: Path = Depends(get_scenarios_dir),
) -> list[HintCard]:
    require_matching_team(team_id, authenticated_team_id)
    use_case = ListHints(
        TeamRepository(session), GameRepository(session), HintRepository(session), scenarios_dir
    )
    return await use_case.execute(team_id)


@router.post("/{team_id}/hints/{hint_id}", status_code=status.HTTP_200_OK)
async def buy_hint(
    team_id: UUID,
    hint_id: str,
    session: AsyncSession = Depends(get_session),
    authenticated_team_id: UUID = Depends(require_team),
    scenarios_dir: Path = Depends(get_scenarios_dir),
) -> BuyHintResponse:
    require_matching_team(team_id, authenticated_team_id)
    use_case = BuyHint(
        TeamRepository(session), GameRepository(session), HintRepository(session), scenarios_dir
    )
    hint, balance = await use_case.execute(team_id, hint_id)
    return BuyHintResponse(hint=hint, credits_balance=balance)


@router.get("/{team_id}/suspects")
async def list_suspects(
    team_id: UUID,
    session: AsyncSession = Depends(get_session),
    authenticated_team_id: UUID = Depends(require_team),
    graph_reader: GraphReader = Depends(get_graph_reader),
) -> list[Suspect]:
    """Who this team may accuse, and who it already burned an attempt on."""
    require_matching_team(team_id, authenticated_team_id)
    team = await TeamRepository(session).get(team_id)
    if team is None:
        return []
    people = await graph_reader.list_suspects(team.current_round)
    already = set(await GuessRepository(session).list_guessed_ids(team_id))
    return sorted(
        (
            Suspect(id=person_id, name=name, already_guessed=person_id in already)
            for person_id, name in people.items()
        ),
        key=lambda s: s.name,
    )


@router.post("/{team_id}/guess")
async def submit_guess(
    team_id: UUID,
    body: GuessRequest,
    session: AsyncSession = Depends(get_session),
    authenticated_team_id: UUID = Depends(require_team),
    connection_manager: ConnectionManager = Depends(get_connection_manager),
    graph_reader: GraphReader = Depends(get_graph_reader),
    scenarios_dir: Path = Depends(get_scenarios_dir),
) -> GuessResult:
    require_matching_team(team_id, authenticated_team_id)
    use_case = SubmitGuess(
        TeamRepository(session),
        GameRepository(session),
        GuessRepository(session),
        HintRepository(session),
        graph_reader,
        connection_manager,
        scenarios_dir,
    )
    return await use_case.execute(team_id, body.person_id)


@router.get("/{team_id}/graph")
async def get_team_graph(
    team_id: UUID,
    session: AsyncSession = Depends(get_session),
    authenticated_team_id: UUID = Depends(require_team),
    graph_reader: GraphReader = Depends(get_graph_reader),
) -> GraphPayload:
    require_matching_team(team_id, authenticated_team_id)
    use_case = GetTeamGraph(DiscoveryRepository(session), graph_reader, TeamRepository(session))
    return await use_case.execute(team_id)


@router.get("/{team_id}/docket")
async def get_docket(
    team_id: UUID,
    session: AsyncSession = Depends(get_session),
    authenticated_team_id: UUID = Depends(require_team),
    graph_reader: GraphReader = Depends(get_graph_reader),
) -> list[CaseFile]:
    require_matching_team(team_id, authenticated_team_id)
    use_case = GetDocket(TeamRepository(session), graph_reader)
    return await use_case.execute(team_id)
