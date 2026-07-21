// Cluster de 2 iPhones flottants — palette éditoriale flat.
// Pas de glass, pas de gradient, pas de glow.
import React from "react";

const C = {
  canvas:   "#F5F5F7",
  surface:  "#FFFFFF",
  ink:      "#1A2138",
  rose:     "#D4537E",
  muted:    "#8A8579",
  hairline: "#E5E5EA",
  green:    "#3F7A5E",
} as const;

function StatusBar() {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 26px 0", fontSize: 13, fontWeight: 600, color: C.ink, letterSpacing: "-0.2px" }}>
      <span>9:41</span>
      <div style={{ display: "flex", gap: 5, alignItems: "center", opacity: 0.85 }}>
        <span style={{ fontSize: 11, fontWeight: 700 }}>5G</span>
        <div style={{ width: 22, height: 11, border: `1.4px solid ${C.ink}`, borderRadius: 3, position: "relative", opacity: 0.7 }}>
          <div style={{ position: "absolute", inset: "1.5px", right: 6, background: C.ink, borderRadius: 1 }} />
        </div>
      </div>
    </div>
  );
}

function Phone({ rotate = 0, z = 1, floatClass, children }: { rotate?: number; z?: number; floatClass?: string; children: React.ReactNode }) {
  return (
    <div className={floatClass} style={{ transform: `rotate(${rotate}deg)`, zIndex: z, width: 248, flex: "0 0 auto" }}>
      <div style={{ background: "#0E1018", borderRadius: 46, padding: 9, boxShadow: "0 30px 70px rgba(26,33,56,0.18), 0 8px 20px rgba(26,33,56,0.10)" }}>
        <div style={{ background: C.canvas, borderRadius: 38, overflow: "hidden", position: "relative", height: 506 }}>
          <div style={{ position: "absolute", top: 11, left: "50%", transform: "translateX(-50%)", width: 80, height: 22, background: "#0E1018", borderRadius: 14, zIndex: 20 }} />
          {children}
        </div>
      </div>
    </div>
  );
}

function ScreenMatch() {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <StatusBar />
      <div style={{ padding: "30px 22px 0", flex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", color: C.rose, textTransform: "uppercase" }}>
          Match trouvé
        </div>
        <h3 style={{ fontFamily: "var(--font-sans)", fontSize: 25, lineHeight: 1.12, fontWeight: 600, color: C.ink, margin: "10px 0 0", letterSpacing: "-0.4px" }}>
          Wandr · app rando
        </h3>

        <div style={{ marginTop: 22, background: C.surface, border: `1px solid ${C.hairline}`, borderRadius: 18, padding: "20px 18px", display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 46, fontWeight: 600, color: C.ink, lineHeight: 1 }}>
            92<span style={{ fontSize: 24, color: C.rose }}>%</span>
          </span>
          <span style={{ fontSize: 13, color: C.muted, lineHeight: 1.3 }}>
            de compatibilité<br />avec ton profil
          </span>
        </div>

        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>Équipe proposée</div>
          {[
            { role: "Dev",    name: "Amine K.", c: "#2E5E8C" },
            { role: "Design", name: "Léa R.",   c: C.rose    },
            { role: "PM",     name: "Sofia T.", c: C.green   },
          ].map((p) => (
            <div key={p.role} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.hairline}` }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: p.c, color: "#fff", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {p.name.charAt(0)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{p.name}</div>
              </div>
              <div style={{ fontSize: 11, color: C.muted }}>{p.role}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "0 22px 26px" }}>
        <div style={{ background: C.ink, color: "#fff", textAlign: "center", padding: "14px", borderRadius: 13, fontSize: 14, fontWeight: 600 }}>
          Voir l&apos;équipe
        </div>
      </div>
    </div>
  );
}

function ScreenBuild() {
  const steps = [
    { label: "Dépose", done: true,  active: false },
    { label: "Match",  done: true,  active: false },
    { label: "Build",  done: false, active: true  },
  ];
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <StatusBar />
      <div style={{ padding: "30px 22px 0", flex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", color: C.muted, textTransform: "uppercase" }}>
          Mon projet
        </div>
        <h3 style={{ fontFamily: "var(--font-sans)", fontSize: 25, lineHeight: 1.12, fontWeight: 600, color: C.ink, margin: "10px 0 0", letterSpacing: "-0.4px" }}>
          Studio Émeraude
        </h3>

        <div style={{ marginTop: 26, display: "flex" }}>
          {steps.map((s, i) => (
            <div key={s.label} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ display: "flex", alignItems: "center" }}>
                <div style={{ flex: 1, height: 2, background: i === 0 ? "transparent" : C.rose }} />
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: s.done ? C.rose : C.surface, border: s.done ? "none" : `2px solid ${C.rose}`, color: "#fff", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {s.done ? "✓" : ""}
                </div>
                <div style={{ flex: 1, height: 2, background: i === steps.length - 1 ? "transparent" : C.rose }} />
              </div>
              <div style={{ fontSize: 12, marginTop: 8, fontWeight: s.active ? 700 : 500, color: s.active ? C.ink : C.muted }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 28, background: C.surface, border: `1px solid ${C.hairline}`, borderRadius: 18, padding: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 13, color: C.muted }}>MVP en cours</span>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 600, color: C.ink }}>Sem. 3 / 6</span>
          </div>
          <div style={{ marginTop: 12, height: 8, borderRadius: 5, background: C.hairline, overflow: "hidden" }}>
            <div style={{ width: "50%", height: "100%", background: C.rose }} />
          </div>
        </div>

        <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
          {[{ n: "3", l: "membres" }, { n: "12", l: "tâches livrées" }].map((s) => (
            <div key={s.l} style={{ flex: 1, background: C.surface, border: `1px solid ${C.hairline}`, borderRadius: 14, padding: "14px 16px" }}>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: 24, fontWeight: 600, color: C.ink }}>{s.n}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function HeroMockups() {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
      <style>{`
        @keyframes lk-floatA { 0%,100%{transform:rotate(-6deg) translateY(0)} 50%{transform:rotate(-6deg) translateY(-14px)} }
        @keyframes lk-floatB { 0%,100%{transform:rotate(3deg) translateY(0)} 50%{transform:rotate(3deg) translateY(-10px)} }
        .lk-floatA { animation: lk-floatA 7s ease-in-out infinite; }
        .lk-floatB { animation: lk-floatB 8s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .lk-floatA { animation: none; transform: rotate(-6deg); }
          .lk-floatB { animation: none; transform: rotate(3deg); }
        }
      `}</style>

      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ marginRight: -56, marginTop: 48 }}>
          <Phone rotate={3} z={1} floatClass="lk-floatB"><ScreenBuild /></Phone>
        </div>
        <Phone rotate={-6} z={3} floatClass="lk-floatA"><ScreenMatch /></Phone>

        {/* Notification flottante — seul accent ludique */}
        <div style={{ position: "absolute", top: -8, right: -28, zIndex: 5, background: C.surface, border: `1px solid ${C.hairline}`, borderRadius: 14, padding: "11px 15px", boxShadow: "0 14px 34px rgba(26,33,56,0.14)", display: "flex", alignItems: "center", gap: 9, transform: "rotate(-4deg)" }}>
          <div style={{ width: 22, height: 22, borderRadius: "50%", background: C.rose, color: "#fff", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Projet matché</div>
            <div style={{ fontSize: 11, color: C.muted }}>il y a 2 min</div>
          </div>
        </div>
      </div>
    </div>
  );
}
