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

## Tutorial video (current)

Script: `demo/tutorial.txt` (18 segments). The Android section is recorded from the release APK on the `Medium_Phone_API_36.1` emulator with `adb screenrecord`, then each clip's idle pauses are capped by `demo/compress-pauses.py`. The emulator had no fingerprint enrolled, so the veto clip shows the app's real "No fingerprint or face is enrolled" refusal.

```sh
python3 ../../tools/voiceover.py demo/tutorial.txt demo/build/tutorial.mp3
node demo/build-tutorial.mjs
cd demo && node ../../../tools/record-demo.mjs tutorial-plan.json
cp build/tutorial.mp3 voiceover.mp3 && sh ../../../tools/mux-demo.sh . ../../selvedge-tutorial.mp4
ffprobe -v error -show_entries format=duration -of csv=p=0 ../../selvedge-tutorial.mp4
```

Last run: 168.6 s.
