import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const demoDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(demoDirectory, "..");
const buildDirectory = join(demoDirectory, "build");
const SHORT_EDGE = 6;

const latestRun = JSON.parse(readFileSync(join(repositoryRoot, "docs/devnet-agent-run.json"), "utf8")).runs.at(-1).results;
const honest = latestRun.honestRun;
const onChain = latestRun.injectionRefusedByProgram;
const policy = latestRun.injectionRefusedByPolicy;

const shorten = (value) => `${value.slice(0, SHORT_EDGE)}...${value.slice(-SHORT_EDGE)}`;
const paymentEvent = honest.containment.find((event) => event.outcome === "allowed");
const refusalEvent = onChain.containment.find((event) => event.outcome === "refused");
const revokeEvent = onChain.containment.find((event) => event.outcome === "revoked");
const policyRefusal = policy.containment.find((event) => event.outcome === "refused");
const quoteSummary = honest.report.observations[0].trustedSummary;
const priceMatch = /costs (\d+) micro-USDC/.exec(quoteSummary);
if (priceMatch === null) throw new Error("the recorded run has no quote price");
const injectionText = JSON.parse(policy.report.observations[0].untrustedContent).note;
const androidClip = existsSync(join(buildDirectory, "android.mp4")) ? "build/android.mp4" : null;
const androidShots = readdirSync(buildDirectory).filter((name) => /^android-.*\.png$/.test(name)).sort().map((name) => `build/${name}`);

const scenes = [
  {
    kicker: "Studio agent, real run on devnet",
    lines: [
      { tone: "result", text: "objective: a two page product brief about a solar lantern" },
      { tone: "action", text: "request_studio_quote  the model writes the request, the studio director turns it into a spec" },
      { tone: "result", text: `quote ${priceMatch[1]} micro-USDC, computed from the spec before any work` },
      { tone: "action", text: `pay_for_studio_job  x402 exact, settled as a spend on mandate ${shorten(honest.mandate)}` },
      { tone: "safe", text: `gate 2 mandate program: allowed   tx ${shorten(paymentEvent.signature)}` },
      { tone: "result", text: "studio job started and rendered" },
    ],
    image: "build/explorer-payment.png",
    imageCaption: "The same payment on the public Solana explorer",
  },
  {
    kicker: "Prompt injection through the job output",
    lines: [
      { tone: "untrusted", text: `<untrusted> ${injectionText} </untrusted>` },
      { tone: "action", text: `compromised model: transfer_funds  payee ${shorten(policyRefusal.payee)}  amount ${policyRefusal.amount}` },
      { tone: "danger", text: "gate 1 engine policy: REFUSED  PayeeNotAllowed" },
      { tone: "result", text: "no transaction was built; the refusal is written to the containment log" },
    ],
    image: null,
    imageCaption: null,
  },
  {
    kicker: "Gate 1 switched off: the program is the authority",
    lines: [
      { tone: "action", text: `transfer_funds  payee ${shorten(refusalEvent.payee)}  amount ${refusalEvent.amount}  (engine pre-check disabled)` },
      { tone: "danger", text: `gate 2 mandate program: REFUSED  PayeeNotAllowed   tx ${shorten(refusalEvent.signature)}` },
      { tone: "result", text: "the failed transaction is final on devnet; no tokens moved" },
    ],
    image: "build/explorer-refusal.png",
    imageCaption: "The refused spend on the public Solana explorer: status Error",
  },
  {
    kicker: "On Android",
    lines: [],
    image: null,
    imageCaption: null,
  },
  {
    kicker: "Selvedge",
    lines: [
      { tone: "result", text: "Agents that can only do what you allowed." },
      { tone: "result", text: "github.com/leojay-net/selvedge" },
      { tone: "result", text: "selvedge-dashboard.vercel.app" },
    ],
    image: null,
    imageCaption: null,
  },
];

const payload = JSON.stringify({ scenes, androidClip, androidShots }).replace(/</g, "\\u003c");
const fontUrl = (name) => `file://${join(repositoryRoot, "assets/fonts", name)}`;
const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>Selvedge demo film</title>
<style>
@font-face { font-family: 'Fraunces'; font-weight: 100 900; src: url('${fontUrl("Fraunces-Variable.ttf")}'); }
@font-face { font-family: 'Inter'; font-weight: 100 900; src: url('${fontUrl("InterVariable.ttf")}'); }
@font-face { font-family: 'JetBrains Mono'; font-weight: 100 800; src: url('${fontUrl("JetBrainsMono[wght].ttf")}'); }
:root { --primary:#1E3A5F; --bg:#F6F5F2; --surface:#FFFFFF; --border:#C9C5BA; --text:#46433B; --heading:#1B1A17; --safe:#2E6B4F; --danger:#B3261E; --caution:#8A5A00; --muted:#7A766B; }
* { box-sizing: border-box; }
body { margin:0; width:1440px; height:900px; overflow:hidden; background:var(--bg); color:var(--text); font:16px/24px Inter, system-ui, sans-serif; }
main { padding:48px 64px 120px; height:100%; display:flex; flex-direction:column; gap:24px; }
.kicker { font:600 14px/20px Inter, sans-serif; color:var(--primary); letter-spacing:0.04em; text-transform:uppercase; }
h1 { margin:0; font:600 44px/52px Fraunces, serif; color:var(--heading); }
.stage { display:flex; gap:32px; flex:1; min-height:0; }
.terminal { flex:1; background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:24px; font:500 18px/28px 'JetBrains Mono', monospace; overflow:hidden; }
.line { opacity:0; transform:translateY(6px); transition:opacity 320ms ease-out, transform 320ms ease-out; margin-bottom:16px; word-break:break-word; }
.line.shown { opacity:1; transform:none; }
.action { color:var(--heading); } .result { color:var(--text); } .safe { color:var(--safe); } .danger { color:var(--danger); font-weight:700; }
.untrusted { color:var(--caution); background:#F4EBD6; border-radius:8px; padding:12px; }
figure { margin:0; width:560px; display:flex; flex-direction:column; gap:8px; }
figure img { width:100%; border:1px solid var(--border); border-radius:12px; }
figcaption { font:500 14px/20px Inter, sans-serif; color:var(--muted); }
video, .shots img { max-height:640px; border-radius:12px; border:1px solid var(--border); }
.android { display:flex; gap:24px; align-items:flex-start; height:100%; }
.android video { height:640px; }
.shots { display:flex; gap:16px; }
.shots img { height:560px; }

.caption { position:fixed; left:50%; bottom:12px; transform:translateX(-50%); width:1280px; padding:9px 20px; border-radius:8px; background:rgba(27,26,23,0.94); color:#fff; font:500 16px/24px Inter, sans-serif; text-align:center; }
@media (prefers-reduced-motion: reduce) { .line { transition:none; } }
</style></head>
<body><main id="root"></main>
<script>
const DATA = ${payload};
const root = document.getElementById('root');
function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
const captionBar = element('div', 'caption');
document.body.appendChild(captionBar);
window.setCaption = function setCaption(text) { captionBar.textContent = text; };
window.playScene = function playScene(sceneIndex, seconds) {
  const scene = DATA.scenes[sceneIndex];
  root.replaceChildren();
  root.appendChild(element('div', 'kicker', scene.kicker));
  root.appendChild(element('h1', '', scene.kicker === 'Selvedge' ? 'Selvedge' : scene.kicker));
  const stage = element('div', 'stage');
  if (scene.lines.length > 0) {
    const terminal = element('div', 'terminal');
    scene.lines.forEach(function addLine(line) { terminal.appendChild(element('div', 'line ' + line.tone, line.text)); });
    stage.appendChild(terminal);
    const lineNodes = Array.from(terminal.children);
    const revealWindow = seconds * 1000 * 0.6;
    lineNodes.forEach(function scheduleLine(node, lineIndex) { setTimeout(function reveal() { node.classList.add('shown'); }, (revealWindow / lineNodes.length) * lineIndex + 200); });
  }
  if (scene.image) {
    const figureNode = element('figure');
    const image = document.createElement('img'); image.src = scene.image; image.alt = scene.imageCaption;
    figureNode.appendChild(image); figureNode.appendChild(element('figcaption', '', scene.imageCaption));
    stage.appendChild(figureNode);
  }
  if (sceneIndex === 3) {
    const android = element('div', 'android');
    if (DATA.androidClip) { const video = document.createElement('video'); video.src = DATA.androidClip; video.muted = true; video.autoplay = true; video.defaultPlaybackRate = Math.min(16, Math.max(1, 38 / seconds)); video.playbackRate = video.defaultPlaybackRate; android.appendChild(video); }
    else { const shots = element('div', 'shots'); DATA.androidShots.forEach(function addShot(source) { const shot = document.createElement('img'); shot.src = source; shots.appendChild(shot); }); android.appendChild(shots); }
    stage.appendChild(android);
  }
  root.appendChild(stage);
};
</script></body></html>`;
writeFileSync(join(demoDirectory, "film.html"), page);
process.stdout.write(`film.html written with ${scenes.length} scenes; android clip: ${androidClip ?? "none"}, screenshots: ${androidShots.length}\n`);

const SITE = "https://selvedge-dashboard.vercel.app";
const filmUrl = `file://${join(demoDirectory, "film.html")}`;
const plan = {
  url: SITE,
  timings: "build/voiceover_segments/timings.json",
  segments: [
    { goto: `${SITE}/` },
    { goto: `${SITE}/mandates/${honest.mandate}` },
    { goto: `${SITE}/proofs` },
    { goto: filmUrl, scene: 0 },
    { goto: filmUrl, scene: 1 },
    { goto: filmUrl, scene: 2 },
    { goto: `${SITE}/containment` },
    { goto: filmUrl, scene: 3 },
    { goto: filmUrl, scene: 4 },
  ],
};
writeFileSync(join(demoDirectory, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
