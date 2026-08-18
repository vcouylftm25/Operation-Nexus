"""Join-code generation for team sessions (CONTRACT.md §7).

Pure domain module: no framework imports, no I/O. Codes are 6 characters,
uppercase alphanumeric, excluding the visually-ambiguous `0 O 1 I`.
"""

from __future__ import annotations

import secrets
from collections.abc import Callable

CODE_LENGTH = 6
# Uppercase alphanumeric, excluding 0/O/1/I.
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


class JoinCodeExhausted(Exception):
    """Raised when no unique join code could be found within the attempt budget."""


def generate_join_code() -> str:
    """Generate one random 6-char join code. Not collision-checked."""
    return "".join(secrets.choice(ALPHABET) for _ in range(CODE_LENGTH))


def generate_unique_join_code(
    exists: Callable[[str], bool],
    *,
    max_attempts: int = 20,
) -> str:
    """Generate a join code, retrying while `exists(code)` reports a collision.

    `exists` is a predicate (e.g. backed by a DB lookup) so this module never
    needs to know how or where codes are persisted.
    """
    for _ in range(max_attempts):
        code = generate_join_code()
        if not exists(code):
            return code
    raise JoinCodeExhausted(f"could not generate a unique join code after {max_attempts} attempts")
