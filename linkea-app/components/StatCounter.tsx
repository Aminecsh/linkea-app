"use client";
import { useEffect, useRef, useState } from "react";

function useCountUp(target: number, duration: number, start: boolean) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!start) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCount(target);
      return;
    }
    let startTime: number | null = null;
    const step = (ts: number) => {
      if (!startTime) startTime = ts;
      const p = Math.min((ts - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setCount(Math.floor(eased * target));
      if (p < 1) requestAnimationFrame(step);
      else setCount(target);
    };
    requestAnimationFrame(step);
  }, [target, duration, start]);
  return count;
}

type Item = { n: number; suffix?: string; label: string };

function Counter({ n, suffix = "", label, start }: Item & { start: boolean }) {
  const count = useCountUp(n, 1400, start);
  return (
    <div>
      <p style={{ fontFamily: "var(--font-sans)", fontSize: 30, fontWeight: 600, letterSpacing: "-0.04em", color: "#1A2138", lineHeight: 1, marginBottom: 5 }}>
        {count}{suffix}
      </p>
      <p style={{ fontSize: 12, color: "#8A8579" }}>{label}</p>
    </div>
  );
}

export default function StatCounter({ items }: { items: Item[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); obs.disconnect(); }
    }, { threshold: 0.4 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ display: "flex", gap: 40 }}>
      {items.map((item) => <Counter key={item.label} {...item} start={visible} />)}
    </div>
  );
}
