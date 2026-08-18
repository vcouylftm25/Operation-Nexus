"""Leakage suite: ai/ must never load or import ground truth / scoring."""

from __future__ import annotations

import ast
import re
from pathlib import Path

_AI_ROOT = Path(__file__).resolve().parents[2] / "src" / "operation_nexus" / "ai"
_SCORING_MODULE = "operation_nexus.domain.game.scoring"
_DENIAL = re.compile(
    r"never|nunca|not |não |nao |must not|não tem|sem acesso|quarantine|"
    r"not loaded|never loads|does not exist|não existe|forbidden|fora do escopo",
    re.IGNORECASE,
)
# `get_ground_truth` is the name of a tool that must NOT exist — denylist, not a load.
_BARE_GROUND_TRUTH = re.compile(r"(?<!get_)ground_truth")


def _ai_files(*suffixes: str) -> list[Path]:
    return sorted(
        path
        for path in _AI_ROOT.rglob("*")
        if path.is_file() and path.suffix in suffixes and "__pycache__" not in path.parts
    )


def _is_comment_or_doc_line(line: str) -> bool:
    stripped = line.lstrip()
    return stripped.startswith("#") or stripped.startswith('"""') or stripped.startswith("'''")


def test_ai_package_exists() -> None:
    assert _AI_ROOT.is_dir(), f"missing ai package at {_AI_ROOT}"


def test_ground_truth_token_only_appears_in_denial_context() -> None:
    """`ground_truth` may show up in comments/prompts that say it is NOT loaded."""
    violations: list[str] = []
    for path in _ai_files(".py", ".md"):
        previous = ""
        for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if not _BARE_GROUND_TRUTH.search(line):
                previous = line
                continue
            allowed = _DENIAL.search(line) or _DENIAL.search(previous)
            if _is_comment_or_doc_line(line) and allowed:
                previous = line
                continue
            if path.suffix == ".md" and allowed:
                previous = line
                continue
            if allowed and ("yaml" in line or "gabarito" in line.lower()):
                previous = line
                continue
            rel = path.relative_to(_AI_ROOT)
            violations.append(f"{rel}:{line_no}: {line.strip()}")
            previous = line
    assert violations == [], "ground_truth mention without a denial:\n" + "\n".join(violations)


def test_ai_never_imports_domain_game_scoring() -> None:
    leaks: list[str] = []
    for path in _ai_files(".py"):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            imported: list[str] = []
            if isinstance(node, ast.Import):
                imported = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom) and node.module:
                imported = [node.module]
            for module in imported:
                if module == _SCORING_MODULE or module.startswith(_SCORING_MODULE + "."):
                    rel = path.relative_to(_AI_ROOT)
                    leaks.append(f"{rel} imports {module}")
    assert leaks == [], "ai/ must never import scoring:\n" + "\n".join(leaks)


def test_ai_never_calls_load_ground_truth() -> None:
    pattern = re.compile(r"\bload_ground_truth\b")
    hits: list[str] = []
    for path in _ai_files(".py"):
        for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if pattern.search(line) and not line.lstrip().startswith("#"):
                rel = path.relative_to(_AI_ROOT)
                hits.append(f"{rel}:{line_no}: {line.strip()}")
    assert hits == [], "ai/ must never call load_ground_truth:\n" + "\n".join(hits)
