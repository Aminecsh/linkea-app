"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import BanModal from "@/components/BanModal";

// ── Types ───────────────────────────────────────────────────────────────────
type Project = { id: string; titre: string; description: string; stack_souhaitee: string; deadline: string; statut: string; created_at: string; profiles_founder: { nom: string; ecole: string }; };
type Founder  = { id: string; user_id: string; nom: string; email: string; ecole: string; linkedin: string; budget: string; created_at: string; };
type Developer = { id: string; user_id: string; nom: string; email: string; ecole: string; competences: string[]; dispo_heures_semaine: number; github: string; linkedin: string; created_at: string; };
type Match    = { id: string; statut: string; created_at: string; projects: { titre: string; statut: string }; profiles_developer: { nom: string; ecole: string }; };
type Report   = { id: string; reporter_id: string; target_type: string; target_id: string; target_nom?: string; raison: string; description?: string; statut: "pending" | "resolu" | "ignore"; created_at: string; };
type SupportConv = { id: string; user_id: string; created_at: string; nom?: string; role?: string; lastMessage?: string; unreadCount: number; };
type ActiveBan   = { id: string; user_id: string; type: "temp" | "permanent"; raison: string; expires_at: string | null; created_at: string; nom?: string; role?: string; };
type Dispute     = { id: string; payment_id: string; status: "open" | "resolved_founder" | "resolved_dev"; reason: string; created_at: string; amount?: number; dev_amount?: number; founderNom?: string; devNom?: string; founderConvId?: string; devConvId?: string; };
type Tab = "analytics" | "projets" | "founders" | "developers" | "matchings" | "signalements" | "bans" | "support" | "litiges";

const C = { ink: "#1A2138", rose: "#D4537E", muted: "#8A8579", hairline: "#ECE7DD", canvas: "#FAF8F4", surface: "#FFFFFF" };

const STATUTS = ["pending", "matched", "en_cours", "livre", "suspendu"];
const statutLabels: Record<string, string> = { pending: "En attente", matched: "Matchée", en_cours: "En cours", livre: "Livré", suspendu: "Suspendu" };
const RAISON_LABELS: Record<string, string> = { spam: "Spam", faux_profil: "Faux profil", contenu_inapproprie: "Contenu inapproprié", arnaque: "Arnaque", autre: "Autre" };

// ── Composant ────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("analytics");
  const [projects,    setProjects]    = useState<Project[]>([]);
  const [founders,    setFounders]    = useState<Founder[]>([]);
  const [developers,  setDevelopers]  = useState<Developer[]>([]);
  const [matches,     setMatches]     = useState<Match[]>([]);
  const [reports,     setReports]     = useState<Report[]>([]);
  const [activeBans,  setActiveBans]  = useState<ActiveBan[]>([]);
  const [supportConvs,setSupportConvs]= useState<SupportConv[]>([]);
  const [disputes,    setDisputes]    = useState<Dispute[]>([]);
  const [resolvingDispute, setResolvingDispute] = useState<string | null>(null);
  const [disputeNote, setDisputeNote] = useState<Record<string, string>>({});
  const [loading,      setLoading]     = useState(true);
  const [updatingId,   setUpdatingId]  = useState<string | null>(null);
  const [filterReport, setFilterReport]= useState<"all" | "pending" | "resolu" | "ignore">("pending");
  const [adminId,      setAdminId]     = useState<string | null>(null);
  const [banTarget,    setBanTarget]   = useState<{ userId: string; nom: string } | null>(null);
  const [liftingBan,   setLiftingBan]  = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }
      setAdminId(user.id);
      const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      if (roleData?.role !== "admin") { router.push("/projets"); return; }

      // 2FA obligatoire pour l'accès admin : refuse l'accès si le compte n'a pas
      // de facteur TOTP vérifié, ou si la session actuelle n'a pas passé le challenge (AAL2).
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
        router.push("/parametres?mfa_required=1");
        return;
      }
      if (aal?.nextLevel !== "aal2") {
        router.push("/parametres?mfa_setup_required=1");
        return;
      }

      const [{ data: projs }, { data: founds }, { data: devs }, { data: matchData }, { data: reportsData }, { data: bansData }] = await Promise.all([
        supabase.from("projects").select("*, profiles_founder(nom, ecole)").order("created_at", { ascending: false }),
        supabase.from("profiles_founder").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles_developer").select("*").order("created_at", { ascending: false }),
        supabase.from("candidatures").select("id, statut, created_at, projects(titre, statut), profiles_developer(nom, ecole)").eq("statut", "accepted").order("created_at", { ascending: false }),
        supabase.from("reports").select("*").order("created_at", { ascending: false }),
        supabase.from("bans").select("id, user_id, type, raison, expires_at, created_at").eq("is_active", true).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).order("created_at", { ascending: false }),
      ]);

      setProjects((projs as Project[]) ?? []);
      setFounders((founds as Founder[]) ?? []);
      setDevelopers((devs as Developer[]) ?? []);
      setMatches((matchData as unknown as Match[]) ?? []);
      setReports((reportsData as Report[]) ?? []);

      const rawBans = (bansData as ActiveBan[]) ?? [];
      if (rawBans.length > 0) {
        const uids = rawBans.map((b) => b.user_id);
        const [{ data: fP }, { data: dP }] = await Promise.all([
          supabase.from("profiles_founder").select("user_id, nom").in("user_id", uids),
          supabase.from("profiles_developer").select("user_id, nom").in("user_id", uids),
        ]);
        const nm: Record<string, { nom: string; role: string }> = {};
        (fP ?? []).forEach((p) => { nm[p.user_id] = { nom: p.nom, role: "founder" }; });
        (dP ?? []).forEach((p) => { nm[p.user_id] = { nom: p.nom, role: "developer" }; });
        setActiveBans(rawBans.map((b) => ({ ...b, nom: nm[b.user_id]?.nom, role: nm[b.user_id]?.role })));
      }

      const { data: sConvs } = await supabase.from("support_conversations").select("id, user_id, created_at").order("created_at", { ascending: false });
      if (sConvs?.length) {
        const sIds = sConvs.map((c: { user_id: string }) => c.user_id);
        const [{ data: sfP }, { data: sdP }] = await Promise.all([
          supabase.from("profiles_founder").select("user_id, nom").in("user_id", sIds),
          supabase.from("profiles_developer").select("user_id, nom").in("user_id", sIds),
        ]);
        const sNm: Record<string, { nom: string; role: string }> = {};
        (sfP ?? []).forEach((p: { user_id: string; nom: string }) => { sNm[p.user_id] = { nom: p.nom, role: "founder" }; });
        (sdP ?? []).forEach((p: { user_id: string; nom: string }) => { sNm[p.user_id] = { nom: p.nom, role: "developer" }; });
        const enriched = await Promise.all(sConvs.map(async (c: { id: string; user_id: string; created_at: string }) => {
          const { data: last } = await supabase.from("support_messages").select("content").eq("conversation_id", c.id).order("created_at", { ascending: false }).limit(1);
          const { count: unread } = await supabase.from("support_messages").select("*", { count: "exact", head: true }).eq("conversation_id", c.id).neq("sender_id", user.id).gt("created_at", "1970-01-01");
          return { ...c, nom: sNm[c.user_id]?.nom, role: sNm[c.user_id]?.role, lastMessage: last?.[0]?.content, unreadCount: unread ?? 0 };
        }));
        setSupportConvs(enriched as SupportConv[]);
      }

      // Charger les litiges
      const { data: disputesData } = await supabase
        .from("disputes")
        .select("id, project_id, payment_id, status, reason, created_at, payments(amount, dev_amount, founder_user_id, dev_user_id)")
        .order("created_at", { ascending: false });
      if (disputesData?.length) {
        // Récupérer toutes les conversations litige en une seule requête
        const projectIds = disputesData.map((d: Record<string, unknown>) => d.project_id as string).filter(Boolean);
        const { data: litigeConvs } = await supabase
          .from("conversations")
          .select("id, project_id, group_name")
          .in("project_id", projectIds)
          .eq("is_group", true)
          .like("group_name", "⚠️ Litige%");

        const convFounderMap: Record<string, string> = {};
        const convDevMap: Record<string, string> = {};
        (litigeConvs ?? []).forEach((c: { id: string; project_id: string; group_name: string }) => {
          if (c.group_name.endsWith("(Founder)")) convFounderMap[c.project_id] = c.id;
          if (c.group_name.endsWith("(Dev)"))     convDevMap[c.project_id]     = c.id;
        });

        const enrichedDisputes = await Promise.all(disputesData.map(async (d: Record<string, unknown>) => {
          const pay = d.payments as Record<string, unknown> | null;
          const founderUid = pay?.founder_user_id as string | undefined;
          const devUid     = pay?.dev_user_id     as string | undefined;
          const projectId  = d.project_id as string;
          let founderNom: string | undefined, devNom: string | undefined;
          if (founderUid) {
            const { data: fp } = await supabase.from("profiles_founder").select("nom").eq("user_id", founderUid).maybeSingle();
            founderNom = fp?.nom;
          }
          if (devUid) {
            const { data: dp } = await supabase.from("profiles_developer").select("nom").eq("user_id", devUid).maybeSingle();
            devNom = dp?.nom;
          }
          return {
            id: d.id as string,
            payment_id: d.payment_id as string,
            status: d.status as Dispute["status"],
            reason: d.reason as string,
            created_at: d.created_at as string,
            amount: pay?.amount as number | undefined,
            dev_amount: pay?.dev_amount as number | undefined,
            founderNom, devNom,
            founderConvId: convFounderMap[projectId],
            devConvId: convDevMap[projectId],
          };
        }));
        setDisputes(enrichedDisputes);
      }

      setLoading(false);
    }
    load();
  }, [router]);

  async function liftBan(banId: string, userId: string) {
    setLiftingBan(banId);
    await supabase.from("bans").update({ is_active: false }).eq("id", banId);
    await supabase.from("notifications").insert({ user_id: userId, type: "admin_unban", title: "Sanction levée", body: "Ton compte Linkea a été réactivé." });
    setActiveBans((prev) => prev.filter((b) => b.id !== banId));
    setLiftingBan(null);
  }

  async function resolveDispute(disputeId: string, decision: "resolved_founder" | "resolved_dev") {
    setResolvingDispute(disputeId);
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      await fetch(`/api/disputes/${disputeId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ decision }),
      });
    }
    setDisputes((prev) => prev.map((d) => d.id === disputeId ? { ...d, status: decision } : d));
    setResolvingDispute(null);
  }

  async function updateReportStatut(reportId: string, statut: "resolu" | "ignore") {
    await supabase.from("reports").update({ statut }).eq("id", reportId);
    setReports((prev) => prev.map((r) => r.id === reportId ? { ...r, statut } : r));
  }

  async function updateProjectStatut(projectId: string, statut: string) {
    setUpdatingId(projectId);
    await supabase.from("projects").update({ statut }).eq("id", projectId);
    setProjects((prev) => prev.map((p) => p.id === projectId ? { ...p, statut } : p));
    setUpdatingId(null);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/connexion");
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.canvas }}>
        <div style={{ width: 24, height: 24, borderRadius: "50%", border: `2px solid ${C.ink}`, borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Métriques ─────────────────────────────────────────────────────────────
  const pendingReports   = reports.filter((r) => r.statut === "pending");
  const openDisputes     = disputes.filter((d) => d.status === "open");
  const totalUsers       = founders.length + developers.length;
  const projectsMatched  = projects.filter((p) => ["matched", "en_cours", "livre"].includes(p.statut)).length;
  const projectsLivre    = projects.filter((p) => p.statut === "livre").length;
  const tauxMatch        = projects.length > 0 ? Math.round((projectsMatched / projects.length) * 100) : 0;
  const tauxCompletion   = projectsMatched > 0 ? Math.round((projectsLivre / projectsMatched) * 100) : 0;

  const recentActivity = [
    ...matches.slice(0, 5).map((m) => ({ date: m.created_at, type: "match" as const, label: "Nouveau match", sub: m.projects?.titre ?? "—", statut: m.projects?.statut ?? "" })),
    ...projects.slice(0, 4).map((p) => ({ date: p.created_at, type: "project" as const, label: "Projet publié", sub: p.titre, statut: p.statut })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);

  const urgentSupport = supportConvs.some((c) => c.unreadCount > 0);

  const tabs: { key: Tab; label: string; count?: number; urgent?: boolean }[] = [
    { key: "analytics",    label: "Vue d'ensemble" },
    { key: "projets",      label: "Projets",       count: projects.length },
    { key: "founders",     label: "Founders",      count: founders.length },
    { key: "developers",   label: "Developers",    count: developers.length },
    { key: "matchings",    label: "Matchings",     count: matches.length },
    { key: "signalements", label: "Signalements",  count: pendingReports.length, urgent: pendingReports.length > 0 },
    { key: "bans",         label: "Bans",          count: activeBans.length },
    { key: "litiges",      label: "⚠️ Litiges",   count: openDisputes.length, urgent: openDisputes.length > 0 },
    { key: "support",      label: "Support",       count: supportConvs.length, urgent: urgentSupport },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: C.canvas, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <style>{`
        .lk-tab { cursor: pointer; padding: 12px 0; margin-right: 32px; font-size: 14px; font-weight: 600; color: ${C.muted}; border-bottom: 2.5px solid transparent; white-space: nowrap; transition: color 0.12s, border-color 0.12s; background: none; border-left: none; border-right: none; border-top: none; }
        .lk-tab:hover { color: ${C.ink}; }
        .lk-tab.active { color: ${C.ink}; border-bottom-color: ${C.rose}; }
        .lk-tab:focus-visible { outline: 2px solid ${C.rose}; outline-offset: 2px; border-radius: 2px; }
        .lk-btn-ghost { cursor: pointer; padding: 9px 16px; font-size: 13px; font-weight: 600; border-radius: 9px; color: ${C.ink}; border: 1.5px solid ${C.hairline}; background: transparent; transition: border-color 0.15s; }
        .lk-btn-ghost:hover { border-color: ${C.ink}; }
        .lk-btn-ghost:focus-visible { outline: 2px solid ${C.rose}; outline-offset: 2px; }
        .lk-row:hover { background: ${C.canvas}; }
        @media (max-width: 768px) {
          .lk-kpi { flex-direction: column !important; }
          .lk-kpi-item { border-right: none !important; border-bottom: 1.5px solid ${C.hairline} !important; }
          .lk-kpi-item:last-child { border-bottom: none !important; }
          .lk-taux { grid-template-columns: 1fr !important; }
          .lk-bifold { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* HEADER */}
      <header style={{ background: C.surface, borderBottom: `1.5px solid ${C.hairline}` }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "18px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <Image src="/logo.png" alt="Linkea" width={72} height={32} style={{ objectFit: "contain", height: 30, width: "auto" }} priority />
            <div style={{ width: 1, height: 32, background: C.hairline }} />
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: C.muted, margin: "0 0 4px" }}>Admin</p>
              <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em", color: C.ink, margin: 0, lineHeight: 1 }}>Dashboard</h1>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => router.push("/messages")} className="lk-btn-ghost">Messagerie</button>
            <button onClick={handleLogout} style={{ cursor: "pointer", padding: "9px 18px", fontSize: 13, fontWeight: 600, borderRadius: 9, color: "#fff", background: C.ink, border: "none" }}>
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 32px" }}>

        {/* KPI BAND — une seule surface, filets verticaux */}
        <div className="lk-kpi" style={{ background: C.surface, border: `1.5px solid ${C.hairline}`, borderRadius: 16, display: "flex", marginBottom: 24 }}>
          {[
            { label: "Projets",      val: projects.length },
            { label: "Founders",     val: founders.length },
            { label: "Developers",   val: developers.length },
            { label: "Matchings",    val: matches.length },
            { label: "Signalements", val: pendingReports.length },
          ].map((s, i, arr) => (
            <div key={s.label} className="lk-kpi-item" style={{ flex: 1, padding: "24px 20px", borderRight: i < arr.length - 1 ? `1.5px solid ${C.hairline}` : "none", textAlign: "center" }}>
              <p style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 40, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1, color: C.ink, margin: "0 0 7px", fontVariantNumeric: "tabular-nums" }}>{s.val}</p>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: C.muted, margin: 0 }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* TABS */}
        <div style={{ display: "flex", borderBottom: `1.5px solid ${C.hairline}`, marginBottom: 28, overflowX: "auto" }}>
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`lk-tab${tab === t.key ? " active" : ""}`}>
              {t.label}
              {t.count !== undefined && (
                <span style={{ marginLeft: 5, fontSize: 12, color: C.muted, fontVariantNumeric: "tabular-nums" }}>{t.count}</span>
              )}
              {t.urgent && (
                <span style={{ marginLeft: 6, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 14, height: 14, borderRadius: "50%", background: C.rose, color: "#fff", fontSize: 9, fontWeight: 700, verticalAlign: "middle" }} />
              )}
            </button>
          ))}
        </div>

        {/* ── VUE D'ENSEMBLE ─────────────────────────────────────────────── */}
        {tab === "analytics" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Taux — grille asymétrique */}
            <div className="lk-taux" style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: 16 }}>

              {/* Héros : Taux de match */}
              <div style={{ background: C.surface, border: `1.5px solid ${C.hairline}`, borderRadius: 16, padding: "32px 36px" }}>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: C.muted, margin: "0 0 6px" }}>Taux de match</p>
                <div style={{ width: 24, height: 2, background: C.rose, marginBottom: 18 }} />
                <p style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 58, fontWeight: 600, letterSpacing: "-0.04em", color: C.ink, lineHeight: 1, margin: "0 0 10px", fontVariantNumeric: "tabular-nums" }}>
                  {tauxMatch}<span style={{ fontSize: 28 }}>%</span>
                </p>
                <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>{projectsMatched} projet{projectsMatched !== 1 ? "s" : ""} matchés sur {projects.length} publiés</p>
              </div>

              {/* Taux de complétion */}
              <div style={{ background: C.surface, border: `1.5px solid ${C.hairline}`, borderRadius: 16, padding: "32px 28px" }}>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: C.muted, margin: "0 0 22px" }}>Taux de complétion</p>
                <p style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 38, fontWeight: 600, letterSpacing: "-0.04em", color: C.ink, lineHeight: 1, margin: "0 0 10px", fontVariantNumeric: "tabular-nums" }}>
                  {tauxCompletion}<span style={{ fontSize: 20 }}>%</span>
                </p>
                <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>{projectsLivre} livré{projectsLivre !== 1 ? "s" : ""}</p>
              </div>

              {/* Utilisateurs */}
              <div style={{ background: C.surface, border: `1.5px solid ${C.hairline}`, borderRadius: 16, padding: "32px 28px" }}>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: C.muted, margin: "0 0 22px" }}>Utilisateurs</p>
                <p style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 38, fontWeight: 600, letterSpacing: "-0.04em", color: C.ink, lineHeight: 1, margin: "0 0 10px", fontVariantNumeric: "tabular-nums" }}>
                  {totalUsers}
                </p>
                <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>{founders.length} founders · {developers.length} devs</p>
              </div>
            </div>

            {/* Funnel + Activité récente */}
            <div className="lk-bifold" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

              {/* Funnel de conversion */}
              <div style={{ background: C.surface, border: `1.5px solid ${C.hairline}`, borderRadius: 16, padding: "28px 32px" }}>
                <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 16, fontWeight: 600, letterSpacing: "-0.02em", color: C.ink, margin: "0 0 24px" }}>Funnel de conversion</h2>
                {([
                  { label: "Projets publiés", val: projects.length,   prev: null,              navy: 1    },
                  { label: "Matchés",          val: projectsMatched,   prev: projects.length,   navy: 0.58 },
                  { label: "Livrés",           val: projectsLivre,     prev: projectsMatched,   navy: 0.30 },
                ] as { label: string; val: number; prev: number | null; navy: number }[]).map(({ label, val, prev, navy }, i) => {
                  const isLast = i === 2;
                  const pct = prev !== null && prev > 0 ? Math.round((val / prev) * 100) : 100;
                  const barW = prev !== null && prev > 0 ? pct : 100;
                  return (
                    <div key={label} style={{ marginBottom: i < 2 ? 20 : 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: isLast ? C.rose : C.ink }}>{label}</span>
                        <span style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 20, fontWeight: 600, color: isLast ? C.rose : C.ink, fontVariantNumeric: "tabular-nums" }}>{val}</span>
                      </div>
                      <div style={{ height: 8, borderRadius: 4, background: C.hairline, overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 4, width: `${barW}%`, background: `rgba(26,33,56,${navy})` }} />
                      </div>
                      {prev !== null && prev > 0 && (
                        <p style={{ fontSize: 11, color: C.muted, margin: "4px 0 0", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{pct}% de l&apos;étape précédente</p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Activité récente */}
              <div style={{ background: C.surface, border: `1.5px solid ${C.hairline}`, borderRadius: 16, padding: "28px 32px" }}>
                <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 16, fontWeight: 600, letterSpacing: "-0.02em", color: C.ink, margin: "0 0 4px" }}>Activité récente</h2>
                {recentActivity.length === 0 ? (
                  <p style={{ fontSize: 13, color: C.muted, padding: "20px 0" }}>Aucune activité récente.</p>
                ) : recentActivity.map((a, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: i < recentActivity.length - 1 ? `1px solid ${C.hairline}` : "none", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: a.type === "match" ? C.rose : C.ink, margin: "0 0 2px" }}>{a.label}</p>
                      <p style={{ fontSize: 12, color: C.muted, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.sub}</p>
                    </div>
                    <span style={{ fontSize: 12, color: C.muted, flexShrink: 0 }}>{statutLabels[a.statut] ?? a.statut}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── PROJETS ───────────────────────────────────────────────────────── */}
        {tab === "projets" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {projects.map((p, i) => (
              <div key={p.id} className="lk-row" style={{ background: C.surface, border: `1.5px solid ${C.hairline}`, borderRadius: 14, padding: "18px 22px", display: "flex", alignItems: "flex-start", gap: 16, transition: "background 0.1s", borderTop: i === 0 ? undefined : undefined }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: C.ink, margin: "0 0 2px" }}>{p.titre}</p>
                  <p style={{ fontSize: 12, color: C.muted, margin: "0 0 8px" }}>{p.profiles_founder?.nom ?? "—"} · {p.profiles_founder?.ecole ?? "—"}</p>
                  {p.description && <p style={{ fontSize: 13, color: C.muted, margin: "0 0 8px", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{p.description}</p>}
                  <div style={{ display: "flex", gap: 16, fontSize: 12, color: C.muted }}>
                    {p.stack_souhaitee && <span>{p.stack_souhaitee}</span>}
                    {p.deadline && <span>Deadline : {p.deadline}</span>}
                  </div>
                </div>
                <select value={p.statut} onChange={(e) => updateProjectStatut(p.id, e.target.value)} disabled={updatingId === p.id}
                  style={{ fontSize: 12, fontWeight: 600, padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${C.hairline}`, color: C.ink, background: C.surface, cursor: "pointer", flexShrink: 0 }}>
                  {STATUTS.map((s) => <option key={s} value={s}>{statutLabels[s] ?? s}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}

        {/* ── FOUNDERS ──────────────────────────────────────────────────────── */}
        {tab === "founders" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {founders.map((f) => (
              <div key={f.id} className="lk-row" style={{ background: C.surface, border: `1.5px solid ${C.hairline}`, borderRadius: 14, padding: "16px 22px", display: "flex", alignItems: "center", gap: 14, transition: "background 0.1s" }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: C.ink, color: "#fff", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {f.nom?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: C.ink, margin: "0 0 2px" }}>{f.nom}</p>
                  <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>{f.email} · {f.ecole}{f.budget ? ` · Budget : ${f.budget}` : ""}</p>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
                  {f.linkedin && <a href={f.linkedin} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.ink, textDecoration: "none", borderBottom: `1px solid ${C.hairline}` }}>LinkedIn ↗</a>}
                  <button onClick={() => setBanTarget({ userId: f.user_id, nom: f.nom })} className="lk-btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }}>Bannir</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── DEVELOPERS ────────────────────────────────────────────────────── */}
        {tab === "developers" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {developers.map((d) => (
              <div key={d.id} className="lk-row" style={{ background: C.surface, border: `1.5px solid ${C.hairline}`, borderRadius: 14, padding: "16px 22px", display: "flex", alignItems: "flex-start", gap: 14, transition: "background 0.1s" }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: C.ink, color: "#fff", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {d.nom?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: C.ink, margin: "0 0 2px" }}>{d.nom}</p>
                  <p style={{ fontSize: 12, color: C.muted, margin: "0 0 8px" }}>{d.email} · {d.ecole} · {d.dispo_heures_semaine}h/sem</p>
                  {d.competences?.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {d.competences.map((c) => (
                        <span key={c} style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, border: `1px solid ${C.hairline}`, color: C.muted }}>{c}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
                  {d.github && <a href={d.github} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.ink, textDecoration: "none", borderBottom: `1px solid ${C.hairline}` }}>GitHub ↗</a>}
                  {d.linkedin && <a href={d.linkedin} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.ink, textDecoration: "none", borderBottom: `1px solid ${C.hairline}` }}>LinkedIn ↗</a>}
                  <button onClick={() => setBanTarget({ userId: d.user_id, nom: d.nom })} className="lk-btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }}>Bannir</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── MATCHINGS ─────────────────────────────────────────────────────── */}
        {tab === "matchings" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {matches.length === 0 ? (
              <div style={{ background: C.surface, border: `1.5px solid ${C.hairline}`, borderRadius: 14, padding: "48px 32px", textAlign: "center" }}>
                <p style={{ fontSize: 13, color: C.muted }}>Aucun matching actif pour l&apos;instant.</p>
              </div>
            ) : matches.map((m) => (
              <div key={m.id} className="lk-row" style={{ background: C.surface, border: `1.5px solid ${C.hairline}`, borderRadius: 14, padding: "16px 22px", display: "flex", alignItems: "center", gap: 16, transition: "background 0.1s" }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: C.ink, margin: "0 0 2px" }}>{m.projects?.titre ?? "—"}</p>
                  <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Dev : {m.profiles_developer?.nom ?? "—"} · {m.profiles_developer?.ecole ?? "—"}</p>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.muted, border: `1px solid ${C.hairline}`, borderRadius: 7, padding: "4px 10px", flexShrink: 0 }}>Matchée</span>
              </div>
            ))}
          </div>
        )}

        {/* ── SIGNALEMENTS ──────────────────────────────────────────────────── */}
        {tab === "signalements" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {(["all", "pending", "resolu", "ignore"] as const).map((f) => (
                <button key={f} onClick={() => setFilterReport(f)}
                  style={{ fontSize: 12, fontWeight: 600, padding: "7px 14px", borderRadius: 8, border: `1.5px solid ${filterReport === f ? C.ink : C.hairline}`, background: filterReport === f ? C.ink : C.surface, color: filterReport === f ? "#fff" : C.muted, cursor: "pointer", transition: "all 0.12s" }}>
                  {f === "all" ? "Tous" : f === "pending" ? "En attente" : f === "resolu" ? "Résolus" : "Ignorés"}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {reports.filter((r) => filterReport === "all" || r.statut === filterReport).map((r) => (
                <div key={r.id} style={{ background: C.surface, border: `1.5px solid ${r.statut === "pending" ? C.rose : C.hairline}`, borderRadius: 14, padding: "18px 22px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, border: `1px solid ${C.hairline}`, color: C.muted }}>{r.target_type === "profile" ? "Profil" : "Projet"}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, border: `1px solid ${C.hairline}`, color: C.muted }}>{RAISON_LABELS[r.raison] ?? r.raison}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, border: `1px solid ${C.hairline}`, color: r.statut === "pending" ? C.rose : C.muted }}>{r.statut === "pending" ? "En attente" : r.statut === "resolu" ? "Résolu" : "Ignoré"}</span>
                      </div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: C.ink, margin: "0 0 4px" }}>{r.target_nom ?? r.target_id}</p>
                      {r.description && <p style={{ fontSize: 13, color: C.muted, margin: "0 0 4px", fontStyle: "italic" }}>&ldquo;{r.description}&rdquo;</p>}
                      <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>{new Date(r.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                    <button onClick={() => router.push(`/profil/${r.target_id}`)} style={{ fontSize: 12, color: C.ink, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", flexShrink: 0 }}>Voir →</button>
                  </div>
                  {r.statut === "pending" && (
                    <div style={{ display: "flex", gap: 8, paddingTop: 12, borderTop: `1px solid ${C.hairline}` }}>
                      <button onClick={() => updateReportStatut(r.id, "resolu")} style={{ flex: 1, fontSize: 13, fontWeight: 600, padding: "9px", borderRadius: 9, border: `1.5px solid ${C.hairline}`, background: C.surface, color: C.ink, cursor: "pointer" }}>Résoudre</button>
                      <button onClick={() => updateReportStatut(r.id, "ignore")} style={{ flex: 1, fontSize: 13, fontWeight: 600, padding: "9px", borderRadius: 9, border: `1.5px solid ${C.hairline}`, background: C.surface, color: C.muted, cursor: "pointer" }}>Ignorer</button>
                      <button onClick={() => { updateReportStatut(r.id, "resolu"); setBanTarget({ userId: r.target_id, nom: r.target_nom ?? r.target_id }); }}
                        style={{ flex: 1, fontSize: 13, fontWeight: 600, padding: "9px", borderRadius: 9, border: `1.5px solid ${C.rose}`, background: C.surface, color: C.rose, cursor: "pointer" }}>Bannir</button>
                    </div>
                  )}
                </div>
              ))}
              {reports.filter((r) => filterReport === "all" || r.statut === filterReport).length === 0 && (
                <div style={{ background: C.surface, border: `1.5px solid ${C.hairline}`, borderRadius: 14, padding: "48px 32px", textAlign: "center" }}>
                  <p style={{ fontSize: 13, color: C.muted }}>Aucun signalement{filterReport !== "all" ? " dans cette catégorie" : ""}.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── BANS ──────────────────────────────────────────────────────────── */}
        {tab === "bans" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {activeBans.length === 0 ? (
              <div style={{ background: C.surface, border: `1.5px solid ${C.hairline}`, borderRadius: 14, padding: "48px 32px", textAlign: "center" }}>
                <p style={{ fontSize: 13, color: C.muted }}>Aucun utilisateur banni actuellement.</p>
              </div>
            ) : activeBans.map((b) => (
              <div key={b.id} style={{ background: C.surface, border: `1.5px solid ${C.hairline}`, borderRadius: 14, padding: "16px 22px", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: C.ink, color: "#fff", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {b.nom?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 3 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: C.ink, margin: 0 }}>{b.nom ?? b.user_id}</p>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 5, border: `1px solid ${C.hairline}`, color: C.muted }}>{b.role === "founder" ? "Founder" : "Developer"}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 5, border: `1px solid ${b.type === "permanent" ? C.rose : C.hairline}`, color: b.type === "permanent" ? C.rose : C.muted }}>{b.type === "permanent" ? "Définitif" : "Temporaire"}</span>
                  </div>
                  <p style={{ fontSize: 12, color: C.muted, margin: "0 0 2px" }}>{b.raison}</p>
                  <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>
                    Banni le {new Date(b.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                    {b.expires_at && ` · Jusqu'au ${new Date(b.expires_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button onClick={() => router.push(`/profil/${b.user_id}`)} style={{ fontSize: 12, color: C.ink, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Voir →</button>
                  <button onClick={() => liftBan(b.id, b.user_id)} disabled={liftingBan === b.id} className="lk-btn-ghost" style={{ fontSize: 12, padding: "6px 12px", opacity: liftingBan === b.id ? 0.5 : 1 }}>
                    {liftingBan === b.id ? "…" : "Lever"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── LITIGES ───────────────────────────────────────────────────────── */}
        {tab === "litiges" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {disputes.length === 0 ? (
              <div style={{ background: C.surface, border: `1.5px solid ${C.hairline}`, borderRadius: 14, padding: "48px 32px", textAlign: "center" }}>
                <p style={{ fontSize: 13, color: C.muted }}>Aucun litige pour l&apos;instant.</p>
              </div>
            ) : disputes.map((d) => (
              <div key={d.id} style={{ background: C.surface, border: `1.5px solid ${d.status === "open" ? C.rose : C.hairline}`, borderRadius: 14, padding: "18px 22px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, border: `1px solid ${d.status === "open" ? C.rose : C.hairline}`, color: d.status === "open" ? C.rose : C.muted }}>
                        {d.status === "open" ? "Ouvert" : d.status === "resolved_founder" ? "Résolu → Founder" : "Résolu → Dev"}
                      </span>
                      {d.amount != null && (
                        <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, border: `1px solid ${C.hairline}`, color: C.muted }}>
                          {d.amount} € ({d.dev_amount} € net dev)
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: C.ink, margin: "0 0 4px" }}>
                      {d.founderNom ?? "Founder"} ↔ {d.devNom ?? "Dev"}
                    </p>
                    <p style={{ fontSize: 13, color: C.muted, margin: "0 0 4px", fontStyle: "italic" }}>&ldquo;{d.reason}&rdquo;</p>
                    <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>{new Date(d.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                </div>

                {/* Boutons conversations */}
                <div style={{ display: "flex", gap: 8, paddingTop: 12, borderTop: `1px solid ${C.hairline}`, flexWrap: "wrap" }}>
                  {d.founderConvId && (
                    <button onClick={() => router.push(`/messages/${d.founderConvId}`)}
                      style={{ fontSize: 12, fontWeight: 600, padding: "7px 14px", borderRadius: 8, border: `1.5px solid ${C.hairline}`, background: C.surface, color: C.ink, cursor: "pointer" }}>
                      💬 Founder →
                    </button>
                  )}
                  {d.devConvId && (
                    <button onClick={() => router.push(`/messages/${d.devConvId}`)}
                      style={{ fontSize: 12, fontWeight: 600, padding: "7px 14px", borderRadius: 8, border: `1.5px solid ${C.hairline}`, background: C.surface, color: C.ink, cursor: "pointer" }}>
                      💬 Dev →
                    </button>
                  )}
                </div>

                {/* Résolution */}
                {d.status === "open" && (
                  <div style={{ display: "flex", gap: 8, paddingTop: 10, flexWrap: "wrap" }}>
                    <input
                      value={disputeNote[d.id] ?? ""}
                      onChange={(e) => setDisputeNote((prev) => ({ ...prev, [d.id]: e.target.value }))}
                      placeholder="Note interne (optionnel)"
                      style={{ flex: 1, minWidth: 120, padding: "8px 12px", fontSize: 12, borderRadius: 8, border: `1.5px solid ${C.hairline}`, outline: "none", fontFamily: "inherit", color: C.ink }}
                    />
                    <button
                      onClick={() => resolveDispute(d.id, "resolved_founder")}
                      disabled={resolvingDispute === d.id}
                      style={{ fontSize: 12, fontWeight: 600, padding: "8px 14px", borderRadius: 8, border: `1.5px solid ${C.hairline}`, background: C.surface, color: C.ink, cursor: "pointer", opacity: resolvingDispute === d.id ? 0.5 : 1 }}>
                      {resolvingDispute === d.id ? "…" : "→ Founder"}
                    </button>
                    <button
                      onClick={() => resolveDispute(d.id, "resolved_dev")}
                      disabled={resolvingDispute === d.id}
                      style={{ fontSize: 12, fontWeight: 600, padding: "8px 14px", borderRadius: 8, border: `1.5px solid ${C.rose}`, background: C.surface, color: C.rose, cursor: "pointer", opacity: resolvingDispute === d.id ? 0.5 : 1 }}>
                      {resolvingDispute === d.id ? "…" : "→ Dev"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── SUPPORT ───────────────────────────────────────────────────────── */}
        {tab === "support" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {supportConvs.length === 0 ? (
              <div style={{ background: C.surface, border: `1.5px solid ${C.hairline}`, borderRadius: 14, padding: "48px 32px", textAlign: "center" }}>
                <p style={{ fontSize: 13, color: C.muted }}>Aucune conversation support pour l&apos;instant.</p>
              </div>
            ) : supportConvs.map((c) => (
              <div key={c.id} onClick={() => router.push(`/support/${c.id}`)} className="lk-row"
                style={{ background: C.surface, border: `1.5px solid ${c.unreadCount > 0 ? C.rose : C.hairline}`, borderRadius: 14, padding: "14px 22px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer", transition: "background 0.1s" }}>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: C.ink, color: "#fff", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {c.nom?.[0]?.toUpperCase() ?? "?"}
                  </div>
                  {c.unreadCount > 0 && (
                    <span style={{ position: "absolute", top: -3, right: -3, minWidth: 16, height: 16, borderRadius: "50%", background: C.rose, color: "#fff", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>{c.unreadCount}</span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 2 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: c.unreadCount > 0 ? C.rose : C.ink, margin: 0 }}>{c.nom ?? "—"}</p>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 5, border: `1px solid ${C.hairline}`, color: C.muted }}>{c.role === "founder" ? "Founder" : "Developer"}</span>
                  </div>
                  {c.lastMessage && <p style={{ fontSize: 12, color: C.muted, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.lastMessage}</p>}
                </div>
                <span style={{ color: C.muted, fontSize: 18, flexShrink: 0 }}>›</span>
              </div>
            ))}
          </div>
        )}

      </div>

      {banTarget && adminId && (
        <BanModal isOpen={!!banTarget} onClose={() => setBanTarget(null)} targetUserId={banTarget.userId} targetNom={banTarget.nom} adminId={adminId} onBanned={() => setBanTarget(null)} />
      )}
    </div>
  );
}
