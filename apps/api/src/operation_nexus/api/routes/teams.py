"""`/teams` routes (CONTRACT.md §8) -- join, investigate, accuse, read state/graph."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from operation_nexus.api.connection_manager import ConnectionManager
from operation_nexus.api.deps import (
    get_connection_manager,
    get_graph_reader,
    get_investigation_runner,
    get_session,
    require_matching_team,
    require_team,
)
from operation_nexus.application.errors import InvalidJoinCode
from operation_nexus.application.get_docket import CaseFile, GetDocket
from operation_nexus.application.get_team_graph import GetTeamGraph
from operation_nexus.application.get_team_state import GetTeamState
from operation_nexus.application.join_team import JoinTeam
from operation_nexus.application.ports import GraphReader, InvestigationRunner
from operation_nexus.application.record_investigation import RecordInvestigation
from operation_nexus.application.submit_accusation import SubmitAccusation
from operation_nexus.domain.game.contracts import Accusation, TeamState
from operation_nexus.domain.graph.payload import GraphPayload
from operation_nexus.domain.investigation.contracts import InvestigationResult
from operation_nexus.infrastructure.postgres.repositories.action_repository import ActionRepository
from operation_nexus.infrastructure.postgres.repositories.discovery_repository import (
    DiscoveryRepository,
)
from operation_nexus.infrastructure.postgres.repositories.game_repository import GameRepository
from operation_nexus.infrastructure.postgres.repositories.team_repository import (
    TeamNotFound,
    TeamRepository,
)

router = APIRouter(prefix="/teams", tags=["teams"])


class JoinTeamRequest(BaseModel):
    join_code: str


class JoinTeamResponse(BaseModel):
    team_id: UUID
    game_id: UUID
    session_token: str


class InvestigateRequest(BaseModel):
    question: str


class AccusationAcceptedResponse(BaseModel):
    status: str = "accepted"


@router.post("/join", status_code=status.HTTP_200_OK)
async def join_team(
    body: JoinTeamRequest, session: AsyncSession = Depends(get_session)
) -> JoinTeamResponse:
    use_case = JoinTeam(TeamRepository(session))
    try:
        result = await use_case.execute(body.join_code)
    except InvalidJoinCode as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return JoinTeamResponse(
        team_id=result.team.team_id, game_id=result.team.game_id, session_token=result.session_token
    )


@router.get("/{team_id}/state")
async def get_team_state(
    team_id: UUID,
    session: AsyncSession = Depends(get_session),
    authenticated_team_id: UUID = Depends(require_team),
) -> TeamState:
    require_matching_team(team_id, authenticated_team_id)
    use_case = GetTeamState(
        TeamRepository(session), GameRepository(session), DiscoveryRepository(session)
    )
    try:
        return await use_case.execute(team_id)
    except TeamNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/{team_id}/investigate")
async def investigate(
    team_id: UUID,
    body: InvestigateRequest,
    session: AsyncSession = Depends(get_session),
    authenticated_team_id: UUID = Depends(require_team),
    connection_manager: ConnectionManager = Depends(get_connection_manager),
    runner: InvestigationRunner = Depends(get_investigation_runner),
) -> InvestigationResult:
    require_matching_team(team_id, authenticated_team_id)
    use_case = RecordInvestigation(
        TeamRepository(session),
        GameRepository(session),
        ActionRepository(session),
        DiscoveryRepository(session),
        runner,
        connection_manager,
    )
    try:
        return await use_case.execute(team_id, body.question)
    except TeamNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/{team_id}/accusation", status_code=status.HTTP_202_ACCEPTED)
async def submit_accusation(
    team_id: UUID,
    body: Accusation,
    session: AsyncSession = Depends(get_session),
    authenticated_team_id: UUID = Depends(require_team),
    connection_manager: ConnectionManager = Depends(get_connection_manager),
) -> AccusationAcceptedResponse:
    require_matching_team(team_id, authenticated_team_id)
    use_case = SubmitAccusation(
        TeamRepository(session), GameRepository(session), connection_manager
    )
    try:
        await use_case.execute(team_id, body)
    except TeamNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return AccusationAcceptedResponse()


@router.get("/{team_id}/graph")
async def get_team_graph(
    team_id: UUID,
    session: AsyncSession = Depends(get_session),
    authenticated_team_id: UUID = Depends(require_team),
    graph_reader: GraphReader = Depends(get_graph_reader),
) -> GraphPayload:
    require_matching_team(team_id, authenticated_team_id)
    use_case = GetTeamGraph(
        DiscoveryRepository(session),
        graph_reader,
        TeamRepository(session),
        GameRepository(session),
    )
    return await use_case.execute(team_id)


@router.get("/{team_id}/docket")
async def get_docket(
    team_id: UUID,
    session: AsyncSession = Depends(get_session),
    authenticated_team_id: UUID = Depends(require_team),
    graph_reader: GraphReader = Depends(get_graph_reader),
) -> list[CaseFile]:
    require_matching_team(team_id, authenticated_team_id)
    use_case = GetDocket(TeamRepository(session), GameRepository(session), graph_reader)
    try:
        return await use_case.execute(team_id)
    except TeamNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
