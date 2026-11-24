"""Deterministic source assets for specs that start from nothing.

The same generator always produces the same bytes, so the content-addressed store and the
result cache treat two identical specs as one.
"""

from __future__ import annotations

import io
import math
import struct
import wave

from PIL import Image

from selvedge_studio.engine.store import LocalStore
from selvedge_studio.service.constants import (
    PCM16_MAX,
    TONE_AMPLITUDE,
    TONE_SAMPLE_RATE_HZ,
    WAV_SAMPLE_WIDTH_BYTES,
)
from selvedge_studio.service.studio_spec import CanvasGenerator, Generator, ToneGenerator

PNG_COMPRESS_LEVEL = 6
RGB_CHANNELS = 3
HEX_RADIX = 16


def render_canvas(canvas: CanvasGenerator) -> bytes:
    red, green, blue = (
        int(canvas.color[offset : offset + 2], HEX_RADIX)
        for offset in range(1, 1 + 2 * RGB_CHANNELS, 2)
    )
    image = Image.new("RGB", (canvas.width, canvas.height), (red, green, blue))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", compress_level=PNG_COMPRESS_LEVEL)
    return buffer.getvalue()


def render_tone(tone: ToneGenerator) -> bytes:
    frame_count = round(tone.seconds * TONE_SAMPLE_RATE_HZ)
    angular_step = 2 * math.pi * tone.frequency_hz / TONE_SAMPLE_RATE_HZ
    samples = [
        round(TONE_AMPLITUDE * PCM16_MAX * math.sin(angular_step * frame_index))
        for frame_index in range(frame_count)
    ]
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as writer:
        writer.setnchannels(1)
        writer.setsampwidth(WAV_SAMPLE_WIDTH_BYTES)
        writer.setframerate(TONE_SAMPLE_RATE_HZ)
        writer.writeframes(struct.pack(f"<{frame_count}h", *samples))
    return buffer.getvalue()


def materialize_generators(generators: list[Generator], store: LocalStore) -> dict[str, str]:
    """Write every generator's bytes into the store; returns generator name to asset handle."""
    handles: dict[str, str] = {}
    for generator in generators:
        if isinstance(generator, CanvasGenerator):
            info = store.put_bytes(render_canvas(generator), ext=".png")
        else:
            info = store.put_bytes(render_tone(generator), ext=".wav")
        handles[generator.name] = info.handle
    return handles
