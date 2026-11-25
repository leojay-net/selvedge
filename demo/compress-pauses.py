"""Shorten the idle pauses in an Android screenrecord clip.

screenrecord writes a frame only when the screen changes, so a slow emulator leaves long
gaps between frames. A blinking text cursor would otherwise count as a change, so near-duplicate frames are
dropped first. The rest are kept and each gap is capped, so the clip plays at
natural speed without the waits between adb commands.

Usage: python3 demo/compress-pauses.py INPUT.mp4 OUTPUT.mp4 [START_SECONDS] [MAXIMUM_PAUSE_SECONDS]
"""

import re
import subprocess
import sys
import tempfile
from pathlib import Path

DEFAULT_MAXIMUM_PAUSE_SECONDS = 1.2
FINAL_HOLD_SECONDS = 1.5
OUTPUT_FRAME_RATE = "30"
NEAR_DUPLICATE_FILTER = "mpdecimate=hi=8000:lo=2000:frac=0.5"


def extract_changed_frames(clip_path: Path, frame_directory: Path, start_seconds: float) -> tuple[list[Path], list[float]]:
    extraction = subprocess.run(
        ["ffmpeg", "-loglevel", "info", "-ss", str(start_seconds), "-i", str(clip_path), "-vf", f"{NEAR_DUPLICATE_FILTER},showinfo",
         "-fps_mode", "passthrough", "-frame_pts", "0", str(frame_directory / "frame-%05d.png")],
        capture_output=True, text=True, check=True,
    )
    timestamps = [float(match) for match in re.findall(r"pts_time:([0-9.]+)", extraction.stderr)]
    frame_paths = sorted(frame_directory.glob("frame-*.png"))
    if len(frame_paths) != len(timestamps):
        raise SystemExit(f"{clip_path}: {len(frame_paths)} frames written but {len(timestamps)} timestamps logged")
    return frame_paths, timestamps


def write_concat_list(frame_paths: list[Path], timestamps: list[float], list_path: Path, maximum_pause_seconds: float) -> None:
    lines = []
    for frame_index, frame_path in enumerate(frame_paths):
        if frame_index + 1 < len(timestamps):
            hold_seconds = min(timestamps[frame_index + 1] - timestamps[frame_index], maximum_pause_seconds)
        else:
            hold_seconds = FINAL_HOLD_SECONDS
        lines.append(f"file '{frame_path}'\nduration {max(hold_seconds, 1 / 30):.4f}")
    lines.append(f"file '{frame_paths[-1]}'")
    list_path.write_text("\n".join(lines) + "\n")


def main() -> None:
    if len(sys.argv) not in (3, 4, 5):
        raise SystemExit("usage: compress-pauses.py INPUT.mp4 OUTPUT.mp4 [START_SECONDS] [MAXIMUM_PAUSE_SECONDS]")
    input_path, output_path = Path(sys.argv[1]), Path(sys.argv[2])
    start_seconds = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0
    maximum_pause_seconds = float(sys.argv[4]) if len(sys.argv) > 4 else DEFAULT_MAXIMUM_PAUSE_SECONDS
    with tempfile.TemporaryDirectory() as working_directory:
        frame_directory = Path(working_directory)
        frame_paths, timestamps = extract_changed_frames(input_path, frame_directory, start_seconds)
        list_path = frame_directory / "frames.txt"
        write_concat_list(frame_paths, timestamps, list_path, maximum_pause_seconds)
        subprocess.run(
            ["ffmpeg", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(list_path),
             "-r", OUTPUT_FRAME_RATE, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", str(output_path)],
            check=True,
        )


if __name__ == "__main__":
    main()
