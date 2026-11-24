"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactElement } from "react";
import { Icon, type IconName } from "./Icons";

const NAVIGATION: ReadonlyArray<{ readonly href: string; readonly label: string; readonly icon: IconName }> = [
  { href: "/", label: "Overview", icon: "overview" },
  { href: "/agents", label: "Agents", icon: "agents" },
  { href: "/activity", label: "Activity", icon: "activity" },
  { href: "/containment", label: "Containment", icon: "containment" },
  { href: "/proofs", label: "Proofs", icon: "proofs" },
  { href: "/download", label: "Get the app", icon: "agents" },
];

function isCurrent(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`) || (href === "/agents" && pathname.startsWith("/mandates"));
}

export function NavLinks(): ReactElement {
  const pathname = usePathname();
  return (
    <nav className="site-nav" aria-label="Primary">
      <ul>
        {NAVIGATION.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="nav-link" aria-current={isCurrent(pathname, item.href) ? "page" : undefined}>
              <Icon name={item.icon} small />
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
