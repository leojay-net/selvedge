import type { ReactElement, ReactNode } from "react";
import { Icon, type IconName } from "./Icons";

interface StateProps {
  readonly title: string;
  readonly children: ReactNode;
  readonly icon?: IconName;
  readonly action?: ReactNode;
}

export function EmptyState({ title, children, icon = "inbox", action }: StateProps): ReactElement {
  return (
    <section className="state" aria-label={title}>
      <Icon name={icon} />
      <h2>{title}</h2>
      <p className="page-lead">{children}</p>
      {action}
    </section>
  );
}

export function ErrorState({ title, children, action }: Omit<StateProps, "icon">): ReactElement {
  return (
    <section className="state state-error" role="alert" aria-label={title}>
      <Icon name="alert" />
      <h2>{title}</h2>
      <p className="page-lead">{children}</p>
      {action}
    </section>
  );
}

export function LoadingBlock({ label }: { readonly label: string }): ReactElement {
  return (
    <div role="status" aria-live="polite" className="stack">
      <span className="visually-hidden">{label}</span>
      <div className="skeleton" style={{ height: 32, width: "40%" }} />
      <div className="skeleton" style={{ height: 120 }} />
      <div className="skeleton" style={{ height: 120 }} />
    </div>
  );
}
