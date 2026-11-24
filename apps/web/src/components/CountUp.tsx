"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";

const COUNT_UP_DURATION_MILLISECONDS = 1100;

interface CountUpProps {
  readonly value: number;
  readonly decimals?: number;
  readonly suffix?: string;
}

function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

export function CountUp({ value, decimals = 0, suffix = "" }: CountUpProps): ReactElement {
  const [displayed, setDisplayed] = useState(value);
  const elementRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (element === null || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    let frameHandle = 0;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      const startedAt = performance.now();
      const step = (now: number): void => {
        const progress = Math.min(1, (now - startedAt) / COUNT_UP_DURATION_MILLISECONDS);
        setDisplayed(value * easeOutCubic(progress));
        if (progress < 1) frameHandle = requestAnimationFrame(step);
      };
      setDisplayed(0);
      frameHandle = requestAnimationFrame(step);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frameHandle);
    };
  }, [value]);

  return (
    <span ref={elementRef} className="count-up">
      <span aria-hidden="true">
        {displayed.toFixed(decimals)}
        {suffix}
      </span>
      <span className="visually-hidden">
        {value.toFixed(decimals)}
        {suffix}
      </span>
    </span>
  );
}
