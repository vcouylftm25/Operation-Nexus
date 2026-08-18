"""Role-scoped WebSocket broadcast for one Operation Nexus API process.

Implements the `EventBroadcaster` port used by the application layer, plus
the raw connection registry backing `routes/ws.py`. This is the module most
likely to break live, so the one rule that matters is enforced in exactly
one place: `broadcast_to_team` only ever reaches the owning team's
connections plus `host`/`screen` connections -- never another team's.

Deliberately has zero dependency on FastAPI/Starlette: connections are any
object with an async `send_json`, so this class is trivially unit-testable
with a fake socket.
"""

from __future__ import annotations

import itertools
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Protocol
from uuid import UUID

VALID_ROLES = frozenset({"team", "host", "screen"})


class SendsJSON(Protocol):
    async def send_json(self, data: dict[str, Any]) -> None: ...


@dataclass
class Connection:
    role: str  # "team" | "host" | "screen"
    socket: SendsJSON
    team_id: UUID | None = None


@dataclass
class _GameChannel:
    connections: list[Connection] = field(default_factory=list)
    seq_counter: itertools.count[int] = field(default_factory=lambda: itertools.count(1))


class ConnectionManager:
    """In-memory registry of live WebSocket connections, scoped per game."""

    def __init__(self) -> None:
        self._channels: dict[UUID, _GameChannel] = {}

    def _channel(self, game_id: UUID) -> _GameChannel:
        return self._channels.setdefault(game_id, _GameChannel())

    def connect(
        self, game_id: UUID, role: str, socket: SendsJSON, team_id: UUID | None = None
    ) -> Connection:
        if role not in VALID_ROLES:
            raise ValueError(f"invalid role: {role}")
        if role == "team" and team_id is None:
            raise ValueError("team connections must supply team_id")
        connection = Connection(role=role, socket=socket, team_id=team_id)
        self._channel(game_id).connections.append(connection)
        return connection

    def disconnect(self, game_id: UUID, connection: Connection) -> None:
        channel = self._channels.get(game_id)
        if channel is None:
            return
        if connection in channel.connections:
            channel.connections.remove(connection)
        if not channel.connections:
            del self._channels[game_id]

    def connection_count(self, game_id: UUID) -> int:
        channel = self._channels.get(game_id)
        return 0 if channel is None else len(channel.connections)

    def _next_seq(self, game_id: UUID) -> int:
        return next(self._channel(game_id).seq_counter)

    async def _send_to(
        self,
        game_id: UUID,
        recipients: Iterable[Connection],
        event_type: str,
        payload: dict[str, Any],
    ) -> None:
        recipients = list(recipients)
        if not recipients:
            return
        seq = self._next_seq(game_id)
        envelope = {
            "type": event_type,
            "game_id": str(game_id),
            "seq": seq,
            "ts": datetime.now(UTC).isoformat(),
            "payload": payload,
        }
        for connection in recipients:
            await connection.socket.send_json(envelope)

    async def broadcast_to_game(
        self, game_id: UUID, event_type: str, payload: dict[str, Any]
    ) -> None:
        """Send to every connection for this game, regardless of role."""
        channel = self._channels.get(game_id)
        if channel is None:
            return
        await self._send_to(game_id, channel.connections, event_type, payload)

    async def broadcast_to_team(
        self, game_id: UUID, team_id: UUID, event_type: str, payload: dict[str, Any]
    ) -> None:
        """Send to the owning team's connections plus host/screen only.

        This is the guarantee CONTRACT.md §9 calls out for `GRAPH_DISCOVERY`:
        a rival team must never see it.
        """
        channel = self._channels.get(game_id)
        if channel is None:
            return
        recipients = [
            connection
            for connection in channel.connections
            if connection.role in ("host", "screen")
            or (connection.role == "team" and connection.team_id == team_id)
        ]
        await self._send_to(game_id, recipients, event_type, payload)
