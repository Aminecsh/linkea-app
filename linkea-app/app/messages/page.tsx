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
  profiles_founder: { nom: string };
  profiles_developer: { nom: string };
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount: number;
};

type SupportConv = {
  id: string;
  created_at: string;
  lastMessage?: string;
  unreadCount: number;
};

export default function MessagesPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [supportConv, setSupportConv] = useState<SupportConv | null>(null);
  const [adminSupportConvs, setAdminSupportConvs] = useState<{ id: string; userId: string; nom: string; lastMessage?: string; unreadCount: number }[]>([]);
  const [isBanned, setIsBanned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }
      setUserId(user.id);

      // Vérifier ban
      const now = new Date().toISOString();
      const { data: ban } = await supabase
        .from("bans").select("id").eq("user_id", user.id).eq("is_active", true)
        .or(`expires_at.is.null,expires_at.gt.${now}`).limit(1).maybeSingle();

      if (ban) {
        setIsBanned(true);
        // Charger uniquement la conv support
        const { data: sc } = await supabase
          .from("support_conversations").select("id, created_at").eq("user_id", user.id).maybeSingle();
        if (sc) {
          const { data: lastMsgs } = await supabase
            .from("support_messages").select("content, created_at, sender_id")
            .eq("conversation_id", sc.id).order("created_at", { ascending: false }).limit(1);
          const lastRead = localStorage.getItem(`lastRead_support_${sc.id}`) ?? "1970-01-01";
          const { count: unread } = await supabase
            .from("support_messages").select("*", { count: "exact", head: true })
            .eq("conversation_id", sc.id).neq("sender_id", user.id).gt("created_at", lastRead);
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
            .select("id, created_at, project_id, projects(titre, statut), profiles_founder(nom), profiles_developer(nom)")
            .eq("founder_id", profile.id)
            .order("created_at", { ascending: false });
          convData = (data as unknown as Conversation[]) ?? [];
        }
      } else if (r === "developer") {
        const { data: profile } = await supabase
          .from("profiles_developer").select("id").eq("user_id", user.id).maybeSingle();
        if (profile) {
          const { data } = await supabase
            .from("conversations")
            .select("id, created_at, project_id, projects(titre, statut), profiles_founder(nom), profiles_developer(nom)")
            .eq("developer_id", profile.id)
            .order("created_at", { ascending: false });
          convData = (data as unknown as Conversation[]) ?? [];
        }
      }

      const enriched = await Promise.all(convData.map(async (c) => {
        const lastRead = localStorage.getItem(`lastRead_${c.id}`) ?? "1970-01-01";
        const [{ data: lastMsgs }, { count: unread }] = await Promise.all([
          supabase.from("messages").select("content, created_at, sender_id").eq("conversation_id", c.id).order("created_at", { ascending: false }).limit(1),
          supabase.from("messages").select("*", { count: "exact", head: true }).eq("conversation_id", c.id).neq("sender_id", user.id).gt("created_at", lastRead),
        ]);
        return { ...c, lastMessage: lastMsgs?.[0]?.content ?? null, lastMessageTime: lastMsgs?.[0]?.created_at ?? null, unreadCount: unread ?? 0 };
      }));

      setConversations(enriched);
      setLoading(false);
    }
    load();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-pink-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  // ── Vue banni ─────────────────────────────────────────────────────────────
  if (isBanned) {
    return (
      <div className="min-h-screen bg-slate-50 pb-24">
        <div className="bg-white border-b border-slate-200 px-4 py-4 sticky top-0 z-10">
          <div className="max-w-2xl mx-auto">
            <p className="text-xs font-bold uppercase tracking-widest text-red-400 mb-1">Compte suspendu</p>
            <h1 className="text-xl font-black text-slate-900">Support Linkea</h1>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 mb-4 flex items-center gap-3">
            <span className="text-xl shrink-0">🚫</span>
            <p className="text-sm text-red-700 font-medium">Ton compte est suspendu. Tu peux contacter le support ci-dessous.</p>
          </div>

          {supportConv ? (
            <div
              onClick={() => router.push(`/support/${supportConv.id}`)}
              className="bg-white rounded-2xl border-2 border-red-200 p-4 flex items-center gap-4 cursor-pointer hover:border-red-300 transition-all shadow-sm"
            >
              <div className="relative shrink-0">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-red-400 to-rose-500 flex items-center justify-center text-white font-black text-lg">L</div>
                {supportConv.unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1">
                    {supportConv.unreadCount}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-900">Support Linkea</p>
                <p className="text-xs text-slate-400 mt-0.5">Équipe Linkea</p>
                {supportConv.lastMessage && (
                  <p className="text-xs text-slate-500 truncate mt-0.5">{supportConv.lastMessage}</p>
                )}
              </div>
              <span className="text-slate-300 text-lg shrink-0">›</span>
            </div>
          ) : (
            <div className="text-center py-10 bg-white rounded-2xl border border-slate-200">
              <p className="text-slate-400 text-sm">Conversation support en cours de création...</p>
            </div>
          )}
        </div>

        <BottomNav />
      </div>
    );
  }

  // ── Vue admin ─────────────────────────────────────────────────────────────
  if (role === "admin") {
    const totalUnreadAdmin = adminSupportConvs.reduce((s, c) => s + c.unreadCount, 0);
    return (
      <div className="min-h-screen bg-slate-50 pb-24">
        <div className="bg-white border-b border-slate-200 px-4 py-4 sticky top-0 z-10">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <button onClick={() => router.push("/admin")} className="text-slate-400 hover:text-slate-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">←</button>
            <div className="flex-1">
              <p className="text-xs font-bold uppercase tracking-widest text-indigo-500 mb-1">Admin</p>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-slate-900">Support</h1>
                {totalUnreadAdmin > 0 && <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{totalUnreadAdmin}</span>}
              </div>
            </div>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-3">
          {adminSupportConvs.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
              <p className="text-2xl mb-2">💬</p>
              <p className="text-slate-400 text-sm">Aucune conversation support.</p>
            </div>
          ) : adminSupportConvs.map((c) => (
            <div key={c.id} onClick={() => router.push(`/support/${c.id}`)}
              className={`bg-white rounded-2xl border-2 p-4 flex items-center gap-4 cursor-pointer transition-all ${c.unreadCount > 0 ? "border-red-200 shadow-sm" : "border-slate-200 hover:border-slate-300"}`}>
              <div className="relative shrink-0">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-red-400 to-rose-500 flex items-center justify-center text-white font-black text-lg">
                  {c.nom[0]?.toUpperCase() ?? "?"}
                </div>
                {c.unreadCount > 0 && <span className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1">{c.unreadCount}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`font-bold ${c.unreadCount > 0 ? "text-red-600" : "text-slate-900"}`}>{c.nom}</p>
                  <span className="text-xs font-semibold bg-red-50 text-red-500 px-2 py-0.5 rounded-full">Banni</span>
                </div>
                {c.lastMessage && <p className="text-xs text-slate-400 truncate mt-0.5">{c.lastMessage}</p>}
              </div>
              <span className="text-slate-300 text-lg shrink-0">›</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Vue normale ────────────────────────────────────────────────────────────
  const ARCHIVED = ["livre", "termine"];
  const active   = conversations.filter((c) => !ARCHIVED.includes(c.projects?.statut));
  const archived = conversations.filter((c) =>  ARCHIVED.includes(c.projects?.statut));
  const totalUnread = active.reduce((sum, c) => sum + c.unreadCount, 0);

  function ConvCard({ c, isArchived }: { c: Conversation; isArchived?: boolean }) {
    const otherNom = role === "founder" ? c.profiles_developer?.nom : c.profiles_founder?.nom;
    const initial = otherNom?.[0]?.toUpperCase() ?? "?";
    const hasUnread = c.unreadCount > 0 && !isArchived;
    return (
      <div
        onClick={() => router.push(`/messages/${c.id}`)}
        className={`bg-white rounded-2xl border-2 p-4 flex items-center gap-4 cursor-pointer transition-all ${
          isArchived ? "border-slate-100 opacity-75 hover:opacity-100 hover:border-slate-200"
          : hasUnread ? "border-pink-300 shadow-sm"
          : "border-slate-200 hover:border-pink-200"
        }`}
      >
        <div className="relative shrink-0">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-black text-lg ${isArchived ? "bg-gradient-to-br from-slate-300 to-slate-400" : "bg-gradient-to-br from-pink-400 to-purple-500"}`}>
            {initial}
          </div>
          {hasUnread && <span className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-pink-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1">{c.unreadCount}</span>}
          {isArchived && <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-slate-400 text-white text-xs rounded-full flex items-center justify-center border border-white">📦</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`font-bold ${isArchived ? "text-slate-500" : "text-slate-900"} ${hasUnread ? "text-pink-600" : ""}`}>{otherNom ?? "—"}</p>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isArchived ? "bg-slate-100 text-slate-400" : role === "founder" ? "bg-blue-50 text-blue-500" : "bg-pink-50 text-pink-500"}`}>
              {isArchived ? "Archivé" : role === "founder" ? "Dev" : "Founder"}
            </span>
          </div>
          <p className="text-xs text-slate-400 truncate mt-0.5">📋 {c.projects?.titre ?? "Projet"}</p>
          {c.lastMessage && <p className={`text-xs truncate mt-0.5 ${hasUnread ? "text-slate-700 font-semibold" : "text-slate-400"}`}>{c.lastMessage}</p>}
        </div>
        <span className="text-slate-300 text-lg shrink-0">›</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="bg-white border-b border-slate-200 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-widest text-pink-500 mb-1">Linkea</p>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900">Messages</h1>
              {totalUnread > 0 && <span className="bg-pink-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{totalUnread}</span>}
            </div>
          </div>
          <NotificationBell />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">
        {active.length === 0 && archived.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
            <p className="text-2xl mb-3">💬</p>
            <p className="text-slate-600 font-semibold">Aucune conversation</p>
            <p className="text-slate-400 text-sm mt-1">
              {role === "founder" ? "Tes conversations apparaîtront ici après avoir accepté un dev." : "Tes conversations apparaîtront ici après qu'un founder t'ait accepté."}
            </p>
          </div>
        ) : (
          <>
            {active.length > 0 && <div className="flex flex-col gap-3">{active.map((c) => <ConvCard key={c.id} c={c} />)}</div>}
            {archived.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">📦 Archives</span>
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-xs text-slate-400">{archived.length}</span>
                </div>
                <div className="flex flex-col gap-3">{archived.map((c) => <ConvCard key={c.id} c={c} isArchived />)}</div>
              </div>
            )}
          </>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
