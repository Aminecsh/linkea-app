"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Message = {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

export default function SupportChatPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userNom, setUserNom] = useState("Utilisateur");

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }
      setMyId(user.id);

      const { data: roleData } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      const admin = roleData?.role === "admin";
      setIsAdmin(admin);

      // Vérifier accès : admin OU propriétaire de la conv
      const { data: conv } = await supabase
        .from("support_conversations").select("id, user_id").eq("id", id).maybeSingle();
      if (!conv) { router.push("/messages"); return; }
      if (!admin && conv.user_id !== user.id) { router.push("/messages"); return; }

      // Nom de l'utilisateur (pour l'admin)
      if (admin) {
        const [{ data: fP }, { data: dP }] = await Promise.all([
          supabase.from("profiles_founder").select("nom").eq("user_id", conv.user_id).maybeSingle(),
          supabase.from("profiles_developer").select("nom").eq("user_id", conv.user_id).maybeSingle(),
        ]);
        setUserNom(fP?.nom ?? dP?.nom ?? "Utilisateur");
      }

      const { data: msgs } = await supabase
        .from("support_messages").select("id, sender_id, content, created_at")
        .eq("conversation_id", id).order("created_at", { ascending: true });
      setMessages(msgs ?? []);

      // Marquer comme lu
      localStorage.setItem(`lastRead_support_${id}`, new Date().toISOString());
      setLoading(false);
    }
    load();
  }, [id, router]);

  // Realtime
  useEffect(() => {
    const channel = supabase.channel(`support:${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages", filter: `conversation_id=eq.${id}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
          localStorage.setItem(`lastRead_support_${id}`, new Date().toISOString());
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    if (!content.trim() || !myId || sending) return;
    setSending(true);
    const text = content.trim();
    setContent("");

    const { error } = await supabase.from("support_messages").insert({
      conversation_id: id,
      sender_id: myId,
      content: text,
    });

    if (error) {
      console.error("support_messages insert error:", error);
      setContent(text); // remettre le texte si échec
      setSending(false);
      return;
    }

    // Notifications (fire-and-forget, non bloquant)
    if (isAdmin) {
      supabase.from("support_conversations").select("user_id").eq("id", id).maybeSingle().then(({ data: conv }) => {
        if (conv) supabase.from("notifications").insert({ user_id: conv.user_id, type: "support_reply", title: "💬 Réponse du support", body: text.length > 60 ? text.slice(0, 60) + "…" : text, link: `/support/${id}` });
      });
    } else {
      supabase.from("user_roles").select("user_id").eq("role", "admin").then(({ data: admins }) => {
        for (const a of admins ?? []) {
          supabase.from("notifications").insert({ user_id: a.user_id, type: "support_message", title: "🆘 Message support", body: text.length > 60 ? text.slice(0, 60) + "…" : text, link: `/support/${id}` });
        }
      });
    }

    setSending(false);
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-red-400 border-t-transparent animate-spin" />
    </div>
  );

  // Grouper les messages par jour
  const groups: { day: string; msgs: Message[] }[] = [];
  for (const msg of messages) {
    const day = fmtDay(msg.created_at);
    if (!groups.length || groups[groups.length - 1].day !== day) groups.push({ day, msgs: [] });
    groups[groups.length - 1].msgs.push(msg);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={() => isAdmin ? router.push("/admin") : router.push("/messages")}
            className="text-slate-400 hover:text-slate-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">←</button>
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-400 to-rose-500 flex items-center justify-center text-white font-black text-sm shrink-0">
            {isAdmin ? userNom[0]?.toUpperCase() : "L"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-900 text-sm leading-tight truncate">
              {isAdmin ? userNom : "Support Linkea"}
            </p>
            <p className="text-xs text-slate-400">{isAdmin ? "Utilisateur suspendu" : "Équipe Linkea"}</p>
          </div>
          {isAdmin && (
            <span className="text-xs font-semibold bg-red-50 text-red-500 border border-red-100 px-2 py-1 rounded-full">Banni</span>
          )}
        </div>
      </div>

      {/* Banner banni */}
      {!isAdmin && (
        <div className="bg-red-50 border-b border-red-100 px-4 py-2.5">
          <p className="text-xs text-red-600 font-medium text-center max-w-2xl mx-auto">
            🚫 Ton compte est suspendu — tu peux contacter le support ici
          </p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 max-w-2xl mx-auto w-full">
        {groups.map(({ day, msgs }) => (
          <div key={day}>
            <div className="flex items-center gap-2 my-4">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-xs text-slate-400 capitalize">{day}</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
            {msgs.map((msg) => {
              const isMe = msg.sender_id === myId;
              const isSupport = !isMe;
              return (
                <div key={msg.id} className={`flex mb-2 ${isMe ? "justify-end" : "justify-start"}`}>
                  {isSupport && (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-red-400 to-rose-500 flex items-center justify-center text-white text-xs font-black shrink-0 mr-2 mt-auto">
                      {isAdmin ? userNom[0]?.toUpperCase() : "L"}
                    </div>
                  )}
                  <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    isMe
                      ? "bg-red-500 text-white rounded-br-md"
                      : "bg-white border border-slate-200 text-slate-800 rounded-bl-md"
                  }`}>
                    {msg.content}
                    <p className={`text-[10px] mt-1 ${isMe ? "text-red-200" : "text-slate-400"}`}>{fmtTime(msg.created_at)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t border-slate-200 px-4 py-3 sticky bottom-0">
        <div className="max-w-2xl mx-auto flex gap-2 items-end">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={1}
            placeholder={isAdmin ? `Répondre à ${userNom}...` : "Écrire au support..."}
            className="flex-1 resize-none border border-slate-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:border-red-300 transition-colors"
            style={{ maxHeight: "120px" }}
          />
          <button onClick={send} disabled={!content.trim() || sending}
            className="w-10 h-10 rounded-full bg-red-500 hover:bg-red-600 disabled:opacity-40 flex items-center justify-center text-white transition-colors shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
