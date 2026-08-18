"""Operation Nexus API entrypoint: FastAPI app, lifespan, routers, error mapping."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from operation_nexus.api.connection_manager import ConnectionManager
from operation_nexus.api.routes import games, health, play, teams, ws
from operation_nexus.application.errors import (
    GuessLocked,
    HintLocked,
    HintNotFound,
    InvalidTeamName,
    NoAttemptsRemaining,
    NoFurtherPhase,
    RunAlreadyResolved,
    UnknownSuspect,
)
from operation_nexus.application.graph_reader import Neo4jGraphReader
from operation_nexus.application.ports import AINotEnabled, NullGraphReader, NullInvestigationRunner
from operation_nexus.domain.game.credits import InsufficientCredits
from operation_nexus.infrastructure.neo4j.driver import create_driver_manager_from_settings
from operation_nexus.infrastructure.neo4j.repository import GraphRepository
from operation_nexus.infrastructure.postgres.engine import create_engine, create_session_factory
from operation_nexus.infrastructure.postgres.repositories.game_repository import (
    GameNotFound,
    RoundNotFound,
)
from operation_nexus.infrastructure.postgres.repositories.team_repository import TeamNotFound
from operation_nexus.infrastructure.settings import get_settings

logger = structlog.get_logger(__name__)


def _build_investigation_runner(settings: object, graph_repo: GraphRepository) -> object:
    """Deterministic DSL runner by default; LangGraph only when AI_ENABLED=true."""
    from operation_nexus.ai.adapters import GraphRepositoryToolAdapter
    from operation_nexus.ai.deterministic import DeterministicInvestigationRunner
    from operation_nexus.infrastructure.settings import Settings

    adapter = GraphRepositoryToolAdapter(graph_repo)
    assert isinstance(settings, Settings)
    if not settings.ai_enabled:
        return DeterministicInvestigationRunner(adapter)

    from operation_nexus.ai.graph.investigation_graph import build_investigation_graph
    from operation_nexus.ai.runner import LangGraphInvestigationRunner
    from operation_nexus.infrastructure.azure_openai.client import build_azure_chat_model
    from operation_nexus.infrastructure.azure_openai.embeddings import get_embedding_provider

    chat = build_azure_chat_model(
        base_url=settings.azure_openai_base_url,
        api_key=settings.azure_openai_api_key.get_secret_value(),
        deployment=settings.azure_chat_deployment,
    )
    compiled = build_investigation_graph(
        chat_model=chat,
        repository=adapter,
        embedder=get_embedding_provider(),
    )
    return LangGraphInvestigationRunner(compiled)


def _configure_logging() -> None:
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.add_log_level,
            structlog.processors.JSONRenderer(),
        ],
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    _configure_logging()
    settings = get_settings()

    engine = create_engine(settings)
    app.state.engine = engine
    app.state.session_factory = create_session_factory(engine)
    app.state.connection_manager = ConnectionManager()
    app.state.settings = settings

    neo4j = create_driver_manager_from_settings()
    try:
        await neo4j.connect()
        await neo4j.verify_connectivity()
        app.state.neo4j = neo4j
        graph_repo = GraphRepository(neo4j)
        app.state.graph_repository = graph_repo
        app.state.graph_reader = Neo4jGraphReader(graph_repo)
        app.state.investigation_runner = _build_investigation_runner(settings, graph_repo)
    except Exception as exc:
        logger.warning("neo4j_startup_failed", error=str(exc))
        app.state.neo4j = None
        app.state.graph_repository = None
        app.state.graph_reader = NullGraphReader()
        app.state.investigation_runner = NullInvestigationRunner()

    logger.info("app_startup", app_env=settings.app_env, ai_enabled=settings.ai_enabled)
    try:
        yield
    finally:
        neo4j_manager = getattr(app.state, "neo4j", None)
        if neo4j_manager is not None:
            await neo4j_manager.close()
        await engine.dispose()
        logger.info("app_shutdown")


app = FastAPI(title="Operation Nexus", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(InsufficientCredits)
async def insufficient_credits_handler(request: Request, exc: InsufficientCredits) -> JSONResponse:
    # CONTRACT.md §7 -- exact body shape.
    return JSONResponse(
        status_code=402,
        content={
            "error": "INSUFFICIENT_CREDITS",
            "required": exc.required,
            "available": exc.available,
        },
    )


@app.exception_handler(AINotEnabled)
async def ai_not_enabled_handler(request: Request, exc: AINotEnabled) -> JSONResponse:
    return JSONResponse(status_code=503, content={"error": "AI_NOT_ENABLED", "detail": str(exc)})


@app.exception_handler(InvalidTeamName)
async def invalid_team_name_handler(request: Request, exc: InvalidTeamName) -> JSONResponse:
    return JSONResponse(status_code=422, content={"error": "INVALID_TEAM_NAME", "detail": str(exc)})


@app.exception_handler(NoFurtherPhase)
async def no_further_phase_handler(request: Request, exc: NoFurtherPhase) -> JSONResponse:
    return JSONResponse(status_code=409, content={"error": "NO_FURTHER_PHASE", "detail": str(exc)})


@app.exception_handler(RunAlreadyResolved)
async def run_already_resolved_handler(request: Request, exc: RunAlreadyResolved) -> JSONResponse:
    return JSONResponse(
        status_code=409, content={"error": "RUN_ALREADY_RESOLVED", "detail": str(exc)}
    )


@app.exception_handler(GuessLocked)
async def guess_locked_handler(request: Request, exc: GuessLocked) -> JSONResponse:
    return JSONResponse(
        status_code=409,
        content={
            "error": "GUESS_LOCKED",
            "detail": str(exc),
            "required_round": exc.required_round,
        },
    )


@app.exception_handler(NoAttemptsRemaining)
async def no_attempts_remaining_handler(request: Request, exc: NoAttemptsRemaining) -> JSONResponse:
    return JSONResponse(
        status_code=409, content={"error": "NO_ATTEMPTS_REMAINING", "detail": str(exc)}
    )


@app.exception_handler(UnknownSuspect)
async def unknown_suspect_handler(request: Request, exc: UnknownSuspect) -> JSONResponse:
    return JSONResponse(status_code=422, content={"error": "UNKNOWN_SUSPECT", "detail": str(exc)})


@app.exception_handler(HintNotFound)
async def hint_not_found_handler(request: Request, exc: HintNotFound) -> JSONResponse:
    return JSONResponse(status_code=404, content={"error": "HINT_NOT_FOUND", "detail": str(exc)})


@app.exception_handler(HintLocked)
async def hint_locked_handler(request: Request, exc: HintLocked) -> JSONResponse:
    return JSONResponse(status_code=409, content={"error": "HINT_LOCKED", "detail": str(exc)})


@app.exception_handler(GameNotFound)
async def game_not_found_handler(request: Request, exc: GameNotFound) -> JSONResponse:
    return JSONResponse(status_code=404, content={"error": "GAME_NOT_FOUND", "detail": str(exc)})


@app.exception_handler(RoundNotFound)
async def round_not_found_handler(request: Request, exc: RoundNotFound) -> JSONResponse:
    return JSONResponse(status_code=404, content={"error": "ROUND_NOT_FOUND", "detail": str(exc)})


@app.exception_handler(TeamNotFound)
async def team_not_found_handler(request: Request, exc: TeamNotFound) -> JSONResponse:
    return JSONResponse(status_code=404, content={"error": "TEAM_NOT_FOUND", "detail": str(exc)})


# `/health` is mounted both bare (infra/orchestration probes) and under the
# API prefix, since CONTRACT.md §8 lists it inside the `/api/v1` block.
app.include_router(health.router)
app.include_router(health.router, prefix="/api/v1")
app.include_router(play.router, prefix="/api/v1")
app.include_router(games.router, prefix="/api/v1")
app.include_router(teams.router, prefix="/api/v1")
app.include_router(ws.router)
