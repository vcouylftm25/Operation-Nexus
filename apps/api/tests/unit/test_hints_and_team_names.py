"""Hint shelf assembly and the team-name-as-credential rules."""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from operation_nexus.application.errors import InvalidTeamName
from operation_nexus.application.hints import HintSpec, load_hints, to_cards
from operation_nexus.application.start_play import (
    MAX_NAME_LENGTH,
    MIN_NAME_LENGTH,
    normalize_team_name,
)


def _spec(hint_id: str, rnd: int, cost: int = 15) -> HintSpec:
    return HintSpec(id=hint_id, round=rnd, cost=cost, title=f"Dica {hint_id}", text="segredo")


def test_hints_from_later_phases_are_not_even_listed() -> None:
    """A team in phase 1 must not see that a phase-3 hint exists."""
    cards = to_cards([_spec("hint_r1_01", 1), _spec("hint_r3_01", 3)], set(), current_round=1)
    assert [card.id for card in cards] == ["hint_r1_01"]


def test_an_unpurchased_hint_shows_its_price_but_never_its_text() -> None:
    (card,) = to_cards([_spec("hint_r1_01", 1, cost=20)], set(), current_round=1)
    assert card.purchased is False
    assert card.cost == 20
    assert card.text is None


def test_a_purchased_hint_carries_its_text() -> None:
    (card,) = to_cards([_spec("hint_r1_01", 1)], {"hint_r1_01"}, current_round=1)
    assert card.purchased is True
    assert card.text == "segredo"


def test_loading_hints_from_a_scenario_directory(tmp_path: Path) -> None:
    scenario = tmp_path / "demo"
    scenario.mkdir()
    (scenario / "hints.yaml").write_text(
        yaml.safe_dump(
            {
                "hints": [
                    {
                        "id": "hint_r2_01",
                        "round": 2,
                        "cost": 10,
                        "title": "Depois",
                        "text": "b",
                    },
                    {
                        "id": "hint_r1_01",
                        "round": 1,
                        "cost": 10,
                        "title": "Antes",
                        "text": "a",
                    },
                ]
            },
            allow_unicode=True,
        ),
        encoding="utf-8",
    )
    specs = load_hints("demo", tmp_path)
    assert [spec.id for spec in specs] == ["hint_r1_01", "hint_r2_01"]


def test_a_scenario_without_hints_is_not_an_error(tmp_path: Path) -> None:
    (tmp_path / "bare").mkdir()
    assert load_hints("bare", tmp_path) == []


def test_whitespace_variants_of_a_name_are_the_same_team() -> None:
    assert normalize_team_name("  Os   Detetives ") == "Os Detetives"


def test_a_name_too_short_or_too_long_is_rejected() -> None:
    with pytest.raises(InvalidTeamName):
        normalize_team_name("a" * (MIN_NAME_LENGTH - 1))
    with pytest.raises(InvalidTeamName):
        normalize_team_name("a" * (MAX_NAME_LENGTH + 1))


def test_a_blank_name_is_rejected() -> None:
    with pytest.raises(InvalidTeamName):
        normalize_team_name("   ")
