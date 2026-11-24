import type { ReactElement } from "react";

const GATE_LABELS: ReadonlyArray<{ readonly label: string; readonly x: number }> = [
  { label: "Engine policy", x: 190 },
  { label: "Mandate program", x: 320 },
  { label: "Biometric", x: 450 },
];

export function GateDiagram(): ReactElement {
  return (
    <figure className="gate-diagram">
      <svg viewBox="0 0 600 260" role="img" aria-labelledby="gate-diagram-title gate-diagram-description">
        <title id="gate-diagram-title">Two requests meet three gates</title>
        <desc id="gate-diagram-description">
          A request inside the mandate passes the engine policy, the mandate program and the biometric gate and reaches its payee. A request to an unlisted payee is stopped at the mandate program.
        </desc>
        <line className="gate-lane" x1="60" y1="90" x2="540" y2="90" />
        <line className="gate-lane" x1="60" y1="190" x2="540" y2="190" />
        {GATE_LABELS.map((gate, gateIndex) => (
          <g key={gate.label} className="gate" style={{ ["--gate-index" as string]: gateIndex }}>
            <rect x={gate.x - 5} y="46" width="10" height="188" rx="5" className="gate-bar" />
            <text x={gate.x} y="30" textAnchor="middle" className="gate-label">
              {gate.label}
            </text>
          </g>
        ))}
        <circle cx="60" cy="90" r="9" className="dot-allowed" />
        <circle cx="60" cy="190" r="9" className="dot-blocked" />
        <g className="payee-mark">
          <circle cx="540" cy="90" r="14" />
          <path d="M533 90 l5 5 l10 -10" />
        </g>
        <g className="blocked-mark">
          <path d="M310 180 l20 20 M330 180 l-20 20" />
        </g>
        <text x="60" y="124" textAnchor="middle" className="gate-caption">
          In the mandate
        </text>
        <text x="60" y="226" textAnchor="middle" className="gate-caption">
          Unlisted payee
        </text>
      </svg>
    </figure>
  );
}
