import Link from "next/link";
import Image from "next/image";
import { FileText } from "lucide-react";
import HeroMockups from "@/components/HeroMockups";
import StatCounter from "@/components/StatCounter";

const C = { ink: "#1A2138", rose: "#D4537E", muted: "#8A8579", hairline: "#E5E5EA", canvas: "#F5F5F7", surface: "#FFFFFF" };

export default function Home() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: C.canvas, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <style>{`
        .lk-cta-primary {
          transition: background-color 150ms ease;
        }
        .lk-cta-primary:hover {
          background-color: #2A3252;
        }
        .lk-cta-primary:hover .lk-arrow {
          transform: translateX(3px);
        }
        .lk-cta-primary:focus-visible {
          outline: 2px solid #D4537E;
          outline-offset: 3px;
        }
        .lk-arrow {
          display: inline-block;
          transition: transform 150ms ease;
        }
        .lk-cta-secondary {
          transition: border-color 150ms ease;
        }
        .lk-cta-secondary:focus-visible {
          outline: 2px solid #D4537E;
          outline-offset: 3px;
        }
      `}</style>

      {/* Nav */}
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 48px", maxWidth: 1200, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
        <Image src="/logo.png" alt="Linkea" width={74} height={34} style={{ objectFit: "contain", height: 34, width: "auto" }} priority />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link href="/connexion" style={{ padding: "9px 18px", fontSize: 14, fontWeight: 600, borderRadius: 10, color: C.ink, textDecoration: "none", border: `1.5px solid ${C.hairline}`, background: "transparent" }}>
            Se connecter
          </Link>
          <Link href="/inscription" style={{ padding: "9px 20px", fontSize: 14, fontWeight: 600, borderRadius: 10, color: "#fff", textDecoration: "none", background: C.rose }}>
            Commencer
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main style={{ flex: 1, maxWidth: 1200, margin: "0 auto", padding: "40px 48px 80px", width: "100%", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 60 }}>

          {/* Left */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontFamily: "var(--font-sans)", fontSize: "clamp(36px, 4.5vw, 58px)", fontWeight: 600, letterSpacing: "-0.035em", lineHeight: 1.05, color: C.ink, margin: "0 0 20px" }}>
              Ton projet mérite<br />le bon développeur
            </h1>

            <p style={{ fontSize: 17, lineHeight: 1.65, color: C.muted, margin: "0 0 8px", maxWidth: 440 }}>
              Linkea connecte vos projets digitaux avec des développeurs étudiants motivés et vérifiés.
            </p>
            <p style={{ fontSize: 14, color: C.muted, margin: "0 0 40px", maxWidth: 400, opacity: 0.75 }}>
              Startup, PME, équipe interne ou projet solo.
            </p>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 52 }}>
              <Link href="/inscription?role=founder" className="lk-cta-primary" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 28px", fontSize: 15, fontWeight: 600, borderRadius: 12, color: "#fff", textDecoration: "none", background: C.rose }}>
                Déposer un projet <span className="lk-arrow">→</span>
              </Link>
              <Link href="/inscription?role=developer" className="lk-cta-secondary" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 28px", fontSize: 15, fontWeight: 600, borderRadius: 12, color: C.ink, textDecoration: "none", background: C.surface, border: `1px solid ${C.rose}` }}>
                Je suis développeur
              </Link>
            </div>

            <StatCounter items={[
              { n: 156, label: "projets lancés" },
              { n: 214, label: "devs actifs" },
              { n: 24,  suffix: "h", label: "délai de match" },
            ]} />
          </div>

          {/* Right — mockups iPhone */}
          <div className="hidden lg:block" style={{ flexShrink: 0 }}>
            <HeroMockups />
          </div>
        </div>

        {/* Bento features */}
        <div style={{ marginTop: 96 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>

            {/* Grande card */}
            <div style={{ background: C.surface, border: `1.5px solid ${C.hairline}`, borderRadius: 18, padding: "44px 48px" }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", color: C.rose, textTransform: "uppercase", marginBottom: 16 }}>
                Comment ça marche
              </p>
              <h2 style={{ fontFamily: "var(--font-sans)", fontSize: 30, fontWeight: 600, color: C.ink, letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 36px" }}>
                De l&apos;idée au MVP,<br />en quelques semaines
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {[
                  { n: "01", title: "Déposez votre projet", desc: "Décrivez le contexte, la stack souhaitée et la deadline. 5 minutes." },
                  { n: "02", title: "Recevez des profils dès le lendemain", desc: "Des développeurs étudiants candidatent dans les 24h. Vous choisissez." },
                  { n: "03", title: "Construisez ensemble", desc: "Contrat signé, gestion de projet et livrables inclus." },
                ].map(({ n, title, desc }) => (
                  <div key={n} style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: C.rose, flexShrink: 0, marginTop: 2, letterSpacing: "0.02em" }}>{n}</span>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: C.ink, margin: "0 0 4px" }}>{title}</p>
                      <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.55, margin: 0 }}>{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Petites cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ flex: 1, background: C.surface, border: `1.5px solid ${C.hairline}`, borderRadius: 18, padding: "28px 30px" }}>
                <FileText size={18} strokeWidth={1.5} style={{ color: C.ink, marginBottom: 18 }} />
                <p style={{ fontSize: 14, fontWeight: 700, color: C.ink, margin: "0 0 6px" }}>Contrat inclus</p>
                <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.55, margin: 0 }}>Lettre de mission générée et signée en ligne, sans friction.</p>
              </div>

              <div style={{ flex: 1, background: C.surface, border: `1.5px solid ${C.hairline}`, borderRadius: 18, padding: "28px 30px" }}>
                <p style={{ fontFamily: "var(--font-sans)", fontSize: 44, fontWeight: 600, color: C.rose, lineHeight: 1, margin: "0 0 10px" }}>24h</p>
                <p style={{ fontSize: 14, fontWeight: 700, color: C.ink, margin: "0 0 6px" }}>Délai moyen de match</p>
                <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.55, margin: 0 }}>Les devs candidatent dès le lendemain de la publication.</p>
              </div>
            </div>

          </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={{ padding: "24px 48px", borderTop: `1.5px solid ${C.hairline}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 20 }}>
        <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>© 2026 Linkea</p>
        <span style={{ color: C.hairline }}>·</span>
        <Link href="/cgu" style={{ fontSize: 12, color: C.muted, textDecoration: "none" }}>CGU</Link>
        <span style={{ color: C.hairline }}>·</span>
        <Link href="/confidentialite" style={{ fontSize: 12, color: C.muted, textDecoration: "none" }}>Confidentialité</Link>
      </footer>
    </div>
  );
}
