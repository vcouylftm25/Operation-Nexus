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
from neo4j.exceptions import ServiceUnavailable, SessionExpired, TransientError

logger = structlog.get_logger(__name__)

T = TypeVar("T")

#: Exceptions worth retrying — connection blips and Neo4j's own "please retry
#: this transaction" signal. Anything else (syntax errors, constraint
#: violations, auth failures) must fail fast.
_TRANSIENT_EXCEPTIONS: tuple[type[Exception], ...] = (
    ServiceUnavailable,
    SessionExpired,
    TransientError,
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
        connection_timeout: float = 30.0,
        max_retries: int = 3,
        retry_backoff_seconds: float = 0.5,
    ) -> None:
        self._uri = uri
        self._user = user
        self._password = password
        self._max_connection_pool_size = max_connection_pool_size
        self._connection_timeout = connection_timeout
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
