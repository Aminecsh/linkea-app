"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Message = { id: string; sender_id: string; content: string; created_at: string; };

const C = { ink: "#1A2138", rose: "#D4537E", muted: "#8A8579", hairline: "#E5E5EA", canvas: "#F5F5F7", surface: "#FFFFFF" };

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
  const [messages,  setMessages] = useState<Message[]>([]);
  const [myId,      setMyId]     = useState<string | null>(null);
  const [isAdmin,   setIsAdmin]  = useState(false);
  const [content,   setContent]  = useState("");
  const [sending,   setSending]  = useState(false);
  const [loading,   setLoading]  = useState(true);
  const [userNom,   setUserNom]  = useState("Utilisateur");

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }
      setMyId(user.id);

      const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      const admin = roleData?.role === "admin";
      setIsAdmin(admin);

      const { data: conv } = await supabase.from("support_conversations").select("id, user_id").eq("id", id).maybeSingle();
      if (!conv) { router.push("/messages"); return; }
      if (!admin && conv.user_id !== user.id) { router.push("/messages"); return; }

      if (admin) {
        const [{ data: fP }, { data: dP }] = await Promise.all([
          supabase.from("profiles_founder").select("nom").eq("user_id", conv.user_id).maybeSingle(),
          supabase.from("profiles_developer").select("nom").eq("user_id", conv.user_id).maybeSingle(),
        ]);
        setUserNom(fP?.nom ?? dP?.nom ?? "Utilisateur");
      }

      const { data: msgs } = await supabase.from("support_messages").select("id, sender_id, content, created_at")
        .eq("conversation_id", id).order("created_at", { ascending: true });
      setMessages(msgs ?? []);
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

    const { error } = await supabase.from("support_messages").insert({ conversation_id: id, sender_id: myId, content: text });
    if (error) { console.error(error); setContent(text); setSending(false); return; }

    if (isAdmin) {
      supabase.from("support_conversations").select("user_id").eq("id", id).maybeSingle().then(({ data: conv }) => {
        if (conv) supabase.from("notifications").insert({ user_id: conv.user_id, type: "support_reply", title: "Réponse du support", body: text.length > 60 ? text.slice(0, 60) + "…" : text, link: `/support/${id}` });
      });
    } else {
      supabase.from("user_roles").select("user_id").eq("role", "admin").then(({ data: admins }) => {
        for (const a of admins ?? []) {
          supabase.from("notifications").insert({ user_id: a.user_id, type: "support_message", title: "Message support", body: text.length > 60 ? text.slice(0, 60) + "…" : text, link: `/support/${id}` });
        }
      });
    }
    setSending(false);
  }

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.canvas }}>
      <div style={{ width: 24, height: 24, borderRadius: "50%", border: `2px solid ${C.ink}`, borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // Grouper par jour
  const groups: { day: string; msgs: Message[] }[] = [];
  for (const msg of messages) {
    const day = fmtDay(msg.created_at);
    if (!groups.length || groups[groups.length - 1].day !== day) groups.push({ day, msgs: [] });
    groups[groups.length - 1].msgs.push(msg);
  }

  return (
    <div style={{ minHeight: "100vh", background: C.canvas, display: "flex", flexDirection: "column", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <style>{`
        .lk-textarea { resize: none; border: 1.5px solid ${C.hairline}; border-radius: 12px; padding: 11px 16px; font-size: 14px; font-family: system-ui, -apple-system, sans-serif; color: ${C.ink}; background: ${C.surface}; outline: none; width: 100%; box-sizing: border-box; transition: border-color 0.15s; max-height: 120px; }
        .lk-textarea:focus { border-color: ${C.ink}; }
        .lk-textarea::placeholder { color: ${C.muted}; }
        .lk-send:focus-visible { outline: 2px solid ${C.rose}; outline-offset: 2px; }
        .lk-back:focus-visible { outline: 2px solid ${C.rose}; outline-offset: 2px; border-radius: 8px; }
      `}</style>

      {/* HEADER */}
      <header style={{ background: C.surface, borderBottom: `1.5px solid ${C.hairline}`, position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", gap: 12 }}>
          <button className="lk-back" onClick={() => router.push(isAdmin ? "/admin" : "/messages")}
            style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 18, lineHeight: 1, padding: "4px 6px", flexShrink: 0 }}>←</button>

          <div style={{ width: 36, height: 36, borderRadius: "50%", background: C.ink, color: "#fff", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {isAdmin ? userNom[0]?.toUpperCase() : "L"}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: C.ink, margin: "0 0 1px", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {isAdmin ? userNom : "Support Linkea"}
            </p>
            <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>
              {isAdmin ? "Conversation support" : "Équipe Linkea"}
            </p>
          </div>

          {isAdmin && (
            <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, border: `1px solid ${C.hairline}`, color: C.muted, flexShrink: 0 }}>
              Support
            </span>
          )}
        </div>
      </header>

      {/* Bandeau compte suspendu */}
      {!isAdmin && (
        <div style={{ background: C.surface, borderBottom: `1.5px solid ${C.hairline}`, padding: "10px 24px" }}>
          <p style={{ fontSize: 12, color: C.muted, textAlign: "center", margin: 0 }}>
            Ton compte est suspendu — contacte le support pour en savoir plus
          </p>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", maxWidth: 680, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
        {groups.map(({ day, msgs }) => (
          <div key={day}>
            {/* Séparateur de jour */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0 16px" }}>
              <div style={{ flex: 1, height: 1, background: C.hairline }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "capitalize", letterSpacing: "0.3px" }}>{day}</span>
              <div style={{ flex: 1, height: 1, background: C.hairline }} />
            </div>

            {msgs.map((msg) => {
              const isMe = msg.sender_id === myId;
              return (
                <div key={msg.id} style={{ display: "flex", marginBottom: 10, justifyContent: isMe ? "flex-end" : "flex-start" }}>
                  {/* Avatar côté récepteur */}
                  {!isMe && (
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.ink, color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginRight: 8, alignSelf: "flex-end", marginBottom: 2 }}>
                      {isAdmin ? userNom[0]?.toUpperCase() : "L"}
                    </div>
                  )}

                  <div style={{
                    maxWidth: "72%",
                    padding: "10px 14px",
                    borderRadius: isMe ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                    fontSize: 14,
                    lineHeight: 1.55,
                    background: isMe ? C.ink : C.surface,
                    color: isMe ? "#fff" : C.ink,
                    border: isMe ? "none" : `1.5px solid ${C.hairline}`,
                  }}>
                    {msg.content}
                    <p style={{ fontSize: 10, margin: "4px 0 0", color: isMe ? "rgba(255,255,255,0.5)" : C.muted, textAlign: "right" }}>
                      {fmtTime(msg.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Zone de saisie */}
      <div style={{ background: C.surface, borderTop: `1.5px solid ${C.hairline}`, padding: "14px 24px", position: "sticky", bottom: 0 }}>
        <div style={{ maxWidth: 680, margin: "0 auto", display: "flex", gap: 10, alignItems: "flex-end" }}>
          <textarea className="lk-textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={1}
            placeholder={isAdmin ? `Répondre à ${userNom}…` : "Écrire au support…"}
          />
          <button className="lk-send" onClick={send} disabled={!content.trim() || sending}
            style={{ width: 40, height: 40, borderRadius: "50%", background: content.trim() ? C.ink : C.hairline, border: "none", cursor: content.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.15s" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill={content.trim() ? "#fff" : C.muted}>
              <path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
