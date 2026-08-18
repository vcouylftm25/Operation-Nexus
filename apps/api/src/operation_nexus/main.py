"""Operation Nexus API entrypoint: FastAPI app, lifespan, routers, error mapping."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from operation_nexus.api.connection_manager import ConnectionManager
from operation_nexus.api.routes import games, health, host, teams, ws
from operation_nexus.application.errors import (
    InvalidJoinCode,
    NoAccusationSubmitted,
    NoActiveRound,
    RoundSequenceError,
)
from operation_nexus.application.graph_reader import Neo4jGraphReader
from operation_nexus.application.ports import AINotEnabled, NullGraphReader, NullInvestigationRunner
from operation_nexus.domain.game.credits import InsufficientCredits
from operation_nexus.domain.game.join_codes import JoinCodeExhausted
from operation_nexus.domain.game.rounds import IllegalRoundTransition
from operation_nexus.infrastructure.neo4j.driver import create_driver_manager_from_settings
from operation_nexus.infrastructure.neo4j.repository import GraphRepository
from operation_nexus.infrastructure.postgres.engine import create_engine, create_session_factory
from operation_nexus.infrastructure.postgres.repositories.game_repository import GameNotFound
from operation_nexus.infrastructure.postgres.repositories.team_repository import (
    AccusationNotFound,
    TeamNotFound,
)
from operation_nexus.infrastructure.settings import get_settings

logger = structlog.get_logger(__name__)

# CONTRACT.md §12: the vite dev server always runs on this origin locally.
_VITE_ORIGIN = "http://localhost:5173"


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
    allow_origins=[_VITE_ORIGIN, "http://127.0.0.1:5173"],
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


@app.exception_handler(IllegalRoundTransition)
async def illegal_round_transition_handler(
    request: Request, exc: IllegalRoundTransition
) -> JSONResponse:
    return JSONResponse(
        status_code=409, content={"error": "ILLEGAL_ROUND_TRANSITION", "detail": str(exc)}
    )


@app.exception_handler(RoundSequenceError)
async def round_sequence_handler(request: Request, exc: RoundSequenceError) -> JSONResponse:
    return JSONResponse(
        status_code=409, content={"error": "ROUND_SEQUENCE_ERROR", "detail": str(exc)}
    )


@app.exception_handler(NoActiveRound)
async def no_active_round_handler(request: Request, exc: NoActiveRound) -> JSONResponse:
    return JSONResponse(status_code=409, content={"error": "NO_ACTIVE_ROUND", "detail": str(exc)})


@app.exception_handler(AINotEnabled)
async def ai_not_enabled_handler(request: Request, exc: AINotEnabled) -> JSONResponse:
    return JSONResponse(status_code=503, content={"error": "AI_NOT_ENABLED", "detail": str(exc)})


@app.exception_handler(JoinCodeExhausted)
async def join_code_exhausted_handler(request: Request, exc: JoinCodeExhausted) -> JSONResponse:
    return JSONResponse(
        status_code=503, content={"error": "JOIN_CODE_EXHAUSTED", "detail": str(exc)}
    )


@app.exception_handler(InvalidJoinCode)
async def invalid_join_code_handler(request: Request, exc: InvalidJoinCode) -> JSONResponse:
    return JSONResponse(status_code=404, content={"error": "INVALID_JOIN_CODE", "detail": str(exc)})


@app.exception_handler(GameNotFound)
async def game_not_found_handler(request: Request, exc: GameNotFound) -> JSONResponse:
    return JSONResponse(status_code=404, content={"error": "GAME_NOT_FOUND", "detail": str(exc)})


@app.exception_handler(TeamNotFound)
async def team_not_found_handler(request: Request, exc: TeamNotFound) -> JSONResponse:
    return JSONResponse(status_code=404, content={"error": "TEAM_NOT_FOUND", "detail": str(exc)})


@app.exception_handler(AccusationNotFound)
async def accusation_not_found_handler(request: Request, exc: AccusationNotFound) -> JSONResponse:
    return JSONResponse(
        status_code=404, content={"error": "ACCUSATION_NOT_FOUND", "detail": str(exc)}
    )


@app.exception_handler(NoAccusationSubmitted)
async def no_accusation_submitted_handler(
    request: Request, exc: NoAccusationSubmitted
) -> JSONResponse:
    return JSONResponse(
        status_code=404, content={"error": "NO_ACCUSATION_SUBMITTED", "detail": str(exc)}
    )


# `/health` is mounted both bare (infra/orchestration probes) and under the
# API prefix, since CONTRACT.md §8 lists it inside the `/api/v1` block.
app.include_router(health.router)
app.include_router(health.router, prefix="/api/v1")
app.include_router(games.router, prefix="/api/v1")
app.include_router(teams.router, prefix="/api/v1")
app.include_router(host.router, prefix="/api/v1")
app.include_router(ws.router)
