"""Ground-truth access -- the quarantine boundary.

THIS IS THE ONLY MODULE IN THE ENTIRE CODEBASE ALLOWED TO TOUCH GROUND TRUTH.

`ground_truth.yaml` is quarantined by design (CONTRACT.md golden rule #4): it
must never enter an LLM prompt, a tool result, or an API response. Concretely:

  * `GroundTruth` and `load_ground_truth` live here and nowhere else.
  * No module under `ai/` may import this module (enforced statically by
    `tests/unit/test_no_ground_truth_leak.py`).
  * Under `application/` and `api/`, exactly one module -- `submit_guess.py` --
    is allowed to import it. That allowlist is enforced by the same test.

`is_fraudster` is the whole public surface for gameplay: it takes the team's
guess and returns a **boolean**. Nothing that could carry the answer -- no id,
no name, no list of suspects -- crosses back out of this module, so even the
moment of judgement cannot leak who the fraudster is.
"""

from __future__ import annotations

from pathlib import Path

import yaml
from pydantic import BaseModel, Field

from operation_nexus.domain.game.contracts import FraudPattern


class GroundTruth(BaseModel):
    """Shape of `scenarios/<slug>/ground_truth.yaml` (CONTRACT.md §14).

    Only `coordinator` drives gameplay now — the team names one person. The
    remaining fields stay because they document the scenario for the
    facilitator and keep older scenarios loadable.
    """

    coordinator: str
    fraudsters: list[str] = Field(default_factory=list)
    pattern: FraudPattern = FraudPattern.OTHER
    key_relationships: list[str] = Field(default_factory=list)
    designed_false_positives: list[str] = Field(default_factory=list)
    decoy_notes: str = ""


def load_ground_truth(scenario_slug: str, scenarios_dir: Path) -> GroundTruth:
    """Load and parse `ground_truth.yaml` for a scenario. The only entry point
    into that file anywhere in the codebase.
    """
    path = scenarios_dir / scenario_slug / "ground_truth.yaml"
    with path.open("r", encoding="utf-8") as fh:
        raw = yaml.safe_load(fh)
    return GroundTruth.model_validate(raw)


def is_fraudster(guessed_person_id: str, ground_truth: GroundTruth) -> bool:
    """Was this the person who coordinated the scheme?

    Returns a bare boolean on purpose. Callers get no way to discover the
    right answer by inspecting the return value.
    """
    return guessed_person_id.strip() == ground_truth.coordinator.strip()
