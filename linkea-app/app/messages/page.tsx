"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import BottomNav from "@/components/BottomNav";
import NotificationBell from "@/components/NotificationBell";

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

type SupportConv = { id: string; created_at: string; lastMessage?: string; unreadCount: number; };

const C = { ink: "#1A2138", rose: "#D4537E", muted: "#8A8579", hairline: "#ECE7DD", canvas: "#FAF8F4", surface: "#FFFFFF" };

function formatTime(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  const now  = new Date();
  const diffMs  = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH   = Math.floor(diffMs / 3600000);
  const diffD   = Math.floor(diffMs / 86400000);
  if (diffMin < 1)  return "à l'instant";
  if (diffMin < 60) return `${diffMin} min`;
  if (diffH   < 24) return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (diffD   < 7)  return ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."][date.getDay()];
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export default function MessagesPage() {
  const router = useRouter();
  const [conversations,     setConversations]     = useState<Conversation[]>([]);
  const [supportConv,       setSupportConv]       = useState<SupportConv | null>(null);
  const [adminSupportConvs, setAdminSupportConvs] = useState<{ id: string; userId: string; nom: string; lastMessage?: string; unreadCount: number }[]>([]);
  const [isBanned,          setIsBanned]          = useState(false);
  const [banInfo,           setBanInfo]           = useState<{ type: string; raison: string; expires_at: string | null } | null>(null);
  const [countdown,         setCountdown]         = useState<string | null>(null);
  const [loading,           setLoading]           = useState(true);
  const [role,              setRole]              = useState<string | null>(null);
  const [userId,            setUserId]            = useState<string | null>(null);
  const [archivesOpen,      setArchivesOpen]      = useState(false);

  // Compte à rebours ban
  useEffect(() => {
    if (!banInfo?.expires_at) return;
    function tick() {
      const diff = new Date(banInfo!.expires_at!).getTime() - Date.now();
      if (diff <= 0) { setCountdown("Expiration en cours…"); return; }
      const j = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (j > 0) setCountdown(`${j}j ${h}h ${m}m ${s}s`);
      else if (h > 0) setCountdown(`${h}h ${m}m ${s}s`);
      else setCountdown(`${m}m ${s}s`);
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [banInfo]);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }
      setUserId(user.id);

      const now = new Date().toISOString();
      const { data: ban } = await supabase
        .from("bans").select("id, type, raison, expires_at").eq("user_id", user.id).eq("is_active", true)
        .or(`expires_at.is.null,expires_at.gt.${now}`).limit(1).maybeSingle();

      if (ban) {
        setIsBanned(true);
        setBanInfo({ type: ban.type, raison: ban.raison, expires_at: ban.expires_at });
        const { data: sc } = await supabase.from("support_conversations").select("id, created_at").eq("user_id", user.id).maybeSingle();
        if (sc) {
          const lastRead = localStorage.getItem(`lastRead_support_${sc.id}`) ?? "1970-01-01";
          const [{ data: lastMsgs }, { count: unread }] = await Promise.all([
            supabase.from("support_messages").select("content, created_at, sender_id").eq("conversation_id", sc.id).order("created_at", { ascending: false }).limit(1),
            supabase.from("support_messages").select("*", { count: "exact", head: true }).eq("conversation_id", sc.id).neq("sender_id", user.id).gt("created_at", lastRead),
          ]);
          setSupportConv({ id: sc.id, created_at: sc.created_at, lastMessage: lastMsgs?.[0]?.content, unreadCount: unread ?? 0 });
        }
        setLoading(false);
        return;
      }

      const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      const r = roleData?.role ?? null;
      setRole(r);

      if (r === "admin") {
        const { data: sConvs } = await supabase.from("support_conversations").select("id, user_id, created_at").order("created_at", { ascending: false });
        if (sConvs?.length) {
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
        const { data: profile } = await supabase.from("profiles_founder").select("id").eq("user_id", user.id).maybeSingle();
        if (profile) {
          const { data } = await supabase.from("conversations")
            .select("id, created_at, project_id, projects(titre, statut), profiles_founder(nom, user_id), profiles_developer(nom, user_id)")
            .eq("founder_id", profile.id);
          convData = (data as unknown as Conversation[]) ?? [];
        }
      } else if (r === "developer") {
        const { data: profile } = await supabase.from("profiles_developer").select("id").eq("user_id", user.id).maybeSingle();
        if (profile) {
          const { data } = await supabase.from("conversations")
            .select("id, created_at, project_id, projects(titre, statut), profiles_founder(nom, user_id), profiles_developer(nom, user_id)")
            .eq("developer_id", profile.id);
          convData = (data as unknown as Conversation[]) ?? [];
        }
      }

      const enriched = await Promise.all(convData.map(async (c) => {
        const lastRead    = localStorage.getItem(`lastRead_${c.id}`) ?? "1970-01-01";
        const otherUserId = r === "founder" ? c.profiles_developer?.user_id : c.profiles_founder?.user_id;
        const otherTable  = r === "founder" ? "profiles_developer" : "profiles_founder";
        const [{ data: lastMsgs }, { count: unread }, { data: otherProf }] = await Promise.all([
          supabase.from("messages").select("content, created_at, sender_id").eq("conversation_id", c.id).order("created_at", { ascending: false }).limit(1),
          supabase.from("messages").select("*", { count: "exact", head: true }).eq("conversation_id", c.id).neq("sender_id", user.id).gt("created_at", lastRead),
          otherUserId ? supabase.from(otherTable).select("avatar_url").eq("user_id", otherUserId).maybeSingle() : Promise.resolve({ data: null }),
        ]);
        return { ...c, lastMessage: lastMsgs?.[0]?.content ?? null, lastMessageTime: lastMsgs?.[0]?.created_at ?? c.created_at, lastSenderId: lastMsgs?.[0]?.sender_id ?? null, unreadCount: unread ?? 0, otherAvatarUrl: (otherProf as { avatar_url?: string } | null)?.avatar_url ?? null };
      }));
      enriched.sort((a, b) => new Date(b.lastMessageTime ?? b.created_at).getTime() - new Date(a.lastMessageTime ?? a.created_at).getTime());
      setConversations(enriched);
      setLoading(false);
    }
    load();
  }, [router]);

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: "100vh", background: C.canvas, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${C.ink}`, borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // ── Vue banni ────────────────────────────────────────────────────────────────
  if (isBanned) return (
    <div style={{ minHeight: "100vh", background: C.canvas, paddingBottom: 80, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <style>{`.lk-conv:hover { background: ${C.canvas}; }`}</style>

      <div style={{ background: C.surface, borderBottom: `1.5px solid ${C.hairline}`, padding: "18px 24px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: C.rose, margin: "0 0 4px" }}>Compte suspendu</p>
          <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em", color: C.ink, margin: 0 }}>Support Linkea</h1>
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ background: C.surface, border: `1.5px solid ${C.rose}`, borderRadius: 16 }}>
          <div style={{ padding: "16px 20px", borderBottom: banInfo?.type === "temp" || banInfo?.type === "permanent" ? `1px solid ${C.hairline}` : "none" }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: C.rose, margin: "0 0 4px" }}>
              Compte {banInfo?.type === "permanent" ? "banni définitivement" : "suspendu temporairement"}
            </p>
            {banInfo?.raison && <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Motif : {banInfo.raison}</p>}
          </div>
          {banInfo?.type === "temp" && banInfo.expires_at && countdown && (
            <div style={{ padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: C.muted }}>Levée du ban dans</span>
              <span style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 18, fontWeight: 600, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{countdown}</span>
            </div>
          )}
          {banInfo?.type === "permanent" && (
            <div style={{ padding: "12px 20px" }}>
              <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Cette suspension est définitive. Contacte le support pour contester.</p>
            </div>
          )}
        </div>

        {supportConv ? (
          <div onClick={() => router.push(`/support/${supportConv.id}`)} className="lk-conv"
            style={{ background: C.surface, border: `1.5px solid ${supportConv.unreadCount > 0 ? C.rose : C.hairline}`, borderRadius: 14, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", transition: "background 0.1s" }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <div style={{ width: 42, height: 42, borderRadius: "50%", background: C.ink, color: "#fff", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>L</div>
              {supportConv.unreadCount > 0 && (
                <span style={{ position: "absolute", top: -2, right: -2, minWidth: 16, height: 16, borderRadius: "50%", background: C.rose, color: "#fff", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>{supportConv.unreadCount}</span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: C.ink, margin: "0 0 2px" }}>Support Linkea</p>
              {supportConv.lastMessage
                ? <p style={{ fontSize: 12, color: C.muted, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{supportConv.lastMessage}</p>
                : <p style={{ fontSize: 12, color: C.muted, margin: 0, fontStyle: "italic" }}>Démarrer la conversation…</p>
              }
            </div>
            <span style={{ color: C.muted, fontSize: 18 }}>›</span>
          </div>
        ) : (
          <div style={{ background: C.surface, border: `1.5px solid ${C.hairline}`, borderRadius: 14, padding: "32px", textAlign: "center" }}>
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Conversation en cours de création…</p>
          </div>
        )}

        <button onClick={async () => { await supabase.auth.signOut(); router.push("/connexion"); }}
          style={{ padding: "13px", borderRadius: 12, background: "none", border: `1.5px solid ${C.hairline}`, fontSize: 13, fontWeight: 600, color: C.muted, cursor: "pointer" }}>
          Se déconnecter
        </button>
      </div>
      <BottomNav />
    </div>
  );

  // ── Vue admin ────────────────────────────────────────────────────────────────
  if (role === "admin") {
    const totalUnread = adminSupportConvs.reduce((s, c) => s + c.unreadCount, 0);
    return (
      <div style={{ minHeight: "100vh", background: C.canvas, paddingBottom: 80, fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <style>{`.lk-conv:hover { background: ${C.canvas}; }`}</style>

        <header style={{ background: C.surface, borderBottom: `1.5px solid ${C.hairline}` }}>
          <div style={{ maxWidth: 560, margin: "0 auto", padding: "16px 24px", display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => router.push("/admin")}
              style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 18, padding: "4px 6px" }}>←</button>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: C.muted, margin: "0 0 3px" }}>Admin</p>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 20, fontWeight: 600, letterSpacing: "-0.03em", color: C.ink, margin: 0 }}>Support</h1>
                {totalUnread > 0 && (
                  <span style={{ minWidth: 18, height: 18, borderRadius: "50%", background: C.rose, color: "#fff", fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{totalUnread}</span>
                )}
              </div>
            </div>
          </div>
        </header>

        <div style={{ maxWidth: 560, margin: "0 auto", padding: "16px 24px", display: "flex", flexDirection: "column", gap: 8 }}>
          {adminSupportConvs.length === 0 ? (
            <div style={{ background: C.surface, border: `1.5px solid ${C.hairline}`, borderRadius: 16, padding: "48px 32px", textAlign: "center", marginTop: 8 }}>
              <p style={{ fontSize: 13, color: C.muted }}>Aucune conversation support pour l&apos;instant.</p>
            </div>
          ) : adminSupportConvs.map((c) => (
            <div key={c.id} onClick={() => router.push(`/support/${c.id}`)} className="lk-conv"
              style={{ background: C.surface, border: `1.5px solid ${c.unreadCount > 0 ? C.rose : C.hairline}`, borderRadius: 14, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", transition: "background 0.1s" }}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <div style={{ width: 42, height: 42, borderRadius: "50%", background: C.ink, color: "#fff", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {c.nom[0]?.toUpperCase() ?? "?"}
                </div>
                {c.unreadCount > 0 && (
                  <span style={{ position: "absolute", top: -2, right: -2, minWidth: 16, height: 16, borderRadius: "50%", background: C.rose, color: "#fff", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>{c.unreadCount > 9 ? "9+" : c.unreadCount}</span>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <p style={{ fontSize: 14, fontWeight: c.unreadCount > 0 ? 700 : 600, color: c.unreadCount > 0 ? C.rose : C.ink, margin: 0 }}>{c.nom}</p>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 5, border: `1px solid ${C.hairline}`, color: C.muted }}>Suspendu</span>
                </div>
                {c.lastMessage && <p style={{ fontSize: 12, color: C.muted, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.lastMessage}</p>}
              </div>
              <span style={{ color: C.muted, fontSize: 18, flexShrink: 0 }}>›</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Vue utilisateur ──────────────────────────────────────────────────────────
  const ARCHIVED  = ["livre", "termine"];
  const active    = conversations.filter((c) => !ARCHIVED.includes(c.projects?.statut));
  const archived  = conversations.filter((c) =>  ARCHIVED.includes(c.projects?.statut));
  const totalUnread = active.reduce((sum, c) => sum + c.unreadCount, 0);

  function ConvCard({ c, isArchived }: { c: Conversation; isArchived?: boolean }) {
    const otherNom  = role === "founder" ? c.profiles_developer?.nom : c.profiles_founder?.nom;
    const initial   = otherNom?.[0]?.toUpperCase() ?? "?";
    const hasUnread = c.unreadCount > 0 && !isArchived;
    const isMine    = c.lastSenderId === userId;

    return (
      <div onClick={() => router.push(`/messages/${c.id}`)} className="lk-conv"
        style={{ background: C.surface, border: `1.5px solid ${hasUnread ? C.rose : C.hairline}`, borderRadius: 14, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", transition: "background 0.1s" }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          {c.otherAvatarUrl ? (
            <img src={c.otherAvatarUrl} alt={otherNom} style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", border: `1.5px solid ${C.hairline}` }} />
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: isArchived ? C.muted : C.ink, color: "#fff", fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {initial}
            </div>
          )}
          {hasUnread && (
            <span style={{ position: "absolute", top: -2, right: -2, minWidth: 16, height: 16, borderRadius: "50%", background: C.rose, color: "#fff", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>
              {c.unreadCount > 9 ? "9+" : c.unreadCount}
            </span>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 14, fontWeight: hasUnread ? 700 : 600, color: isArchived ? C.muted : C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {otherNom ?? "—"}
            </span>
            <span style={{ fontSize: 11, color: hasUnread ? C.rose : C.muted, fontVariantNumeric: "tabular-nums", flexShrink: 0, fontWeight: hasUnread ? 700 : 400 }}>
              {formatTime(c.lastMessageTime)}
            </span>
          </div>

          <p style={{ fontSize: 11, color: C.muted, margin: "0 0 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {c.projects?.titre ?? "Projet"}
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {isMine && !isArchived && <span style={{ fontSize: 11, color: C.muted }}>↑</span>}
            <p style={{ fontSize: 12, color: hasUnread ? C.ink : C.muted, fontWeight: hasUnread ? 600 : 400, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontStyle: !c.lastMessage ? "italic" : "normal" }}>
              {c.lastMessage ?? "Démarrer la conversation…"}
            </p>
          </div>
        </div>

        <span style={{ color: C.muted, fontSize: 18, flexShrink: 0 }}>›</span>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.canvas, paddingBottom: 80, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <style>{`.lk-conv:hover { background: ${C.canvas}; }`}</style>

      <header style={{ background: C.surface, borderBottom: `1.5px solid ${C.hairline}` }}>
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: C.muted, margin: "0 0 4px" }}>Linkea</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em", color: C.ink, margin: 0 }}>Messages</h1>
              {totalUnread > 0 && (
                <span style={{ minWidth: 18, height: 18, borderRadius: "50%", background: C.rose, color: "#fff", fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{totalUnread}</span>
              )}
            </div>
          </div>
          <NotificationBell />
        </div>
      </header>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "16px 24px", display: "flex", flexDirection: "column", gap: 8 }}>
        {active.length === 0 && archived.length === 0 ? (
          <div style={{ background: C.surface, border: `1.5px solid ${C.hairline}`, borderRadius: 16, padding: "56px 32px", textAlign: "center", marginTop: 8 }}>
            <p style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 18, fontWeight: 600, color: C.ink, margin: "0 0 8px", letterSpacing: "-0.02em" }}>Aucune conversation</p>
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
              {role === "founder" ? "Tes échanges avec les devs apparaîtront ici." : "Tes échanges avec les founders apparaîtront ici."}
            </p>
          </div>
        ) : (
          <>
            {active.length > 0 && active.map((c) => <ConvCard key={c.id} c={c} />)}

            {archived.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <button onClick={() => setArchivesOpen((v) => !v)}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 4px", background: "none", border: "none", cursor: "pointer" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: C.muted }}>Archives</span>
                  <div style={{ flex: 1, height: 1, background: C.hairline }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, fontVariantNumeric: "tabular-nums" }}>{archived.length}</span>
                  <span style={{ fontSize: 12, color: C.muted }}>{archivesOpen ? "↑" : "↓"}</span>
                </button>
                {archivesOpen && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, opacity: 0.75 }}>
                    {archived.map((c) => <ConvCard key={c.id} c={c} isArchived />)}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
