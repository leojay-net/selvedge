"""Shared helpers for the service tests."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from selvedge_studio.service.app import create_app
from selvedge_studio.service.constants import INTERNAL_TOKEN_HEADER
from selvedge_studio.service.director import DirectorModel
from selvedge_studio.service.settings import DirectorSettings, Settings

INTERNAL_TOKEN = "test-internal-token-0123456789abcdef"
POLL_SECONDS = 0.1
POLL_TIMEOUT_SECONDS = 90.0

POSTER_SPEC: dict[str, Any] = {
    "version": 1,
    "generators": [
        {"kind": "canvas", "name": "background", "width": 640, "height": 360, "color": "#102030"}
    ],
    "steps": [
        {"id": "title", "op": "image.text", "in": "background", "args": {"text": "Selvedge"}},
        {"id": "final", "op": "export", "in": "title", "args": {"preset": "web_jpeg"}},
    ],
    "outputs": ["final"],
}


class ScriptedDirectorModel:
    """Returns prepared replies in order and records what it was asked."""

    def __init__(self, replies: list[str]) -> None:
        self.replies = replies
        self.conversations: list[list[dict[str, str]]] = []
        self.systems: list[str] = []

    def complete(self, system: str, conversation: list[dict[str, str]]) -> str:
        self.systems.append(system)
        self.conversations.append(list(conversation))
        return self.replies[min(len(self.conversations) - 1, len(self.replies) - 1)]


def make_settings(
    home: Path, *, rate_limit_per_minute: int = 1000, max_body_bytes: int = 64 * 1024
) -> Settings:
    return Settings(
        home=home,
        internal_token=INTERNAL_TOKEN,
        host="127.0.0.1",
        port=0,
        worker_threads=2,
        max_body_bytes=max_body_bytes,
        rate_limit_per_minute=rate_limit_per_minute,
        director=DirectorSettings(provider="none", model="", base_url="", api_key=""),
    )


def make_client(
    home: Path,
    director_model: DirectorModel | None = None,
    *,
    rate_limit_per_minute: int = 1000,
    max_body_bytes: int = 64 * 1024,
) -> TestClient:
    settings = make_settings(
        home, rate_limit_per_minute=rate_limit_per_minute, max_body_bytes=max_body_bytes
    )
    return TestClient(create_app(settings, director_model))


def internal_headers() -> dict[str, str]:
    return {INTERNAL_TOKEN_HEADER: INTERNAL_TOKEN}


def wait_for_terminal_status(client: TestClient, job_id: str) -> dict[str, Any]:
    deadline = time.monotonic() + POLL_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        body: dict[str, Any] = client.get(f"/v1/jobs/{job_id}").json()
        if body["status"] in ("succeeded", "failed"):
            return body
        time.sleep(POLL_SECONDS)
    raise AssertionError(f"job {job_id} did not finish in {POLL_TIMEOUT_SECONDS} seconds")
