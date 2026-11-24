"""Validation, pricing and execution of studio specs on top of the engine."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from selvedge_studio.engine.engine import Engine
from selvedge_studio.engine.runner import JobResult, Observer, RunLimits
from selvedge_studio.engine.runner import run as run_spec
from selvedge_studio.ops.registry import Registry
from selvedge_studio.recipes import all_recipes
from selvedge_studio.service.catalog import build_exposed_registry
from selvedge_studio.service.constants import JOB_WALL_SECONDS
from selvedge_studio.service.errors import SpecRejected
from selvedge_studio.service.generators import materialize_generators
from selvedge_studio.service.pricing import Quote, price_spec
from selvedge_studio.service.studio_spec import StudioSpec
from selvedge_studio.spec.errors import SpecInvalid
from selvedge_studio.spec.model import CanonicalSpec

CHECKS_MODE = "default"


@dataclass(frozen=True)
class PreparedSpec:
    spec: StudioSpec
    canonical: CanonicalSpec
    quote: Quote


def parse_studio_spec(raw: Any) -> StudioSpec:
    try:
        return StudioSpec.model_validate(raw)
    except ValidationError as failure:
        problems = [
            {
                "path": ".".join(str(part) for part in problem["loc"]),
                "code": problem["type"],
                "message": problem["msg"],
            }
            for problem in failure.errors(include_url=False, include_context=False)
        ]
        raise SpecRejected(
            "the spec does not match the studio spec schema", {"errors": problems}
        ) from None


class Studio:
    def __init__(self, home: Path, registry: Registry | None = None) -> None:
        self.registry = registry if registry is not None else build_exposed_registry()
        self.engine = Engine.open(
            home / "engine",
            registry=self.registry,
            run_limits=RunLimits(wall_seconds=JOB_WALL_SECONDS),
        )

    def operation_names(self) -> list[str]:
        return self.registry.names()

    def prepare(self, spec: StudioSpec) -> PreparedSpec:
        self._require_exposed_operations(spec)
        handles = materialize_generators(spec.generators, self.engine.store)
        engine_spec = self._engine_spec(spec, handles)
        try:
            canonical = self.engine.validate(engine_spec)
        except SpecInvalid as failure:
            raise SpecRejected(
                "the pipeline was rejected by the engine",
                {"errors": [error.to_json() for error in failure.errors]},
            ) from None
        return PreparedSpec(spec=spec, canonical=canonical, quote=price_spec(spec, canonical))

    def quote(self, spec: StudioSpec) -> Quote:
        return self.prepare(spec).quote

    def run(self, prepared: PreparedSpec, observer: Observer | None = None) -> JobResult:
        return run_spec(
            prepared.canonical,
            store=self.engine.store,
            cache=self.engine.cache,
            limits=self.engine.run_limits,
            observer=observer,
        )

    def _engine_spec(self, spec: StudioSpec, handles: dict[str, str]) -> dict[str, Any]:
        if spec.recipe is not None:
            recipe = all_recipes().get(spec.recipe.id)
            asset_parameters = (
                {name for name, parameter in recipe.params.items() if parameter.type == "asset"}
                if recipe is not None
                else set()
            )
            parameters = {
                name: handles.get(value, value) if name in asset_parameters else value
                for name, value in spec.recipe.params.items()
            }
            return {"recipe": spec.recipe.id, "params": parameters, "checks": CHECKS_MODE}
        return {
            "version": spec.version,
            "inputs": handles,
            "steps": [
                {"id": step.id, "op": step.op, "in": step.input_refs, "args": step.args}
                for step in spec.steps
            ],
            "outputs": spec.outputs,
            "checks": CHECKS_MODE,
        }

    def _require_exposed_operations(self, spec: StudioSpec) -> None:
        exposed = set(self.registry.names())
        unknown = sorted({step.op for step in spec.steps if step.op not in exposed})
        if unknown:
            raise SpecRejected(
                f"operations not available: {', '.join(unknown)}",
                {"unknown": unknown, "allowed": sorted(exposed)},
            )
