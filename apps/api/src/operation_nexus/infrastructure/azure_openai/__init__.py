"""Azure OpenAI adapters (chat + embeddings). Optional extra `ai`."""

from __future__ import annotations

from operation_nexus.infrastructure.azure_openai.embeddings import (
    EmbeddingProvider,
    get_embedding_provider,
)

__all__ = ["EmbeddingProvider", "get_embedding_provider"]
