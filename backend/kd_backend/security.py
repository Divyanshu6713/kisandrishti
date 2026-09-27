"""
Administrator authentication and authorisation — enforced on the server for every /v1/admin route.

Two ways to prove you are an ML administrator (either can be enabled):

1. Admin key (default, works without Supabase):
   ML_ADMIN_KEYS="alice:<random ≥24 chars>,bob:<…>". POST /v1/admin/session exchanges a key for a
   short-lived signed session token (HMAC-SHA256, ML_SESSION_SECRET). The key's name is the actor
   recorded in the audit log.

2. Supabase account (when the site uses Supabase Auth):
   the browser sends its Supabase access token; the server verifies the JWT signature
   (SUPABASE_JWT_SECRET for HS256 projects, or the project's JWKS for asymmetric keys) and grants
   admin only if app_metadata.role is "admin"/"ml_admin" (settable only with the service role) or the
   user's id/email is in ML_ADMIN_USER_IDS / ML_ADMIN_EMAILS. Anonymous (demo) users are never admins.

Hiding buttons in the frontend is UX only; these checks are the security boundary.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass

from .config import get_settings
from .errors import AppError

log = logging.getLogger("kd.security")


@dataclass(frozen=True)
class Admin:
    name: str
    method: str  # "key" | "supabase"

    @property
    def actor(self) -> str:
        return f"{self.name} ({self.method})"


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def issue_session(name: str) -> tuple[str, int]:
    s = get_settings()
    exp = int(time.time() + s.session_hours * 3600)
    payload = _b64(json.dumps({"sub": name, "exp": exp, "typ": "kd-ml-admin", "v": 1}, separators=(",", ":")).encode())
    sig = _b64(hmac.new(s.session_secret, payload.encode(), hashlib.sha256).digest())
    return f"kdml.{payload}.{sig}", exp


def _verify_session(token: str) -> Admin | None:
    parts = token.split(".")
    if len(parts) != 3 or parts[0] != "kdml":
        return None
    payload, sig = parts[1], parts[2]
    expected = _b64(hmac.new(get_settings().session_secret, payload.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(expected, sig):
        raise AppError(401, "invalid_session", "Your admin session is not valid. Please sign in again.")
    try:
        data = json.loads(_unb64(payload))
    except ValueError:
        raise AppError(401, "invalid_session", "Your admin session is not valid. Please sign in again.")
    if data.get("typ") != "kd-ml-admin" or not isinstance(data.get("exp"), int):
        raise AppError(401, "invalid_session", "Your admin session is not valid. Please sign in again.")
    if data["exp"] < time.time():
        raise AppError(401, "session_expired", "Your admin session has expired. Please sign in again.")
    # A key removed from ML_ADMIN_KEYS ends its sessions too.
    if data.get("sub") not in set(get_settings().admin_keys.values()):
        raise AppError(401, "invalid_session", "This admin account is no longer enabled.")
    return Admin(name=str(data["sub"]), method="key")


def check_admin_key(key: str) -> str | None:
    """Constant-time comparison against every configured key; returns the admin name or None."""
    match = None
    for configured, name in get_settings().admin_keys.items():
        if hmac.compare_digest(configured.encode(), key.encode()):
            match = name
    return match


_jwks_client = None
_jwks_lock = threading.Lock()


def _verify_supabase(token: str) -> Admin | None:
    s = get_settings()
    if not s.supabase_url and not s.supabase_jwt_secret:
        return None
    try:
        import jwt  # PyJWT
    except ImportError:  # pragma: no cover - dependency is in requirements.txt
        log.error("PyJWT is not installed; Supabase admin tokens cannot be verified")
        return None
    try:
        header = jwt.get_unverified_header(token)
        alg = header.get("alg")
        if alg == "HS256":
            if not s.supabase_jwt_secret:
                return None
            claims = jwt.decode(token, s.supabase_jwt_secret, algorithms=["HS256"], audience="authenticated")
        elif alg in ("ES256", "RS256") and s.supabase_url:
            global _jwks_client
            with _jwks_lock:
                if _jwks_client is None:
                    _jwks_client = jwt.PyJWKClient(f"{s.supabase_url}/auth/v1/.well-known/jwks.json", cache_keys=True, lifespan=3600)
            key = _jwks_client.get_signing_key_from_jwt(token)
            claims = jwt.decode(token, key.key, algorithms=[alg], audience="authenticated")
        else:
            return None
    except jwt.ExpiredSignatureError:
        raise AppError(401, "session_expired", "Your session has expired. Please sign in again.")
    except Exception:  # invalid signature, malformed token, JWKS unreachable
        raise AppError(401, "invalid_session", "Your session could not be verified.")

    if claims.get("is_anonymous"):
        return None
    role = (claims.get("app_metadata") or {}).get("role")
    email = str(claims.get("email") or "").lower()
    sub = str(claims.get("sub") or "")
    if role in ("admin", "ml_admin") or (email and email in s.supabase_admin_emails) or (sub and sub in s.supabase_admin_ids):
        return Admin(name=email or sub, method="supabase")
    return None


def authenticate(authorization: str | None) -> Admin:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise AppError(401, "admin_auth_required", "Administrator sign-in is required.")
    token = authorization[7:].strip()
    if not token or len(token) > 8192:
        raise AppError(401, "admin_auth_required", "Administrator sign-in is required.")
    admin = _verify_session(token) if token.startswith("kdml.") else _verify_supabase(token)
    if admin is None:
        raise AppError(403, "not_admin", "This account is not allowed to manage AI models.")
    return admin


class RateLimiter:
    """In-process sliding-window limiter (per key, e.g. client IP). Per worker process — fine for the MVP."""

    def __init__(self, limit: int, window_s: float):
        self.limit = limit
        self.window = window_s
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str, record: bool = True) -> bool:
        """True if `key` is under the limit. With record=False it only checks (use `record_hit` for failures)."""
        if self.limit <= 0:
            return True
        t = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and t - q[0] > self.window:
                q.popleft()
            if len(q) >= self.limit:
                return False
            if record:
                q.append(t)
            if len(self._hits) > 10_000:  # bound memory
                for k in [k for k, v in self._hits.items() if not v][:5_000]:
                    del self._hits[k]
            return True

    def record_hit(self, key: str) -> None:
        with self._lock:
            self._hits[key].append(time.monotonic())
