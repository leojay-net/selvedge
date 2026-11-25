/**
 * Builds the demo video recording inputs: the pitch scenes, a stage page that plays the
 * Android emulator clips inside a phone frame, and the plan that record-demo.mjs follows
 * paragraph by paragraph of demo/pitch.txt.
 *
 * Usage: node demo/build-demo-video.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PITCH_SCENE_COUNT, buildPitchPage } from "./pitch-scenes.mjs";

const DEMO_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const SITE_URL = "https://selvedge-dashboard.vercel.app";
const LIVE_MANDATE_ADDRESS = "HDuEGxujDAbpBLBMRAisuLawC4PLoFAszMoqfDQ9gWc2";
const FONT_DIRECTORY = resolve(DEMO_DIRECTORY, "../apps/web/public/fonts");
const RAW_CLIP_DIRECTORY = resolve(DEMO_DIRECTORY, "build/android-clips2");
const CLIP_DIRECTORY = resolve(DEMO_DIRECTORY, "build/android-cut");
const TIMINGS_RELATIVE_PATH = "build/pitch-take/timings.json";
const ATTACK_RUN_MILLISECONDS = 2650;
const DEFAULT_MAXIMUM_PAUSE_SECONDS = 1.2;
const DECODE_VECTORS_PATH = resolve(DEMO_DIRECTORY, "../vectors/decode/decode.v1.json");

const ANDROID_STEPS = [
  { clip: "a1-onboarding", title: "Choose a wallet", startSeconds: 8.0, maximumPauseSeconds: 2.5 },
  { clip: "a2-create", title: "Create an agent" },
  { clip: "a3-mandate", title: "Edit its mandate" },
  { clip: "a4-review", title: "Review a transaction" },
  { clip: "a5-veto", title: "Biometric veto" },
];

/** Caps the pauses where the emulator sat idle between adb commands, so the clip plays at natural speed. */
function removeIdleFrames(clipName, startSeconds = 0, maximumPauseSeconds = DEFAULT_MAXIMUM_PAUSE_SECONDS) {
  mkdirSync(CLIP_DIRECTORY, { recursive: true });
  const rawPath = resolve(RAW_CLIP_DIRECTORY, `${clipName}.mp4`);
  if (!existsSync(rawPath)) throw new Error(`missing raw Android clip ${rawPath}`);
  execFileSync("python3", [resolve(DEMO_DIRECTORY, "compress-pauses.py"), rawPath, resolve(CLIP_DIRECTORY, `${clipName}.mp4`), String(startSeconds), String(maximumPauseSeconds)]);
}

function clipSeconds(clipName) {
  const clipPath = resolve(CLIP_DIRECTORY, `${clipName}.mp4`);
  if (!existsSync(clipPath)) throw new Error(`missing Android clip ${clipPath}`);
  const output = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", clipPath], { encoding: "utf8" });
  return Number.parseFloat(output.trim());
}

function readDangerTransaction() {
  const document = JSON.parse(readFileSync(DECODE_VECTORS_PATH, "utf8"));
  const cases = Array.isArray(document) ? document : document.cases ?? document.vectors;
  const unlimitedApprove = cases.find((vectorCase) => vectorCase.name === "unlimited approve");
  if (unlimitedApprove === undefined) throw new Error("decode vectors have no 'unlimited approve' case");
  return unlimitedApprove.transactionBase64;
}

function buildStagePage(steps) {
  const stepsJson = JSON.stringify(steps);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Selvedge on Android</title>
<style>
@font-face { font-family: "Fraunces"; src: url("file://${FONT_DIRECTORY}/fraunces-latin-wght-normal.woff2") format("woff2"); font-weight: 100 900; }
@font-face { font-family: "Inter"; src: url("file://${FONT_DIRECTORY}/inter-latin-wght-normal.woff2") format("woff2"); font-weight: 100 900; }
:root { --primary: #1e3a5f; --neutral-50: #f5f3ee; --neutral-300: #c9c5ba; --neutral-500: #6b675c; --neutral-900: #1b1a17; }
* { box-sizing: border-box; }
body { margin: 0; height: 100vh; background: var(--neutral-50); font-family: "Inter", sans-serif; color: var(--neutral-900);
  display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 72px; padding: 0 140px 60px; overflow: hidden; }
.eyebrow { font-size: 15px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--primary); margin: 0 0 12px; }
h1 { font-family: "Fraunces", serif; font-size: 56px; line-height: 1.05; margin: 0 0 36px; }
ol { list-style: none; padding: 0; margin: 0; display: grid; gap: 14px; }
li { display: flex; align-items: center; gap: 16px; font-size: 22px; color: var(--neutral-500); transition: color 300ms ease, transform 300ms cubic-bezier(0.34, 1.4, 0.5, 1); }
li span { width: 36px; height: 36px; border-radius: 50%; border: 2px solid var(--neutral-300); display: grid; place-items: center; font-size: 15px; font-weight: 600; transition: all 300ms ease; }
li.is-current { color: var(--neutral-900); font-weight: 600; transform: translateX(8px); }
li.is-current span { background: var(--primary); border-color: var(--primary); color: #fff; }
li.is-done span { border-color: var(--primary); color: var(--primary); }
.phone { width: 368px; height: 800px; border-radius: 48px; background: var(--neutral-900); padding: 14px; box-shadow: 0 24px 60px rgba(27, 26, 23, 0.18); }
video { width: 100%; height: 100%; border-radius: 36px; object-fit: cover; background: #fff; display: block; }
</style>
</head>
<body>
<div>
  <p class="eyebrow">On Android</p>
  <h1>Selvedge in your pocket</h1>
  <ol id="steps"></ol>
</div>
<div class="phone"><video id="clip" muted playsinline></video></div>
<script>
const steps = ${stepsJson};
const list = document.getElementById("steps");
const video = document.getElementById("clip");
steps.forEach(function addStep(step, stepIndex) {
  const item = document.createElement("li");
  item.innerHTML = "<span>" + (stepIndex + 1) + "</span>" + step.title;
  list.appendChild(item);
});
function highlight(currentIndex) {
  [...list.children].forEach(function markStep(item, stepIndex) {
    item.classList.toggle("is-current", stepIndex === currentIndex);
    item.classList.toggle("is-done", stepIndex < currentIndex);
  });
}
window.playScene = function playScene(sceneIndex, segmentSeconds) {
  const step = steps[sceneIndex];
  highlight(sceneIndex);
  video.src = step.src;
  video.playbackRate = Math.min(4, Math.max(1, step.seconds / segmentSeconds));
  video.defaultPlaybackRate = video.playbackRate;
  video.play();
};
highlight(-1);
</script>
</body>
</html>
`;
}

function attackClick(attackTitle) {
  return { click: `button.attack-button:has-text("${attackTitle}")` };
}

function buildPlan(stagePath, pitchPath) {
  const stageUrl = `file://${stagePath}`;
  const pitchUrl = `file://${pitchPath}`;
  const dangerTransaction = readDangerTransaction();
  const pitchSegments = Array.from({ length: PITCH_SCENE_COUNT }, (_, sceneIndex) => ({ goto: pitchUrl, scene: sceneIndex }));
  const segments = [
    ...pitchSegments,
    { goto: `${SITE_URL}/`, section: ".injection", actions: [{ wait: 400 }] },
    { section: ".game", actions: [{ wait: 1200 }, attackClick("Send funds to a stranger")] },
    { actions: [{ click: ".game-toggle:has-text(\"Compromise the agent\") input" }, { wait: 700 }, attackClick("Send funds to a stranger")] },
    {
      actions: [
        attackClick("Ask for unlimited access"),
        { wait: ATTACK_RUN_MILLISECONDS },
        attackClick("Spend past the cap"),
        { wait: ATTACK_RUN_MILLISECONDS },
        attackClick("Replay an old payment"),
        { wait: ATTACK_RUN_MILLISECONDS },
        attackClick("Pay after you pulled the plug"),
      ],
    },
    { section: ".stat-card", actions: [{ wait: 3000 }, { scrollBy: 380 }] },
    { goto: `${SITE_URL}/agents` },
    { goto: `${SITE_URL}/mandates/${LIVE_MANDATE_ADDRESS}`, actions: [{ wait: 2500 }, { scrollBy: 420 }] },
    { goto: `${SITE_URL}/activity`, actions: [{ wait: 600 }, { fill: { selector: "textarea", value: dangerTransaction } }, { wait: 500 }, { click: "button:has-text(\"Review transaction\")" }, { wait: 1800 }, { scrollBy: 360 }] },
    { goto: `${SITE_URL}/containment`, actions: [{ wait: 3500 }, { scrollBy: 380 }] },
    ...ANDROID_STEPS.map((step, stepIndex) => ({ goto: stageUrl, scene: stepIndex })),
    { goto: `${SITE_URL}/`, section: ".chapter-final" },
  ];
  return { url: pitchUrl, timings: TIMINGS_RELATIVE_PATH, segments };
}

function main() {
  for (const step of ANDROID_STEPS) removeIdleFrames(step.clip, step.startSeconds, step.maximumPauseSeconds);
  const steps = ANDROID_STEPS.map((step) => ({
    title: step.title,
    src: `file://${resolve(CLIP_DIRECTORY, `${step.clip}.mp4`)}`,
    seconds: clipSeconds(step.clip),
  }));
  const stagePath = resolve(DEMO_DIRECTORY, "android-stage.html");
  writeFileSync(stagePath, buildStagePage(steps));
  const pitchPath = resolve(DEMO_DIRECTORY, "pitch-stage.html");
  writeFileSync(pitchPath, buildPitchPage(FONT_DIRECTORY));
  const plan = buildPlan(stagePath, pitchPath);
  const timings = JSON.parse(readFileSync(resolve(DEMO_DIRECTORY, TIMINGS_RELATIVE_PATH), "utf8"));
  if (timings.length !== plan.segments.length) {
    throw new Error(`script has ${timings.length} segments but the plan has ${plan.segments.length}`);
  }
  writeFileSync(resolve(DEMO_DIRECTORY, "demo-plan.json"), JSON.stringify(plan, null, 2));
  console.log(`wrote pitch-stage.html, android-stage.html and demo-plan.json (${plan.segments.length} segments)`);
}

main();
