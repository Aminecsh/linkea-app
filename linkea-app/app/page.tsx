import Link from "next/link";
import { ArrowRight, Zap, Shield, Users } from "lucide-react";

export default function Home() {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--bg)" }}
    >
      {/* Ambient gradient blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none select-none" aria-hidden>
        <div
          className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full opacity-30"
          style={{
            background: "radial-gradient(circle, rgba(244,63,94,0.18) 0%, transparent 70%)",
            filter: "blur(60px)",
          }}
        />
        <div
          className="absolute top-1/3 -right-32 w-[420px] h-[420px] rounded-full opacity-20"
          style={{
            background: "radial-gradient(circle, rgba(139,92,246,0.20) 0%, transparent 70%)",
            filter: "blur(60px)",
          }}
        />
        <div
          className="absolute -bottom-20 left-1/3 w-[360px] h-[360px] rounded-full opacity-20"
          style={{
            background: "radial-gradient(circle, rgba(59,130,246,0.16) 0%, transparent 70%)",
            filter: "blur(60px)",
          }}
        />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-5xl mx-auto w-full">
        <span
          className="font-black text-xl tracking-tight"
          style={{ color: "var(--text)" }}
        >
          Linkea
        </span>
        <Link
          href="/connexion"
          className="btn-ghost"
          style={{ padding: "9px 18px", fontSize: 14 }}
        >
          Se connecter
        </Link>
      </nav>

      {/* Hero */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        {/* Badge */}
        <div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8"
          style={{
            background: "rgba(255,255,255,0.70)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(0,0,0,0.06)",
            boxShadow: "var(--shadow-xs)",
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: "var(--rose)" }}
          />
          <span className="text-xs font-semibold" style={{ color: "var(--muted)" }}>
            Bêta V1 · Ouvert aux étudiants
          </span>
        </div>

        {/* Title */}
        <h1
          className="text-5xl sm:text-6xl font-black tracking-tight leading-[1.05] mb-5 max-w-xl"
          style={{ color: "var(--text)" }}
        >
          De l&apos;idée au{" "}
          <span className="gradient-text">MVP</span>
          <br />en 4–8 semaines
        </h1>

        {/* Subtitle */}
        <p
          className="text-lg leading-relaxed mb-10 max-w-md"
          style={{ color: "var(--muted)" }}
        >
          La plateforme qui connecte les founders étudiants
          avec les meilleurs devs de leur promo.
        </p>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-16">
          <Link href="/inscription" className="btn-primary" style={{ fontSize: 16, padding: "15px 28px" }}>
            Créer un compte
            <ArrowRight size={17} strokeWidth={2.2} />
          </Link>
          <Link href="/connexion" className="btn-ghost" style={{ fontSize: 16, padding: "15px 28px" }}>
            Se connecter
          </Link>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl w-full">
          {[
            {
              icon: Zap,
              color: "var(--rose)",
              bg: "var(--rose-soft)",
              title: "Match rapide",
              desc: "Trouvez votre dev en 48h, pas en 2 semaines.",
            },
            {
              icon: Shield,
              color: "var(--blue)",
              bg: "var(--blue-soft)",
              title: "Contrat inclus",
              desc: "Lettre de mission générée et signée en ligne.",
            },
            {
              icon: Users,
              color: "var(--violet)",
              bg: "var(--violet-soft)",
              title: "Étudiants only",
              desc: "Une communauté de confiance, école vérifiée.",
            },
          ].map(({ icon: Icon, color, bg, title, desc }) => (
            <div
              key={title}
              className="card text-left p-5"
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                style={{ background: bg }}
              >
                <Icon size={18} strokeWidth={1.8} style={{ color }} />
              </div>
              <p className="font-bold text-sm mb-1" style={{ color: "var(--text)" }}>{title}</p>
              <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>{desc}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center pb-8">
        <p className="text-xs" style={{ color: "var(--subtle)" }}>
          © 2025 Linkea · Fait avec passion pour les builders
        </p>
      </footer>
    </div>
  );
}
