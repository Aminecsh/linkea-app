"use client";

// Linkeo, la mascotte (fruit du dragon rose à piquants verts, sac à dos bleu).
// L'asset attendu : public/linkeo.png (fond transparent). Tant qu'il n'est pas là,
// on affiche une goutte de la matière Linkea — jamais un carré cassé.
//
// Trois moments et pas plus : chargement (> 1,5 s ou juste après connexion),
// état vide, célébration. Pas de Linkeo sur les écrans de travail dense.

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const C = { ink: "#1A2138", muted: "#8A8579" } as const;

// Trois poses, un fichier chacune dans public/ :
//   hello → linkeo-hello.png (il salue : chargement, accueil)
//   idle  → linkeo-idle.png  (debout : états vides)
//   jump  → linkeo-jump.png  (il saute : célébration)
// Si la pose demandée manque, on retombe sur linkeo.png, puis sur la goutte.
export type LinkeoPose = "hello" | "idle" | "jump";
const POSE_SRC: Record<LinkeoPose, string> = { hello: "/linkeo-hello.png", idle: "/linkeo-idle.png", jump: "/linkeo-jump.png" };

export function LinkeoMark({ size = 96, pose = "idle", animate = false, className }: { size?: number; pose?: LinkeoPose; animate?: boolean; className?: string }) {
  const [src, setSrc] = useState<string | null>(POSE_SRC[pose]);
  const broken = src === null;
  const onError = () => setSrc((cur) => (cur === "/linkeo.png" ? null : "/linkeo.png"));
  return (
    <div className={cn(animate && "lk-breathe", className)} style={{ width: size, height: size, position: "relative", flexShrink: 0 }}>
      {broken ? (
        <div className="lk-mat lk-mat-rose" style={{ width: size, height: size, borderRadius: "58% 42% 55% 45% / 52% 48% 52% 48%", boxShadow: "0 16px 36px rgba(212,83,126,0.28), inset 0 -8px 20px rgba(60,30,120,0.18)" }}>
          <div className="lk-mat-hi" style={{ width: size * 0.7, height: size * 0.7, left: -size * 0.1, top: -size * 0.18 }} />
          <div className="lk-mat-grain" />
        </div>
      ) : (
        <img
          src={src}
          alt="Linkeo"
          width={size}
          height={size}
          onError={onError}
          style={{ width: size, height: size, objectFit: "contain", display: "block", filter: "drop-shadow(0 14px 24px rgba(212,83,126,0.22))" }}
        />
      )}
    </div>
  );
}

// Passe à true après `ms` — pour ne montrer Linkeo que si le chargement traîne.
export function useDelayed(ms = 1500) {
  const [on, setOn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setOn(true), ms); return () => clearTimeout(t); }, [ms]);
  return on;
}

export function LinkeoLoader({ label = "Ça charge…", sublabel = "Linkeo prépare ton espace", fullscreen = true }: {
  label?: string; sublabel?: string; fullscreen?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(fullscreen && "fixed inset-0 z-[80]")}
      style={{ background: C.ink, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22, minHeight: fullscreen ? undefined : 320, borderRadius: fullscreen ? 0 : 22, position: fullscreen ? undefined : "relative", overflow: "hidden" }}
    >
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(60% 50% at 50% 60%, rgba(154,91,216,0.30), rgba(26,33,56,0) 70%)", pointerEvents: "none" }} />
      <LinkeoMark size={120} pose="hello" animate />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, position: "relative" }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#fff", letterSpacing: "-0.02em" }}>{label}</span>
        <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.55)" }}>{sublabel}</span>
      </div>
    </div>
  );
}

export function LinkeoEmpty({ title, text, action }: { title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, padding: "56px 24px", textAlign: "center" }}>
      <LinkeoMark size={128} pose="idle" />
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 380 }}>
        <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.025em", color: C.ink }}>{title}</span>
        {text && <span style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.5 }}>{text}</span>}
      </div>
      {action}
    </div>
  );
}
