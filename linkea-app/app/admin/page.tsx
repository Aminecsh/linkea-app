"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import BanModal from "@/components/BanModal";

type Project = {
  id: string;
  titre: string;
  description: string;
  stack_souhaitee: string;
  deadline: string;
  statut: string;
  created_at: string;
  profiles_founder: { nom: string; ecole: string };
};

type Founder = {
  id: string;
  user_id: string;
  nom: string;
  email: string;
  ecole: string;
  linkedin: string;
  budget: string;
  created_at: string;
};

type Developer = {
  id: string;
  user_id: string;
  nom: string;
  email: string;
  ecole: string;
  competences: string[];
  dispo_heures_semaine: number;
  github: string;
  linkedin: string;
  created_at: string;
};

type Match = {
  id: string;
  statut: string;
  created_at: string;
  projects: { titre: string; statut: string };
  profiles_developer: { nom: string; ecole: string };
};

const STATUTS = ["pending", "matched", "en_cours", "livre", "suspendu"];
const statutColors: Record<string, string> = {
  pending:   "bg-amber-50 text-amber-600 border-amber-200",
  matched:   "bg-blue-50 text-blue-600 border-blue-200",
  en_cours:  "bg-green-50 text-green-600 border-green-200",
  livre:     "bg-slate-100 text-slate-500 border-slate-200",
  suspendu:  "bg-red-50 text-red-500 border-red-200",
};
const statutLabels: Record<string, string> = {
  pending: "En attente", matched: "Matchée", en_cours: "En cours", livre: "Livré", suspendu: "Suspendu",
};

type Report = {
  id: string;
  reporter_id: string;
  target_type: string;
  target_id: string;
  target_nom?: string;
  raison: string;
  description?: string;
  statut: "pending" | "resolu" | "ignore";
  created_at: string;
};

const RAISON_LABELS: Record<string, string> = {
  spam: "Spam",
  faux_profil: "Faux profil",
  contenu_inapproprie: "Contenu inapproprié",
  arnaque: "Arnaque",
  autre: "Autre",
};

type SupportConv = {
  id: string;
  user_id: string;
  created_at: string;
  nom?: string;
  role?: string;
  lastMessage?: string;
  unreadCount: number;
};

type ActiveBan = {
  id: string;
  user_id: string;
  type: "temp" | "permanent";
  raison: string;
  expires_at: string | null;
  created_at: string;
  nom?: string;
  role?: string;
};

type Dispute = {
  id: string;
  project_id: string;
  payment_id: string;
  founder_user_id: string;
  dev_user_id: string;
  reason: string;
  status: string;
  admin_note: string | null;
  created_at: string;
  resolved_at: string | null;
  projects: { titre: string } | null;
  payments: { amount: number; dev_amount: number } | null;
  founder_profile?: { nom: string };
  dev_profile?: { nom: string };
  conv_founder_id?: string;
  conv_dev_id?: string;
};

type Tab = "projets" | "founders" | "developers" | "matchings" | "signalements" | "bans" | "support" | "analytics" | "litiges";

export default function AdminDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("projets");
  const [projects, setProjects] = useState<Project[]>([]);
  const [founders, setFounders] = useState<Founder[]>([]);
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [filterReport, setFilterReport] = useState<"all" | "pending" | "resolu" | "ignore">("pending");
  const [adminId, setAdminId] = useState<string | null>(null);
  const [banTarget, setBanTarget] = useState<{ userId: string; nom: string } | null>(null);
  const [activeBans, setActiveBans] = useState<ActiveBan[]>([]);
  const [liftingBan, setLiftingBan] = useState<string | null>(null);
  const [supportConvs, setSupportConvs] = useState<SupportConv[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [resolvingDispute, setResolvingDispute] = useState<string | null>(null);
  const [disputeNote, setDisputeNote] = useState<Record<string, string>>({});

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }

      setAdminId(user.id);
      const { data: roleData } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      if (roleData?.role !== "admin") { router.push("/projets"); return; }

      const [{ data: projs }, { data: founds }, { data: devs }, { data: matchData }, { data: reportsData }, { data: bansData }] = await Promise.all([
        supabase.from("projects").select("*, profiles_founder(nom, ecole)").order("created_at", { ascending: false }),
        supabase.from("profiles_founder").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles_developer").select("*").order("created_at", { ascending: false }),
        supabase.from("candidatures").select("id, statut, created_at, projects(titre, statut), profiles_developer(nom, ecole)").eq("statut", "accepted").order("created_at", { ascending: false }),
        supabase.from("reports").select("*").order("created_at", { ascending: false }),
        supabase.from("bans").select("id, user_id, type, raison, expires_at, created_at")
          .eq("is_active", true)
          .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
          .order("created_at", { ascending: false }),
      ]);

      setProjects((projs as Project[]) ?? []);
      setFounders((founds as Founder[]) ?? []);
      setDevelopers((devs as Developer[]) ?? []);
      setMatches((matchData as unknown as Match[]) ?? []);
      setReports((reportsData as Report[]) ?? []);

      // Enrichir les bans avec le nom de l'utilisateur
      const rawBans = (bansData as ActiveBan[]) ?? [];
      if (rawBans.length > 0) {
        const userIds = rawBans.map((b) => b.user_id);
        const [{ data: fP }, { data: dP }] = await Promise.all([
          supabase.from("profiles_founder").select("user_id, nom").in("user_id", userIds),
          supabase.from("profiles_developer").select("user_id, nom").in("user_id", userIds),
        ]);
        const nameMap: Record<string, { nom: string; role: string }> = {};
        (fP ?? []).forEach((p) => { nameMap[p.user_id] = { nom: p.nom, role: "founder" }; });
        (dP ?? []).forEach((p) => { nameMap[p.user_id] = { nom: p.nom, role: "developer" }; });
        setActiveBans(rawBans.map((b) => ({ ...b, nom: nameMap[b.user_id]?.nom, role: nameMap[b.user_id]?.role })));
      }
      // Support conversations
      const { data: sConvs } = await supabase
        .from("support_conversations").select("id, user_id, created_at").order("created_at", { ascending: false });
      if (sConvs && sConvs.length > 0) {
        const sUserIds = sConvs.map((c: { user_id: string }) => c.user_id);
        const [{ data: sfP }, { data: sdP }] = await Promise.all([
          supabase.from("profiles_founder").select("user_id, nom").in("user_id", sUserIds),
          supabase.from("profiles_developer").select("user_id, nom").in("user_id", sUserIds),
        ]);
        const sNameMap: Record<string, { nom: string; role: string }> = {};
        (sfP ?? []).forEach((p: { user_id: string; nom: string }) => { sNameMap[p.user_id] = { nom: p.nom, role: "founder" }; });
        (sdP ?? []).forEach((p: { user_id: string; nom: string }) => { sNameMap[p.user_id] = { nom: p.nom, role: "developer" }; });
        const enriched = await Promise.all(sConvs.map(async (c: { id: string; user_id: string; created_at: string }) => {
          const { data: last } = await supabase.from("support_messages").select("content, sender_id").eq("conversation_id", c.id).order("created_at", { ascending: false }).limit(1);
          const lastRead = `lastRead_support_${c.id}`;
          const { count: unread } = await supabase.from("support_messages").select("*", { count: "exact", head: true }).eq("conversation_id", c.id).neq("sender_id", user.id).gt("created_at", "1970-01-01");
          return { ...c, nom: sNameMap[c.user_id]?.nom, role: sNameMap[c.user_id]?.role, lastMessage: last?.[0]?.content, unreadCount: unread ?? 0, _lastRead: lastRead };
        }));
        setSupportConvs(enriched as SupportConv[]);
      }

      // Litiges
      const { data: disputesData } = await supabase
        .from("disputes")
        .select("*, projects(titre), payments(amount, dev_amount)")
        .order("created_at", { ascending: false });

      if (disputesData && disputesData.length > 0) {
        const raw = disputesData as Dispute[];
        const founderIds = raw.map((d) => d.founder_user_id);
        const devIds = raw.map((d) => d.dev_user_id);
        const [{ data: fProfiles }, { data: dProfiles }] = await Promise.all([
          supabase.from("profiles_founder").select("user_id, nom").in("user_id", founderIds),
          supabase.from("profiles_developer").select("user_id, nom").in("user_id", devIds),
        ]);
        const fMap: Record<string, string> = {};
        const dMap: Record<string, string> = {};
        (fProfiles ?? []).forEach((p: { user_id: string; nom: string }) => { fMap[p.user_id] = p.nom; });
        (dProfiles ?? []).forEach((p: { user_id: string; nom: string }) => { dMap[p.user_id] = p.nom; });
        // Récupérer les conversations de litige par projet
        const projectIds = raw.map((d) => d.project_id);
        const { data: litigeConvs } = await supabase
          .from("conversations")
          .select("id, project_id, group_name")
          .in("project_id", projectIds)
          .eq("is_group", true)
          .ilike("group_name", "⚠️ Litige%");

        const convFounderMap: Record<string, string> = {};
        const convDevMap: Record<string, string> = {};
        (litigeConvs ?? []).forEach((c: { id: string; project_id: string; group_name: string }) => {
          if (c.group_name.endsWith("(Founder)")) convFounderMap[c.project_id] = c.id;
          if (c.group_name.endsWith("(Dev)")) convDevMap[c.project_id] = c.id;
        });

        setDisputes(raw.map((d) => ({
          ...d,
          founder_profile: { nom: fMap[d.founder_user_id] ?? "?" },
          dev_profile: { nom: dMap[d.dev_user_id] ?? "?" },
          conv_founder_id: convFounderMap[d.project_id],
          conv_dev_id: convDevMap[d.project_id],
        })));
      }

      setLoading(false);
    }
    load();
  }, [router]);

  async function liftBan(banId: string, userId: string) {
    setLiftingBan(banId);
    await supabase.from("bans").update({ is_active: false }).eq("id", banId);
    await supabase.from("notifications").insert({
      user_id: userId,
      type: "admin_unban",
      title: "✅ Sanction levée",
      body: "Ton compte Linkea a été réactivé. Bienvenue de retour !",
    });
    setActiveBans((prev) => prev.filter((b) => b.id !== banId));
    setLiftingBan(null);
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

  async function resolveDispute(disputeId: string, decision: "dev" | "founder") {
    setResolvingDispute(disputeId);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setResolvingDispute(null); return; }
    await fetch("/api/disputes/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ disputeId, decision, adminNote: disputeNote[disputeId] ?? null }),
    });
    setDisputes((prev) => prev.map((d) => d.id === disputeId
      ? { ...d, status: decision === "dev" ? "resolved_dev" : "resolved_founder", resolved_at: new Date().toISOString() }
      : d
    ));
    setResolvingDispute(null);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  const pendingReports = reports.filter((r) => r.statut === "pending");

  // ── Analytics ────────────────────────────────────────────────────────────────
  const totalUsers = founders.length + developers.length;
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const newUsersWeek = [...founders, ...developers].filter((u) => u.created_at > oneWeekAgo).length;

  const projectsMatched = projects.filter((p) => ["matched", "en_cours", "livre"].includes(p.statut)).length;
  const projectsLivre   = projects.filter((p) => p.statut === "livre").length;
  const tauxMatch       = projects.length > 0 ? Math.round((projectsMatched / projects.length) * 100) : 0;
  const tauxCompletion  = projectsMatched > 0 ? Math.round((projectsLivre / projectsMatched) * 100) : 0;

  // Croissance : 8 dernières semaines
  function weekLabel(weeksAgo: number) {
    const d = new Date(Date.now() - weeksAgo * 7 * 24 * 60 * 60 * 1000);
    return `S${d.getMonth() + 1}/${String(d.getDate()).padStart(2, "0")}`;
  }
  const growthWeeks = Array.from({ length: 8 }, (_, i) => {
    const weeksAgo = 7 - i;
    const from = new Date(Date.now() - weeksAgo * 7 * 24 * 60 * 60 * 1000).toISOString();
    const to   = new Date(Date.now() - (weeksAgo - 1) * 7 * 24 * 60 * 60 * 1000).toISOString();
    const count = [...founders, ...developers].filter((u) => u.created_at >= from && u.created_at < to).length;
    return { label: weekLabel(weeksAgo), count };
  });
  const maxGrowth = Math.max(...growthWeeks.map((w) => w.count), 1);

  // Funnel
  const funnel = [
    { label: "Inscrits",       val: totalUsers,       color: "bg-indigo-500" },
    { label: "Projets publiés", val: projects.length,  color: "bg-purple-500" },
    { label: "Matchés",         val: projectsMatched,  color: "bg-blue-500"   },
    { label: "Livrés",          val: projectsLivre,    color: "bg-green-500"  },
  ];
  const maxFunnel = Math.max(totalUsers, 1);

  const openDisputes = disputes.filter((d) => d.status === "open");

  const tabs: { key: Tab; label: string; count?: number; urgent?: boolean }[] = [
    { key: "analytics",     label: "📊 Analytics" },
    { key: "projets",       label: "Projets",       count: projects.length },
    { key: "founders",      label: "Founders",      count: founders.length },
    { key: "developers",    label: "Developers",    count: developers.length },
    { key: "matchings",     label: "Matchings",     count: matches.length },
    { key: "litiges",       label: "⚠️ Litiges",    count: openDisputes.length, urgent: openDisputes.length > 0 },
    { key: "signalements",  label: "Signalements",  count: pendingReports.length, urgent: pendingReports.length > 0 },
    { key: "bans",          label: "Bans actifs",   count: activeBans.length, urgent: activeBans.length > 0 },
    { key: "support",       label: "Support",       count: supportConvs.length, urgent: supportConvs.some((c) => c.unreadCount > 0) },
  ];

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-500 mb-0.5">Linkea · Admin</p>
            <h1 className="text-xl font-black text-slate-900">Dashboard</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => router.push("/messages")} className="btn-ghost text-sm px-4 py-2">💬 Messagerie</button>
            <button onClick={handleLogout} className="btn-ghost text-sm px-4 py-2">Déconnexion</button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* Stats */}
        <div className="grid grid-cols-5 gap-3 mb-6">
          {[
            { label: "Projets", val: projects.length, color: "text-pink-500" },
            { label: "Founders", val: founders.length, color: "text-purple-500" },
            { label: "Developers", val: developers.length, color: "text-blue-500" },
            { label: "Matchings", val: matches.length, color: "text-green-500" },
            { label: "Signalements", val: pendingReports.length, color: pendingReports.length > 0 ? "text-red-500" : "text-slate-400" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
              <p className={`text-3xl font-black ${s.color}`}>{s.val}</p>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mb-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-all relative ${
                tab === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
              {t.count !== undefined && (
                <span className={`ml-1.5 text-xs font-bold ${t.urgent ? "text-red-500" : tab === t.key ? "text-indigo-500" : "text-slate-400"}`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Analytics ─────────────────────────────────────────────────────── */}
        {tab === "analytics" && (
          <div className="flex flex-col gap-6">

            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Utilisateurs total", val: totalUsers, sub: `+${newUsersWeek} cette semaine`, color: "text-indigo-600", bg: "bg-indigo-50 border-indigo-100" },
                { label: "Taux de match",       val: `${tauxMatch}%`,     sub: `${projectsMatched} projets matchés`, color: "text-blue-600",   bg: "bg-blue-50 border-blue-100" },
                { label: "Taux de complétion",  val: `${tauxCompletion}%`, sub: `${projectsLivre} projets livrés`,  color: "text-green-600",  bg: "bg-green-50 border-green-100" },
                { label: "Projets actifs",      val: projects.filter((p) => p.statut === "en_cours").length, sub: `${projects.filter((p) => p.statut === "matched").length} en attente de démarrage`, color: "text-purple-600", bg: "bg-purple-50 border-purple-100" },
              ].map((k) => (
                <div key={k.label} className={`rounded-2xl border p-5 ${k.bg}`}>
                  <p className={`text-3xl font-black ${k.color}`}>{k.val}</p>
                  <p className="text-xs font-bold text-slate-700 mt-1">{k.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{k.sub}</p>
                </div>
              ))}
            </div>

            {/* Funnel */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <h2 className="font-bold text-slate-900 mb-5">Funnel de conversion</h2>
              <div className="flex flex-col gap-3">
                {funnel.map((f, i) => (
                  <div key={f.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-slate-700">{f.label}</span>
                      <span className="text-sm font-black text-slate-900">{f.val}</span>
                    </div>
                    <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-3 rounded-full transition-all ${f.color}`}
                        style={{ width: `${Math.round((f.val / maxFunnel) * 100)}%` }}
                      />
                    </div>
                    {i < funnel.length - 1 && funnel[i].val > 0 && (
                      <p className="text-xs text-slate-400 mt-1 text-right">
                        {Math.round((funnel[i + 1].val / funnel[i].val) * 100)}% conversion →
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Courbe de croissance */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <h2 className="font-bold text-slate-900 mb-5">Nouveaux utilisateurs (8 dernières semaines)</h2>
              <div className="flex items-end gap-2 h-32">
                {growthWeeks.map((w) => (
                  <div key={w.label} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs font-bold text-slate-600">{w.count > 0 ? w.count : ""}</span>
                    <div className="w-full rounded-t-lg bg-indigo-500 transition-all" style={{ height: `${Math.round((w.count / maxGrowth) * 96)}px`, minHeight: w.count > 0 ? "4px" : "0" }} />
                    <span className="text-[10px] text-slate-400 truncate w-full text-center">{w.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Répartition projets par statut */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <h2 className="font-bold text-slate-900 mb-5">Répartition des projets par statut</h2>
              <div className="flex flex-col gap-3">
                {[
                  { label: "En attente",  statut: "pending",  color: "bg-amber-400" },
                  { label: "Matchés",     statut: "matched",  color: "bg-blue-500" },
                  { label: "En cours",    statut: "en_cours", color: "bg-purple-500" },
                  { label: "Livrés",      statut: "livre",    color: "bg-green-500" },
                  { label: "Suspendus",   statut: "suspendu", color: "bg-red-400" },
                ].map((s) => {
                  const count = projects.filter((p) => p.statut === s.statut).length;
                  return (
                    <div key={s.statut}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-slate-700">{s.label}</span>
                        <span className="text-sm font-black text-slate-900">{count}</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-2 rounded-full ${s.color}`} style={{ width: projects.length > 0 ? `${Math.round((count / projects.length) * 100)}%` : "0%" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        )}

        {/* Projets */}
        {tab === "projets" && (
          <div className="flex flex-col gap-3">
            {projects.map((p) => (
              <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-900 text-base mb-0.5">{p.titre}</h3>
                    <p className="text-xs text-slate-400 mb-2">
                      {p.profiles_founder?.nom ?? "—"} · {p.profiles_founder?.ecole ?? "—"}
                    </p>
                    {p.description && (
                      <p className="text-sm text-slate-500 line-clamp-2 mb-3">{p.description}</p>
                    )}
                    <div className="flex gap-3 text-xs text-slate-400">
                      {p.stack_souhaitee && <span>🛠 {p.stack_souhaitee}</span>}
                      {p.deadline && <span>📅 {p.deadline}</span>}
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-2">
                    <select
                      value={p.statut}
                      onChange={(e) => updateProjectStatut(p.id, e.target.value)}
                      disabled={updatingId === p.id}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full border cursor-pointer ${statutColors[p.statut] ?? "bg-slate-100 text-slate-500 border-slate-200"}`}
                    >
                      {STATUTS.map((s) => (
                        <option key={s} value={s}>{statutLabels[s] ?? s}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Founders */}
        {tab === "founders" && (
          <div className="flex flex-col gap-3">
            {founders.map((f) => (
              <div key={f.id} className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white font-black shrink-0">
                  {f.nom?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900">{f.nom}</p>
                  <p className="text-xs text-slate-400">{f.email} · {f.ecole}</p>
                  {f.budget && <p className="text-xs text-slate-400 mt-0.5">Budget : {f.budget}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {f.linkedin && <a href={f.linkedin} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline">LinkedIn ↗</a>}
                  <button onClick={() => setBanTarget({ userId: f.user_id, nom: f.nom })} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-red-50 text-red-500 border border-red-100 hover:bg-red-100 transition-colors">
                    🚫 Bannir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Developers */}
        {tab === "developers" && (
          <div className="flex flex-col gap-3">
            {developers.map((d) => (
              <div key={d.id} className="bg-white rounded-2xl border border-slate-200 p-5 flex items-start gap-4">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-black shrink-0">
                  {d.nom?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900">{d.nom}</p>
                  <p className="text-xs text-slate-400 mb-2">{d.email} · {d.ecole} · {d.dispo_heures_semaine}h/sem</p>
                  {d.competences?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {d.competences.map((c) => (
                        <span key={c} className="text-xs bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-full font-medium">{c}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0 flex-col items-end">
                  <div className="flex gap-2">
                    {d.github && <a href={d.github} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline">GitHub ↗</a>}
                    {d.linkedin && <a href={d.linkedin} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline">LinkedIn ↗</a>}
                  </div>
                  <button onClick={() => setBanTarget({ userId: d.user_id, nom: d.nom })} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-red-50 text-red-500 border border-red-100 hover:bg-red-100 transition-colors">
                    🚫 Bannir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Matchings */}
        {tab === "matchings" && (
          <div className="flex flex-col gap-3">
            {matches.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
                <p className="text-slate-400">Aucun matching actif pour l'instant.</p>
              </div>
            ) : matches.map((m) => (
              <div key={m.id} className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4">
                <div className="flex-1">
                  <p className="font-bold text-slate-900 text-sm">{m.projects?.titre ?? "—"}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Dev : {m.profiles_developer?.nom ?? "—"} · {m.profiles_developer?.ecole ?? "—"}</p>
                </div>
                <span className="text-xs font-semibold bg-green-50 text-green-600 border border-green-200 px-3 py-1 rounded-full shrink-0">
                  ✓ Matchée
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Litiges */}
        {tab === "litiges" && (
          <div className="flex flex-col gap-4">
            {disputes.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                <p className="text-4xl mb-3">⚖️</p>
                <p className="font-semibold text-slate-700">Aucun litige</p>
                <p className="text-sm text-slate-400 mt-1">Tout se passe bien côté paiements.</p>
              </div>
            ) : disputes.map((d) => {
              const isOpen = d.status === "open";
              const resolvedDev = d.status === "resolved_dev";
              const resolvedFounder = d.status === "resolved_founder";
              return (
                <div key={d.id} className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col gap-4">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          isOpen ? "bg-red-50 text-red-600 border border-red-200" :
                          resolvedDev ? "bg-blue-50 text-blue-600 border border-blue-200" :
                          "bg-green-50 text-green-600 border border-green-200"
                        }`}>
                          {isOpen ? "⚠️ Ouvert" : resolvedDev ? "✅ Résolu → Dev" : "✅ Résolu → Founder"}
                        </span>
                        <span className="text-xs text-slate-400">{new Date(d.created_at).toLocaleDateString("fr-FR")}</span>
                      </div>
                      <p className="font-bold text-slate-900">{(d.projects as { titre: string } | null)?.titre ?? "Projet"}</p>
                    </div>
                    {d.payments && (
                      <div className="text-right shrink-0">
                        <p className="text-lg font-black text-slate-900">{(d.payments as { amount: number }).amount.toFixed(2)}€</p>
                        <p className="text-xs text-slate-400">Dev reçoit {(d.payments as { dev_amount: number }).dev_amount.toFixed(2)}€</p>
                      </div>
                    )}
                  </div>

                  {/* Parties */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-purple-50 border border-purple-100 px-3 py-2">
                      <p className="text-xs font-bold text-purple-400 mb-0.5">FOUNDER</p>
                      <p className="text-sm font-semibold text-slate-800">{d.founder_profile?.nom ?? "?"}</p>
                    </div>
                    <div className="rounded-xl bg-blue-50 border border-blue-100 px-3 py-2">
                      <p className="text-xs font-bold text-blue-400 mb-0.5">DÉVELOPPEUR</p>
                      <p className="text-sm font-semibold text-slate-800">{d.dev_profile?.nom ?? "?"}</p>
                    </div>
                  </div>

                  {/* Motif */}
                  <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                    <p className="text-xs font-bold text-slate-400 mb-1">MOTIF DU LITIGE</p>
                    <p className="text-sm text-slate-700">{d.reason}</p>
                  </div>

                  {/* Liens conversations */}
                  {(d.conv_founder_id || d.conv_dev_id) && (
                    <div className="grid grid-cols-2 gap-2">
                      {d.conv_founder_id && (
                        <button
                          onClick={() => router.push(`/messages/${d.conv_founder_id}`)}
                          className="py-2.5 rounded-xl text-sm font-semibold border border-purple-200 text-purple-600 bg-purple-50 hover:bg-purple-100 transition-colors flex items-center justify-center gap-1.5"
                        >
                          💬 Founder
                        </button>
                      )}
                      {d.conv_dev_id && (
                        <button
                          onClick={() => router.push(`/messages/${d.conv_dev_id}`)}
                          className="py-2.5 rounded-xl text-sm font-semibold border border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors flex items-center justify-center gap-1.5"
                        >
                          💬 Dev
                        </button>
                      )}
                    </div>
                  )}

                  {/* Décision admin (seulement si ouvert) */}
                  {isOpen && (
                    <div className="flex flex-col gap-3">
                      <div>
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Note admin (optionnel)</label>
                        <input
                          value={disputeNote[d.id] ?? ""}
                          onChange={(e) => setDisputeNote((prev) => ({ ...prev, [d.id]: e.target.value }))}
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-indigo-400 transition-colors"
                          placeholder="Raison de la décision…"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => resolveDispute(d.id, "dev")}
                          disabled={resolvingDispute === d.id}
                          className="py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
                          style={{ background: "linear-gradient(135deg,#3b82f6,#6366f1)" }}
                        >
                          {resolvingDispute === d.id
                            ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            : "💸 Libérer au dev"}
                        </button>
                        <button
                          onClick={() => resolveDispute(d.id, "founder")}
                          disabled={resolvingDispute === d.id}
                          className="py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
                          style={{ background: "linear-gradient(135deg,#f59e0b,#ef4444)" }}
                        >
                          {resolvingDispute === d.id
                            ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            : "↩️ Rembourser founder"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Signalements */}
        {tab === "signalements" && (
          <div>
            {/* Filtres */}
            <div className="flex gap-2 mb-4">
              {(["all", "pending", "resolu", "ignore"] as const).map((f) => (
                <button key={f} onClick={() => setFilterReport(f)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
                    filterReport === f
                      ? f === "pending" ? "bg-red-500 text-white border-red-500"
                        : f === "resolu" ? "bg-green-500 text-white border-green-500"
                        : f === "ignore" ? "bg-slate-400 text-white border-slate-400"
                        : "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                  }`}>
                  { f === "all" ? "Tous" : f === "pending" ? "En attente" : f === "resolu" ? "Résolus" : "Ignorés" }
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-3">
              {reports
                .filter((r) => filterReport === "all" || r.statut === filterReport)
                .map((r) => (
                  <div key={r.id} className={`bg-white rounded-2xl border-2 p-5 ${r.statut === "pending" ? "border-red-100" : "border-slate-100"}`}>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${r.target_type === "profile" ? "bg-purple-50 text-purple-600" : "bg-pink-50 text-pink-600"}`}>
                            {r.target_type === "profile" ? "Profil" : "Projet"}
                          </span>
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600">
                            {RAISON_LABELS[r.raison] ?? r.raison}
                          </span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            r.statut === "pending" ? "bg-amber-50 text-amber-600" :
                            r.statut === "resolu" ? "bg-green-50 text-green-600" : "bg-slate-100 text-slate-400"
                          }`}>
                            {r.statut === "pending" ? "En attente" : r.statut === "resolu" ? "Résolu" : "Ignoré"}
                          </span>
                        </div>
                        <p className="font-bold text-slate-900 text-sm">{r.target_nom ?? r.target_id}</p>
                        {r.description && <p className="text-sm text-slate-500 mt-1 italic">&ldquo;{r.description}&rdquo;</p>}
                        <p className="text-xs text-slate-400 mt-1">{new Date(r.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                      <button onClick={() => router.push(`/profil/${r.target_id}`)} className="text-xs text-indigo-500 hover:underline shrink-0">
                        Voir →
                      </button>
                    </div>

                    {r.statut === "pending" && (
                      <div className="flex gap-2 pt-3 border-t border-slate-100">
                        <button onClick={() => updateReportStatut(r.id, "resolu")} className="flex-1 text-sm font-semibold py-2 rounded-xl bg-green-50 text-green-600 hover:bg-green-100 transition-colors">
                          ✓ Résolu
                        </button>
                        <button onClick={() => updateReportStatut(r.id, "ignore")} className="flex-1 text-sm font-semibold py-2 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">
                          Ignorer
                        </button>
                        <button onClick={() => { updateReportStatut(r.id, "resolu"); setBanTarget({ userId: r.target_id, nom: r.target_nom ?? r.target_id }); }} className="flex-1 text-sm font-semibold py-2 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-colors">
                          🚫 Bannir
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              {reports.filter((r) => filterReport === "all" || r.statut === filterReport).length === 0 && (
                <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
                  <p className="text-2xl mb-2">🚩</p>
                  <p className="text-slate-400 text-sm">Aucun signalement{filterReport !== "all" ? " dans cette catégorie" : ""}.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Support */}
        {tab === "support" && (
          <div className="flex flex-col gap-3">
            {supportConvs.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
                <p className="text-2xl mb-2">💬</p>
                <p className="text-slate-400 text-sm">Aucune conversation support pour l&apos;instant.</p>
              </div>
            ) : supportConvs.map((c) => (
              <div key={c.id} onClick={() => router.push(`/support/${c.id}`)}
                className={`bg-white rounded-2xl border-2 p-4 flex items-center gap-4 cursor-pointer transition-all ${c.unreadCount > 0 ? "border-red-200 shadow-sm" : "border-slate-200 hover:border-slate-300"}`}>
                <div className="relative shrink-0">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-black text-lg ${c.role === "founder" ? "bg-gradient-to-br from-pink-400 to-purple-500" : "bg-gradient-to-br from-blue-400 to-indigo-500"}`}>
                    {c.nom?.[0]?.toUpperCase() ?? "?"}
                  </div>
                  {c.unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1">{c.unreadCount}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`font-bold text-slate-900 ${c.unreadCount > 0 ? "text-red-600" : ""}`}>{c.nom ?? "—"}</p>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.role === "founder" ? "bg-pink-50 text-pink-600" : "bg-blue-50 text-blue-600"}`}>
                      {c.role === "founder" ? "Founder" : "Developer"}
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-500">Banni</span>
                  </div>
                  {c.lastMessage && <p className="text-xs text-slate-400 truncate mt-0.5">{c.lastMessage}</p>}
                </div>
                <span className="text-slate-300 text-lg shrink-0">›</span>
              </div>
            ))}
          </div>
        )}

        {/* Bans actifs */}
        {tab === "bans" && (
          <div className="flex flex-col gap-3">
            {activeBans.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
                <p className="text-2xl mb-2">✅</p>
                <p className="text-slate-400 text-sm">Aucun utilisateur banni actuellement.</p>
              </div>
            ) : activeBans.map((b) => (
              <div key={b.id} className="bg-white rounded-2xl border-2 border-red-100 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-full flex items-center justify-center text-white font-black shrink-0 ${b.role === "founder" ? "bg-gradient-to-br from-pink-400 to-purple-500" : "bg-gradient-to-br from-blue-400 to-indigo-500"}`}>
                      {b.nom?.[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-slate-900">{b.nom ?? b.user_id}</p>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${b.role === "founder" ? "bg-pink-50 text-pink-600" : "bg-blue-50 text-blue-600"}`}>
                          {b.role === "founder" ? "Founder" : "Developer"}
                        </span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${b.type === "permanent" ? "bg-red-100 text-red-600" : "bg-amber-50 text-amber-600"}`}>
                          {b.type === "permanent" ? "🚫 Définitif" : "⏸ Temporaire"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{b.raison}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Banni le {new Date(b.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                        {b.expires_at && ` · Jusqu'au ${new Date(b.expires_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0 items-end">
                    <button onClick={() => router.push(`/profil/${b.user_id}`)} className="text-xs text-indigo-500 hover:underline">Voir →</button>
                    <button onClick={() => liftBan(b.id, b.user_id)} disabled={liftingBan === b.id}
                      className="text-xs font-bold px-4 py-2 rounded-xl bg-green-50 text-green-600 border border-green-200 hover:bg-green-100 transition-colors disabled:opacity-50">
                      {liftingBan === b.id ? "..." : "✅ Lever le ban"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Modal ban */}
      {banTarget && adminId && (
        <BanModal
          isOpen={!!banTarget}
          onClose={() => setBanTarget(null)}
          targetUserId={banTarget.userId}
          targetNom={banTarget.nom}
          adminId={adminId}
          onBanned={() => setBanTarget(null)}
        />
      )}
    </div>
  );
}
