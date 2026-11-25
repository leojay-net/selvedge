/**
 * The pitch half of the video: five animated scenes rendered as one local page.
 * record-demo.mjs calls window.playScene(index, seconds) as each narration paragraph starts.
 */

const SCENES = [
  `<section class="scene" data-scene="0">
    <p class="eyebrow">The shift</p>
    <h1>Agents now pay on their own.</h1>
    <div class="flow">
      <div class="node node-agent">Agent</div>
      <div class="wire"><span class="coin"></span><span class="coin"></span><span class="coin"></span></div>
      <ul class="sellers">
        <li class="card rise" style="--order:1"><strong>Data</strong><span>0.02 USDC per call</span></li>
        <li class="card rise" style="--order:2"><strong>Compute</strong><span>0.40 USDC per job</span></li>
        <li class="card rise" style="--order:3"><strong>Other agents</strong><span>1.10 USDC per task</span></li>
      </ul>
    </div>
    <p class="note rise" style="--order:4">x402 on Solana: a payment settles in about a second.</p>
  </section>`,
  `<section class="scene" data-scene="1">
    <p class="eyebrow">The problem</p>
    <h1>Today there are two bad choices.</h1>
    <div class="choices">
      <div class="card choice choice-danger rise" style="--order:1">
        <span class="choice-tag">Option one</span>
        <h2>Hand the agent your keys</h2>
        <p>One poisoned web page, and the wallet is drained.</p>
        <div class="drain"><span></span></div>
      </div>
      <div class="card choice rise" style="--order:3">
        <span class="choice-tag">Option two</span>
        <h2>Approve every payment</h2>
        <p>Safe, but the agent is no longer autonomous.</p>
        <div class="queue"><span></span><span></span><span></span><span></span></div>
      </div>
    </div>
  </section>`,
  `<section class="scene" data-scene="2">
    <p class="eyebrow">The answer</p>
    <h1>Selvedge: a mandate on Solana.</h1>
    <div class="mandate-layout">
      <div class="card mandate rise" style="--order:1">
        <div class="mandate-head"><strong>Scout</strong><span class="pill">Active</span></div>
        <dl>
          <div><dt>Cap</dt><dd>25 USDC per day</dd></div>
          <div><dt>May pay</dt><dd>Supplier only</dd></div>
          <div><dt>Expires</dt><dd>in 30 days</dd></div>
          <div><dt>Kill switch</dt><dd>one click</dd></div>
        </dl>
      </div>
      <div class="zones">
        <div class="zone zone-inside rise" style="--order:3"><strong>Inside the mandate</strong><span>The agent works freely, no approvals.</span></div>
        <div class="zone zone-outside rise" style="--order:5"><strong>Outside the mandate</strong><span>Impossible, even for a compromised agent.</span></div>
      </div>
    </div>
  </section>`,
  `<section class="scene" data-scene="3">
    <p class="eyebrow">Who it is for</p>
    <h1>Autonomy without giving away the keys.</h1>
    <ul class="audiences">
      <li class="card rise" style="--order:1"><strong>People</strong><span>Hand chores to an assistant that can pay, but only up to the limit you set.</span></li>
      <li class="card rise" style="--order:2"><strong>Teams</strong><span>Run procurement and trading bots with hard caps and a kill switch.</span></li>
      <li class="card rise" style="--order:3"><strong>Services</strong><span>Sell to agents over x402 and get paid from a mandate, not a loose key.</span></li>
    </ul>
  </section>`,
  `<section class="scene" data-scene="4">
    <p class="eyebrow">How it holds</p>
    <h1>Three independent gates.</h1>
    <ol class="gates">
      <li class="card rise" style="--order:1"><span class="gate-number">1</span><strong>Policy check</strong><span>Inside the agent. Refuses before a transaction is built.</span></li>
      <li class="card rise" style="--order:3"><span class="gate-number">2</span><strong>Mandate program</strong><span>On Solana, proven with Kani. The final authority.</span></li>
      <li class="card rise" style="--order:5"><span class="gate-number">3</span><strong>Your fingerprint</strong><span>On your phone, for anything dangerous.</span></li>
    </ol>
  </section>`,
];

const STYLE = `
:root { --primary: #1e3a5f; --on-primary: #fff; --n0: #fff; --n50: #f5f3ee; --n100: #ebe8e1; --n300: #c9c5ba; --n500: #6b675c; --n900: #1b1a17;
  --safe: #2e6b4f; --safe-tint: #e6f0ea; --danger: #b3261e; --danger-tint: #f8e4e2; --ease: cubic-bezier(0.2, 0.7, 0.2, 1); --spring: cubic-bezier(0.34, 1.4, 0.5, 1); }
* { box-sizing: border-box; }
body { margin: 0; height: 100vh; overflow: hidden; background: var(--n50); color: var(--n900); font-family: "Inter", sans-serif; }
.scene { position: absolute; inset: 0; padding: 96px 140px 120px; display: none; flex-direction: column; gap: 20px; }
.scene.is-active { display: flex; }
.eyebrow { margin: 0; font-size: 15px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--primary); animation: rise 500ms var(--ease) both; }
h1 { margin: 0 0 28px; font-family: "Fraunces", serif; font-size: 60px; line-height: 1.05; max-width: 20ch; animation: rise 600ms var(--ease) 80ms both; }
h2 { margin: 0; font-family: "Fraunces", serif; font-size: 30px; }
.card { background: var(--n0); border: 1px solid var(--n300); border-radius: 16px; padding: 28px; }
.rise { animation: rise 600ms var(--ease) calc(var(--order, 0) * 260ms + 300ms) both; }
@keyframes rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
.note { margin: 12px 0 0; font-size: 22px; color: var(--n500); }
.flow { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 28px; }
.node-agent { width: 150px; height: 150px; border-radius: 28px; background: var(--primary); color: var(--on-primary); display: grid; place-items: center; font-size: 24px; font-weight: 600; animation: rise 500ms var(--spring) 200ms both; }
.wire { position: relative; height: 4px; background: repeating-linear-gradient(90deg, var(--n300) 0 10px, transparent 10px 18px); }
.coin { position: absolute; top: -9px; left: 0; width: 22px; height: 22px; border-radius: 50%; background: var(--safe); animation: travel 1600ms var(--ease) both; }
.coin:nth-child(2) { animation-delay: 700ms; } .coin:nth-child(3) { animation-delay: 1400ms; }
@keyframes travel { from { left: 0; opacity: 0; } 15% { opacity: 1; } to { left: calc(100% - 22px); opacity: 0; } }
.sellers { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; width: 340px; }
.sellers li, .audiences li, .gates li { display: grid; gap: 6px; }
.sellers strong, .audiences strong, .gates strong, .zone strong { font-size: 22px; }
.sellers span, .audiences span, .gates span, .zone span, .choice p { font-size: 19px; line-height: 1.45; color: var(--n500); }
.choices { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
.choice { display: grid; gap: 14px; }
.choice p { margin: 0; }
.choice-tag { font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--n500); }
.choice-danger { border-color: var(--danger); background: var(--danger-tint); }
.choice-danger .choice-tag, .choice-danger p { color: var(--danger); }
.drain { height: 14px; border-radius: 7px; background: var(--n0); overflow: hidden; }
.drain span { display: block; height: 100%; background: var(--danger); animation: drain 2600ms var(--ease) 1300ms both; }
@keyframes drain { from { width: 100%; } to { width: 0%; } }
.queue { display: flex; gap: 10px; }
.queue span { flex: 1; height: 14px; border-radius: 7px; background: var(--n100); animation: wait 900ms ease-in-out 2200ms 3 alternate both; }
.queue span:nth-child(2) { animation-delay: 2400ms; } .queue span:nth-child(3) { animation-delay: 2600ms; } .queue span:nth-child(4) { animation-delay: 2800ms; }
@keyframes wait { from { background: var(--n100); } to { background: var(--n300); } }
.mandate-layout { display: grid; grid-template-columns: 420px 1fr; gap: 40px; align-items: center; }
.mandate { border: 2px solid var(--primary); }
.mandate-head { display: flex; justify-content: space-between; align-items: center; font-size: 26px; margin-bottom: 18px; }
.pill { font-size: 15px; font-weight: 600; padding: 4px 12px; border-radius: 999px; background: var(--safe-tint); color: var(--safe); }
dl { margin: 0; display: grid; gap: 14px; }
dl div { display: flex; justify-content: space-between; border-top: 1px solid var(--n100); padding-top: 12px; font-size: 19px; }
dt { color: var(--n500); } dd { margin: 0; font-weight: 600; }
.zones { display: grid; gap: 20px; }
.zone { border-radius: 16px; padding: 26px 28px; display: grid; gap: 6px; }
.zone-inside { background: var(--safe-tint); } .zone-inside strong { color: var(--safe); }
.zone-outside { background: var(--danger-tint); } .zone-outside strong { color: var(--danger); }
.audiences, .gates { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px; }
.gate-number { width: 44px; height: 44px; border-radius: 50%; background: var(--primary); color: var(--on-primary) !important; display: grid; place-items: center; font-weight: 600; margin-bottom: 8px; }
.gates li { border-top: 4px solid var(--primary); }
`;

export function buildPitchPage(fontDirectory) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Selvedge</title>
<style>
@font-face { font-family: "Fraunces"; src: url("file://${fontDirectory}/fraunces-latin-wght-normal.woff2") format("woff2"); font-weight: 100 900; }
@font-face { font-family: "Inter"; src: url("file://${fontDirectory}/inter-latin-wght-normal.woff2") format("woff2"); font-weight: 100 900; }
${STYLE}
</style>
</head>
<body>
${SCENES.join("\n")}
<script>
window.playScene = function playScene(sceneIndex) {
  document.querySelectorAll(".scene").forEach(function showOnlyCurrent(scene) {
    scene.classList.toggle("is-active", Number(scene.dataset.scene) === sceneIndex);
  });
};
</script>
</body>
</html>
`;
}

export const PITCH_SCENE_COUNT = SCENES.length;
