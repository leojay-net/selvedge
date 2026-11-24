import type { ReactElement } from "react";

export type IconName =
  | "overview"
  | "agents"
  | "mandate"
  | "activity"
  | "proofs"
  | "containment"
  | "wallet"
  | "revoke"
  | "external"
  | "alert"
  | "check"
  | "refresh"
  | "inbox"
  | "plug";

const ICON_PATHS: Readonly<Record<IconName, ReactElement>> = {
  overview: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <path d="M13.5 17h7M17 13.5v7" />
    </>
  ),
  agents: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
    </>
  ),
  mandate: (
    <>
      <path d="M6 3.5h9l3.5 3.5v13.5H6z" />
      <path d="M14.5 3.5V7.5h4M9 12h6M9 16h6" />
    </>
  ),
  activity: <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />,
  proofs: (
    <>
      <path d="M12 3l7.5 3v5.5c0 4.4-3 8-7.5 9.5-4.5-1.5-7.5-5.1-7.5-9.5V6z" />
      <path d="M8.5 12l2.5 2.5 4.5-5" />
    </>
  ),
  containment: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 12h16M9 4v8M15 12v8" />
    </>
  ),
  wallet: (
    <>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H19v14H6.5A2.5 2.5 0 0 1 4 16.5z" />
      <path d="M19 9.5h-4.5a2 2 0 0 0 0 4H19" />
    </>
  ),
  revoke: (
    <>
      <path d="M12 3.5v8" />
      <path d="M7 6.8a7.5 7.5 0 1 0 10 0" />
    </>
  ),
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  alert: (
    <>
      <path d="M12 3.5l9 16H3z" />
      <path d="M12 10v4.5M12 17.5v.01" />
    </>
  ),
  check: <path d="M4.5 12.5l5 5 10-11" />,
  refresh: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 4v4.5H15" />
    </>
  ),
  inbox: (
    <>
      <path d="M4 13l2.5-8h11L20 13v6H4z" />
      <path d="M4 13h5l1 2.5h4l1-2.5h5" />
    </>
  ),
  plug: (
    <>
      <path d="M9 3.5v5M15 3.5v5" />
      <path d="M6.5 8.5h11v3.5a5.5 5.5 0 0 1-11 0z" />
      <path d="M12 17.5v3" />
    </>
  ),
};

interface IconProps {
  readonly name: IconName;
  readonly small?: boolean;
}

export function Icon({ name, small = false }: IconProps): ReactElement {
  return (
    <svg className={small ? "icon icon-sm" : "icon"} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {ICON_PATHS[name]}
    </svg>
  );
}
