"""Outlines the Selvedge wordmark from the self-hosted Fraunces font.

Usage: build-wordmark.py <fraunces-variable.ttf> <output-path-data.json>
The wordmark is converted to a path so the logo renders without the font installed.
"""
import json
import sys

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

WORDMARK_TEXT = "Selvedge"
WEIGHT_AXIS_VALUE = 600
OPTICAL_SIZE_AXIS_VALUE = 72
SOFT_AXIS_VALUE = 0
WONK_AXIS_VALUE = 0
TARGET_CAP_HEIGHT_UNITS = 30.0


def build_wordmark_path(font_path: str) -> dict:
    variable_font = TTFont(font_path)
    static_font = instantiateVariableFont(
        variable_font,
        {"wght": WEIGHT_AXIS_VALUE, "opsz": OPTICAL_SIZE_AXIS_VALUE, "SOFT": SOFT_AXIS_VALUE, "WONK": WONK_AXIS_VALUE},
    )
    glyph_set = static_font.getGlyphSet()
    character_map = static_font.getBestCmap()
    units_per_em = static_font["head"].unitsPerEm
    cap_height = static_font["OS/2"].sCapHeight
    scale = TARGET_CAP_HEIGHT_UNITS / cap_height

    pen = SVGPathPen(glyph_set, ntos=lambda value: f"{value:.2f}".rstrip("0").rstrip("."))
    cursor_x = 0.0
    for character in WORDMARK_TEXT:
        glyph_name = character_map[ord(character)]
        glyph = glyph_set[glyph_name]
        transform = (scale, 0, 0, -scale, cursor_x * scale, 0)
        glyph.draw(TransformPen(pen, transform))
        cursor_x += glyph.width
    return {
        "pathData": pen.getCommands(),
        "width": round(cursor_x * scale, 2),
        "capHeight": TARGET_CAP_HEIGHT_UNITS,
        "unitsPerEm": units_per_em,
    }


if __name__ == "__main__":
    result = build_wordmark_path(sys.argv[1])
    with open(sys.argv[2], "w", encoding="utf-8") as output_file:
        json.dump(result, output_file)
    print(f"wordmark width {result['width']}")
