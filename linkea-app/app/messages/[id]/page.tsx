"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";
import {
  ArrowLeft, ArrowUp, Paperclip, Smile, FileText, ImageIcon,
  ChevronDown, FileArchive, LayoutDashboard, ScrollText, BellRing, X,
  CheckCircle2, Circle, Clock, RotateCcw,
} from "lucide-react";

type Message = {
  id: string;
  content: string;
  sender_id: string;
  created_at: string;
  file_url?: string;
  file_type?: string;
};

type Conversation = {
  id: string;
  project_id: string;
  projects: { titre: string; statut: string };
  profiles_founder: { nom: string; user_id: string };
  profiles_developer: { nom: string; user_id: string };
};

type Sprint = {
  id: string; nom: string; objectif?: string;
  date_debut: string; date_fin: string;
  statut: "a_venir" | "en_cours" | "termine";
};
type SprintTask = {
  id: string; sprint_id: string | null; titre: string;
  statut: "todo" | "en_cours" | "review" | "done";
  priorite: "basse" | "normale" | "haute";
};

function formatMsgTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatDateSeparator(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffD = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffD === 0) return "Aujourd'hui";
  if (diffD === 1) return "Hier";
  if (diffD < 7) {
    const days = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
    return days[d.getDay()];
  }
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: diffD > 365 ? "numeric" : undefined });
}

function isSameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

export default function ChatPage() {
  const router  = useRouter();
  const { id }  = useParams<{ id: string }>();
  const [messages,      setMessages]      = useState<Message[]>([]);
  const [conversation,  setConversation]  = useState<Conversation | null>(null);
  const [content,       setContent]       = useState("");
  const [userId,        setUserId]        = useState<string | null>(null);
  const [role,          setRole]          = useState<string | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [sending,       setSending]       = useState(false);
  const [uploading,     setUploading]     = useState(false);
  const [otherTyping,   setOtherTyping]   = useState(false);
  const [showAttach,    setShowAttach]    = useState(false);
  const [showEmoji,     setShowEmoji]     = useState(false);
  const [contractId,    setContractId]    = useState<string | null>(null);
  const [myAvatarUrl,   setMyAvatarUrl]   = useState<string | null>(null);
  const [otherAvatarUrl,setOtherAvatarUrl]= useState<string | null>(null);
  const [myNom,         setMyNom]         = useState("");
  const [showScrollBtn,    setShowScrollBtn]    = useState(false);
  const [unreadBelow,      setUnreadBelow]      = useState(0);
  const [showSprintModal,  setShowSprintModal]  = useState(false);
  const [sprintLoading,    setSprintLoading]    = useState(false);
  const [sprints,          setSprints]          = useState<Sprint[]>([]);
  const [sprintTasks,      setSprintTasks]      = useState<SprintTask[]>([]);
  const [selectedSprint,   setSelectedSprint]   = useState<Sprint | null>(null);

  const bottomRef      = useRef<HTMLDivElement>(null);
  const scrollAreaRef  = useRef<HTMLDivElement>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const mediaInputRef  = useRef<HTMLInputElement>(null);
  const typingTimeout  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef     = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isAtBottomRef  = useRef(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }
      setUserId(user.id);

      const { data: roleData } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      const r = roleData?.role ?? null;
      setRole(r);

      const { data: conv } = await supabase
        .from("conversations")
        .select("id, project_id, projects(titre, statut), profiles_founder(nom, user_id), profiles_developer(nom, user_id)")
        .eq("id", id).maybeSingle();

      if (!conv) { router.push("/messages"); return; }
      setConversation(conv as unknown as Conversation);

      const { data: contract } = await supabase
        .from("contracts").select("id").eq("project_id", conv.project_id).maybeSingle();
      if (contract) setContractId(contract.id);

      const convTyped = conv as unknown as {
        profiles_founder: { user_id: string };
        profiles_developer: { user_id: string };
      };
      const myTable    = r === "founder" ? "profiles_founder" : "profiles_developer";
      const otherTable = r === "founder" ? "profiles_developer" : "profiles_founder";
      const otherUserId = r === "founder"
        ? convTyped.profiles_developer?.user_id
        : convTyped.profiles_founder?.user_id;

      const [{ data: myProf }, { data: otherProf }] = await Promise.all([
        supabase.from(myTable).select("avatar_url, nom").eq("user_id", user.id).maybeSingle(),
        otherUserId
          ? supabase.from(otherTable).select("avatar_url").eq("user_id", otherUserId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      setMyAvatarUrl((myProf as { avatar_url?: string } | null)?.avatar_url ?? null);
      setOtherAvatarUrl((otherProf as { avatar_url?: string } | null)?.avatar_url ?? null);
      setMyNom((myProf as { nom?: string } | null)?.nom ?? "");

      const { data: msgs } = await supabase
        .from("messages").select("*")
        .eq("conversation_id", id)
        .order("created_at", { ascending: true });

      setMessages(msgs ?? []);
      localStorage.setItem(`lastRead_${id}`, new Date().toISOString());
      setLoading(false);
    }
    load();
  }, [id, router]);

  // Realtime
  useEffect(() => {
    if (loading || !userId) return;
    const channel = supabase.channel(`chat:${id}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` },
        (payload) => {
          const newMsg = payload.new as Message;
          if (newMsg.sender_id !== userId) {
            setMessages((prev) => [...prev, newMsg]);
            setOtherTyping(false);
            if (isAtBottomRef.current) {
              localStorage.setItem(`lastRead_${id}`, new Date().toISOString());
            } else {
              setUnreadBelow((n) => n + 1);
            }
          }
        })
      .on("broadcast", { event: "typing" }, (payload) => {
        if (payload.payload.sender_id !== userId) {
          setOtherTyping(true);
          if (typingTimeout.current) clearTimeout(typingTimeout.current);
          typingTimeout.current = setTimeout(() => setOtherTyping(false), 2500);
        }
      })
      .subscribe();
    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [id, loading, userId]);

  // Scroll to bottom on new messages (only if already at bottom)
  useEffect(() => {
    if (isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, otherTyping]);

  // Scroll listener
  useEffect(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    const handler = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      const atBottom = distFromBottom < 60;
      isAtBottomRef.current = atBottom;
      setShowScrollBtn(!atBottom);
      if (atBottom) {
        setUnreadBelow(0);
        localStorage.setItem(`lastRead_${id}`, new Date().toISOString());
      }
    };
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  }, [id, loading]);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setUnreadBelow(0);
  };

  const broadcastTyping = useCallback(() => {
    channelRef.current?.send({ type: "broadcast", event: "typing", payload: { sender_id: userId } });
  }, [userId]);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    setContent(e.target.value);
    broadcastTyping();
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || !userId || sending) return;
    setSending(true);

    const newMsg: Message = {
      id: crypto.randomUUID(),
      sender_id: userId,
      content: content.trim(),
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, newMsg]);
    setContent("");
    isAtBottomRef.current = true;

    await supabase.from("messages").insert({
      conversation_id: id, sender_id: userId, content: newMsg.content,
    });

    if (conversation) {
      const otherUserId = role === "founder"
        ? conversation.profiles_developer?.user_id
        : conversation.profiles_founder?.user_id;
      if (otherUserId) {
        await supabase.from("notifications").insert({
          user_id: otherUserId,
          type: "nouveau_message",
          title: "Nouveau message 💬",
          body: newMsg.content.slice(0, 80),
          link: `/messages/${id}`,
        });
      }
    }
    setSending(false);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setUploading(true);

    const ext  = file.name.split(".").pop();
    const path = `${id}/${crypto.randomUUID()}.${ext}`;

    const { error } = await supabase.storage.from("chat-files").upload(path, file);
    if (error) { setUploading(false); return; }

    const { data: urlData } = supabase.storage.from("chat-files").getPublicUrl(path);
    const fileUrl  = urlData.publicUrl;
    const fileType = file.type;

    const newMsg: Message = {
      id: crypto.randomUUID(), sender_id: userId, content: "",
      file_url: fileUrl, file_type: fileType, created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, newMsg]);
    await supabase.from("messages").insert({
      conversation_id: id, sender_id: userId, content: "", file_url: fileUrl, file_type: fileType,
    });
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function openSprintModal() {
    if (!conversation?.project_id) return;
    setShowSprintModal(true);
    setSprintLoading(true);
    const [{ data: spData }, { data: tkData }] = await Promise.all([
      supabase.from("sprints").select("*").eq("project_id", conversation.project_id).order("date_debut"),
      supabase.from("tasks").select("id, sprint_id, titre, statut, priorite").eq("project_id", conversation.project_id),
    ]);
    const spList = (spData as Sprint[]) ?? [];
    setSprints(spList);
    setSprintTasks((tkData as SprintTask[]) ?? []);
    const active = spList.find((s) => s.statut === "en_cours") ?? spList[spList.length - 1] ?? null;
    setSelectedSprint(active);
    setSprintLoading(false);
  }

  async function sendSprintReminder() {
    if (!selectedSprint || !userId) return;
    const tasks = sprintTasks.filter((t) => t.sprint_id === selectedSprint.id);
    const done    = tasks.filter((t) => t.statut === "done");
    const inProg  = tasks.filter((t) => t.statut === "en_cours" || t.statut === "review");
    const todo    = tasks.filter((t) => t.statut === "todo");

    const daysLeft = Math.ceil(
      (new Date(selectedSprint.date_fin).getTime() - Date.now()) / 86400000
    );
    const echeance = new Date(selectedSprint.date_fin).toLocaleDateString("fr-FR", {
      weekday: "long", day: "numeric", month: "long",
    });

    const lines: string[] = [
      `📋 Rappel sprint · ${selectedSprint.nom}`,
      `Échéance : ${echeance}${daysLeft > 0 ? ` (J-${daysLeft})` : daysLeft === 0 ? " (aujourd'hui !)" : " (dépassée)"}`,
    ];
    if (selectedSprint.objectif) lines.push(`Objectif : ${selectedSprint.objectif}`);
    lines.push("");

    if (done.length)   lines.push(`✅ Terminé (${done.length})`, ...done.map((t) => `  · ${t.titre}`), "");
    if (inProg.length) lines.push(`🔄 En cours (${inProg.length})`, ...inProg.map((t) => `  · ${t.titre}`), "");
    if (todo.length)   lines.push(`⏳ À faire (${todo.length})`, ...todo.map((t) => `  · ${t.titre}`));

    const msgContent = lines.join("\n");

    const newMsg: Message = {
      id: crypto.randomUUID(), sender_id: userId,
      content: msgContent, created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, newMsg]);
    setShowSprintModal(false);
    isAtBottomRef.current = true;

    await supabase.from("messages").insert({ conversation_id: id, sender_id: userId, content: msgContent });

    if (conversation) {
      const otherUid = role === "founder"
        ? conversation.profiles_developer?.user_id
        : conversation.profiles_founder?.user_id;
      if (otherUid) {
        await supabase.from("notifications").insert({
          user_id: otherUid, type: "nouveau_message",
          title: "Rappel sprint 📋", body: `${selectedSprint.nom} — J-${daysLeft}`,
          link: `/messages/${id}`,
        });
      }
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="spinner" />
      </div>
    );
  }

  const otherNom    = role === "founder" ? conversation?.profiles_developer?.nom : conversation?.profiles_founder?.nom;
  const otherUserId = role === "founder" ? conversation?.profiles_founder?.user_id : conversation?.profiles_developer?.user_id;
  const isArchived  = ["livre", "termine"].includes(conversation?.projects?.statut ?? "");
  const hasText     = content.trim().length > 0;

  return (
    <div className="flex flex-col" style={{ height: "100dvh", background: "var(--bg)" }}>

      {/* ── Header ── */}
      <div
        style={{
          background: "rgba(240,240,245,0.88)",
          backdropFilter: "blur(28px) saturate(180%)",
          WebkitBackdropFilter: "blur(28px) saturate(180%)",
          borderBottom: "1px solid rgba(0,0,0,0.07)",
          flexShrink: 0,
          zIndex: 40,
        }}
      >
        <div className="max-w-2xl mx-auto px-3 py-3 flex items-center gap-2.5">

          {/* Retour */}
          <button
            onClick={() => router.push("/messages")}
            className="btn-icon shrink-0"
            style={{ width: 34, height: 34, borderRadius: 10 }}
          >
            <ArrowLeft size={17} />
          </button>

          {/* Avatar */}
          <button
            onClick={() => otherUserId && router.push(`/profil/${otherUserId}`)}
            className="shrink-0"
          >
            {otherAvatarUrl ? (
              <img
                src={otherAvatarUrl} alt={otherNom ?? ""}
                className="w-9 h-9 rounded-full object-cover"
                style={{ border: "2px solid rgba(255,255,255,0.9)", boxShadow: "0 2px 6px rgba(0,0,0,0.10)" }}
              />
            ) : (
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm"
                style={{
                  background: "linear-gradient(135deg, #f43f5e, #8b5cf6)",
                  border: "2px solid rgba(255,255,255,0.9)",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.10)",
                }}
              >
                {otherNom?.[0]?.toUpperCase() ?? "?"}
              </div>
            )}
          </button>

          {/* Nom + statut */}
          <div className="flex-1 min-w-0">
            <button
              onClick={() => otherUserId && router.push(`/profil/${otherUserId}`)}
              className="font-bold text-sm leading-tight truncate block text-left w-full"
              style={{ color: "var(--text)", letterSpacing: "-0.015em" }}
            >
              {otherNom}
            </button>
            <p
              className="text-xs truncate transition-all duration-200"
              style={{ color: otherTyping ? "var(--rose)" : "var(--muted)", fontWeight: otherTyping ? 600 : 400 }}
            >
              {otherTyping ? "En train d'écrire…" : conversation?.projects?.titre}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => router.push(`/projets/${conversation?.project_id}/gestion`)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all"
              style={{
                background: "rgba(0,0,0,0.04)",
                border: "1px solid rgba(0,0,0,0.08)",
                color: "var(--text-2)",
              }}
            >
              <LayoutDashboard size={12} />
              <span className="hidden sm:inline">Gestion</span>
            </button>
            {contractId && (
              <button
                onClick={() => router.push(`/contrat/${contractId}`)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all"
                style={{
                  background: "rgba(0,0,0,0.04)",
                  border: "1px solid rgba(0,0,0,0.08)",
                  color: "var(--text-2)",
                }}
              >
                <ScrollText size={12} />
                <span className="hidden sm:inline">Contrat</span>
              </button>
            )}
          </div>
        </div>

        {/* Bannière contrat actif */}
        {contractId && !isArchived && (
          <div
            className="mx-3 mb-2 rounded-xl px-3 py-2 flex items-center justify-between"
            style={{ background: "var(--blue-soft)", border: "1px solid var(--blue-border)" }}
          >
            <div className="flex items-center gap-2">
              <ScrollText size={13} style={{ color: "var(--blue)", flexShrink: 0 }} />
              <span className="text-xs font-semibold" style={{ color: "var(--blue)" }}>
                Projet en cours — contrat signé
              </span>
            </div>
            <button
              onClick={() => router.push(`/contrat/${contractId}`)}
              className="text-xs font-bold"
              style={{ color: "var(--blue)" }}
            >
              Voir →
            </button>
          </div>
        )}
      </div>

      {/* ── Messages ── */}
      <div
        ref={scrollAreaRef}
        className="flex-1 overflow-y-auto scrollbar-hide"
        style={{ overscrollBehavior: "contain" }}
      >
        <div className="max-w-2xl mx-auto px-3 py-4">

          {messages.length === 0 && (
            <div className="text-center py-12">
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Début de la conversation — dites bonjour 👋
              </p>
            </div>
          )}

          <div className="flex flex-col gap-0.5">
            {messages.map((m, i) => {
              const isMe  = m.sender_id === userId;
              const prev  = messages[i - 1];
              const next  = messages[i + 1];
              const isFirstInGroup = !prev || prev.sender_id !== m.sender_id;
              const isLastInGroup  = !next || next.sender_id !== m.sender_id;
              const showDate = !prev || !isSameDay(prev.created_at, m.created_at);

              const isImage = m.file_type?.startsWith("image/");
              const isPdf   = m.file_type === "application/pdf";
              const isFile  = !!m.file_url;

              // Border radius iMessage style
              const r = 18;
              const flat = 5;
              const br = isMe
                ? `${r}px ${isFirstInGroup ? r : flat}px ${isLastInGroup ? flat : r}px ${r}px`
                : `${isFirstInGroup ? r : flat}px ${r}px ${r}px ${isLastInGroup ? flat : r}px`;

              return (
                <div key={m.id}>
                  {/* Séparateur de date */}
                  {showDate && (
                    <div className="flex items-center gap-3 my-4">
                      <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                      <span className="text-xs font-semibold px-3 py-1 rounded-full"
                        style={{ color: "var(--muted)", background: "rgba(0,0,0,0.04)" }}>
                        {formatDateSeparator(m.created_at)}
                      </span>
                      <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                    </div>
                  )}

                  <div
                    className={`flex items-end gap-2 ${isMe ? "justify-end" : "justify-start"} ${isFirstInGroup ? "mt-3" : "mt-0.5"}`}
                  >
                    {/* Avatar gauche */}
                    {!isMe && (
                      <div className="w-6 shrink-0 self-end mb-0.5">
                        {isLastInGroup ? (
                          <button onClick={() => otherUserId && router.push(`/profil/${otherUserId}`)}>
                            {otherAvatarUrl ? (
                              <img src={otherAvatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
                            ) : (
                              <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                                style={{ background: "linear-gradient(135deg, #f43f5e, #8b5cf6)" }}>
                                {otherNom?.[0]?.toUpperCase() ?? "?"}
                              </div>
                            )}
                          </button>
                        ) : null}
                      </div>
                    )}

                    {/* Bulle */}
                    <div className={`flex flex-col ${isMe ? "items-end" : "items-start"} max-w-[72%]`}>
                      {isFile ? (
                        isImage ? (
                          <a href={m.file_url} target="_blank" rel="noreferrer" style={{ borderRadius: br, overflow: "hidden", display: "block" }}>
                            <img src={m.file_url} alt="img" className="max-w-[240px] object-cover hover:opacity-90 transition-opacity" />
                          </a>
                        ) : (
                          <a
                            href={m.file_url} target="_blank" rel="noreferrer"
                            className="flex items-center gap-2.5 px-4 py-3 text-sm font-semibold"
                            style={{
                              borderRadius: br,
                              background: isMe ? "linear-gradient(145deg, #f43f5e, #d4264b)" : "#ffffff",
                              color: isMe ? "#fff" : "var(--text)",
                              border: isMe ? "none" : "1px solid var(--border-2)",
                              boxShadow: isMe ? "var(--shadow-rose)" : "var(--shadow-xs)",
                            }}
                          >
                            {isPdf
                              ? <FileText size={16} style={{ flexShrink: 0 }} />
                              : <FileArchive size={16} style={{ flexShrink: 0 }} />
                            }
                            <span className="truncate max-w-[160px]">{m.file_url?.split("/").pop()}</span>
                          </a>
                        )
                      ) : (
                        <div
                          className="px-4 py-2.5 text-sm leading-relaxed"
                          style={{
                            borderRadius: br,
                            background: isMe ? "linear-gradient(145deg, #f43f5e 0%, #e8304f 60%, #d4264b 100%)" : "#ffffff",
                            color: isMe ? "#ffffff" : "var(--text)",
                            border: isMe ? "none" : "1px solid rgba(0,0,0,0.07)",
                            boxShadow: isMe
                              ? "0 2px 10px rgba(244,63,94,0.30), inset 0 1px 0 rgba(255,255,255,0.12)"
                              : "0 1px 2px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.04)",
                            wordBreak: "break-word",
                          }}
                        >
                          {m.content}
                        </div>
                      )}

                      {/* Heure sous le dernier message du groupe */}
                      {isLastInGroup && (
                        <span className="text-[10px] mt-1 px-1" style={{ color: "var(--subtle)" }}>
                          {formatMsgTime(m.created_at)}
                        </span>
                      )}
                    </div>

                    {/* Avatar droite */}
                    {isMe && (
                      <div className="w-6 shrink-0 self-end mb-0.5">
                        {isLastInGroup ? (
                          myAvatarUrl ? (
                            <img src={myAvatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
                          ) : (
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                              style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)" }}>
                              {myNom?.[0]?.toUpperCase() ?? "?"}
                            </div>
                          )
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Typing indicator */}
            {otherTyping && (
              <div className="flex items-end gap-2 mt-3">
                <div className="w-6 shrink-0">
                  {otherAvatarUrl ? (
                    <img src={otherAvatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
                  ) : (
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                      style={{ background: "linear-gradient(135deg, #f43f5e, #8b5cf6)" }}>
                      {otherNom?.[0]?.toUpperCase() ?? "?"}
                    </div>
                  )}
                </div>
                <div
                  className="px-4 py-3 flex gap-1 items-center"
                  style={{
                    borderRadius: "18px 18px 18px 5px",
                    background: "#ffffff",
                    border: "1px solid rgba(0,0,0,0.07)",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.04)",
                  }}
                >
                  {[0, 150, 300].map((delay) => (
                    <span key={delay} className="w-2 h-2 rounded-full animate-bounce"
                      style={{ background: "var(--muted)", animationDelay: `${delay}ms` }} />
                  ))}
                </div>
              </div>
            )}
          </div>
          <div ref={bottomRef} className="h-2" />
        </div>
      </div>

      {/* ── Scroll to bottom ── */}
      {showScrollBtn && (
        <div className="absolute bottom-24 right-4 z-30">
          <button
            onClick={scrollToBottom}
            className="flex items-center justify-center rounded-full shadow-lg relative"
            style={{
              width: 38, height: 38,
              background: "#ffffff",
              border: "1px solid rgba(0,0,0,0.10)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
            }}
          >
            <ChevronDown size={18} style={{ color: "var(--text)" }} />
            {unreadBelow > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-white px-1"
                style={{ background: "var(--rose)", fontSize: 10, fontWeight: 800 }}
              >
                {unreadBelow}
              </span>
            )}
          </button>
        </div>
      )}

      {/* ── Archive banner ── */}
      {isArchived && (
        <div className="shrink-0 px-3 pb-3" style={{ borderTop: "1px solid var(--border)", background: "var(--bg)", paddingTop: 12 }}>
          <div className="max-w-2xl mx-auto">
            <div
              className="flex items-center justify-center gap-2 rounded-xl px-4 py-3"
              style={{ background: "rgba(0,0,0,0.04)", border: "1px solid var(--border-2)" }}
            >
              <FileArchive size={14} style={{ color: "var(--muted)" }} />
              <p className="text-xs font-medium" style={{ color: "var(--muted)" }}>
                Projet terminé — conversation archivée
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Input bar ── */}
      {!isArchived && (
        <div
          className="shrink-0"
          style={{
            background: "rgba(240,240,245,0.94)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            borderTop: "1px solid rgba(0,0,0,0.07)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
        >
          <div className="max-w-2xl mx-auto px-3 py-2.5">
            <form onSubmit={handleSend} className="flex items-end gap-2">

              {/* Inputs cachés */}
              <input ref={mediaInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileChange} />
              <input ref={fileInputRef}  type="file" accept=".pdf,.doc,.docx,.zip,.txt,.xls,.xlsx,.ppt,.pptx" className="hidden" onChange={handleFileChange} />

              {/* Sprint reminder — disparaît quand on tape */}
              {!hasText && role === "founder" && (
                <button type="button" onClick={openSprintModal}
                  className="btn-icon shrink-0" style={{ width: 38, height: 38 }}>
                  <BellRing size={17} />
                </button>
              )}

              {/* Attach — disparaît quand on tape */}
              {!hasText && (
                <div className="relative shrink-0">
                  {showAttach && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowAttach(false)} />
                      <div
                        className="absolute bottom-12 left-0 z-20 overflow-hidden"
                        style={{
                          background: "#fff", borderRadius: 16,
                          border: "1px solid var(--border-2)",
                          boxShadow: "var(--shadow-md)", width: 180,
                        }}
                      >
                        <button type="button" onClick={() => { setShowAttach(false); mediaInputRef.current?.click(); }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold hover:bg-slate-50 transition-colors"
                          style={{ color: "var(--text)" }}>
                          <ImageIcon size={16} style={{ color: "var(--blue)" }} /> Photo / Vidéo
                        </button>
                        <div className="mx-3 h-px" style={{ background: "var(--border)" }} />
                        <button type="button" onClick={() => { setShowAttach(false); fileInputRef.current?.click(); }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold hover:bg-slate-50 transition-colors"
                          style={{ color: "var(--text)" }}>
                          <FileText size={16} style={{ color: "var(--violet)" }} /> Fichier
                        </button>
                      </div>
                    </>
                  )}
                  <button type="button" onClick={() => setShowAttach(!showAttach)} disabled={uploading}
                    className="btn-icon" style={{ width: 38, height: 38 }}>
                    {uploading
                      ? <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--rose-border)", borderTopColor: "var(--rose)" }} />
                      : <Paperclip size={17} />
                    }
                  </button>
                </div>
              )}

              {/* Emoji — disparaît quand on tape */}
              {!hasText && (
                <div className="relative shrink-0">
                  {showEmoji && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowEmoji(false)} />
                      <div className="absolute bottom-12 left-0 z-20">
                        <EmojiPicker
                          onEmojiClick={(e: EmojiClickData) => { setContent((p) => p + e.emoji); setShowEmoji(false); }}
                          height={360} width={300} searchDisabled={false} skinTonesDisabled
                          previewConfig={{ showPreview: false }}
                        />
                      </div>
                    </>
                  )}
                  <button type="button" onClick={() => setShowEmoji(!showEmoji)}
                    className="btn-icon" style={{ width: 38, height: 38 }}>
                    <Smile size={17} />
                  </button>
                </div>
              )}

              {/* Input texte */}
              <input
                type="text"
                value={content}
                onChange={handleInput}
                placeholder="Message…"
                className="flex-1 text-sm"
                autoComplete="off"
                style={{
                  background: "#ffffff",
                  border: "1px solid rgba(0,0,0,0.10)",
                  borderRadius: 20,
                  padding: "10px 16px",
                  outline: "none",
                  color: "var(--text)",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                  fontFamily: "var(--font-sans)",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "var(--rose)";
                  e.target.style.boxShadow = "0 0 0 3px rgba(244,63,94,0.10)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "rgba(0,0,0,0.10)";
                  e.target.style.boxShadow = "0 1px 2px rgba(0,0,0,0.03)";
                }}
              />

              {/* Bouton envoi */}
              <button
                type="submit"
                disabled={!hasText || sending}
                className="shrink-0 flex items-center justify-center rounded-full transition-all"
                style={{
                  width: 38, height: 38,
                  background: hasText
                    ? "linear-gradient(145deg, #f43f5e, #d4264b)"
                    : "rgba(0,0,0,0.08)",
                  boxShadow: hasText ? "var(--shadow-rose)" : "none",
                  border: "none",
                  cursor: hasText ? "pointer" : "default",
                  transform: hasText ? "scale(1)" : "scale(0.90)",
                  opacity: sending ? 0.6 : 1,
                  transition: "all 0.18s cubic-bezier(0.34, 1.26, 0.64, 1)",
                }}
              >
                <ArrowUp size={17} color={hasText ? "#fff" : "var(--muted)"} strokeWidth={2.5} />
              </button>

            </form>
          </div>
        </div>
      )}
      {/* ── Sprint reminder modal ── */}
      {showSprintModal && (
        <div
          className="fixed inset-0 flex items-end justify-center px-4"
          style={{ zIndex: 60, background: "rgba(0,0,0,0.42)", backdropFilter: "blur(4px)", paddingBottom: 24 }}
          onClick={() => setShowSprintModal(false)}
        >
          <div
            className="w-full max-w-sm flex flex-col"
            style={{ background: "#fff", borderRadius: 24, boxShadow: "0 24px 64px rgba(0,0,0,0.18)", maxHeight: "78vh", overflow: "hidden" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-8 h-1 rounded-full" style={{ background: "rgba(0,0,0,0.12)" }} />
            </div>

            {/* Header modal */}
            <div className="flex items-center justify-between px-5 pt-2 pb-3 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "var(--rose-soft)" }}>
                  <BellRing size={15} style={{ color: "var(--rose)" }} />
                </div>
                <div>
                  <p className="font-bold text-sm" style={{ color: "var(--text)", letterSpacing: "-0.015em" }}>Rappel sprint</p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>Envoie un récap au dev</p>
                </div>
              </div>
              <button onClick={() => setShowSprintModal(false)} className="btn-icon" style={{ width: 30, height: 30, borderRadius: 9 }}>
                <X size={14} />
              </button>
            </div>

            {/* Contenu scrollable */}
            <div className="overflow-y-auto flex-1 px-5 py-4">
              {sprintLoading ? (
                <div className="flex justify-center py-8"><div className="spinner" /></div>
              ) : sprints.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm" style={{ color: "var(--muted)" }}>Aucun sprint créé sur ce projet.</p>
                  <button onClick={() => { setShowSprintModal(false); router.push(`/projets/${conversation?.project_id}/gestion`); }}
                    className="text-sm font-semibold mt-2" style={{ color: "var(--rose)" }}>
                    Créer un sprint →
                  </button>
                </div>
              ) : (
                <>
                  {/* Sélecteur de sprint */}
                  <p className="label mb-2">Sprint</p>
                  <div className="flex flex-col gap-1.5 mb-4">
                    {sprints.map((s) => {
                      const isSelected = selectedSprint?.id === s.id;
                      const daysLeft = Math.ceil((new Date(s.date_fin).getTime() - Date.now()) / 86400000);
                      return (
                        <button key={s.id} onClick={() => setSelectedSprint(s)}
                          className="flex items-center justify-between px-3.5 py-3 rounded-xl text-left transition-all"
                          style={{
                            background: isSelected ? "var(--rose-soft)" : "rgba(0,0,0,0.03)",
                            border: isSelected ? "1px solid var(--rose-border)" : "1px solid transparent",
                          }}
                        >
                          <div>
                            <p className="text-sm font-semibold" style={{ color: isSelected ? "var(--rose-hover)" : "var(--text)" }}>
                              {s.nom}
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                              {new Date(s.date_fin).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
                              {daysLeft > 0 ? ` · J-${daysLeft}` : daysLeft === 0 ? " · aujourd'hui" : " · terminé"}
                            </p>
                          </div>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={{
                              background: s.statut === "en_cours" ? "var(--green-soft)" : s.statut === "termine" ? "var(--blue-soft)" : "var(--amber-soft)",
                              color: s.statut === "en_cours" ? "var(--green)" : s.statut === "termine" ? "var(--blue)" : "var(--amber)",
                            }}>
                            {s.statut === "en_cours" ? "En cours" : s.statut === "termine" ? "Terminé" : "À venir"}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Aperçu tâches du sprint sélectionné */}
                  {selectedSprint && (() => {
                    const tasks = sprintTasks.filter((t) => t.sprint_id === selectedSprint.id);
                    const done   = tasks.filter((t) => t.statut === "done");
                    const inProg = tasks.filter((t) => t.statut === "en_cours" || t.statut === "review");
                    const todo   = tasks.filter((t) => t.statut === "todo");

                    const Section = ({ label, items, icon, color }: { label: string; items: SprintTask[]; icon: React.ReactNode; color: string }) =>
                      items.length > 0 ? (
                        <div className="mb-3">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            {icon}
                            <span className="text-xs font-bold" style={{ color }}>{label} ({items.length})</span>
                          </div>
                          {items.map((t) => (
                            <div key={t.id} className="flex items-center gap-2 py-1">
                              <div className="w-1 h-1 rounded-full shrink-0" style={{ background: color }} />
                              <span className="text-xs truncate" style={{ color: "var(--text-2)" }}>{t.titre}</span>
                            </div>
                          ))}
                        </div>
                      ) : null;

                    return tasks.length === 0 ? (
                      <p className="text-xs text-center py-4" style={{ color: "var(--muted)" }}>Aucune tâche dans ce sprint.</p>
                    ) : (
                      <div className="rounded-xl p-3.5" style={{ background: "rgba(0,0,0,0.03)", border: "1px solid var(--border)" }}>
                        <p className="label mb-3">Aperçu du message</p>
                        <Section label="Terminé" items={done}   icon={<CheckCircle2 size={12} style={{ color: "var(--green)" }} />}  color="var(--green)" />
                        <Section label="En cours" items={inProg} icon={<RotateCcw    size={12} style={{ color: "var(--blue)" }} />}   color="var(--blue)" />
                        <Section label="À faire"  items={todo}   icon={<Circle       size={12} style={{ color: "var(--muted)" }} />}  color="var(--muted)" />
                      </div>
                    );
                  })()}
                </>
              )}
            </div>

            {/* Bouton envoi */}
            {!sprintLoading && sprints.length > 0 && (
              <div className="px-5 pb-5 pt-3 shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
                <button
                  onClick={sendSprintReminder}
                  disabled={!selectedSprint}
                  className="btn-primary w-full"
                  style={{ padding: "13px 0", fontSize: 14 }}
                >
                  <BellRing size={14} /> Envoyer le rappel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
