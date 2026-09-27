"""Server-side authorisation: every admin route rejects farmers/unauthenticated callers."""
from __future__ import annotations

import time

import pytest

from conftest import ADMIN_KEY

ADMIN_ROUTES = [
    ("get", "/v1/admin/overview"),
    ("get", "/v1/admin/datasets"),
    ("post", "/v1/admin/datasets/versions"),
    ("put", "/v1/admin/datasets/versions/dsv_x/archive"),
    ("patch", "/v1/admin/datasets/versions/dsv_x"),
    ("post", "/v1/admin/datasets/versions/dsv_x/delete"),
    ("post", "/v1/admin/datasets/versions/dsv_x/splits"),
    ("get", "/v1/admin/training/options"),
    ("post", "/v1/admin/training/jobs"),
    ("post", "/v1/admin/training/jobs/job_x/cancel"),
    ("get", "/v1/admin/models"),
    ("post", "/v1/admin/models/mdl_x/archive"),
    ("post", "/v1/admin/models/mdl_x/delete"),
    ("get", "/v1/admin/models/mdl_x/export"),
    ("post", "/v1/admin/models/mdl_x/predict"),
    ("post", "/v1/admin/deployment/deploy"),
    ("post", "/v1/admin/deployment/rollback"),
    ("post", "/v1/admin/deployment/turn-off"),
    ("put", "/v1/admin/settings/confidence-threshold"),
    ("get", "/v1/admin/audit"),
]


@pytest.mark.parametrize("method,path", ADMIN_ROUTES)
def test_admin_routes_require_auth(client, method, path):
    r = getattr(client, method)(path, **({"json": {}} if method in ("post", "put", "patch") else {}))
    assert r.status_code == 401, (path, r.text)
    r = getattr(client, method)(path, headers={"Authorization": "Bearer kdml.forged.token"}, **({"json": {}} if method in ("post", "put", "patch") else {}))
    assert r.status_code == 401


def test_wrong_key_and_rate_limit(client):
    for _ in range(10):
        assert client.post("/v1/admin/session", json={"key": "wrong-key-wrong-key-wrong"}).status_code == 401
    assert client.post("/v1/admin/session", json={"key": "wrong-key-wrong-key-wrong"}).status_code == 429
    # even the right key is refused while rate-limited
    assert client.post("/v1/admin/session", json={"key": ADMIN_KEY}).status_code == 429


def test_tampered_and_expired_tokens(client, admin, monkeypatch):
    token = admin["Authorization"][7:]
    head, payload, sig = token.split(".")
    import base64
    import json

    data = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    data["sub"] = "mallory"
    forged = base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()
    assert client.get("/v1/admin/me", headers={"Authorization": f"Bearer {head}.{forged}.{sig}"}).status_code == 401
    assert client.get("/v1/admin/me", headers=admin).json()["admin"]["name"] == "tester"
    monkeypatch.setattr(time, "time", lambda: 10**11)
    r = client.get("/v1/admin/me", headers=admin)
    assert r.status_code == 401 and r.json()["error"]["code"] == "session_expired"


def test_removed_admin_key_ends_sessions(client, admin, monkeypatch):
    from kd_backend import config

    monkeypatch.setenv("ML_ADMIN_KEYS", "someone-else:another-key-0123456789abcdef")
    secret = config.get_settings().session_secret
    config.reset_settings()
    monkeypatch.setenv("ML_SESSION_SECRET", secret.decode())
    assert client.get("/v1/admin/me", headers=admin).status_code == 401


def test_short_keys_are_ignored(env, monkeypatch):
    from kd_backend import config

    monkeypatch.setenv("ML_ADMIN_KEYS", "weak:short")
    config.reset_settings()
    assert config.get_settings().admin_keys == {}


def test_supabase_tokens(client, monkeypatch):
    jwt = pytest.importorskip("jwt")
    from kd_backend import config

    secret = "super-secret-jwt-signing-key-for-tests-only-0123456789"
    monkeypatch.setenv("SUPABASE_JWT_SECRET", secret)
    monkeypatch.setenv("ML_ADMIN_EMAILS", "boss@example.com")
    config.reset_settings()

    def tok(**claims):
        base = {"aud": "authenticated", "exp": int(time.time()) + 600, "sub": "u1", "role": "authenticated"}
        return jwt.encode({**base, **claims}, secret, algorithm="HS256")

    assert client.get("/v1/admin/me", headers={"Authorization": f"Bearer {tok(email='boss@example.com')}"}).status_code == 200
    assert client.get("/v1/admin/me", headers={"Authorization": f"Bearer {tok(email='farmer@example.com')}"}).status_code == 403
    assert client.get("/v1/admin/me", headers={"Authorization": f"Bearer {tok(sub='u2', app_metadata={'role': 'admin'})}"}).status_code == 200
    # a farmer cannot promote themselves through user_metadata
    assert client.get("/v1/admin/me", headers={"Authorization": f"Bearer {tok(sub='u3', user_metadata={'role': 'admin'})}"}).status_code == 403
    assert client.get("/v1/admin/me", headers={"Authorization": f"Bearer {tok(email='boss@example.com', is_anonymous=True)}"}).status_code == 403
    wrong = jwt.encode({"aud": "authenticated", "exp": int(time.time()) + 600, "email": "boss@example.com"}, "another-secret-another-secret-another-secret", algorithm="HS256")
    assert client.get("/v1/admin/me", headers={"Authorization": f"Bearer {wrong}"}).status_code == 401
    expired = tok(email="boss@example.com", exp=int(time.time()) - 10)
    assert client.get("/v1/admin/me", headers={"Authorization": f"Bearer {expired}"}).status_code == 401


def test_public_routes_expose_no_training_controls(client):
    paths = set(client.get("/openapi.json").json()["paths"])
    public = {p for p in paths if not p.startswith("/v1/admin")}
    assert public == {"/health", "/v1/disease/model", "/v1/disease/predict"}


def test_errors_do_not_leak_internals(client, admin):
    r = client.get("/v1/admin/models/does-not-exist", headers=admin)
    assert r.status_code == 404 and set(r.json()) == {"error"}
    r = client.post("/v1/disease/predict", content=b"x" * 10, headers={"Content-Type": "image/png"})
    assert "Traceback" not in r.text
