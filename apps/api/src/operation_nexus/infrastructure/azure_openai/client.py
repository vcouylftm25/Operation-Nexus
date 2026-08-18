"""Builds the real Azure OpenAI chat model against the v1-compatible endpoint.

Azure now exposes an OpenAI-compatible surface at `.../openai/v1/`. Against
that surface, a plain `langchain_openai.ChatOpenAI` works unmodified — no
`AzureChatOpenAI`, no `api_version` query param — you point `base_url` at it
and pass the deployment name as `model` (CONTRACT.md §11:
`AZURE_OPENAI_BASE_URL`, `AZURE_CHAT_DEPLOYMENT`).

This module is only ever imported from AI-enabled code paths
(`ai.runner`'s production wiring); `ai.graph.investigation_graph` itself
never imports it — it only depends on the injected `BaseChatModel`.
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

from langchain_openai import ChatOpenAI

_V1_SUFFIX = "/openai/v1/"


@runtime_checkable
class AzureChatSettings(Protocol):
    """The narrow slice of `infrastructure.settings.Settings` this needs.

    Declared as a `Protocol` rather than importing the concrete settings
    class, so this module never hard-depends on `infrastructure.settings`
    (owned by the engine agent) landing first.
    """

    azure_openai_base_url: str
    azure_openai_api_key: str
    azure_chat_deployment: str


def build_azure_chat_model(
    *,
    base_url: str,
    api_key: str,
    deployment: str,
    temperature: float | None = None,
    timeout: float = 30.0,
    max_retries: int = 2,
    **extra: Any,
) -> ChatOpenAI:
    """Build a `ChatOpenAI` pointed at Azure's OpenAI v1-compatible endpoint.

    `temperature` is left unset by default: some reasoning-style deployments
    (e.g. `AZURE_REASONING_DEPLOYMENT`) reject a non-default `temperature`
    outright, so we only pass it when the caller explicitly asks for one.
    """
    if not base_url.endswith(_V1_SUFFIX):
        raise ValueError(
            f"AZURE_OPENAI_BASE_URL must end in '{_V1_SUFFIX}' (Azure's "
            f"OpenAI-compatible v1 surface); got {base_url!r}"
        )
    kwargs: dict[str, Any] = {
        "base_url": base_url,
        "api_key": api_key,
        "model": deployment,
        "timeout": timeout,
        "max_retries": max_retries,
        **extra,
    }
    if temperature is not None:
        kwargs["temperature"] = temperature
    return ChatOpenAI(**kwargs)


def build_chat_model_from_settings(settings: AzureChatSettings, **overrides: Any) -> ChatOpenAI:
    """Convenience wiring for `infrastructure.settings.get_settings()`."""
    return build_azure_chat_model(
        base_url=settings.azure_openai_base_url,
        api_key=settings.azure_openai_api_key,
        deployment=settings.azure_chat_deployment,
        **overrides,
    )
