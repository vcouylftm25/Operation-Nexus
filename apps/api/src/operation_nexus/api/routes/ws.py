"""`/ws/games/{game_id}` -- role-scoped realtime channel (CONTRACT.md §9).

`role=host` authenticates with the shared `X-Host-Token` value (passed as
`?token=`); `role=team` authenticates with a team's bearer session token;
`role=screen` is the public projector view and needs no token. Actual
broadcast fan-out and the "never leak to a rival team" guarantee live in
`ConnectionManager` -- this module only handles the handshake and registry
lifecycle.
"""

from __future__ import annotations

import secrets
from uuid import UUID

import structlog
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, WebSocketException, status

from operation_nexus.api.connection_manager import ConnectionManager
from operation_nexus.application.session_tokens import hash_session_token
from operation_nexus.infrastructure.postgres.repositories.team_repository import TeamRepository
from operation_nexus.infrastructure.settings import get_settings

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["ws"])


async def _authenticate(
    websocket: WebSocket, game_id: UUID, role: str, token: str | None
) -> UUID | None:
    """Return the authenticated team_id for `role=team`, or None otherwise.
    Raises `WebSocketException` (closing the socket) on failure.
    """
    if role == "host":
        settings = get_settings()
        if token is None or not secrets.compare_digest(
            token, settings.host_token.get_secret_value()
        ):
            raise WebSocketException(
                code=status.WS_1008_POLICY_VIOLATION, reason="invalid host token"
            )
        return None

    if role == "team":
        if token is None:
            raise WebSocketException(
                code=status.WS_1008_POLICY_VIOLATION, reason="missing team token"
            )
        session_factory = websocket.app.state.session_factory
        async with session_factory() as session:
            team_repo = TeamRepository(session)
            team_id = await team_repo.resolve_session_token(hash_session_token(token))
            if team_id is None:
                raise WebSocketException(
                    code=status.WS_1008_POLICY_VIOLATION, reason="invalid team token"
                )
            team = await team_repo.get(team_id)
            if team is None or team.game_id != game_id:
                raise WebSocketException(
                    code=status.WS_1008_POLICY_VIOLATION, reason="team not in this game"
                )
        return team_id

    if role == "screen":
        return None

    raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION, reason="invalid role")


@router.websocket("/ws/games/{game_id}")
async def game_channel(
    websocket: WebSocket, game_id: UUID, role: str, token: str | None = None
) -> None:
    manager: ConnectionManager = websocket.app.state.connection_manager

    try:
        team_id = await _authenticate(websocket, game_id, role, token)
    except WebSocketException as exc:
        await websocket.close(code=exc.code, reason=exc.reason)
        return

    await websocket.accept()
    connection = manager.connect(game_id, role, websocket, team_id=team_id)
    logger.info(
        "ws_connected", game_id=str(game_id), role=role, team_id=str(team_id) if team_id else None
    )

    try:
        while True:
            # Server -> client is push-only; we still need to await the
            # socket so disconnects are detected promptly. Any inbound frame
            # is ignored (no client -> server protocol is defined yet).
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(game_id, connection)
        logger.info("ws_disconnected", game_id=str(game_id), role=role)
