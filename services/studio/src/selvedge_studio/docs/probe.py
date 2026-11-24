"""Describe a document for the agent and for the checks (runs in the sandboxed probe worker)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from selvedge_studio.media import MediaType
from selvedge_studio.ops.registry import OpError


def probe_document(path: Path, media: MediaType) -> dict[str, Any]:
    """Structure and content facts about a PDF or Office file, or {"error": ...} if unreadable."""
    try:
        if media is MediaType.PDF:
            from selvedge_studio.docs import pdfdoc

            return pdfdoc.describe(path)
        if media is MediaType.DOCX:
            from selvedge_studio.docs import word

            return word.describe(path)
        if media is MediaType.PPTX:
            from selvedge_studio.docs import slides

            return slides.describe(path)
        if media is MediaType.XLSX:
            from selvedge_studio.docs import sheet

            return sheet.describe(path)
    except OpError as e:
        return {"error": str(e)}
    return {}
