"""The versioned spec an agent submits: generated source assets plus an engine pipeline.

The engine itself only transforms existing assets. An agent has none, so a spec may declare
generators (a flat-colour canvas, a pure tone) that are materialised deterministically into
the content store before the pipeline is validated. Nothing else may enter a spec: no asset
handles, no checks override, no paths.
"""

from __future__ import annotations

import re
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from selvedge_studio.canonical import canonical_json, sha256_hex
from selvedge_studio.service.constants import (
    MAX_CANVAS_EDGE_PIXELS,
    MAX_GENERATORS,
    MAX_NAME_LENGTH,
    MAX_OUTPUTS,
    MAX_STEPS,
    MAX_TONE_FREQUENCY_HZ,
    MAX_TONE_SECONDS,
    MIN_CANVAS_EDGE_PIXELS,
    MIN_TONE_FREQUENCY_HZ,
    MIN_TONE_SECONDS,
)

NAME_PATTERN = re.compile(r"^[a-z][a-z0-9_]*$")
HEX_COLOR_PATTERN = re.compile(r"^#[0-9a-fA-F]{6}$")


def _check_name(value: str) -> str:
    if not NAME_PATTERN.match(value) or len(value) > MAX_NAME_LENGTH:
        raise ValueError(
            f"names are lowercase letters, digits and underscores, starting with a letter, "
            f"at most {MAX_NAME_LENGTH} characters; got {value!r}"
        )
    return value


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class CanvasGenerator(StrictModel):
    kind: Literal["canvas"]
    name: str
    width: int = Field(ge=MIN_CANVAS_EDGE_PIXELS, le=MAX_CANVAS_EDGE_PIXELS)
    height: int = Field(ge=MIN_CANVAS_EDGE_PIXELS, le=MAX_CANVAS_EDGE_PIXELS)
    color: str = Field(description="#rrggbb")

    _name = field_validator("name")(_check_name)

    @field_validator("color")
    @classmethod
    def _check_color(cls, value: str) -> str:
        if not HEX_COLOR_PATTERN.match(value):
            raise ValueError(f"color must look like #rrggbb, got {value!r}")
        return value.lower()


class ToneGenerator(StrictModel):
    kind: Literal["tone"]
    name: str
    frequency_hz: int = Field(ge=MIN_TONE_FREQUENCY_HZ, le=MAX_TONE_FREQUENCY_HZ)
    seconds: float = Field(ge=MIN_TONE_SECONDS, le=MAX_TONE_SECONDS)

    _name = field_validator("name")(_check_name)


Generator = Annotated[CanvasGenerator | ToneGenerator, Field(discriminator="kind")]


class StudioStep(StrictModel):
    id: str
    op: str
    input_refs: str | list[str] = Field(alias="in")
    args: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    _id = field_validator("id")(_check_name)

    @field_validator("input_refs")
    @classmethod
    def _check_refs(cls, value: str | list[str]) -> str | list[str]:
        for reference in [value] if isinstance(value, str) else value:
            _check_name(reference)
        return value


class StudioRecipe(StrictModel):
    id: str
    params: dict[str, Any] = Field(default_factory=dict)

    _id = field_validator("id")(_check_name)


class StudioSpec(StrictModel):
    """Either explicit `steps` with `outputs`, or one `recipe`; never both."""

    version: Literal[1] = 1
    generators: list[Generator] = Field(default_factory=list, max_length=MAX_GENERATORS)
    steps: list[StudioStep] = Field(default_factory=list, max_length=MAX_STEPS)
    outputs: list[str] = Field(default_factory=list, max_length=MAX_OUTPUTS)
    recipe: StudioRecipe | None = None

    @field_validator("outputs")
    @classmethod
    def _check_outputs(cls, value: list[str]) -> list[str]:
        for name in value:
            _check_name(name)
        return value

    @model_validator(mode="after")
    def _check_steps_or_recipe(self) -> StudioSpec:
        if self.recipe is not None:
            if self.steps or self.outputs:
                raise ValueError("a recipe spec has no steps or outputs of its own")
        elif not self.steps or not self.outputs:
            raise ValueError("a spec needs steps and outputs, or a recipe")
        return self

    @model_validator(mode="after")
    def _check_unique_names(self) -> StudioSpec:
        names = [generator.name for generator in self.generators] + [step.id for step in self.steps]
        duplicated = sorted({name for name in names if names.count(name) > 1})
        if duplicated:
            raise ValueError(f"names must be unique across generators and steps: {duplicated}")
        return self

    @property
    def spec_hash(self) -> str:
        return sha256_hex(canonical_json(self.model_dump(mode="json", by_alias=True)))


def studio_spec_json_schema(operation_names: list[str]) -> dict[str, Any]:
    """The JSON Schema served to agents, with the exposed operation names as an enum."""
    schema = StudioSpec.model_json_schema(by_alias=True)
    schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    schema["title"] = "StudioSpec"
    schema["$defs"]["StudioStep"]["properties"]["op"] = {
        "type": "string",
        "enum": sorted(operation_names),
    }
    return schema
