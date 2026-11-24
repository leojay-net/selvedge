"""Locations of bundled, version-controlled assets (fonts, ICC profiles, LUTs)."""

from __future__ import annotations

import os
from pathlib import Path

# src/selvedge_studio/paths.py → repo root. Override for installed deployments.
ASSETS = Path(
    os.environ.get("SELVEDGE_STUDIO_ASSETS") or Path(__file__).resolve().parents[2] / "assets"
)
FONTS = ASSETS / "fonts"
ICC = ASSETS / "icc"
SRGB_ICC = ICC / "sRGB.icc"
