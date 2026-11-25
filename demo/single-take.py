"""Speak a whole narration script in one request, so the video has one consistent voice.

Uses the shared voice settings in tools/voiceover.py (same model, seed and designed voice),
but sends every paragraph together instead of one request per paragraph. Per-paragraph
timings come afterwards from align-take.py.

Usage: python3 demo/single-take.py SCRIPT.txt OUTPUT.mp3
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "tools"))

import voiceover  # noqa: E402


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: single-take.py SCRIPT.txt OUTPUT.mp3")
    script_path, output_path = Path(sys.argv[1]), Path(sys.argv[2])
    paragraphs = [paragraph.strip().replace("\n", " ") for paragraph in script_path.read_text().split("\n\n") if paragraph.strip()]
    description = (
        f"{voiceover.PEOPLE['man']} speaking English with {voiceover.ACCENTS['nigerian']}; "
        "clear, upbeat and natural, like a presenter."
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(voiceover.synthesize("\n\n".join(paragraphs), description, voiceover.load_api_key()))
    print(f"wrote {output_path} ({voiceover.measure_duration_seconds(output_path):.1f}s)")


if __name__ == "__main__":
    main()
