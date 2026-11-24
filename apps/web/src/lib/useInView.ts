"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

const DEFAULT_THRESHOLD = 0.35;

export function useInView<ElementType extends HTMLElement>(threshold: number = DEFAULT_THRESHOLD): readonly [RefObject<ElementType | null>, boolean] {
  const elementRef = useRef<ElementType | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const element = elementRef.current;
    if (element === null) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [threshold]);

  return [elementRef, inView] as const;
}
