"""Loading and serving purchasable hints.

Hints are scenario data, not code: `scenarios/<slug>/hints.yaml` holds the
copy, the phase each hint belongs to, and what it costs. A hint nudges a team
toward the next investigative move -- it never names the fraudster, which is a
property of how the scenario is written and is checked by the scenario tests.

A hint is only ever returned with its `text` filled in once the team has paid
for it; until then the card carries the title and the price so a team can
decide, and nothing else.
"""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import BaseModel, Field, model_validator

from operation_nexus.infrastructure.settings import get_settings

_HINT_ID = re.compile(r"^hint_r(\d)_\d{2}$")


class HintSpec(BaseModel):
    """One row of `hints.yaml`."""

    id: str
    round: int = Field(ge=1)
    cost: int = Field(ge=0)
    title: str
    text: str

    @model_validator(mode="after")
    def _id_must_agree_with_round(self) -> HintSpec:
        """`hint_r2_01` must declare `round: 2`.

        The id encodes the phase, and the shelf is filtered by the `round`
        field. If the two disagree, a phase-3 hint filed as `hint_r1_..` would
        be sold to a team still in phase 1 -- handing them the endgame. Caught
        at load time rather than in front of players.
        """
        match = _HINT_ID.match(self.id)
        if match is None:
            raise ValueError(f"hint id must look like hint_r<phase>_<nn>: {self.id!r}")
        if int(match.group(1)) != self.round:
            raise ValueError(
                f"hint {self.id!r} declares round {self.round}; its id says phase {match.group(1)}"
            )
        return self


class HintCard(BaseModel):
    """What the API hands a team: text present only if they bought it."""

    id: str
    round: int
    cost: int
    title: str
    purchased: bool
    text: str | None = None


@lru_cache
def _load_cached(scenario_slug: str, scenarios_dir: str) -> tuple[HintSpec, ...]:
    path = Path(scenarios_dir) / scenario_slug / "hints.yaml"
    if not path.is_file():
        return ()
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    rows = raw.get("hints") or []
    specs = [HintSpec.model_validate(row) for row in rows if isinstance(row, dict)]
    return tuple(sorted(specs, key=lambda h: (h.round, h.id)))


def load_hints(scenario_slug: str, scenarios_dir: Path | None = None) -> list[HintSpec]:
    """All hints a scenario defines, ordered by phase then id."""
    root = scenarios_dir or get_settings().scenarios_dir
    return list(_load_cached(scenario_slug, str(root)))


def find_hint(
    scenario_slug: str, hint_id: str, scenarios_dir: Path | None = None
) -> HintSpec | None:
    for spec in load_hints(scenario_slug, scenarios_dir):
        if spec.id == hint_id:
            return spec
    return None


def to_cards(specs: list[HintSpec], purchased_ids: set[str], current_round: int) -> list[HintCard]:
    """Build the hint shelf for a team: everything up to its current phase."""
    cards: list[HintCard] = []
    for spec in specs:
        if spec.round > current_round:
            continue
        bought = spec.id in purchased_ids
        cards.append(
            HintCard(
                id=spec.id,
                round=spec.round,
                cost=spec.cost,
                title=spec.title,
                purchased=bought,
                text=spec.text if bought else None,
            )
        )
    return cards
