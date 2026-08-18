"""Application settings, loaded from the environment (see CONTRACT.md §11).

All settings are given safe local-dev defaults so the API can boot without a
`.env` file present (e.g. in CI or a fresh checkout). Every real deployment
MUST override the secret fields via the environment or an `.env` file --
never commit real secrets.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_V1_SUFFIX = "/openai/v1/"


def _default_scenarios_dir() -> Path:
    """Walk parents until we find a `scenarios/` directory.

    Locally this is the repo root. Inside the API Docker image the package
    lives at `/app/src/...` and scenarios are copied to `/app/scenarios`.
    """
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "scenarios"
        if candidate.is_dir():
            return candidate
    return here.parents[5] / "scenarios"


def _discover_env_files() -> tuple[str, ...]:
    """Repo-root `.env` first (so `make api` from apps/api still sees it)."""
    files: list[str] = []
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "scenarios").is_dir():
            root_env = parent / ".env"
            if root_env.is_file():
                files.append(str(root_env))
            break
    cwd_env = Path(".env")
    if cwd_env.is_file():
        resolved = str(cwd_env.resolve())
        if resolved not in files:
            files.append(resolved)
    return tuple(files)


class Settings(BaseSettings):
    """Typed view over every environment variable from CONTRACT.md §11."""

    model_config = SettingsConfigDict(
        env_file=_discover_env_files(),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
        populate_by_name=True,
    )

    app_env: str = "local"
    api_host: str = "0.0.0.0"  # noqa: S104
    api_port: int = 8000

    host_token: SecretStr = SecretStr("dev-host-token-change-me")
    session_secret: SecretStr = SecretStr("dev-session-secret-change-me")

    postgres_dsn: str = "postgresql+psycopg://nexus:nexus@localhost:5432/nexus"

    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: SecretStr = SecretStr("nexus_dev_password")

    azure_openai_base_url: str = Field(
        default="https://example.openai.azure.com/openai/v1/",
        validation_alias=AliasChoices("AZURE_OPENAI_BASE_URL", "AZURE_OPENAI_ENDPOINT"),
    )
    azure_openai_api_key: SecretStr = SecretStr("dev-azure-openai-key")
    azure_chat_deployment: str = Field(
        default="gpt-5.4-mini",
        validation_alias=AliasChoices("AZURE_CHAT_DEPLOYMENT", "AZURE_OPENAI_DEPLOYMENT"),
    )
    azure_reasoning_deployment: str = "gpt-5.6-sol"
    azure_embedding_deployment: str = Field(
        default="text-embedding-3-small",
        validation_alias=AliasChoices(
            "AZURE_EMBEDDING_DEPLOYMENT", "AZURE_OPENAI_EMBEDDING_DEPLOYMENT"
        ),
    )

    ai_enabled: bool = False
    langsmith_tracing: bool = False

    vite_api_url: str = "http://localhost:8000"
    vite_ws_url: str = "ws://localhost:8000"

    scenarios_dir: Path = _default_scenarios_dir()

    @field_validator("azure_openai_base_url", mode="before")
    @classmethod
    def _normalize_azure_base_url(cls, value: object) -> object:
        """Accept a resource origin and force Azure's OpenAI v1 surface."""
        if not isinstance(value, str) or not value.strip():
            return value
        url = value.strip().rstrip("/")
        if url.endswith("/openai/v1"):
            return f"{url}/"
        if "/openai/v1/" in url:
            return url if url.endswith("/") else f"{url}/"
        return f"{url}{_V1_SUFFIX}"


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide cached Settings instance."""
    return Settings()
