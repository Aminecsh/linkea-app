"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import BottomNav from "@/components/BottomNav";
import NotificationBell from "@/components/NotificationBell";
import { MessageCircle, Briefcase, ChevronDown, ChevronUp, Send } from "lucide-react";

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
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [archivesOpen, setArchivesOpen] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }
      setUserId(user.id);

      const { data: roleData } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      const r = roleData?.role ?? null;
      setRole(r);

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
      setLoading(false);
    }
    load();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
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
          className="flex items-center gap-3 px-4 py-3.5 rounded-2xl"
          style={{
            background: hasUnread
              ? "linear-gradient(135deg, rgba(244,63,94,0.04) 0%, #ffffff 60%)"
              : "linear-gradient(180deg, #ffffff 0%, #fdfcfc 100%)",
            border: hasUnread
              ? "1px solid rgba(244,63,94,0.16)"
              : "1px solid rgba(0,0,0,0.075)",
            boxShadow: hasUnread
              ? "0 2px 12px rgba(244,63,94,0.08), 0 1px 3px rgba(0,0,0,0.04)"
              : "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",
          }}
        >
          {/* Avatar */}
          <div className="relative shrink-0">
            {c.otherAvatarUrl ? (
              <img
                src={c.otherAvatarUrl}
                alt={otherNom}
                className="w-12 h-12 rounded-full object-cover"
                style={{ border: "2px solid rgba(255,255,255,0.9)", boxShadow: "0 2px 8px rgba(0,0,0,0.10)" }}
              />
            ) : (
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-base"
                style={{
                  background: isArchived
                    ? "linear-gradient(135deg, #b0b0b8, #8a8a92)"
                    : "linear-gradient(135deg, #f43f5e, #8b5cf6)",
                  border: "2px solid rgba(255,255,255,0.9)",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
                }}
              >
                {initial}
              </div>
            )}
            {/* Badge non-lu */}
            {hasUnread && (
              <div
                className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center text-white rounded-full px-1"
                style={{ background: "var(--rose)", fontSize: 10, fontWeight: 800, boxShadow: "0 1px 4px rgba(244,63,94,0.40)" }}
              >
                {c.unreadCount > 9 ? "9+" : c.unreadCount}
              </div>
            )}
          </div>

          {/* Contenu */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <span
                className="truncate text-sm"
                style={{
                  color: hasUnread ? "var(--text)" : isArchived ? "var(--muted)" : "var(--text)",
                  fontWeight: hasUnread ? 700 : 600,
                  letterSpacing: "-0.01em",
                }}
              >
                {otherNom ?? "—"}
              </span>
              <span
                className="shrink-0 text-xs tabular-nums"
                style={{ color: hasUnread ? "var(--rose)" : "var(--subtle)", fontWeight: hasUnread ? 700 : 400 }}
              >
                {formatTime(c.lastMessageTime)}
              </span>
            </div>

            {/* Sous-titre projet */}
            <div className="flex items-center gap-1 mb-1">
              <Briefcase size={10} style={{ color: "var(--subtle)", flexShrink: 0 }} />
              <span className="text-xs truncate" style={{ color: "var(--subtle)", fontWeight: 500 }}>
                {c.projects?.titre ?? "Projet"}
              </span>
            </div>

            {/* Dernier message */}
            <div className="flex items-center gap-1">
              {isMine && !isArchived && (
                <Send size={10} style={{ color: "var(--subtle)", flexShrink: 0, transform: "rotate(0deg)" }} />
              )}
              <p
                className="text-xs truncate"
                style={{
                  color: hasUnread ? "var(--text-2)" : "var(--muted)",
                  fontWeight: hasUnread ? 600 : 400,
                  fontStyle: !c.lastMessage ? "italic" : "normal",
                }}
              >
                {c.lastMessage ?? "Démarrer la conversation..."}
              </p>
            </div>
          </div>

          {/* Chevron */}
          <div style={{ color: "var(--border-2)", flexShrink: 0 }}>
            <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
              <path d="M1 1l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-nav" style={{ background: "var(--bg)" }}>

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
          <NotificationBell />
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

      <BottomNav />
    </div>
  );
}
