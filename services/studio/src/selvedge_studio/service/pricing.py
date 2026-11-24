"""The single pricing table. All amounts are integer micro-USDC (six decimals).

A spec's price is a pure function of the spec: generators are priced by their declared size,
operations by a flat price per step. Both are bounded by the spec limits, so the work a given
price buys is bounded as well.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal

from selvedge_studio.service.constants import PIXELS_PER_MEGAPIXEL
from selvedge_studio.service.errors import SpecRejected
from selvedge_studio.service.studio_spec import CanvasGenerator, StudioSpec, ToneGenerator
from selvedge_studio.spec.model import CanonicalSpec

PriceUnit = Literal["step", "megapixel", "second"]

PREVIEW_STEP_MICRO_USDC = 2_000
IMAGE_STEP_MICRO_USDC = 5_000
AUDIO_STEP_MICRO_USDC = 10_000
EXPORT_STEP_MICRO_USDC = 10_000
DOCUMENT_STEP_MICRO_USDC = 20_000
VIDEO_STEP_MICRO_USDC = 50_000
VIDEO_HEAVY_STEP_MICRO_USDC = 100_000
CANVAS_MEGAPIXEL_MICRO_USDC = 2_000
TONE_SECOND_MICRO_USDC = 1_000
MINIMUM_JOB_MICRO_USDC = 1_000

HEAVY_VIDEO_OPERATIONS = frozenset(
    {"video.captions", "video.stabilize", "video.slideshow", "video.concat", "video.layers"}
)


@dataclass(frozen=True)
class PriceRule:
    unit: PriceUnit
    micro_usdc_per_unit: int
    minimum_micro_usdc: int


@dataclass(frozen=True)
class LineItem:
    name: str
    kind: Literal["generator", "operation"]
    quantity: int
    unit: PriceUnit
    micro_usdc: int


@dataclass(frozen=True)
class Quote:
    spec_hash: str
    total_micro_usdc: int
    line_items: tuple[LineItem, ...]


OPERATION_PREFIX_PRICES: dict[str, int] = {
    "preview.": PREVIEW_STEP_MICRO_USDC,
    "image.": IMAGE_STEP_MICRO_USDC,
    "audio.": AUDIO_STEP_MICRO_USDC,
    "doc.": DOCUMENT_STEP_MICRO_USDC,
    "pdf.": DOCUMENT_STEP_MICRO_USDC,
    "pptx.": DOCUMENT_STEP_MICRO_USDC,
    "xlsx.": DOCUMENT_STEP_MICRO_USDC,
    "video.": VIDEO_STEP_MICRO_USDC,
}

GENERATOR_RULES: dict[str, PriceRule] = {
    "canvas": PriceRule("megapixel", CANVAS_MEGAPIXEL_MICRO_USDC, CANVAS_MEGAPIXEL_MICRO_USDC),
    "tone": PriceRule("second", TONE_SECOND_MICRO_USDC, TONE_SECOND_MICRO_USDC),
}


def operation_rule(operation_name: str) -> PriceRule:
    if operation_name == "export":
        return PriceRule("step", EXPORT_STEP_MICRO_USDC, EXPORT_STEP_MICRO_USDC)
    if operation_name in HEAVY_VIDEO_OPERATIONS:
        return PriceRule("step", VIDEO_HEAVY_STEP_MICRO_USDC, VIDEO_HEAVY_STEP_MICRO_USDC)
    for prefix, micro_usdc in OPERATION_PREFIX_PRICES.items():
        if operation_name.startswith(prefix):
            return PriceRule("step", micro_usdc, micro_usdc)
    raise SpecRejected(
        f"operation {operation_name!r} has no price and cannot be run",
        {"operation": operation_name},
    )


def pricing_table(operation_names: list[str]) -> dict[str, object]:
    return {
        "currency": "USDC",
        "decimals": 6,
        "minimumJobMicroUsdc": MINIMUM_JOB_MICRO_USDC,
        "operations": {name: _rule_json(operation_rule(name)) for name in sorted(operation_names)},
        "generators": {name: _rule_json(rule) for name, rule in sorted(GENERATOR_RULES.items())},
    }


def _rule_json(rule: PriceRule) -> dict[str, object]:
    return {
        "unit": rule.unit,
        "microUsdcPerUnit": rule.micro_usdc_per_unit,
        "minimumMicroUsdc": rule.minimum_micro_usdc,
    }


def _generator_item(generator: CanvasGenerator | ToneGenerator) -> LineItem:
    if isinstance(generator, CanvasGenerator):
        rule = GENERATOR_RULES["canvas"]
        quantity = math.ceil(generator.width * generator.height / PIXELS_PER_MEGAPIXEL)
    else:
        rule = GENERATOR_RULES["tone"]
        quantity = math.ceil(generator.seconds)
    micro_usdc = max(rule.minimum_micro_usdc, quantity * rule.micro_usdc_per_unit)
    return LineItem(generator.name, "generator", quantity, rule.unit, micro_usdc)


def price_spec(spec: StudioSpec, canonical: CanonicalSpec) -> Quote:
    """Price the validated pipeline, so a recipe is charged for the steps it expands to."""
    items: list[LineItem] = [_generator_item(generator) for generator in spec.generators]
    for step in canonical.steps:
        rule = operation_rule(step.op.name)
        items.append(LineItem(step.id, "operation", 1, rule.unit, rule.micro_usdc_per_unit))
    total = max(MINIMUM_JOB_MICRO_USDC, sum(item.micro_usdc for item in items))
    return Quote(spec.spec_hash, total, tuple(items))
