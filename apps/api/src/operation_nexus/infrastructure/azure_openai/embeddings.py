"""Embedding providers used by GraphRAG and the scenario seeder.

`GraphRepository.semantic_evidence_search` never calls Azure itself — it
accepts an already-computed vector (or `None`, which falls back to a
`CONTAINS` search). This module is the only place embeddings are produced.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol, runtime_checkable

from pydantic import SecretStr

from operation_nexus.domain.graph.schema import EMBEDDING_DIMENSIONS


@runtime_checkable
class EmbeddingProvider(Protocol):
    """Structural contract shared by Azure, the seeder, and the fake."""

    async def embed(self, texts: Sequence[str]) -> list[list[float]]: ...

    async def embed_query(self, text: str) -> list[float]: ...


class AzureEmbeddingProvider:
    """OpenAI-compatible embeddings against Azure's `/openai/v1/` surface."""

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        deployment: str,
        dimensions: int = EMBEDDING_DIMENSIONS,
    ) -> None:
        from langchain_openai import OpenAIEmbeddings

        self._dimensions = dimensions
        self._client = OpenAIEmbeddings(
            base_url=base_url,
            api_key=SecretStr(api_key),
            model=deployment,
            dimensions=dimensions,
            check_embedding_ctx_length=False,
        )

    async def embed(self, texts: Sequence[str]) -> list[list[float]]:
        if not texts:
            return []
        vectors = await self._client.aembed_documents(list(texts))
        return [list(vector) for vector in vectors]

    async def embed_query(self, text: str) -> list[float]:
        return list(await self._client.aembed_query(text))


def get_embedding_provider() -> EmbeddingProvider:
    """Production wiring. Falls back to the deterministic fake when no key is set."""
    from operation_nexus.infrastructure.azure_openai.fake import FakeEmbeddingProvider
    from operation_nexus.infrastructure.settings import get_settings

    settings = get_settings()
    api_key = settings.azure_openai_api_key.get_secret_value().strip()
    if not api_key or api_key.startswith("dev-"):
        return FakeEmbeddingProvider()
    return AzureEmbeddingProvider(
        base_url=settings.azure_openai_base_url,
        api_key=api_key,
        deployment=settings.azure_embedding_deployment,
        dimensions=settings.azure_embedding_dimensions,
    )
