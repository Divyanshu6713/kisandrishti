from __future__ import annotations

from fastapi import Request

from ..errors import AppError


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


async def read_body_limited(request: Request, limit: int) -> bytes:
    """Reads a request body but stops (413) as soon as it exceeds `limit` — never buffers an oversized upload."""
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > limit:
        raise AppError(413, "too_large", f"The file is larger than {limit // (1024 * 1024)} MB.")
    buf = bytearray()
    async for chunk in request.stream():
        buf.extend(chunk)
        if len(buf) > limit:
            raise AppError(413, "too_large", f"The file is larger than {limit // (1024 * 1024)} MB.")
    return bytes(buf)
