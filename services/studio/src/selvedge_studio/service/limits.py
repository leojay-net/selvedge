"""Request size and rate limits for the public endpoints."""

from __future__ import annotations

import json
import threading
import time
from collections import defaultdict, deque
from collections.abc import Callable, MutableMapping

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from selvedge_studio.service.constants import RATE_LIMIT_WINDOW_SECONDS
from selvedge_studio.service.errors import RateLimited, RequestTooLarge, ServiceError

Clock = Callable[[], float]


class SlidingWindowRateLimiter:
    """At most `limit` hits per client inside the window; thread safe, in memory."""

    def __init__(self, limit: int, clock: Clock = time.monotonic) -> None:
        self._limit = limit
        self._clock = clock
        self._hits: MutableMapping[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, client: str) -> None:
        now = self._clock()
        with self._lock:
            hits = self._hits[client]
            while hits and now - hits[0] >= RATE_LIMIT_WINDOW_SECONDS:
                hits.popleft()
            if len(hits) >= self._limit:
                raise RateLimited(
                    "too many requests; slow down",
                    {"limitPerMinute": self._limit, "windowSeconds": RATE_LIMIT_WINDOW_SECONDS},
                )
            hits.append(now)


class BodyLimitMiddleware:
    """Rejects a request whose body exceeds the limit, by header and by bytes actually read."""

    def __init__(self, app: ASGIApp, max_body_bytes: int) -> None:
        self._app = app
        self._max_body_bytes = max_body_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self._app(scope, receive, send)
            return
        declared = _declared_length(scope)
        if declared is not None and declared > self._max_body_bytes:
            await _reject(send, self._max_body_bytes)
            return
        received_bytes = 0
        exceeded = False

        async def limited_receive() -> Message:
            nonlocal received_bytes, exceeded
            message = await receive()
            if message["type"] == "http.request":
                received_bytes += len(message.get("body", b""))
                if received_bytes > self._max_body_bytes:
                    exceeded = True
                    return {"type": "http.request", "body": b"", "more_body": False}
            return message

        sent_response = False

        async def guarded_send(message: Message) -> None:
            nonlocal sent_response
            if exceeded and not sent_response:
                sent_response = True
                await _reject(send, self._max_body_bytes)
                return
            if not exceeded:
                await send(message)

        await self._app(scope, limited_receive, guarded_send)


def _declared_length(scope: Scope) -> int | None:
    for name, value in scope["headers"]:
        if name == b"content-length":
            try:
                return int(value)
            except ValueError:
                return None
    return None


async def _reject(send: Send, max_body_bytes: int) -> None:
    error = RequestTooLarge("the request body is too large", {"maxBodyBytes": max_body_bytes})
    await send_error(send, error)


async def send_error(send: Send, error: ServiceError) -> None:
    payload = json.dumps(error.envelope()).encode("utf-8")
    await send(
        {
            "type": "http.response.start",
            "status": error.status_code,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(payload)).encode()),
            ],
        }
    )
    await send({"type": "http.response.body", "body": payload})
