"""Loads versioned prompt templates from disk.

Prompts live as plain Markdown files (`<name>.<version>.md`) next to this
loader — never as inline f-strings in Python — so they can be reviewed,
diffed, and versioned like any other artifact independent of code changes.

Variable substitution uses `string.Template` (`$name` placeholders) rather
than `str.format`/f-strings: the prompts embed JSON examples and tool
schemas full of literal `{}`, which would collide with `.format()`'s syntax.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from string import Template

_PROMPTS_DIR = Path(__file__).resolve().parent


class PromptNotFoundError(LookupError):
    """Raised when `<name>.<version>.md` does not exist under `ai/prompts/`."""


@lru_cache(maxsize=32)
def _read_template(name: str, version: str) -> Template:
    path = _PROMPTS_DIR / f"{name}.{version}.md"
    if not path.is_file():
        raise PromptNotFoundError(f"no prompt file at {path}")
    return Template(path.read_text(encoding="utf-8"))


def load_prompt(name: str, *, version: str = "v1", **variables: str) -> str:
    """Load `<name>.<version>.md` and substitute any `$variable` placeholders.

    Raises `PromptNotFoundError` if the file doesn't exist, and
    `KeyError`/`ValueError` (via `string.Template.substitute`) if the
    template references a placeholder not present in `variables`.
    """
    template = _read_template(name, version)
    if not variables:
        return template.template
    return template.substitute(**variables)
