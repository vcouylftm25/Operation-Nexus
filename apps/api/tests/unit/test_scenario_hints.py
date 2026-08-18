"""Guards over the shipped scenarios' `hints.yaml`.

A hint is bought mid-game and shown verbatim to players, so a bad one cannot
be caught by review alone -- these run on every commit. The strong rule is that
a hint may never name *any* person in the cast: that is stricter than "never
name the fraudster", and it needs no access to the answer to enforce.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from operation_nexus.application.hints import load_hints

_SCENARIOS = Path(__file__).resolve().parents[3].parent / "scenarios"
_SHIPPED = ("vero_express",)


def _person_names(slug: str) -> set[str]:
    """Every string that would identify a suspect: id, full name, each name part."""
    entities = json.loads((_SCENARIOS / slug / "entities.json").read_text(encoding="utf-8"))
    rows = entities["entities"] if isinstance(entities, dict) else entities
    names: set[str] = set()
    for row in rows:
        if row.get("label") != "Person":
            continue
        names.add(row["id"])
        for candidate in (row.get("label_display"), row.get("properties", {}).get("name")):
            if isinstance(candidate, str):
                names.add(candidate)
                names.update(part for part in candidate.split() if len(part) > 3)
    return names


@pytest.mark.parametrize("slug", _SHIPPED)
def test_the_forbidden_name_list_is_actually_populated(slug: str) -> None:
    """Without this, a schema change would silently make the guard vacuous."""
    names = _person_names(slug)
    assert len(names) >= 8, f"expected the whole cast, extracted only {sorted(names)}"


@pytest.mark.parametrize("slug", _SHIPPED)
def test_scenario_ships_hints_for_every_phase(slug: str) -> None:
    hints = load_hints(slug, _SCENARIOS)
    assert hints, f"{slug} has no hints"
    phases = {hint.round for hint in hints}
    assert phases == {1, 2, 3}, f"{slug} is missing hints for some phase: {sorted(phases)}"


@pytest.mark.parametrize("slug", _SHIPPED)
def test_hint_ids_are_unique(slug: str) -> None:
    ids = [hint.id for hint in load_hints(slug, _SCENARIOS)]
    assert len(ids) == len(set(ids)), f"duplicate hint ids in {slug}: {ids}"


@pytest.mark.parametrize("slug", _SHIPPED)
def test_no_hint_names_anyone_in_the_cast(slug: str) -> None:
    """Stricter than 'never name the fraudster', and answer-blind."""
    forbidden = _person_names(slug)
    offences: list[str] = []
    for hint in load_hints(slug, _SCENARIOS):
        haystack = f"{hint.title} {hint.text}"
        for name in forbidden:
            if name in haystack:
                offences.append(f"{hint.id} mentions {name!r}")
    assert offences == [], "hints must never name a suspect:\n" + "\n".join(offences)


@pytest.mark.parametrize("slug", _SHIPPED)
def test_hints_are_affordable_relative_to_the_phase_grant(slug: str) -> None:
    """No single hint may eat a whole phase's credits."""
    for hint in load_hints(slug, _SCENARIOS):
        assert 0 < hint.cost <= 30, f"{hint.id} costs {hint.cost}"
