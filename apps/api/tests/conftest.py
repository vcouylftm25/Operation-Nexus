"""Shared pytest fixtures for the `operation_nexus` test suite.

`asyncio_mode = "auto"` (set in pyproject.toml) means async `def test_*`
functions run without needing an explicit `@pytest.mark.asyncio` marker.
"""

from __future__ import annotations

from uuid import UUID, uuid4

import pytest


@pytest.fixture
def team_id() -> UUID:
    return uuid4()


@pytest.fixture
def game_id() -> UUID:
    return uuid4()
