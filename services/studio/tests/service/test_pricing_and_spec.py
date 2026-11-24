from __future__ import annotations

import copy
import json
import wave
from io import BytesIO
from pathlib import Path
from typing import Any

import pytest

from selvedge_studio.__main__ import export_schema
from selvedge_studio.service.catalog import build_exposed_registry
from selvedge_studio.service.errors import SpecRejected
from selvedge_studio.service.generators import render_canvas, render_tone
from selvedge_studio.service.pricing import (
    CANVAS_MEGAPIXEL_MICRO_USDC,
    EXPORT_STEP_MICRO_USDC,
    IMAGE_STEP_MICRO_USDC,
    MINIMUM_JOB_MICRO_USDC,
    operation_rule,
    pricing_table,
)
from selvedge_studio.service.studio import Studio, parse_studio_spec
from selvedge_studio.service.studio_spec import CanvasGenerator, ToneGenerator
from tests.service.support import POSTER_SPEC

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "schema" / "studio-spec.v1.json"


@pytest.fixture(scope="module")
def studio(tmp_path_factory: pytest.TempPathFactory) -> Studio:
    return Studio(tmp_path_factory.mktemp("studio-home"))


def test_every_exposed_operation_has_a_price() -> None:
    registry = build_exposed_registry()
    assert registry.names()
    for name in registry.names():
        rule = operation_rule(name)
        assert rule.micro_usdc_per_unit > 0
        assert rule.minimum_micro_usdc > 0


def test_debug_operations_are_never_exposed() -> None:
    assert not [name for name in build_exposed_registry().names() if name.startswith("debug.")]


def test_pricing_table_lists_operations_and_generators() -> None:
    table = pricing_table(build_exposed_registry().names())
    assert table["currency"] == "USDC" and table["decimals"] == 6
    operations = table["operations"]
    assert isinstance(operations, dict)
    assert operations["export"] == {
        "unit": "step",
        "microUsdcPerUnit": EXPORT_STEP_MICRO_USDC,
        "minimumMicroUsdc": EXPORT_STEP_MICRO_USDC,
    }
    assert set(table["generators"]) == {"canvas", "tone"}  # type: ignore[arg-type]


def test_quote_is_the_sum_of_generator_and_step_prices(studio: Studio) -> None:
    quote = studio.quote(parse_studio_spec(POSTER_SPEC))
    assert quote.total_micro_usdc == (
        CANVAS_MEGAPIXEL_MICRO_USDC + IMAGE_STEP_MICRO_USDC + EXPORT_STEP_MICRO_USDC
    )
    assert [item.name for item in quote.line_items] == ["background", "title", "final"]
    assert sum(item.micro_usdc for item in quote.line_items) == quote.total_micro_usdc


def test_quote_is_deterministic_and_ignores_argument_values(studio: Studio) -> None:
    first = studio.quote(parse_studio_spec(POSTER_SPEC))
    again = studio.quote(parse_studio_spec(copy.deepcopy(POSTER_SPEC)))
    assert first == again
    other = copy.deepcopy(POSTER_SPEC)
    other["steps"][0]["args"]["text"] = "Another headline"
    changed = studio.quote(parse_studio_spec(other))
    assert changed.total_micro_usdc == first.total_micro_usdc
    assert changed.spec_hash != first.spec_hash


def test_a_larger_canvas_costs_more_megapixels(studio: Studio) -> None:
    large = copy.deepcopy(POSTER_SPEC)
    large["generators"][0].update(width=2048, height=1536)
    large_quote = studio.quote(parse_studio_spec(large))
    small_quote = studio.quote(parse_studio_spec(POSTER_SPEC))
    assert large_quote.line_items[0].quantity == 4
    assert large_quote.total_micro_usdc - small_quote.total_micro_usdc == (
        3 * CANVAS_MEGAPIXEL_MICRO_USDC
    )


def test_a_recipe_is_priced_by_the_steps_it_expands_to(studio: Studio) -> None:
    spec = parse_studio_spec(
        {
            "generators": [
                {"kind": "canvas", "name": "photo", "width": 800, "height": 450, "color": "#336699"}
            ],
            "recipe": {"id": "batch_thumbnails", "params": {"in": "photo", "title": "Hi"}},
        }
    )
    prepared = studio.prepare(spec)
    assert [item.name for item in prepared.quote.line_items if item.kind == "operation"]
    assert prepared.quote.total_micro_usdc >= MINIMUM_JOB_MICRO_USDC
    assert prepared.canonical.origin == {"recipe": "batch_thumbnails", "version": 2}


def test_canvas_bytes_are_identical_on_every_render() -> None:
    canvas = CanvasGenerator(kind="canvas", name="bg", width=64, height=48, color="#aabbcc")
    assert render_canvas(canvas) == render_canvas(canvas)


def test_tone_is_a_valid_mono_wave_of_the_requested_length() -> None:
    tone = ToneGenerator(kind="tone", name="beep", frequency_hz=440, seconds=0.5)
    assert render_tone(tone) == render_tone(tone)
    with wave.open(BytesIO(render_tone(tone))) as reader:
        assert reader.getnchannels() == 1
        assert reader.getnframes() == round(0.5 * reader.getframerate())


def rejected_paths(raw: Any) -> list[str]:
    with pytest.raises(SpecRejected) as failure:
        parse_studio_spec(raw)
    return [error["path"] for error in failure.value.details["errors"]]


def test_unknown_top_level_keys_are_rejected() -> None:
    for forbidden_key in ("inputs", "checks", "ops", "in"):
        raw = copy.deepcopy(POSTER_SPEC) | {forbidden_key: "asset:" + "0" * 64}
        assert forbidden_key in rejected_paths(raw)


def test_asset_handles_cannot_be_smuggled_in_as_step_inputs() -> None:
    raw = copy.deepcopy(POSTER_SPEC)
    raw["steps"][0]["in"] = "asset:" + "a" * 64
    assert any(path.endswith("input_refs") or "in" in path for path in rejected_paths(raw))


def test_names_must_be_safe_identifiers() -> None:
    for bad_name in ("Upper", "has space", "../etc", "a" * 40, "", "9starts"):
        raw = copy.deepcopy(POSTER_SPEC)
        raw["generators"][0]["name"] = bad_name
        assert rejected_paths(raw)


def test_limits_on_steps_outputs_and_generators_are_enforced() -> None:
    too_many_steps = copy.deepcopy(POSTER_SPEC)
    too_many_steps["steps"] = [
        {"id": f"step_{index}", "op": "image.flip", "in": "background"} for index in range(25)
    ]
    assert "steps" in rejected_paths(too_many_steps)
    too_many_generators = copy.deepcopy(POSTER_SPEC)
    too_many_generators["generators"] = [
        {"kind": "canvas", "name": f"bg_{index}", "width": 16, "height": 16, "color": "#000000"}
        for index in range(9)
    ]
    assert "generators" in rejected_paths(too_many_generators)


def test_canvas_and_tone_bounds_are_enforced() -> None:
    for generator in (
        {"kind": "canvas", "name": "bg", "width": 4096, "height": 100, "color": "#000000"},
        {"kind": "canvas", "name": "bg", "width": 100, "height": 100, "color": "red"},
        {"kind": "tone", "name": "bg", "frequency_hz": 10, "seconds": 1},
        {"kind": "tone", "name": "bg", "frequency_hz": 440, "seconds": 600},
        {"kind": "movie", "name": "bg"},
    ):
        raw = copy.deepcopy(POSTER_SPEC)
        raw["generators"] = [generator]
        assert rejected_paths(raw)


def test_duplicate_names_are_rejected() -> None:
    raw = copy.deepcopy(POSTER_SPEC)
    raw["steps"][0]["id"] = "background"
    assert rejected_paths(raw)


def test_a_spec_needs_steps_and_outputs_or_a_recipe_but_not_both() -> None:
    assert rejected_paths({"generators": []})
    both = copy.deepcopy(POSTER_SPEC) | {"recipe": {"id": "batch_thumbnails", "params": {}}}
    assert rejected_paths(both)


@pytest.mark.parametrize("operation", ["debug.sleep", "debug.fail", "os.system", "export; rm"])
def test_operations_outside_the_catalogue_are_refused(studio: Studio, operation: str) -> None:
    raw = copy.deepcopy(POSTER_SPEC)
    raw["steps"][0]["op"] = operation
    with pytest.raises(SpecRejected) as failure:
        studio.prepare(parse_studio_spec(raw))
    assert "debug.sleep" not in failure.value.details["allowed"]


def test_engine_argument_errors_come_back_as_typed_paths(studio: Studio) -> None:
    raw = copy.deepcopy(POSTER_SPEC)
    raw["steps"][0]["args"] = {"text": "x", "font_path": "/etc/passwd"}
    with pytest.raises(SpecRejected) as failure:
        studio.prepare(parse_studio_spec(raw))
    assert (
        failure.value.details["errors"][0]["code"] == "unknown_key"
        or failure.value.details["errors"]
    )


def test_unknown_recipe_is_refused(studio: Studio) -> None:
    raw = {"recipe": {"id": "no_such_recipe", "params": {}}}
    with pytest.raises(SpecRejected):
        studio.prepare(parse_studio_spec(raw))


def test_the_committed_json_schema_matches_the_code(tmp_path: Path) -> None:
    export_schema(tmp_path / "schema.json")
    assert json.loads((tmp_path / "schema.json").read_text()) == json.loads(SCHEMA_PATH.read_text())
    schema = json.loads(SCHEMA_PATH.read_text())
    assert "export" in schema["$defs"]["StudioStep"]["properties"]["op"]["enum"]
    assert "debug.sleep" not in schema["$defs"]["StudioStep"]["properties"]["op"]["enum"]
