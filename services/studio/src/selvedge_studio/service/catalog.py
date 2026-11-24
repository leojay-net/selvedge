"""The operations an agent may use: everything a spec can reach from its generators.

Generators produce images and audio. An operation is exposed when each of its inputs can be
fed by a media type that is reachable, directly or through other exposed operations. Debug
operations are never exposed.
"""

from __future__ import annotations

from selvedge_studio.media import MediaType
from selvedge_studio.ops.catalogue import catalogue, preset_line, recipe_signature
from selvedge_studio.ops.registry import AnyOf, OpDef, Registry, load_builtin_ops
from selvedge_studio.presets import all_presets
from selvedge_studio.recipes import all_recipes

GENERATED_MEDIA = frozenset({MediaType.IMAGE, MediaType.AUDIO})
DEBUG_PREFIX = "debug."


def _accepts(expected: MediaType | AnyOf, available: frozenset[MediaType]) -> set[MediaType]:
    if isinstance(expected, AnyOf):
        return {media for media in available if media in expected}
    return {expected} if expected in available else set()


def _produced_media(operation: OpDef, available: frozenset[MediaType]) -> set[MediaType] | None:
    """The media types this operation can output, or None when its inputs cannot be fed."""
    first_input_options: set[MediaType] = set()
    for position in range(len(operation.inputs)):
        options = _accepts(operation.input_type(position), available)
        if not options:
            return None
        if position == 0:
            first_input_options = options
    if operation.output_label == "same":
        return first_input_options
    return {operation.output_for([])}


def build_exposed_registry() -> Registry:
    full_registry = load_builtin_ops()
    exposed = Registry()
    available = frozenset(GENERATED_MEDIA)
    changed = True
    while changed:
        changed = False
        for operation in full_registry:
            if operation.name.startswith(DEBUG_PREFIX) or operation.name in exposed:
                continue
            produced = _produced_media(operation, available)
            if produced is None:
                continue
            exposed.register(operation)
            changed = True
            available = frozenset(available | produced)
    return exposed


def director_catalogue(registry: Registry) -> str:
    """Operations, presets and the recipes whose asset inputs a generator can supply."""
    recipe_lines = [
        f"{recipe_signature(recipe)} - {recipe.description}"
        for _, recipe in sorted(all_recipes().items())
        if all(
            parameter.media in GENERATED_MEDIA
            for parameter in recipe.params.values()
            if parameter.type == "asset"
        )
    ]
    preset_lines = [
        preset_line(preset)
        for preset in sorted(all_presets().values(), key=lambda entry: (entry.kind, entry.id))
    ]
    return "\n".join([catalogue(registry), *preset_lines, *recipe_lines])
