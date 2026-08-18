"""`/host/games` routes (CONTRACT.md §8) -- round control, reveal, finish, scoreboard.

Every route here requires `X-Host-Token` (`require_host`).
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from operation_nexus.api.connection_manager import ConnectionManager
from operation_nexus.api.deps import (
    get_connection_manager,
    get_graph_reader,
    get_session,
    require_host,
)
from operation_nexus.application.advance_round import AdvanceRound
from operation_nexus.application.errors import NoActiveRound, RoundSequenceError
from operation_nexus.application.finish_game import FinishGame
from operation_nexus.application.get_scoreboard import GetScoreboard
from operation_nexus.application.ports import GraphReader
from operation_nexus.application.start_round import StartRound
from operation_nexus.domain.game.contracts import RoundState, ScoreBreakdown
from operation_nexus.domain.game.rounds import IllegalRoundTransition
from operation_nexus.infrastructure.postgres.repositories.evidence_reveal_repository import (
    EvidenceRevealRepository,
)
from operation_nexus.infrastructure.postgres.repositories.game_repository import (
    GameNotFound,
    GameRepository,
)
from operation_nexus.infrastructure.postgres.repositories.score_repository import ScoreRepository
from operation_nexus.infrastructure.postgres.repositories.team_repository import TeamRepository
from operation_nexus.infrastructure.settings import get_settings

router = APIRouter(
    prefix="/host/games",
    tags=["host"],
    dependencies=[Depends(require_host)],
)


class RevealRequest(BaseModel):
    evidence_id: str


class RevealResponse(BaseModel):
    status: str = "revealed"


@router.post("/{game_id}/rounds/next")
async def advance_round(
    game_id: UUID,
    session: AsyncSession = Depends(get_session),
    connection_manager: ConnectionManager = Depends(get_connection_manager),
) -> RoundState:
    use_case = AdvanceRound(GameRepository(session), connection_manager)
    try:
        return await use_case.execute(game_id)
    except NoActiveRound as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.post("/{game_id}/rounds/{number}/start")
async def start_round(
    game_id: UUID,
    number: int,
    session: AsyncSession = Depends(get_session),
    connection_manager: ConnectionManager = Depends(get_connection_manager),
) -> RoundState:
    use_case = StartRound(GameRepository(session), TeamRepository(session), connection_manager)
    try:
        return await use_case.execute(game_id, number)
    except GameNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except RoundSequenceError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except IllegalRoundTransition as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.post("/{game_id}/reveal")
async def reveal(
    game_id: UUID,
    body: RevealRequest,
    session: AsyncSession = Depends(get_session),
    connection_manager: ConnectionManager = Depends(get_connection_manager),
    graph_reader: GraphReader = Depends(get_graph_reader),
) -> RevealResponse:
    game = await GameRepository(session).get(game_id)
    if game is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"game not found: {game_id}",
        )

    graph_payload = await graph_reader.fetch_subgraph(
        [body.evidence_id], [], game.current_round
    )
    node = next((item for item in graph_payload.nodes if item.id == body.evidence_id), None)
    if node is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"evidence not visible: {body.evidence_id}",
        )

    reveal_payload: dict[str, object] = {
        "evidence_id": node.id,
        "id": node.id,
        "evidence_type": node.labels[0] if node.labels else "evidence",
        "excerpt": str(node.properties.get("content") or ""),
        "source": str(
            node.properties.get("source")
            or node.properties.get("channel")
            or "revelação do host"
        ),
        "captured_at": node.properties.get("captured_at") or node.properties.get("sent_at"),
        "round": game.current_round,
    }
    await EvidenceRevealRepository(session).record(
        game_id, body.evidence_id, game.current_round, reveal_payload
    )
    await connection_manager.broadcast_to_game(
        game_id,
        "EVIDENCE_UNLOCKED",
        reveal_payload,
    )
    return RevealResponse()


@router.get("/{game_id}/reveals")
async def list_reveals(
    game_id: UUID, session: AsyncSession = Depends(get_session)
) -> list[dict[str, object]]:
    if await GameRepository(session).get(game_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="game not found")
    return await EvidenceRevealRepository(session).list_for_game(game_id)


@router.post("/{game_id}/finish")
async def finish_game(
    game_id: UUID,
    session: AsyncSession = Depends(get_session),
    connection_manager: ConnectionManager = Depends(get_connection_manager),
) -> list[ScoreBreakdown]:
    settings = get_settings()
    use_case = FinishGame(
        GameRepository(session),
        TeamRepository(session),
        ScoreRepository(session),
        connection_manager,
        settings.scenarios_dir,
    )
    try:
        return await use_case.execute(game_id)
    except GameNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/{game_id}/scoreboard")
async def get_scoreboard(
    game_id: UUID, session: AsyncSession = Depends(get_session)
) -> list[ScoreBreakdown]:
    use_case = GetScoreboard(ScoreRepository(session))
    return await use_case.execute(game_id)
