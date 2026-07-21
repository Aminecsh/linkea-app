"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import {
  Users,
  MessageCircle,
  Search,
  User,
  LogOut,
  Settings,
  ShieldCheck,
  FolderKanban,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import NotifToast from "@/components/NotifToast";

type Tab = {
  label: string;
  icon: React.ElementType;
  href: string;
};

type Profile = {
  nom: string;
  avatar_url?: string;
};

const ACTIVE_STATUTS = ["matched", "en_cours"];

export default function AppNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);
  const [role, setRole] = useState<string | null>(null);
  const [isBanned, setIsBanned] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeProjects, setActiveProjects] = useState<{ id: string; titre: string }[]>([]);
  const [projectsOpen, setProjectsOpen] = useState(false);

  // Ouvre le menu déroulant quand on arrive sur une page de gestion
  useEffect(() => {
    if (pathname.includes("/gestion")) setProjectsOpen(true);
  }, [pathname]);

  useEffect(() => {
    const cached = localStorage.getItem("lk_role");
    if (cached) setRole(cached);
    try {
      const cachedProjs = localStorage.getItem("lk_active_projects");
      if (cachedProjs) setActiveProjects(JSON.parse(cachedProjs));
    } catch { /* cache invalide, ignoré */ }
  }, []);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const now = new Date().toISOString();
      const { data: ban } = await supabase
        .from("bans").select("id").eq("user_id", user.id).eq("is_active", true)
        .or(`expires_at.is.null,expires_at.gt.${now}`).limit(1).maybeSingle();
      if (ban) {
        setIsBanned(true);
        if (!pathname.startsWith("/messages") && !pathname.startsWith("/support")) {
          router.push("/messages");
        }
        return;
      }

      const { data: roleData } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      const r = roleData?.role;
      setRole(r ?? null);
      if (r) localStorage.setItem("lk_role", r);
      if (!r || r === "admin") return;

      let convQuery;
      if (r === "founder") {
        const { data: p } = await supabase.from("profiles_founder").select("id, nom, avatar_url").eq("user_id", user.id).maybeSingle();
        if (!p) return;
        setProfile({ nom: p.nom, avatar_url: p.avatar_url });
        convQuery = await supabase.from("conversations").select("id").eq("founder_id", p.id);

        // Projets actifs (matched / en_cours) → accès direct gestion
        const { data: activeProjs } = await supabase
          .from("projects").select("id, titre")
          .eq("founder_id", p.id).in("statut", ACTIVE_STATUTS)
          .order("created_at", { ascending: false });
        const list = (activeProjs ?? []).map((proj) => ({ id: proj.id, titre: proj.titre }));
        setActiveProjects(list);
        localStorage.setItem("lk_active_projects", JSON.stringify(list));
      } else {
        const { data: p } = await supabase.from("profiles_developer").select("id, nom, avatar_url").eq("user_id", user.id).maybeSingle();
        if (!p) return;
        setProfile({ nom: p.nom, avatar_url: p.avatar_url });
        convQuery = await supabase.from("conversations").select("id").eq("developer_id", p.id);

        // Missions actives du dev : candidatures acceptées sur projets matched / en_cours
        const { data: cands } = await supabase
          .from("candidatures")
          .select("project_id, projects(id, titre, statut, created_at)")
          .eq("developer_id", p.id).eq("statut", "accepted");
        const active = (cands ?? [])
          .map((c) => c.projects as unknown as { id: string; titre: string; statut: string; created_at: string } | null)
          .filter((proj): proj is { id: string; titre: string; statut: string; created_at: string } =>
            !!proj && ACTIVE_STATUTS.includes(proj.statut))
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map((proj) => ({ id: proj.id, titre: proj.titre }));
        setActiveProjects(active);
        localStorage.setItem("lk_active_projects", JSON.stringify(active));
      }

      const convIds = convQuery?.data?.map((c: { id: string }) => c.id) ?? [];
      if (convIds.length === 0) return;

      let total = 0;
      for (const convId of convIds) {
        const lastRead = localStorage.getItem(`lastRead_${convId}`) ?? "1970-01-01";
        const { count } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("conversation_id", convId)
          .neq("sender_id", user.id)
          .gt("created_at", lastRead);
        total += count ?? 0;
      }
      setUnreadCount(total);
    }

    load();
  }, [pathname]);

  if (role === "admin") {
    return (
      <aside
        className="hidden md:flex fixed left-0 top-0 bottom-0 z-50 flex-col"
        style={{ width: "var(--lk-sidebar-w)", background: "var(--lk-ink)" }}
      >
        <div className="flex items-center gap-2.5 px-5 h-16">
          <Image src="/logo-mark.png" alt="Linkea" width={30} height={30} />
          <span className="font-bold text-white text-[15px] tracking-tight">Linkea</span>
        </div>
        <nav className="flex-1 px-3 pt-2">
          <SidebarLink
            icon={ShieldCheck}
            label="Admin"
            active={pathname.startsWith("/admin")}
            onClick={() => router.push("/admin")}
          />
        </nav>
        <div className="px-3 pb-5">
          <button
            onClick={async () => { await supabase.auth.signOut(); router.push("/connexion"); }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors"
            style={{ color: "rgba(255,255,255,0.5)" }}
          >
            <LogOut size={17} strokeWidth={2} />
            Déconnexion
          </button>
        </div>
      </aside>
    );
  }

  if (isBanned) {
    return (
      <div
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
        style={{
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(32px) saturate(200%)",
          WebkitBackdropFilter: "blur(32px) saturate(200%)",
          borderTop: "1px solid rgba(212,83,126,0.15)",
          boxShadow: "0 -4px 24px rgba(212,83,126,0.08)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div className="max-w-lg mx-auto flex items-stretch h-[60px]">
          <button
            onClick={() => router.push("/messages")}
            className="flex-1 flex flex-col items-center justify-center gap-[3px] transition-all duration-200"
          >
            <MessageCircle size={22} strokeWidth={2.2} style={{ color: "var(--lk-accent)" }} />
            <span className="text-[10px] font-semibold tracking-tight" style={{ color: "var(--lk-accent)" }}>
              Support
            </span>
          </button>
          <button
            onClick={async () => { await supabase.auth.signOut(); router.push("/connexion"); }}
            className="flex-1 flex flex-col items-center justify-center gap-[3px] transition-all duration-200 opacity-50 hover:opacity-80"
          >
            <LogOut size={20} strokeWidth={2} style={{ color: "var(--text)" }} />
            <span className="text-[10px] font-semibold tracking-tight" style={{ color: "var(--muted)" }}>
              Déconnexion
            </span>
          </button>
        </div>
      </div>
    );
  }

  // 1 seul projet actif → lien direct ; plusieurs → section listant chaque projet
  const singleGestionTab: Tab | null = activeProjects.length === 1
    ? { label: role === "founder" ? "Mon projet" : "Ma mission", icon: FolderKanban, href: `/projets/${activeProjects[0].id}/gestion` }
    : null;

  const tabs: Tab[] = role === "founder"
    ? [
        ...(singleGestionTab ? [singleGestionTab] : []),
        { label: "Trouver un dev", icon: Users,        href: "/devs"     },
        { label: "Messages",    icon: MessageCircle,   href: "/messages" },
      ]
    : [
        { label: "Projets",     icon: Search,          href: "/projets"  },
        ...(singleGestionTab ? [singleGestionTab] : []),
        { label: "Messages",    icon: MessageCircle,   href: "/messages" },
        { label: "Profil",      icon: User,            href: "/profil"   },
      ];

  // Tab mobile gestion : premier projet actif
  const mobileTabs: Tab[] = activeProjects.length > 1
    ? [...tabs.slice(0, 1), { label: role === "founder" ? "Mon projet" : "Ma mission", icon: FolderKanban, href: `/projets/${activeProjects[0].id}/gestion` }, ...tabs.slice(1)]
    : tabs;

  const initials = profile?.nom
    ? profile.nom.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()
    : "";

  return (
    <>
      <NotifToast />

      {/* ─── Desktop sidebar ───────────────────────────────────────── */}
      <aside
        className="hidden md:flex fixed left-0 top-0 bottom-0 z-50 flex-col"
        style={{ width: "var(--lk-sidebar-w)", background: "var(--lk-ink)" }}
      >
        <div className="flex items-center gap-2.5 px-5 h-16">
          <Image src="/logo-mark.png" alt="Linkea" width={30} height={30} />
          <span className="font-bold text-white text-[15px] tracking-tight">Linkea</span>
        </div>

        <nav className="flex-1 px-3 pt-2 flex flex-col gap-1">
          {tabs.map((tab) => {
            const active = tab.href.includes("/gestion")
              ? pathname.includes("/gestion")
              : pathname.startsWith(tab.href);
            const showBadge = tab.href === "/messages" && unreadCount > 0 && !pathname.startsWith("/messages");
            return (
              <SidebarLink
                key={tab.href}
                icon={tab.icon}
                label={tab.label}
                active={active}
                badge={showBadge ? unreadCount : undefined}
                onClick={() => router.push(tab.href)}
              />
            );
          })}

          {/* Plusieurs projets actifs → menu déroulant */}
          {activeProjects.length > 1 && (
            <>
              <button
                onClick={() => setProjectsOpen((o) => !o)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-medium transition-colors"
                style={{
                  background: pathname.includes("/gestion") && !projectsOpen ? "var(--lk-accent-soft)" : "transparent",
                  color: pathname.includes("/gestion") ? "var(--lk-accent)" : "rgba(255,255,255,0.65)",
                }}
              >
                <FolderKanban size={18} strokeWidth={2} style={{ color: pathname.includes("/gestion") ? "var(--lk-accent)" : "rgba(255,255,255,0.65)" }} />
                {role === "founder" ? "Mes projets" : "Mes missions"}
                <span
                  className="ml-auto flex items-center justify-center text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full"
                  style={{ background: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.65)" }}
                >
                  {activeProjects.length}
                </span>
                <ChevronDown
                  size={14}
                  strokeWidth={2}
                  className="transition-transform duration-150"
                  style={{ transform: projectsOpen ? "rotate(180deg)" : "none", color: "rgba(255,255,255,0.45)" }}
                />
              </button>
              {projectsOpen && (
                <div className="flex flex-col gap-0.5 pl-4">
                  {activeProjects.map((proj) => {
                    const active = pathname.startsWith(`/projets/${proj.id}/gestion`);
                    return (
                      <button
                        key={proj.id}
                        onClick={() => router.push(`/projets/${proj.id}/gestion`)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12.5px] font-medium transition-colors text-left"
                        style={{
                          background: active ? "var(--lk-accent-soft)" : "transparent",
                          color: active ? "var(--lk-accent)" : "rgba(255,255,255,0.55)",
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: active ? "var(--lk-accent)" : "rgba(255,255,255,0.25)" }}
                        />
                        <span className="truncate">{proj.titre}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          <div className="my-2 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
          <SidebarLink
            icon={Settings}
            label="Paramètres"
            active={pathname.startsWith("/parametres")}
            onClick={() => router.push("/parametres")}
          />
        </nav>

        <div className="px-3 pb-4">
          <button
            onClick={() => router.push("/profil")}
            className="w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl transition-colors hover:bg-white/5"
          >
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.nom}
                className="w-8 h-8 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-white"
                style={{ background: "var(--lk-accent)" }}
              >
                {initials || <User size={15} />}
              </div>
            )}
            <span className="text-[13px] font-medium truncate text-left" style={{ color: "rgba(255,255,255,0.85)" }}>
              {profile?.nom ?? "Mon profil"}
            </span>
          </button>
          <button
            onClick={async () => { await supabase.auth.signOut(); router.push("/connexion"); }}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 mt-0.5 rounded-xl text-[12px] font-medium transition-colors hover:bg-white/5"
            style={{ color: "rgba(255,255,255,0.45)" }}
          >
            <LogOut size={15} strokeWidth={2} />
            Déconnexion
          </button>
        </div>
      </aside>

      {/* ─── Mobile bottom tab bar ─────────────────────────────────── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
        style={{
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(32px) saturate(200%)",
          WebkitBackdropFilter: "blur(32px) saturate(200%)",
          borderTop: "1px solid var(--lk-divider)",
          boxShadow: "0 -4px 24px rgba(0,0,0,0.06)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div className="max-w-lg mx-auto flex items-stretch h-[60px]">
          {mobileTabs.map((tab) => {
            const active = tab.href.includes("/gestion")
              ? pathname.includes("/gestion")
              : pathname.startsWith(tab.href);
            const showBadge = tab.href === "/messages" && unreadCount > 0 && !pathname.startsWith("/messages");
            const Icon = tab.icon;

            return (
              <button
                key={tab.href}
                onClick={() => router.push(tab.href)}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-[3px] transition-all duration-200 relative",
                  active ? "opacity-100" : "opacity-45 hover:opacity-70"
                )}
              >
                <span className="relative">
                  <Icon
                    size={22}
                    strokeWidth={2}
                    style={{ color: active ? "var(--lk-accent)" : "var(--lk-ink)" }}
                  />
                  {showBadge && (
                    <span
                      className="absolute -top-1 -right-1.5 min-w-[16px] h-4 flex items-center justify-center px-1 text-white font-bold rounded-full border-2 border-white"
                      style={{
                        fontSize: 9,
                        background: "var(--lk-accent)",
                        boxShadow: "0 2px 6px rgba(212,83,126,0.4)",
                      }}
                    >
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </span>
                <span
                  className="text-[10px] font-semibold tracking-tight transition-all duration-200"
                  style={{ color: active ? "var(--lk-accent)" : "var(--lk-muted)" }}
                >
                  {tab.label}
                </span>
                {active && (
                  <span
                    className="absolute top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                    style={{ background: "var(--lk-accent)" }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

function SidebarLink({
  icon: Icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  active: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-medium transition-colors relative"
      style={{
        background: active ? "var(--lk-accent-soft)" : "transparent",
        color: active ? "var(--lk-accent)" : "rgba(255,255,255,0.65)",
      }}
    >
      <Icon size={18} strokeWidth={2} style={{ color: active ? "var(--lk-accent)" : "rgba(255,255,255,0.65)" }} />
      {label}
      {!!badge && (
        <span
          className="ml-auto min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold rounded-full text-white"
          style={{ background: "var(--lk-accent)" }}
        >
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}
