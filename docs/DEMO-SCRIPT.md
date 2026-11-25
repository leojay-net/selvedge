# Demo script

Narration source: `demo/script.txt` (nine paragraphs, one per segment). Voice: Vultr `qwen3-tts-12hz-1.7b`, seed 7, default voice, measured 106.2 s for the current text.

| Segment | Picture | Source |
|---|---|---|
| 1 | Dashboard overview | live site |
| 2 | Mandate detail with on-chain state | live site, mandate from the latest agent run |
| 3 | Proofs page | live site |
| 4 | Studio agent run and the payment on the explorer | `demo/film.html` scene 0 |
| 5 | Injected instruction refused by the engine policy gate | scene 1 |
| 6 | Same attack with gate one off, refused by the program, failed transaction on the explorer | scene 2 |
| 7 | Containment page with the security-agent revoke | live site |
| 8 | Android review and biometric veto | scene 3, emulator recording |
| 9 | Closing | scene 4 |

Build and record (from the repository root, the workspace `tools/` directory is `../../tools`):

```bash
python3 ../../tools/voiceover.py demo/script.txt demo/build/voiceover.mp3
node demo/capture-explorer.mjs
node demo/build-film.mjs
node ../../tools/record-demo.mjs demo/plan.json
sh ../../tools/mux-demo.sh demo ../selvedge-demo.mp4
ffprobe -v error -show_entries format=duration -of csv=p=0 ../selvedge-demo.mp4
```

Captions are burned in by the recorder from the same text. The final duration must be under 180 s.

## Demo video (current)

Script: `demo/pitch.txt`, 20 paragraphs: five pitch paragraphs (the shift, the problem, the answer, who it is for, the three gates), then the demo. The whole script is spoken in one request by `demo/single-take.py` so the video has one consistent voice; `demo/align-take.py` then cuts it into per-paragraph timings from a faster-whisper word transcript. The Android section is recorded from the release APK on the `Medium_Phone_API_36.1` emulator with `adb screenrecord`, and `demo/compress-pauses.py` caps each clip's idle pauses. The emulator had no fingerprint enrolled, so the veto clip shows the app's real "No fingerprint or face is enrolled" refusal.

```sh
python3 demo/single-take.py demo/pitch.txt demo/build/pitch-take/full.mp3
python3 transcribe.py demo/build/pitch-take/full.mp3 demo/build/pitch-take/words.json   # faster-whisper 1.2.1, base.en, word timestamps
python3 demo/align-take.py demo/pitch.txt demo/build/pitch-take/full.mp3 demo/build/pitch-take/words.json demo/build/pitch-take/timings.json
node demo/build-demo-video.mjs
cd demo && node ../../../tools/record-demo.mjs demo-plan.json
cp build/pitch-take/full.mp3 voiceover.mp3 && sh ../../../tools/mux-demo.sh . ../../selvedge-demo.mp4
ffprobe -v error -show_entries format=duration -of csv=p=0 ../../selvedge-demo.mp4
```

Last run: 162.9 s.
