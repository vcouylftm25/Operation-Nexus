"""Async Neo4j driver lifecycle: connection pooling, retry, connectivity checks.

This is the only module allowed to hold a live `neo4j.AsyncDriver`. Everything
else (the repository, the seeder) is handed a `Neo4jDriverManager` instance —
never a bare driver — so retry/backoff behaviour is applied uniformly.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from typing import TypeVar

import structlog
from neo4j import AsyncDriver, AsyncGraphDatabase, AsyncManagedTransaction, AsyncSession

# Private module on purpose: `SocketDeadlineExceededError` is a plain
# RuntimeError, not a DriverError, so it is invisible to every public
# exception in `neo4j.exceptions` — see `_TRANSIENT_EXCEPTIONS`. A driver
# upgrade that moves or renames it must fail loudly here rather than silently
# stop retrying in production — see tests/unit/test_neo4j_driver_retry.py.
from neo4j._exceptions import SocketDeadlineExceededError
from neo4j.exceptions import ServiceUnavailable, SessionExpired, TransientError

logger = structlog.get_logger(__name__)

T = TypeVar("T")

#: Exceptions worth retrying — connection blips and Neo4j's own "please retry
#: this transaction" signal. Anything else (syntax errors, constraint
#: violations, auth failures) must fail fast.
#:
#: `SocketDeadlineExceededError` is the one that bites in production: when Aura
#: kills a connection mid-query the read blocks until the socket deadline and
#: then raises this, which — being a bare RuntimeError — sails past the
#: driver's own managed retry and past the three DriverError types below. It
#: reached a player once as an HTTP 500 while every other stale-connection blip
#: was retried transparently.
_TRANSIENT_EXCEPTIONS: tuple[type[Exception], ...] = (
    ServiceUnavailable,
    SessionExpired,
    TransientError,
    SocketDeadlineExceededError,
)


class Neo4jDriverManager:
    """Owns one `AsyncDriver` for the process lifetime and wraps read/write
    transactions with retry-on-transient-error and exponential backoff."""

    def __init__(
        self,
        uri: str,
        user: str,
        password: str,
        *,
        max_connection_pool_size: int = 50,
        # Aura's hostname resolves to more than one address and one of them
        # occasionally refuses to answer — roughly one connect in fifteen hung
        # for the full timeout while the healthy ones all finished under half a
        # second. The driver only moves to the next address once this expires,
        # so the timeout is the entire cost of hitting a bad one. Five seconds
        # is an order of magnitude above the observed worst healthy connect and
        # an order of magnitude below what a player will sit through.
        connection_timeout: float = 5.0,
        # Aura sits behind a load balancer that silently drops idle TCP
        # connections after a few minutes. Without these two the pool hands out
        # a socket the server already closed, and the first query after a quiet
        # spell pays a read timeout ("failed to read from defunct connection")
        # before the driver retries on a fresh one. Retiring connections well
        # inside that idle window, and pinging anything idle past
        # `liveness_check_timeout`, keeps the first request cheap.
        max_connection_lifetime: float = 300.0,
        liveness_check_timeout: float = 30.0,
        # A single stale socket burns ~30s before the read gives up. The
        # driver's default retry budget is also 30s, so that one stall used up
        # the whole allowance and the managed transaction gave up without ever
        # retrying. Doubling the budget leaves room for the retry that
        # succeeds — a slow answer beats an error the team has to re-ask for.
        max_transaction_retry_time: float = 60.0,
        max_retries: int = 3,
        retry_backoff_seconds: float = 0.5,
    ) -> None:
        self._uri = uri
        self._user = user
        self._password = password
        self._max_connection_pool_size = max_connection_pool_size
        self._connection_timeout = connection_timeout
        self._max_connection_lifetime = max_connection_lifetime
        self._liveness_check_timeout = liveness_check_timeout
        self._max_transaction_retry_time = max_transaction_retry_time
        self._max_retries = max_retries
        self._retry_backoff_seconds = retry_backoff_seconds
        self._driver: AsyncDriver | None = None

    @property
    def driver(self) -> AsyncDriver:
        if self._driver is None:
            raise RuntimeError("Neo4jDriverManager not connected — call connect() first.")
        return self._driver

    async def connect(self) -> AsyncDriver:
        """Idempotent: safe to call more than once."""
        if self._driver is None:
            self._driver = AsyncGraphDatabase.driver(
                self._uri,
                auth=(self._user, self._password),
                max_connection_pool_size=self._max_connection_pool_size,
                connection_timeout=self._connection_timeout,
                max_connection_lifetime=self._max_connection_lifetime,
                liveness_check_timeout=self._liveness_check_timeout,
                max_transaction_retry_time=self._max_transaction_retry_time,
            )
        return self._driver

    async def close(self) -> None:
        if self._driver is not None:
            await self._driver.close()
            self._driver = None

    async def verify_connectivity(self) -> None:
        """Retries transient connectivity failures — useful right after a
        container (Docker/testcontainers) has just been started and Bolt
        isn't accepting connections yet."""
        driver = await self.connect()

        async def _verify() -> None:
            await driver.verify_connectivity()

        await self._with_retry(_verify)

    @asynccontextmanager
    async def session(self, **kwargs: object) -> AsyncIterator[AsyncSession]:
        driver = await self.connect()
        session = driver.session(**kwargs)
        try:
            yield session
        finally:
            await session.close()

    async def execute_read(
        self,
        work: Callable[[AsyncManagedTransaction], Awaitable[T]],
        **session_kwargs: object,
    ) -> T:
        async def _run() -> T:
            async with self.session(**session_kwargs) as session:
                return await session.execute_read(work)

        return await self._with_retry(_run)

    async def execute_write(
        self,
        work: Callable[[AsyncManagedTransaction], Awaitable[T]],
        **session_kwargs: object,
    ) -> T:
        async def _run() -> T:
            async with self.session(**session_kwargs) as session:
                return await session.execute_write(work)

        return await self._with_retry(_run)

    async def _with_retry(self, action: Callable[[], Awaitable[T]]) -> T:
        attempt = 0
        while True:
            try:
                return await action()
            except _TRANSIENT_EXCEPTIONS as exc:
                attempt += 1
                if attempt > self._max_retries:
                    logger.error("neo4j.retry.exhausted", attempts=attempt, error=str(exc))
                    raise
                backoff = self._retry_backoff_seconds * (2 ** (attempt - 1))
                logger.warning(
                    "neo4j.retry",
                    attempt=attempt,
                    max_retries=self._max_retries,
                    backoff_seconds=backoff,
                    error=str(exc),
                )
                await asyncio.sleep(backoff)


def create_driver_manager_from_settings() -> Neo4jDriverManager:
    """Build a `Neo4jDriverManager` from `operation_nexus.infrastructure.settings`.

    Imported lazily so this module (and anything that merely imports it, e.g.
    the CLI) never hard-fails if settings aren't wired up yet elsewhere in the
    monorepo, and so tests can construct a `Neo4jDriverManager` directly
    against a testcontainer without going through settings at all.
    """
    from operation_nexus.infrastructure.settings import get_settings

    settings = get_settings()
    return Neo4jDriverManager(
        uri=settings.neo4j_uri,
        user=settings.neo4j_user,
        password=settings.neo4j_password.get_secret_value(),
    )
