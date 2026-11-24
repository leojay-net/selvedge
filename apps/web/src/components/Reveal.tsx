"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";

const VISIBILITY_THRESHOLD = 0.15;
const STAGGER_MILLISECONDS = 80;

interface RevealProps {
  readonly children: ReactNode;
  readonly order?: number;
  readonly as?: "div" | "section" | "li";
  readonly className?: string;
}

export function Reveal({ children, order = 0, as: Element = "div", className }: RevealProps): ReactElement {
  const elementRef = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = elementRef.current;
    if (element === null) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: VISIBILITY_THRESHOLD },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const style = { "--reveal-delay": `${order * STAGGER_MILLISECONDS}ms` } as CSSProperties;
  return (
    <Element
      ref={elementRef as never}
      className={`reveal${visible ? " is-visible" : ""}${className === undefined ? "" : ` ${className}`}`}
      style={style}
    >
      {children}
    </Element>
  );
}
