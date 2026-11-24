"""Settings read once from the environment and validated at the boundary."""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

from selvedge_studio.service.constants import (
    DEFAULT_HOST,
    DEFAULT_MAX_BODY_BYTES,
    DEFAULT_PORT,
    DEFAULT_RATE_LIMIT_PER_MINUTE,
    DEFAULT_WORKER_THREADS,
    MIN_INTERNAL_TOKEN_LENGTH,
)
from selvedge_studio.service.errors import ConfigurationError

DIRECTOR_PROVIDERS = ("none", "openai_compatible", "anthropic")
MIN_BODY_BYTES = 1024


@dataclass(frozen=True)
class DirectorSettings:
    provider: str
    model: str
    base_url: str
    api_key: str


@dataclass(frozen=True)
class Settings:
    home: Path
    internal_token: str
    host: str
    port: int
    worker_threads: int
    max_body_bytes: int
    rate_limit_per_minute: int
    director: DirectorSettings


def _integer(environment: Mapping[str, str], name: str, default: int, minimum: int) -> int:
    raw = environment.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ConfigurationError(f"{name} must be an integer, got {raw!r}") from None
    if value < minimum:
        raise ConfigurationError(f"{name} must be at least {minimum}, got {value}")
    return value


def _director(environment: Mapping[str, str]) -> DirectorSettings:
    provider = environment.get("SELVEDGE_STUDIO_DIRECTOR_PROVIDER", "none")
    if provider not in DIRECTOR_PROVIDERS:
        raise ConfigurationError(
            f"SELVEDGE_STUDIO_DIRECTOR_PROVIDER must be one of {', '.join(DIRECTOR_PROVIDERS)}, "
            f"got {provider!r}"
        )
    api_key = ""
    if provider != "none":
        key_variable = (
            "ANTHROPIC_API_KEY" if provider == "anthropic" else "SELVEDGE_STUDIO_DIRECTOR_API_KEY"
        )
        api_key = environment.get(key_variable, "")
        if not api_key:
            raise ConfigurationError(f"{key_variable} is required for provider {provider}")
        if not environment.get("SELVEDGE_STUDIO_DIRECTOR_MODEL"):
            raise ConfigurationError("SELVEDGE_STUDIO_DIRECTOR_MODEL is required for the director")
        if provider == "openai_compatible" and not environment.get(
            "SELVEDGE_STUDIO_DIRECTOR_BASE_URL"
        ):
            raise ConfigurationError(
                "SELVEDGE_STUDIO_DIRECTOR_BASE_URL is required for openai_compatible"
            )
    return DirectorSettings(
        provider=provider,
        model=environment.get("SELVEDGE_STUDIO_DIRECTOR_MODEL", ""),
        base_url=environment.get("SELVEDGE_STUDIO_DIRECTOR_BASE_URL", ""),
        api_key=api_key,
    )


def load_settings(environment: Mapping[str, str] | None = None) -> Settings:
    env = os.environ if environment is None else environment
    token = env.get("SELVEDGE_STUDIO_INTERNAL_TOKEN", "")
    if len(token) < MIN_INTERNAL_TOKEN_LENGTH:
        raise ConfigurationError(
            f"SELVEDGE_STUDIO_INTERNAL_TOKEN must be at least {MIN_INTERNAL_TOKEN_LENGTH} "
            "characters"
        )
    home = Path(env.get("SELVEDGE_STUDIO_HOME") or Path.home() / ".selvedge-studio")
    return Settings(
        home=home,
        internal_token=token,
        host=env.get("SELVEDGE_STUDIO_HOST", DEFAULT_HOST),
        port=_integer(env, "SELVEDGE_STUDIO_PORT", DEFAULT_PORT, 1),
        worker_threads=_integer(env, "SELVEDGE_STUDIO_WORKER_THREADS", DEFAULT_WORKER_THREADS, 1),
        max_body_bytes=_integer(
            env, "SELVEDGE_STUDIO_MAX_BODY_BYTES", DEFAULT_MAX_BODY_BYTES, MIN_BODY_BYTES
        ),
        rate_limit_per_minute=_integer(
            env, "SELVEDGE_STUDIO_RATE_LIMIT_PER_MINUTE", DEFAULT_RATE_LIMIT_PER_MINUTE, 1
        ),
        director=_director(env),
    )
