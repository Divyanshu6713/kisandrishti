"""
Errors that are safe to show. Every API error body is {"error": {"code", "message"}} — never a
stack trace, server path or secret. Unexpected exceptions become a generic 500 (details go to the
server log only).
"""
from __future__ import annotations

import re


class AppError(Exception):
    def __init__(self, status: int, code: str, message: str, details: dict | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details or {}


def bad_request(code: str, message: str, **details) -> AppError:
    return AppError(400, code, message, details)


def not_found(what: str) -> AppError:
    return AppError(404, "not_found", f"{what} was not found.")


def conflict(code: str, message: str, **details) -> AppError:
    return AppError(409, code, message, details)


_PATH_RE = re.compile(r"([A-Za-z]:)?[\\/](?:[^\\/\s:'\"]+[\\/])+[^\\/\s:'\"]*")


def redact_paths(text: str, limit: int = 400) -> str:
    """Remove filesystem paths from an exception message before it is stored or shown to admins."""
    return _PATH_RE.sub("<path>", str(text))[:limit]
