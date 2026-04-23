"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import BottomNav from "@/components/BottomNav";

type Conversation = {
  id: string;
  created_at: string;
  project_id: string;
  projects: { titre: string };
  profiles_founder: { nom: string };
  profiles_developer: { nom: string };
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount: number;
};

export default function MessagesPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

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
        if (!profile) { router.push("/onboarding"); return; }
        const { data } = await supabase
          .from("conversations")
          .select("id, created_at, project_id, projects(titre), profiles_founder(nom), profiles_developer(nom)")
          .eq("founder_id", profile.id)
          .order("created_at", { ascending: false });
        convData = (data as Conversation[]) ?? [];
      } else if (r === "developer") {
        const { data: profile } = await supabase
          .from("profiles_developer").select("id").eq("user_id", user.id).maybeSingle();
        if (!profile) { router.push("/onboarding"); return; }
        const { data } = await supabase
          .from("conversations")
          .select("id, created_at, project_id, projects(titre), profiles_founder(nom), profiles_developer(nom)")
          .eq("developer_id", profile.id)
          .order("created_at", { ascending: false });
        convData = (data as Conversation[]) ?? [];
      } else {
        router.push("/projets");
        return;
      }

      // Pour chaque conversation : dernier message + nb non lus
      const enriched = await Promise.all(convData.map(async (c) => {
        const lastRead = localStorage.getItem(`lastRead_${c.id}`) ?? "1970-01-01";

        const [{ data: lastMsgs }, { count: unread }] = await Promise.all([
          supabase.from("messages").select("content, created_at, sender_id").eq("conversation_id", c.id).order("created_at", { ascending: false }).limit(1),
          supabase.from("messages").select("*", { count: "exact", head: true }).eq("conversation_id", c.id).neq("sender_id", user.id).gt("created_at", lastRead),
        ]);

        return {
          ...c,
          lastMessage: lastMsgs?.[0]?.content ?? null,
          lastMessageTime: lastMsgs?.[0]?.created_at ?? null,
          unreadCount: unread ?? 0,
        };
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

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="bg-white border-b border-slate-200 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-pink-500 mb-1">Linkea</p>
            <h1 className="text-xl font-black text-slate-900">Messages</h1>
          </div>
          {totalUnread > 0 && (
            <span className="ml-2 bg-pink-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {totalUnread}
            </span>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {conversations.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
            <p className="text-2xl mb-3">💬</p>
            <p className="text-slate-600 font-semibold">Aucune conversation</p>
            <p className="text-slate-400 text-sm mt-1">
              {role === "founder"
                ? "Tes conversations apparaîtront ici après avoir accepté un dev."
                : "Tes conversations apparaîtront ici après qu'un founder t'ait accepté."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {conversations.map((c) => {
              const otherNom = role === "founder" ? c.profiles_developer?.nom : c.profiles_founder?.nom;
              const initial = otherNom?.[0]?.toUpperCase() ?? "?";
              const hasUnread = c.unreadCount > 0;
              return (
                <div
                  key={c.id}
                  onClick={() => router.push(`/messages/${c.id}`)}
                  className={`bg-white rounded-2xl border-2 p-4 flex items-center gap-4 cursor-pointer transition-all ${
                    hasUnread ? "border-pink-300 shadow-sm" : "border-slate-200 hover:border-pink-200"
                  }`}
                >
                  <div className="relative shrink-0">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white font-black text-lg">
                      {initial}
                    </div>
                    {hasUnread && (
                      <span className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-pink-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1">
                        {c.unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`font-bold text-slate-900 ${hasUnread ? "text-pink-600" : ""}`}>{otherNom ?? "—"}</p>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${role === "founder" ? "bg-blue-50 text-blue-500" : "bg-pink-50 text-pink-500"}`}>
                        {role === "founder" ? "Dev" : "Founder"}
                      </span>
                    </div>
                    <p className={`text-xs truncate mt-0.5 ${hasUnread ? "text-slate-700 font-semibold" : "text-slate-400"}`}>
                      {c.lastMessage ?? `📋 ${c.projects?.titre ?? "Projet"}`}
                    </p>
                  </div>
                  <span className="text-slate-300 text-lg shrink-0">›</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
