"""What the driver manager retries, and what it refuses to retry.

The interesting case is `SocketDeadlineExceededError`: Aura drops a connection
mid-query, the read blocks until the socket deadline and raises a plain
RuntimeError that no `neo4j.exceptions` type covers. It reached a player as an
HTTP 500 before it was added to the retry set, so it is pinned here.
"""

from __future__ import annotations

import pytest
from neo4j._exceptions import SocketDeadlineExceededError
from neo4j.exceptions import ServiceUnavailable, TransientError

from operation_nexus.infrastructure.neo4j.driver import Neo4jDriverManager


def _manager() -> Neo4jDriverManager:
    return Neo4jDriverManager(
        "bolt://unused:7687",
        "neo4j",
        "unused",
        max_retries=3,
        retry_backoff_seconds=0.0,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "error",
    [
        SocketDeadlineExceededError("read timed out"),
        ServiceUnavailable("failed to read from defunct connection"),
        TransientError("please retry"),
    ],
)
async def test_transient_errors_are_retried(error: Exception) -> None:
    attempts = 0

    async def flaky() -> str:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise error
        return "recuperado"

    assert await _manager()._with_retry(flaky) == "recuperado"
    assert attempts == 2


@pytest.mark.asyncio
async def test_socket_deadline_is_invisible_to_the_public_exception_types() -> None:
    """Guards the reason the private import exists at all.

    If a driver upgrade ever makes this a DriverError, the private import can
    go away — this failing is the signal to revisit it.
    """
    assert not issubclass(SocketDeadlineExceededError, ServiceUnavailable)
    assert issubclass(SocketDeadlineExceededError, RuntimeError)


@pytest.mark.asyncio
async def test_programming_errors_are_not_retried() -> None:
    attempts = 0

    async def broken() -> str:
        nonlocal attempts
        attempts += 1
        raise ValueError("cypher inválido")

    with pytest.raises(ValueError):
        await _manager()._with_retry(broken)
    assert attempts == 1


@pytest.mark.asyncio
async def test_retries_are_exhausted_rather_than_looping_forever() -> None:
    attempts = 0

    async def always_down() -> str:
        nonlocal attempts
        attempts += 1
        raise ServiceUnavailable("down")

    with pytest.raises(ServiceUnavailable):
        await _manager()._with_retry(always_down)
    assert attempts == 4  # first try plus max_retries
