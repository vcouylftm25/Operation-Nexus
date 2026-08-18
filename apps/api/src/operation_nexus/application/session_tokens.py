"""Session-token generation/hashing shared by `join_team` and the API auth deps.

Raw tokens are handed to the client once and never persisted; only their
SHA-256 hash is stored, so a leaked database never yields usable bearer
tokens.
"""

from __future__ import annotations

import hashlib
import secrets


def generate_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
