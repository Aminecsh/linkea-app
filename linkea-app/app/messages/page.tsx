"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth";
import AppNav from "@/components/AppNav";
import NotificationBell from "@/components/NotificationBell";
import { MessageCircle, Briefcase, ChevronDown, ChevronUp, Send, Users, Plus, X, Ban } from "lucide-react";

const C = { ink: "#1A2138", rose: "#D4537E", muted: "#8A8579", hairline: "#E5E5EA", canvas: "#F5F5F7", surface: "#FFFFFF" } as const;

type Conversation = {
  id: string;
  created_at: string;
  project_id: string;
  projects: { titre: string; statut: string };
  profiles_founder: { nom: string; user_id: string };
  profiles_developer: { nom: string; user_id: string };
  lastMessage?: string;
  lastMessageTime?: string;
  lastSenderId?: string;
  unreadCount: number;
  otherAvatarUrl?: string | null;
};

type SupportConv = {
  id: string;
  created_at: string;
  lastMessage?: string;
  unreadCount: number;
};

function formatTime(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  const now  = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH   = Math.floor(diffMs / 3600000);
  const diffD   = Math.floor(diffMs / 86400000);

  if (diffMin < 1)  return "à l'instant";
  if (diffMin < 60) return `${diffMin} min`;
  if (diffH   < 24) return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (diffD   < 7)  {
    const days = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];
    return days[date.getDay()];
  }
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export default function MessagesPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [supportConv, setSupportConv] = useState<SupportConv | null>(null);
  const [adminSupportConvs, setAdminSupportConvs] = useState<{ id: string; userId: string; nom: string; lastMessage?: string; unreadCount: number }[]>([]);
  const [isBanned, setIsBanned] = useState(false);
  const [banInfo, setBanInfo] = useState<{ type: string; raison: string; expires_at: string | null } | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [archivesOpen, setArchivesOpen] = useState(false);

  // Groups
  const [groups, setGroups] = useState<{ id: string; group_name: string; project_id: string; lastMessage?: string; lastMessageTime?: string; unreadCount: number }[]>([]);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [groupProjects, setGroupProjects] = useState<{ id: string; titre: string }[]>([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupProjectId, setNewGroupProjectId] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Compte à rebours du ban
  useEffect(() => {
    if (!banInfo?.expires_at) return;
    function tick() {
      const diff = new Date(banInfo!.expires_at!).getTime() - Date.now();
      if (diff <= 0) { setCountdown("Expiration en cours..."); return; }
      const j = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (j > 0) setCountdown(`${j}j ${h}h ${m}m ${s}s`);
      else if (h > 0) setCountdown(`${h}h ${m}m ${s}s`);
      else setCountdown(`${m}m ${s}s`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [banInfo]);

  useEffect(() => {
    async function load() {
      const user = await getAuthUser();
      if (!user) { router.push("/connexion"); return; }
      setUserId(user.id);

      // Vérifier ban
      const now = new Date().toISOString();
      const { data: ban } = await supabase
        .from("bans").select("id, type, raison, expires_at").eq("user_id", user.id).eq("is_active", true)
        .or(`expires_at.is.null,expires_at.gt.${now}`).limit(1).maybeSingle();

      if (ban) {
        setIsBanned(true);
        setBanInfo({ type: ban.type, raison: ban.raison, expires_at: ban.expires_at });
        const { data: sc } = await supabase
          .from("support_conversations").select("id, created_at").eq("user_id", user.id).maybeSingle();
        if (sc) {
          const lastRead = localStorage.getItem(`lastRead_support_${sc.id}`) ?? "1970-01-01";
          const [{ data: lastMsgs }, { count: unread }] = await Promise.all([
            supabase.from("support_messages").select("content, created_at, sender_id")
              .eq("conversation_id", sc.id).order("created_at", { ascending: false }).limit(1),
            supabase.from("support_messages").select("*", { count: "exact", head: true })
              .eq("conversation_id", sc.id).neq("sender_id", user.id).gt("created_at", lastRead),
          ]);
          setSupportConv({ id: sc.id, created_at: sc.created_at, lastMessage: lastMsgs?.[0]?.content, unreadCount: unread ?? 0 });
        }
        setLoading(false);
        return;
      }

      const { data: roleData } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      const r = roleData?.role ?? null;
      setRole(r);

      // Admin → charger les conversations support
      if (r === "admin") {
        const { data: sConvs } = await supabase
          .from("support_conversations").select("id, user_id, created_at").order("created_at", { ascending: false });
        if (sConvs && sConvs.length > 0) {
          const userIds = sConvs.map((c: { user_id: string }) => c.user_id);
          const [{ data: fP }, { data: dP }] = await Promise.all([
            supabase.from("profiles_founder").select("user_id, nom").in("user_id", userIds),
            supabase.from("profiles_developer").select("user_id, nom").in("user_id", userIds),
          ]);
          const nameMap: Record<string, string> = {};
          (fP ?? []).forEach((p: { user_id: string; nom: string }) => { nameMap[p.user_id] = p.nom; });
          (dP ?? []).forEach((p: { user_id: string; nom: string }) => { nameMap[p.user_id] = p.nom; });
          const enriched = await Promise.all(sConvs.map(async (c: { id: string; user_id: string }) => {
            const lastRead = localStorage.getItem(`lastRead_support_${c.id}`) ?? "1970-01-01";
            const [{ data: lastMsgs }, { count: unread }] = await Promise.all([
              supabase.from("support_messages").select("content").eq("conversation_id", c.id).order("created_at", { ascending: false }).limit(1),
              supabase.from("support_messages").select("*", { count: "exact", head: true }).eq("conversation_id", c.id).neq("sender_id", user.id).gt("created_at", lastRead),
            ]);
            return { id: c.id, userId: c.user_id, nom: nameMap[c.user_id] ?? "Utilisateur", lastMessage: lastMsgs?.[0]?.content, unreadCount: unread ?? 0 };
          }));
          setAdminSupportConvs(enriched as { id: string; userId: string; nom: string; lastMessage?: string; unreadCount: number }[]);
        }
        setLoading(false);
        return;
      }

      let convData: Conversation[] = [];

      if (r === "founder") {
        const { data: profile } = await supabase
          .from("profiles_founder").select("id").eq("user_id", user.id).maybeSingle();
        if (profile) {
          const { data } = await supabase
            .from("conversations")
            .select("id, created_at, project_id, projects(titre, statut), profiles_founder(nom, user_id), profiles_developer(nom, user_id)")
            .eq("founder_id", profile.id);
          convData = (data as unknown as Conversation[]) ?? [];
        }
      } else if (r === "developer") {
        const { data: profile } = await supabase
          .from("profiles_developer").select("id").eq("user_id", user.id).maybeSingle();
        if (profile) {
          const { data } = await supabase
            .from("conversations")
            .select("id, created_at, project_id, projects(titre, statut), profiles_founder(nom, user_id), profiles_developer(nom, user_id)")
            .eq("developer_id", profile.id);
          convData = (data as unknown as Conversation[]) ?? [];
        }
      }

      const enriched = await Promise.all(convData.map(async (c) => {
        const lastRead = localStorage.getItem(`lastRead_${c.id}`) ?? "1970-01-01";

        const otherUserId = r === "founder"
          ? c.profiles_developer?.user_id
          : c.profiles_founder?.user_id;

        const otherTable = r === "founder" ? "profiles_developer" : "profiles_founder";

        const [{ data: lastMsgs }, { count: unread }, { data: otherProf }] = await Promise.all([
          supabase.from("messages").select("content, created_at, sender_id")
            .eq("conversation_id", c.id)
            .order("created_at", { ascending: false })
            .limit(1),
          supabase.from("messages").select("*", { count: "exact", head: true })
            .eq("conversation_id", c.id)
            .neq("sender_id", user.id)
            .gt("created_at", lastRead),
          otherUserId
            ? supabase.from(otherTable).select("avatar_url").eq("user_id", otherUserId).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

        return {
          ...c,
          lastMessage:     lastMsgs?.[0]?.content ?? null,
          lastMessageTime: lastMsgs?.[0]?.created_at ?? c.created_at,
          lastSenderId:    lastMsgs?.[0]?.sender_id ?? null,
          unreadCount:     unread ?? 0,
          otherAvatarUrl:  (otherProf as { avatar_url?: string } | null)?.avatar_url ?? null,
        };
      }));

      // Trier par dernière activité
      enriched.sort((a, b) =>
        new Date(b.lastMessageTime ?? b.created_at).getTime() -
        new Date(a.lastMessageTime ?? a.created_at).getTime()
      );

      setConversations(enriched);

      // Load group conversations
      const { data: gpData } = await supabase
        .from("conversation_participants")
        .select("conversation_id, conversations(id, group_name, project_id, is_group)")
        .eq("user_id", user.id);

      if (gpData && gpData.length > 0) {
        const groupConvs = (gpData as unknown as { conversation_id: string; conversations: { id: string; group_name: string; project_id: string; is_group: boolean } | null }[])
          .filter((g) => g.conversations?.is_group)
          .map((g) => g.conversations!);

        const enrichedGroups = await Promise.all(groupConvs.map(async (g) => {
          const lastRead = localStorage.getItem(`lastRead_${g.id}`) ?? "1970-01-01";
          const [{ data: lastMsgs }, { count: unread }] = await Promise.all([
            supabase.from("messages").select("content, created_at").eq("conversation_id", g.id).order("created_at", { ascending: false }).limit(1),
            supabase.from("messages").select("*", { count: "exact", head: true }).eq("conversation_id", g.id).neq("sender_id", user.id).gt("created_at", lastRead),
          ]);
          return { id: g.id, group_name: g.group_name, project_id: g.project_id, lastMessage: lastMsgs?.[0]?.content ?? undefined, lastMessageTime: lastMsgs?.[0]?.created_at ?? undefined, unreadCount: unread ?? 0 };
        }));
        setGroups(enrichedGroups);
      }

      // Projects disponibles pour créer un groupe
      const projectIds = convData.map((c) => c.project_id).filter(Boolean);
      if (projectIds.length > 0) {
        const { data: projs } = await supabase.from("projects").select("id, titre").in("id", projectIds);
        setGroupProjects((projs ?? []) as { id: string; titre: string }[]);
      }

      setLoading(false);
    }
    load();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col pl-sidebar" style={{ background: "var(--bg)" }}>
        <div className="page-header px-4 py-4">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <div>
              <div className="skeleton h-3 w-14 mb-2 rounded" />
              <div className="skeleton h-7 w-32 rounded" />
            </div>
            <div className="skeleton w-9 h-9 rounded-full" />
          </div>
        </div>
        <div className="max-w-2xl mx-auto w-full px-4 py-4 flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-4 flex gap-3 items-center">
              <div className="skeleton w-12 h-12 rounded-full shrink-0" />
              <div className="flex-1 flex flex-col gap-2">
                <div className="skeleton h-4 w-32 rounded" />
                <div className="skeleton h-3 w-48 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Vue banni ────────────────────────────────────────────────────────────────
  if (isBanned) {
    return (
      <div className="min-h-screen pb-nav pl-sidebar" style={{ background: "var(--bg)" }}>
        <div className="page-header px-4 py-4">
          <div className="max-w-2xl mx-auto">
            <p className="label mb-1" style={{ color: "var(--rose)" }}>Compte suspendu</p>
            <h1 className="text-xl font-bold" style={{ color: "var(--text)", letterSpacing: "-0.025em" }}>Support Linkea</h1>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-4 py-4 flex flex-col gap-3">
          {/* Infos ban */}
          <div style={{ borderRadius: 16, overflow: "hidden", border: `1px solid ${C.hairline}`, background: C.surface }}>
            <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${C.hairline}`, background: C.canvas, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Ban size={16} strokeWidth={2} style={{ color: C.rose }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: C.ink, margin: 0 }}>
                  Compte {banInfo?.type === "permanent" ? "banni définitivement" : "suspendu"}
                </p>
                {banInfo?.raison && (
                  <p style={{ fontSize: 12, color: C.muted, margin: "2px 0 0" }}>Motif : {banInfo.raison}</p>
                )}
              </div>
            </div>
            {banInfo?.type === "temp" && banInfo.expires_at && countdown && (
              <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", background: C.canvas, borderTop: `1px solid ${C.hairline}` }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>Levée du ban dans</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{countdown}</span>
              </div>
            )}
            {banInfo?.type === "permanent" && (
              <div style={{ padding: "12px 16px", background: C.canvas, borderTop: `1px solid ${C.hairline}` }}>
                <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Cette suspension est définitive. Contacte le support pour contester.</p>
              </div>
            )}
          </div>
          {supportConv ? (
            <div onClick={() => router.push(`/support/${supportConv.id}`)}
              className="cursor-pointer active:scale-[0.99] transition-transform"
              style={{ WebkitTapHighlightColor: "transparent" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 16, background: C.surface, border: `1px solid ${C.hairline}` }}>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: C.ink, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 17, fontWeight: 600, color: "#fff", lineHeight: 1 }}>L</span>
                  </div>
                  {supportConv.unreadCount > 0 && (
                    <div style={{ position: "absolute", top: -3, right: -3, minWidth: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", borderRadius: 999, padding: "0 4px", background: C.rose, fontSize: 10, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                      {supportConv.unreadCount > 9 ? "9+" : supportConv.unreadCount}
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>Support Linkea</span>
                  <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Équipe Linkea</p>
                  {supportConv.lastMessage && (
                    <p style={{ fontSize: 12, color: C.muted, margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{supportConv.lastMessage}</p>
                  )}
                </div>
                <svg width="8" height="14" viewBox="0 0 8 14" fill="none" style={{ color: C.hairline, flexShrink: 0 }}>
                  <path d="M1 1l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 0", borderRadius: 16, background: C.surface, border: `1px solid ${C.hairline}` }}>
              <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>Conversation en cours de création...</p>
            </div>
          )}

          {/* Déconnexion */}
          <button
            onClick={async () => { await supabase.auth.signOut(); router.push("/connexion"); }}
            style={{ width: "100%", padding: "12px 0", borderRadius: 12, fontSize: 14, fontWeight: 600, background: C.surface, border: `1px solid ${C.hairline}`, color: C.muted, cursor: "pointer" }}
          >
            Se déconnecter
          </button>
        </div>
        <AppNav />
      </div>
    );
  }

  // ── Vue admin ────────────────────────────────────────────────────────────────
  if (role === "admin") {
    const totalUnreadAdmin = adminSupportConvs.reduce((s, c) => s + c.unreadCount, 0);
    return (
      <div className="min-h-screen pb-nav pl-sidebar" style={{ background: "var(--bg)" }}>
        <div className="page-header px-4 py-4">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push("/admin")} style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 10, background: "none", border: "none", cursor: "pointer", color: C.muted }}>
                <svg width="8" height="14" viewBox="0 0 8 14" fill="none"><path d="M7 1L1 7l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <div>
                <p className="label mb-1">Admin</p>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold" style={{ color: "var(--text)", letterSpacing: "-0.025em" }}>Support</h1>
                  {totalUnreadAdmin > 0 && (
                    <div className="flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-white"
                      style={{ background: "var(--rose)", fontSize: 11, fontWeight: 800 }}>
                      {totalUnreadAdmin}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <NotificationBell />
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-4 py-4 flex flex-col gap-2">
          {adminSupportConvs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 rounded-2xl mt-4"
              style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.07)" }}>
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: "var(--rose-soft)", border: "1px solid var(--rose-border)" }}>
                <MessageCircle size={28} style={{ color: "var(--rose)" }} />
              </div>
              <p className="font-bold text-base mb-1" style={{ color: "var(--text)" }}>Aucune conversation support</p>
            </div>
          ) : adminSupportConvs.map((c) => (
            <div key={c.id} onClick={() => router.push(`/support/${c.id}`)}
              className="cursor-pointer active:scale-[0.99] transition-transform"
              style={{ WebkitTapHighlightColor: "transparent" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 16, background: C.surface, border: c.unreadCount > 0 ? `1px solid ${C.rose}` : `1px solid ${C.hairline}` }}>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: C.ink, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 17, fontWeight: 600, color: "#fff", lineHeight: 1 }}>{c.nom[0]?.toUpperCase() ?? "?"}</span>
                  </div>
                  {c.unreadCount > 0 && (
                    <div style={{ position: "absolute", top: -3, right: -3, minWidth: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", borderRadius: 999, padding: "0 4px", background: C.rose, fontSize: 10, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                      {c.unreadCount > 9 ? "9+" : c.unreadCount}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{c.nom}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", padding: "2px 7px", borderRadius: 6, border: `1px solid ${C.hairline}`, background: C.canvas, color: C.rose }}>
                      Banni
                    </span>
                  </div>
                  {c.lastMessage && (
                    <p className="text-xs truncate" style={{ color: C.muted }}>{c.lastMessage}</p>
                  )}
                </div>
                <svg width="8" height="14" viewBox="0 0 8 14" fill="none" style={{ color: C.hairline, flexShrink: 0 }}>
                  <path d="M1 1l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          ))}
        </div>
        <AppNav />
      </div>
    );
  }

  const ARCHIVED = ["livre", "termine"];
  const active   = conversations.filter((c) => !ARCHIVED.includes(c.projects?.statut));
  const archived = conversations.filter((c) =>  ARCHIVED.includes(c.projects?.statut));
  const totalUnread = active.reduce((sum, c) => sum + c.unreadCount, 0);

  function ConvCard({ c, isArchived }: { c: Conversation; isArchived?: boolean }) {
    const otherNom = role === "founder" ? c.profiles_developer?.nom : c.profiles_founder?.nom;
    const initial  = otherNom?.[0]?.toUpperCase() ?? "?";
    const hasUnread = c.unreadCount > 0 && !isArchived;
    const isMine    = c.lastSenderId === userId;

    return (
      <div
        onClick={() => router.push(`/messages/${c.id}`)}
        className="cursor-pointer active:scale-[0.99] transition-transform"
        style={{ WebkitTapHighlightColor: "transparent" }}
      >
        <div
          style={{
            display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 16,
            background: C.surface,
            border: hasUnread ? `1px solid ${C.rose}` : `1px solid ${C.hairline}`,
            opacity: isArchived ? 0.7 : 1,
          }}
        >
          {/* Avatar */}
          <div className="relative shrink-0">
            {c.otherAvatarUrl ? (
              <img
                src={c.otherAvatarUrl}
                alt={otherNom}
                style={{ width: 44, height: 44, borderRadius: 12, objectFit: "cover", border: `1px solid ${C.hairline}`, display: "block" }}
              />
            ) : (
              <div style={{ width: 44, height: 44, borderRadius: 12, background: isArchived ? C.hairline : C.ink, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 17, fontWeight: 600, color: isArchived ? C.muted : "#fff", lineHeight: 1 }}>{initial}</span>
              </div>
            )}
            {/* Badge non-lu */}
            {hasUnread && (
              <div style={{ position: "absolute", top: -3, right: -3, minWidth: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", borderRadius: 999, padding: "0 4px", background: C.rose, fontSize: 10, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                {c.unreadCount > 9 ? "9+" : c.unreadCount}
              </div>
            )}
          </div>

          {/* Contenu */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <span
                className="truncate"
                style={{ fontSize: 14, color: isArchived ? C.muted : C.ink, fontWeight: hasUnread ? 700 : 600, letterSpacing: "-0.01em" }}
              >
                {otherNom ?? "—"}
              </span>
              <span
                className="shrink-0 text-xs"
                style={{ color: hasUnread ? C.rose : C.muted, fontWeight: hasUnread ? 700 : 400, fontVariantNumeric: "tabular-nums" }}
              >
                {formatTime(c.lastMessageTime)}
              </span>
            </div>

            {/* Sous-titre projet */}
            <div className="flex items-center gap-1 mb-1">
              <Briefcase size={10} style={{ color: C.muted, flexShrink: 0 }} />
              <span className="text-xs truncate" style={{ color: C.muted, fontWeight: 500 }}>
                {c.projects?.titre ?? "Projet"}
              </span>
            </div>

            {/* Dernier message */}
            <div className="flex items-center gap-1">
              {isMine && !isArchived && (
                <Send size={10} style={{ color: C.muted, flexShrink: 0 }} />
              )}
              <p
                className="text-xs truncate"
                style={{
                  color: hasUnread ? C.ink : C.muted,
                  fontWeight: hasUnread ? 600 : 400,
                  fontStyle: !c.lastMessage ? "italic" : "normal",
                }}
              >
                {c.lastMessage ?? "Démarrer la conversation..."}
              </p>
            </div>
          </div>

          {/* Chevron */}
          <div style={{ color: C.hairline, flexShrink: 0 }}>
            <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
              <path d="M1 1l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-nav pl-sidebar" style={{ background: "var(--bg)" }}>

      {/* Header */}
      <div className="page-header px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <p className="label mb-1">Linkea</p>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold" style={{ color: "var(--text)", letterSpacing: "-0.025em" }}>
                Messages
              </h1>
              {totalUnread > 0 && (
                <div
                  className="flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-white"
                  style={{ background: "var(--rose)", fontSize: 11, fontWeight: 800 }}
                >
                  {totalUnread}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {groupProjects.length > 0 && (
              <button
                onClick={() => setShowNewGroup(true)}
                style={{ width: 36, height: 36, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: C.surface, border: `1px solid ${C.hairline}`, cursor: "pointer" }}
                title="Créer un groupe"
              >
                <Plus size={16} strokeWidth={2} style={{ color: C.ink }} />
              </button>
            )}
            <NotificationBell />
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 flex flex-col gap-2">

        {/* État vide */}
        {active.length === 0 && archived.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-16 rounded-2xl mt-4"
            style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.07)" }}
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: "var(--rose-soft)", border: "1px solid var(--rose-border)" }}
            >
              <MessageCircle size={28} style={{ color: "var(--rose)" }} />
            </div>
            <p className="font-bold text-base mb-1" style={{ color: "var(--text)", letterSpacing: "-0.02em" }}>
              Aucune conversation
            </p>
            <p className="text-sm text-center px-8" style={{ color: "var(--muted)" }}>
              {role === "founder"
                ? "Tes échanges avec les devs apparaîtront ici."
                : "Tes échanges avec les founders apparaîtront ici."}
            </p>
          </div>
        ) : (
          <>
            {/* Convs actives */}
            {active.length > 0 && (
              <div className="flex flex-col gap-2">
                {active.map((c) => <ConvCard key={c.id} c={c} />)}
              </div>
            )}

            {/* Groupes */}
            {groups.length > 0 && (
              <div className="mt-2">
                <div className="flex items-center gap-2 py-2 px-1 mb-1">
                  <span className="label">Groupes</span>
                  <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                  <span className="label">{groups.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {groups.map((g) => (
                    <div key={g.id} onClick={() => router.push(`/messages/${g.id}`)}
                      className="cursor-pointer active:scale-[0.99] transition-transform"
                      style={{ WebkitTapHighlightColor: "transparent" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 16, background: C.surface, border: g.unreadCount > 0 ? `1px solid ${C.rose}` : `1px solid ${C.hairline}` }}>
                        <div className="relative shrink-0">
                          <div style={{ width: 44, height: 44, borderRadius: 12, background: C.ink, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Users size={18} strokeWidth={1.8} style={{ color: "#fff" }} />
                          </div>
                          {g.unreadCount > 0 && (
                            <div style={{ position: "absolute", top: -3, right: -3, minWidth: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", borderRadius: 999, padding: "0 4px", background: C.rose, fontSize: 10, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                              {g.unreadCount > 9 ? "9+" : g.unreadCount}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <span className="truncate text-sm font-semibold" style={{ color: C.ink }}>{g.group_name || "Groupe"}</span>
                            <span className="shrink-0 text-xs" style={{ color: C.muted, fontVariantNumeric: "tabular-nums" }}>{formatTime(g.lastMessageTime)}</span>
                          </div>
                          <p className="text-xs truncate" style={{ color: C.muted, fontStyle: !g.lastMessage ? "italic" : "normal" }}>
                            {g.lastMessage ?? "Démarrer la discussion..."}
                          </p>
                        </div>
                        <svg width="8" height="14" viewBox="0 0 8 14" fill="none" style={{ color: C.hairline, flexShrink: 0 }}>
                          <path d="M1 1l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Archives collapsibles */}
            {archived.length > 0 && (
              <div className="mt-2">
                <button
                  onClick={() => setArchivesOpen((v) => !v)}
                  className="w-full flex items-center gap-2 py-3 px-1"
                >
                  <span className="label">Archives</span>
                  <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                  <span className="label">{archived.length}</span>
                  {archivesOpen
                    ? <ChevronUp size={13} style={{ color: "var(--subtle)" }} />
                    : <ChevronDown size={13} style={{ color: "var(--subtle)" }} />
                  }
                </button>

                {archivesOpen && (
                  <div className="flex flex-col gap-2 opacity-75">
                    {archived.map((c) => <ConvCard key={c.id} c={c} isArchived />)}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <AppNav />

      {/* ── Modal nouveau groupe ── */}
      {showNewGroup && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 px-4 pb-6"
          onClick={() => setShowNewGroup(false)}>
          <div style={{ width: "100%", maxWidth: 384, background: C.surface, borderRadius: 20, border: `1px solid ${C.hairline}`, padding: 24, display: "flex", flexDirection: "column", gap: 16 }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div style={{ width: 40, height: 40, borderRadius: 12, background: C.ink, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Users size={18} strokeWidth={1.8} style={{ color: "#fff" }} />
                </div>
                <p style={{ fontFamily: "var(--font-sans)", fontSize: 17, fontWeight: 600, color: C.ink, margin: 0 }}>Nouveau groupe</p>
              </div>
              <button onClick={() => setShowNewGroup(false)} style={{ width: 32, height: 32, borderRadius: 10, background: C.canvas, border: `1px solid ${C.hairline}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.muted }}>
                <X size={16} />
              </button>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: C.muted, marginBottom: 8 }}>Nom du groupe</label>
              <input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                style={{ width: "100%", padding: "11px 14px", borderRadius: 12, border: `1px solid ${C.hairline}`, background: C.surface, fontSize: 14, color: C.ink, outline: "none" }}
                placeholder="Ex: Cybercamp — Équipe dev"
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: C.muted, marginBottom: 8 }}>Projet associé</label>
              <select
                value={newGroupProjectId}
                onChange={(e) => setNewGroupProjectId(e.target.value)}
                style={{ width: "100%", padding: "11px 14px", borderRadius: 12, border: `1px solid ${C.hairline}`, background: C.surface, fontSize: 14, color: C.ink, outline: "none", appearance: "none" }}
              >
                <option value="">Choisir un projet...</option>
                {groupProjects.map((p) => (
                  <option key={p.id} value={p.id}>{p.titre}</option>
                ))}
              </select>
            </div>

            <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Tous les membres du projet sélectionné seront ajoutés automatiquement.</p>

            <button
              onClick={async () => {
                if (!newGroupProjectId || creatingGroup) return;
                setCreatingGroup(true);
                const user = await getAuthUser();
                if (!user) { setCreatingGroup(false); return; }

                // Créer la conversation groupe
                const { data: conv } = await supabase.from("conversations").insert({
                  project_id: newGroupProjectId,
                  is_group: true,
                  group_name: newGroupName.trim() || groupProjects.find((p) => p.id === newGroupProjectId)?.titre + " — Groupe",
                }).select().maybeSingle();

                if (conv) {
                  // Ajouter le créateur comme participant
                  await supabase.from("conversation_participants").insert({ conversation_id: conv.id, user_id: user.id });

                  // Trouver les membres du projet via les conversations existantes
                  const { data: convMembers } = await supabase
                    .from("conversations")
                    .select("profiles_founder(user_id), profiles_developer(user_id)")
                    .eq("project_id", newGroupProjectId)
                    .neq("is_group", true);

                  const memberIds = new Set<string>([user.id]);
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (convMembers ?? []).forEach((c: any) => {
                    if (c.profiles_founder?.user_id) memberIds.add(c.profiles_founder.user_id);
                    if (c.profiles_developer?.user_id) memberIds.add(c.profiles_developer.user_id);
                  });

                  const otherMembers = [...memberIds].filter((uid) => uid !== user.id);
                  if (otherMembers.length > 0) {
                    await supabase.from("conversation_participants").insert(
                      otherMembers.map((uid) => ({ conversation_id: conv.id, user_id: uid }))
                    );
                  }

                  setShowNewGroup(false);
                  setNewGroupName("");
                  setNewGroupProjectId("");
                  router.push(`/messages/${conv.id}`);
                }
                setCreatingGroup(false);
              }}
              disabled={creatingGroup || !newGroupProjectId}
              style={{ width: "100%", padding: "14px 0", borderRadius: 12, fontSize: 14, fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: C.rose, border: "none", cursor: "pointer", opacity: (creatingGroup || !newGroupProjectId) ? 0.4 : 1 }}
            >
              {creatingGroup
                ? <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "lk-spin 0.8s linear infinite" }} />
                : <><Users size={15} strokeWidth={2} /> Créer le groupe</>}
            </button>
            <style>{`@keyframes lk-spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        </div>
      )}
    </div>
  );
}
