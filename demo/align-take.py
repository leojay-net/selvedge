"""Split a single-take narration into per-paragraph timings.

The voice-over is spoken in one request so the whole video is one consistent voice.
The picture still needs to change on each paragraph, so this aligns the script's words
with a word-timestamped transcript (faster-whisper) and writes timings.json in the format
record-demo.mjs reads: one entry per paragraph with its text and its length in seconds.

Usage: python3 demo/align-take.py SCRIPT.txt TAKE.mp3 WORDS.json TIMINGS.json
WORDS.json is a list of {"word", "start", "end"} produced by faster-whisper.
"""

import difflib
import json
import re
import subprocess
import sys
from pathlib import Path

PARAGRAPH_LEAD_SECONDS = 0.15
AVERAGE_WORD_SECONDS = 0.3


def normalize(word: str) -> str:
    return re.sub(r"[^a-z0-9]", "", word.lower())


def read_paragraphs(script_path: Path) -> list[str]:
    return [paragraph.strip().replace("\n", " ") for paragraph in script_path.read_text().split("\n\n") if paragraph.strip()]


def audio_seconds(audio_path: Path) -> float:
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(audio_path)],
        capture_output=True, text=True, check=True,
    )
    return float(probe.stdout.strip())


def paragraph_start_times(paragraphs: list[str], transcript_words: list[dict]) -> list[float]:
    script_words: list[str] = []
    paragraph_first_word_index: list[int] = []
    for paragraph in paragraphs:
        paragraph_first_word_index.append(len(script_words))
        script_words.extend(normalize(word) for word in paragraph.split())
    heard_words = [normalize(entry["word"]) for entry in transcript_words]
    matcher = difflib.SequenceMatcher(a=script_words, b=heard_words, autojunk=False)
    script_to_heard: dict[int, int] = {}
    for block in matcher.get_matching_blocks():
        for offset in range(block.size):
            script_to_heard[block.a + offset] = block.b + offset
    start_times = []
    for paragraph_index, first_word_index in enumerate(paragraph_first_word_index):
        next_paragraph_word_index = (
            paragraph_first_word_index[paragraph_index + 1] if paragraph_index + 1 < len(paragraphs) else len(script_words)
        )
        first_aligned_word_index = next(
            (word_index for word_index in range(first_word_index, next_paragraph_word_index) if word_index in script_to_heard), None
        )
        if first_aligned_word_index is None:
            raise SystemExit(f"paragraph {paragraph_index + 1} could not be found in the transcript")
        unheard_leading_words = first_aligned_word_index - first_word_index
        heard_start = transcript_words[script_to_heard[first_aligned_word_index]]["start"]
        start_times.append(max(0.0, heard_start - unheard_leading_words * AVERAGE_WORD_SECONDS - PARAGRAPH_LEAD_SECONDS))
    start_times[0] = 0.0
    if any(later <= earlier for earlier, later in zip(start_times, start_times[1:])):
        raise SystemExit(f"paragraph start times are not increasing: {start_times}")
    return start_times


def main() -> None:
    if len(sys.argv) != 5:
        raise SystemExit("usage: align-take.py SCRIPT.txt TAKE.mp3 WORDS.json TIMINGS.json")
    script_path, take_path, words_path, timings_path = (Path(argument) for argument in sys.argv[1:])
    paragraphs = read_paragraphs(script_path)
    start_times = paragraph_start_times(paragraphs, json.loads(words_path.read_text()))
    total_seconds = audio_seconds(take_path)
    end_times = start_times[1:] + [total_seconds]
    timings = [
        {"segment": index + 1, "text": text, "seconds": round(end - start, 2)}
        for index, (text, start, end) in enumerate(zip(paragraphs, start_times, end_times))
    ]
    timings_path.parent.mkdir(parents=True, exist_ok=True)
    timings_path.write_text(json.dumps(timings, indent=2))
    for entry in timings:
        print(f"{entry['segment']:2d} {entry['seconds']:5.1f}s  {entry['text'][:60]}")


if __name__ == "__main__":
    main()
