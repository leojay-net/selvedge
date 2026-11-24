from __future__ import annotations

from pathlib import Path

import pytest

from selvedge_studio.service.errors import ConfigurationError
from selvedge_studio.service.settings import load_settings

VALID_TOKEN = "t" * 32


def test_minimal_environment_loads_with_safe_defaults(tmp_path: Path) -> None:
    settings = load_settings(
        {"SELVEDGE_STUDIO_INTERNAL_TOKEN": VALID_TOKEN, "SELVEDGE_STUDIO_HOME": str(tmp_path)}
    )
    assert settings.host == "127.0.0.1"
    assert settings.director.provider == "none"
    assert settings.home == tmp_path


@pytest.mark.parametrize(
    "environment",
    [
        {},
        {"SELVEDGE_STUDIO_INTERNAL_TOKEN": "short"},
        {"SELVEDGE_STUDIO_INTERNAL_TOKEN": VALID_TOKEN, "SELVEDGE_STUDIO_PORT": "abc"},
        {"SELVEDGE_STUDIO_INTERNAL_TOKEN": VALID_TOKEN, "SELVEDGE_STUDIO_PORT": "0"},
        {"SELVEDGE_STUDIO_INTERNAL_TOKEN": VALID_TOKEN, "SELVEDGE_STUDIO_DIRECTOR_PROVIDER": "x"},
        {
            "SELVEDGE_STUDIO_INTERNAL_TOKEN": VALID_TOKEN,
            "SELVEDGE_STUDIO_DIRECTOR_PROVIDER": "openai_compatible",
        },
        {
            "SELVEDGE_STUDIO_INTERNAL_TOKEN": VALID_TOKEN,
            "SELVEDGE_STUDIO_DIRECTOR_PROVIDER": "anthropic",
            "ANTHROPIC_API_KEY": "key",
        },
    ],
)
def test_invalid_environments_are_rejected_with_a_clear_error(environment: dict[str, str]) -> None:
    with pytest.raises(ConfigurationError):
        load_settings(environment)


def test_director_settings_are_read_from_the_environment() -> None:
    settings = load_settings(
        {
            "SELVEDGE_STUDIO_INTERNAL_TOKEN": VALID_TOKEN,
            "SELVEDGE_STUDIO_DIRECTOR_PROVIDER": "openai_compatible",
            "SELVEDGE_STUDIO_DIRECTOR_MODEL": "some-model",
            "SELVEDGE_STUDIO_DIRECTOR_BASE_URL": "https://example.invalid/v1",
            "SELVEDGE_STUDIO_DIRECTOR_API_KEY": "secret",
        }
    )
    assert settings.director.model == "some-model"
    assert settings.director.api_key == "secret"
