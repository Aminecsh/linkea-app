"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth";
import { validateProjectFile } from "@/lib/fileUpload";
import AppNav from "@/components/AppNav";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";
import {
  ArrowLeft, ArrowUp, Paperclip, Smile, FileText, ImageIcon,
  ChevronDown, FileArchive, LayoutDashboard, ScrollText, BellRing, X,
  CheckCircle2, Circle, RotateCcw, Video, Calendar, Users, ExternalLink,
} from "lucide-react";
import JitsiCall from "@/components/JitsiCall";

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
  is_group?: boolean;
  group_name?: string;
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

type MeetingData = {
  id?: string;
  title: string;
  scheduled_at: string;
  duration_minutes: number;
  jitsi_room: string;
};

type CallData = {
  room: string;
  url: string;
  starter: string;
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

function parseMeetingContent(content: string): MeetingData | null {
  if (!content.startsWith("__MEETING__:")) return null;
  try { return JSON.parse(content.slice(12)); } catch { return null; }
}

function parseCallContent(content: string): CallData | null {
  if (!content.startsWith("__CALL__:")) return null;
  try { return JSON.parse(content.slice(9)); } catch { return null; }
}

const C = { ink: "#1A2138", rose: "#D4537E", muted: "#8A8579", hairline: "#E5E5EA", canvas: "#F5F5F7", surface: "#FFFFFF" } as const;

function MeetingCard({ data }: { data: MeetingData }) {
  const d = new Date(data.scheduled_at);
  const now = new Date();
  const isPast = d < now;
  const url = `https://meet.jit.si/${data.jitsi_room}`;
  const label = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div style={{ borderRadius: 16, overflow: "hidden", border: `1px solid ${C.hairline}`, background: C.surface, minWidth: 220, maxWidth: 280 }}>
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 mb-2">
          <div style={{ width: 28, height: 28, borderRadius: 9, background: C.canvas, border: `1px solid ${C.hairline}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Calendar size={13} strokeWidth={2} style={{ color: C.ink }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: C.muted }}>Réunion planifiée</span>
        </div>
        <p style={{ fontSize: 14, fontWeight: 700, color: C.ink, margin: 0, lineHeight: 1.3 }}>{data.title}</p>
        <p className="capitalize" style={{ fontSize: 12, color: C.muted, margin: "4px 0 0" }}>{label} · {time}</p>
        <p style={{ fontSize: 12, color: C.muted, margin: 0, fontVariantNumeric: "tabular-nums" }}>{data.duration_minutes} min</p>
      </div>
      <div style={{ borderTop: `1px solid ${C.hairline}` }} className="px-3 py-2.5">
        <a
          href={url} target="_blank" rel="noreferrer"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", padding: "9px 0", borderRadius: 10, fontSize: 12, fontWeight: 600, color: "#fff", background: C.rose, opacity: isPast ? 0.6 : 1, textDecoration: "none" }}
        >
          <Video size={12} strokeWidth={2} /> {isPast ? "Voir le replay" : "Rejoindre le call"}
          <ExternalLink size={10} style={{ opacity: 0.7 }} />
        </a>
      </div>
    </div>
  );
}

function CallCard({ data, onJoin }: { data: CallData; onJoin: (room: string) => void }) {
  return (
    <div style={{ borderRadius: 16, overflow: "hidden", border: `1px solid ${C.hairline}`, background: C.surface, minWidth: 200, maxWidth: 260 }}>
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-1.5">
          <div style={{ width: 28, height: 28, borderRadius: 9, background: C.canvas, border: `1px solid ${C.hairline}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Video size={13} strokeWidth={2} style={{ color: C.ink }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: C.muted }}>Appel en cours</span>
        </div>
        <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>par {data.starter}</p>
      </div>
      <div style={{ borderTop: `1px solid ${C.hairline}` }} className="px-3 py-2.5">
        <button
          onClick={() => onJoin(data.room)}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", padding: "9px 0", borderRadius: 10, fontSize: 12, fontWeight: 700, color: "#fff", background: C.rose, border: "none", cursor: "pointer" }}
        >
          <Video size={12} strokeWidth={2} /> Rejoindre l&apos;appel
        </button>
      </div>
    </div>
  );
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

  // Call + Meeting state
  const [showCallModal,    setShowCallModal]    = useState(false);
  const [activeCall,       setActiveCall]       = useState<{ room: string } | null>(null);
  const callStartRef = useRef<number | null>(null);
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [meetingTitle,     setMeetingTitle]     = useState("Réunion");
  const [meetingDate,      setMeetingDate]      = useState("");
  const [meetingTime,      setMeetingTime]      = useState("10:00");
  const [meetingDuration,  setMeetingDuration]  = useState(60);
  const [meetingCreating,  setMeetingCreating]  = useState(false);
  const [isGroup,          setIsGroup]          = useState(false);
  const [groupName,        setGroupName]        = useState("");

  const bottomRef      = useRef<HTMLDivElement>(null);
  const scrollAreaRef  = useRef<HTMLDivElement>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const mediaInputRef  = useRef<HTMLInputElement>(null);
  const typingTimeout  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef     = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isAtBottomRef  = useRef(true);

  useEffect(() => {
    async function load() {
      const user = await getAuthUser();
      if (!user) { router.push("/connexion"); return; }
      setUserId(user.id);

      // Parallel: role + conversation
      const [{ data: roleData }, { data: conv }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle(),
        supabase.from("conversations")
          .select("id, project_id, is_group, group_name, projects(titre, statut), profiles_founder(nom, user_id), profiles_developer(nom, user_id)")
          .eq("id", id).maybeSingle(),
      ]);
      const r = roleData?.role ?? null;
      setRole(r);

      if (!conv) { router.push("/messages"); return; }
      const convTyped = conv as unknown as Conversation;
      setConversation(convTyped);
      setIsGroup(!!convTyped.is_group);
      setGroupName(convTyped.group_name ?? "");

      const { data: contract } = await supabase
        .from("contracts").select("id").eq("project_id", conv.project_id).maybeSingle();
      if (contract) setContractId(contract.id);

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

  useEffect(() => {
    if (isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, otherTyping]);

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

  async function notifyOther(title: string, body: string) {
    if (!conversation) return;
    const otherUid = role === "founder"
      ? conversation.profiles_developer?.user_id
      : conversation.profiles_founder?.user_id;
    if (otherUid) {
      await supabase.from("notifications").insert({
        user_id: otherUid, type: "nouveau_message", title, body, link: `/messages/${id}`,
      });
    }
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
    await notifyOther("Nouveau message 💬", newMsg.content.slice(0, 80));
    setSending(false);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    const check = validateProjectFile(file);
    if (!check.ok) { e.target.value = ""; alert(check.error); return; }
    setUploading(true);

    const path = `${id}/${crypto.randomUUID()}.${check.ext}`;

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

  async function startCall() {
    if (!userId) return;
    const room = `linkea-${id.slice(0, 8)}`;
    const url  = `https://meet.jit.si/${room}`;
    const msgContent = `__CALL__:${JSON.stringify({ room, url, starter: myNom })}`;

    const newMsg: Message = { id: crypto.randomUUID(), sender_id: userId, content: msgContent, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, newMsg]);
    isAtBottomRef.current = true;
    await supabase.from("messages").insert({ conversation_id: id, sender_id: userId, content: msgContent });
    await notifyOther("📹 Appel entrant", `${myNom} vous appelle`);
    setShowCallModal(false);
    callStartRef.current = Date.now();
    setActiveCall({ room });
  }

  async function handleHangup() {
    if (userId && callStartRef.current !== null) {
      const secs = Math.floor((Date.now() - callStartRef.current) / 1000);
      const label = secs < 60
        ? `${secs}s`
        : `${Math.floor(secs / 60)} min${secs % 60 > 0 ? ` ${secs % 60}s` : ""}`;
      const msgContent = `__CALL_END__:${label}`;
      const newMsg: Message = { id: crypto.randomUUID(), sender_id: userId, content: msgContent, created_at: new Date().toISOString() };
      setMessages((prev) => [...prev, newMsg]);
      isAtBottomRef.current = true;
      await supabase.from("messages").insert({ conversation_id: id, sender_id: userId, content: msgContent });
      callStartRef.current = null;
    }
    setActiveCall(null);
  }

  async function scheduleMeeting() {
    if (!userId || !meetingDate || !meetingTime || meetingCreating) return;
    setMeetingCreating(true);

    const scheduled_at = new Date(`${meetingDate}T${meetingTime}`).toISOString();
    const jitsi_room   = `linkea-meeting-${crypto.randomUUID().slice(0, 8)}`;

    const { data: meeting } = await supabase.from("meetings").insert({
      conversation_id: id,
      project_id: conversation?.project_id,
      title: meetingTitle.trim() || "Réunion",
      scheduled_at,
      duration_minutes: meetingDuration,
      jitsi_room,
      created_by: userId,
    }).select().maybeSingle();

    if (meeting) {
      const msgContent = `__MEETING__:${JSON.stringify({
        id: meeting.id,
        title: meeting.title,
        scheduled_at: meeting.scheduled_at,
        duration_minutes: meeting.duration_minutes,
        jitsi_room: meeting.jitsi_room,
      })}`;
      const newMsg: Message = { id: crypto.randomUUID(), sender_id: userId, content: msgContent, created_at: new Date().toISOString() };
      setMessages((prev) => [...prev, newMsg]);
      isAtBottomRef.current = true;
      await supabase.from("messages").insert({ conversation_id: id, sender_id: userId, content: msgContent });

      const label = new Date(scheduled_at).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      await notifyOther("📅 Réunion planifiée", `${meeting.title} — ${label}`);
    }

    setMeetingCreating(false);
    setShowMeetingModal(false);
    setMeetingTitle("Réunion");
    setMeetingDate("");
    setMeetingTime("10:00");
    setMeetingDuration(60);
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

    const daysLeft = Math.ceil((new Date(selectedSprint.date_fin).getTime() - Date.now()) / 86400000);
    const echeance = new Date(selectedSprint.date_fin).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

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
    const newMsg: Message = { id: crypto.randomUUID(), sender_id: userId, content: msgContent, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, newMsg]);
    setShowSprintModal(false);
    isAtBottomRef.current = true;

    await supabase.from("messages").insert({ conversation_id: id, sender_id: userId, content: msgContent });
    await notifyOther("Rappel sprint 📋", `${selectedSprint.nom} — J-${daysLeft}`);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="spinner" />
      </div>
    );
  }

  const otherNom    = isGroup ? groupName : (role === "founder" ? conversation?.profiles_developer?.nom : conversation?.profiles_founder?.nom);
  const otherUserId = role === "founder" ? conversation?.profiles_founder?.user_id : conversation?.profiles_developer?.user_id;
  const isArchived  = ["livre", "termine"].includes(conversation?.projects?.statut ?? "");
  const hasText     = content.trim().length > 0;

  return (
    <div className="flex flex-col pl-sidebar" style={{ height: "100dvh", background: "var(--bg)" }}>
      <AppNav />

      {/* ── Appel Jitsi in-app ── */}
      {activeCall && (
        <JitsiCall
          room={activeCall.room}
          displayName={myNom || "Utilisateur"}
          onHangup={handleHangup}
        />
      )}

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

          <button onClick={() => router.push("/messages")} className="btn-icon shrink-0" style={{ width: 34, height: 34, borderRadius: 10 }}>
            <ArrowLeft size={17} />
          </button>

          {/* Avatar */}
          <button onClick={() => !isGroup && otherUserId && router.push(`/profil/${otherUserId}`)} className="shrink-0">
            {isGroup ? (
              <div style={{ width: 36, height: 36, borderRadius: 11, background: C.ink, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Users size={16} strokeWidth={1.8} style={{ color: "#fff" }} />
              </div>
            ) : otherAvatarUrl ? (
              <img src={otherAvatarUrl} alt={otherNom ?? ""}
                style={{ width: 36, height: 36, borderRadius: 11, objectFit: "cover", border: `1px solid ${C.hairline}`, display: "block" }} />
            ) : (
              <div style={{ width: 36, height: 36, borderRadius: 11, background: C.ink, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "#fff", lineHeight: 1 }}>{otherNom?.[0]?.toUpperCase() ?? "?"}</span>
              </div>
            )}
          </button>

          {/* Nom + statut */}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm leading-tight truncate" style={{ color: C.ink, letterSpacing: "-0.015em" }}>{otherNom}</p>
            <p className="text-xs truncate transition-all duration-200"
              style={{ color: otherTyping ? C.rose : C.muted, fontWeight: otherTyping ? 600 : 400 }}>
              {otherTyping ? "En train d'écrire…" : conversation?.projects?.titre}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Appel vidéo */}
            {!isArchived && (
              <button
                onClick={() => setShowCallModal(true)}
                style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 10, background: C.surface, border: `1px solid ${C.hairline}`, cursor: "pointer" }}
                title="Appel vidéo"
              >
                <Video size={15} strokeWidth={2} style={{ color: C.ink }} />
              </button>
            )}
            {/* Planifier meeting */}
            {!isArchived && (
              <button
                onClick={() => setShowMeetingModal(true)}
                style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 10, background: C.surface, border: `1px solid ${C.hairline}`, cursor: "pointer" }}
                title="Planifier une réunion"
              >
                <Calendar size={15} strokeWidth={2} style={{ color: C.ink }} />
              </button>
            )}
            <button
              onClick={() => router.push(`/projets/${conversation?.project_id}/gestion`)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all"
              style={{ background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.08)", color: "var(--text-2)" }}
            >
              <LayoutDashboard size={12} />
              <span className="hidden sm:inline">Gestion</span>
            </button>
            {contractId && (
              <button
                onClick={() => router.push(`/contrat/${contractId}`)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all"
                style={{ background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.08)", color: "var(--text-2)" }}
              >
                <ScrollText size={12} />
                <span className="hidden sm:inline">Contrat</span>
              </button>
            )}
          </div>
        </div>

        {contractId && !isArchived && (
          <div className="mx-3 mb-2 flex items-center justify-between"
            style={{ borderRadius: 10, padding: "8px 12px", background: C.canvas, border: `1px solid ${C.hairline}` }}>
            <div className="flex items-center gap-2">
              <ScrollText size={13} strokeWidth={2} style={{ color: C.ink, flexShrink: 0 }} />
              <span className="text-xs font-semibold" style={{ color: C.ink }}>Projet en cours — contrat signé</span>
            </div>
            <button onClick={() => router.push(`/contrat/${contractId}`)} className="text-xs font-bold" style={{ color: C.ink, background: "none", border: "none", cursor: "pointer" }}>Voir →</button>
          </div>
        )}
      </div>

      {/* ── Messages ── */}
      <div ref={scrollAreaRef} className="flex-1 overflow-y-auto scrollbar-hide" style={{ overscrollBehavior: "contain" }}>
        <div className="max-w-2xl mx-auto px-3 py-4">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <p className="text-sm" style={{ color: C.muted }}>Début de la conversation — dites bonjour</p>
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

              const meetingData = parseMeetingContent(m.content);
              const callData    = parseCallContent(m.content);
              const callEndMatch = m.content.startsWith("__CALL_END__:") ? m.content.slice(13) : null;
              const isImage = m.file_type?.startsWith("image/");
              const isPdf   = m.file_type === "application/pdf";
              const isFile  = !!m.file_url;

              const r = 18;
              const flat = 5;
              const br = isMe
                ? `${r}px ${isFirstInGroup ? r : flat}px ${isLastInGroup ? flat : r}px ${r}px`
                : `${isFirstInGroup ? r : flat}px ${r}px ${r}px ${isLastInGroup ? flat : r}px`;

              return (
                <div key={m.id}>
                  {showDate && (
                    <div className="flex items-center gap-3 my-4">
                      <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                      <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ color: "var(--muted)", background: "rgba(0,0,0,0.04)" }}>
                        {formatDateSeparator(m.created_at)}
                      </span>
                      <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                    </div>
                  )}

                  <div className={`flex items-end gap-2 ${isMe ? "justify-end" : "justify-start"} ${isFirstInGroup ? "mt-3" : "mt-0.5"}`}>
                    {/* Avatar gauche */}
                    {!isMe && (
                      <div className="w-6 shrink-0 self-end mb-0.5">
                        {isLastInGroup ? (
                          <button onClick={() => otherUserId && router.push(`/profil/${otherUserId}`)}>
                            {otherAvatarUrl ? (
                              <img src={otherAvatarUrl} alt="" style={{ width: 24, height: 24, borderRadius: 8, objectFit: "cover", display: "block" }} />
                            ) : (
                              <div style={{ width: 24, height: 24, borderRadius: 8, background: C.ink, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", lineHeight: 1 }}>{otherNom?.[0]?.toUpperCase() ?? "?"}</span>
                              </div>
                            )}
                          </button>
                        ) : null}
                      </div>
                    )}

                    {/* Bulle */}
                    <div className={`flex flex-col ${isMe ? "items-end" : "items-start"} max-w-[75%]`}>
                      {meetingData ? (
                        <MeetingCard data={meetingData} />
                      ) : callEndMatch ? (
                        <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl"
                          style={{ background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.07)" }}>
                          <Video size={13} style={{ color: "var(--muted)" }} />
                          <span className="text-xs font-semibold" style={{ color: "var(--muted)" }}>
                            Appel terminé · {callEndMatch}
                          </span>
                        </div>
                      ) : callData ? (
                        <CallCard data={callData} onJoin={(room) => setActiveCall({ room })} />
                      ) : isFile ? (
                        isImage ? (
                          <a href={m.file_url} target="_blank" rel="noreferrer" style={{ borderRadius: br, overflow: "hidden", display: "block" }}>
                            <img src={m.file_url} alt="img" className="max-w-[240px] object-cover hover:opacity-90 transition-opacity" />
                          </a>
                        ) : (
                          <a href={m.file_url} target="_blank" rel="noreferrer"
                            className="flex items-center gap-2.5 px-4 py-3 text-sm font-semibold"
                            style={{
                              borderRadius: br,
                              background: isMe ? C.rose : C.surface,
                              color: isMe ? "#fff" : C.ink,
                              border: isMe ? "none" : `1px solid ${C.hairline}`,
                            }}>
                            {isPdf ? <FileText size={16} style={{ flexShrink: 0 }} /> : <FileArchive size={16} style={{ flexShrink: 0 }} />}
                            <span className="truncate max-w-[160px]">{m.file_url?.split("/").pop()}</span>
                          </a>
                        )
                      ) : (
                        <div
                          className="px-4 py-2.5 text-sm leading-relaxed"
                          style={{
                            borderRadius: br,
                            background: isMe ? C.rose : C.surface,
                            color: isMe ? "#ffffff" : C.ink,
                            border: isMe ? "none" : `1px solid ${C.hairline}`,
                            wordBreak: "break-word",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {m.content}
                        </div>
                      )}

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
                            <img src={myAvatarUrl} alt="" style={{ width: 24, height: 24, borderRadius: 8, objectFit: "cover", display: "block" }} />
                          ) : (
                            <div style={{ width: 24, height: 24, borderRadius: 8, background: C.ink, display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", lineHeight: 1 }}>{myNom?.[0]?.toUpperCase() ?? "?"}</span>
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
                    <img src={otherAvatarUrl} alt="" style={{ width: 24, height: 24, borderRadius: 8, objectFit: "cover", display: "block" }} />
                  ) : (
                    <div style={{ width: 24, height: 24, borderRadius: 8, background: C.ink, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", lineHeight: 1 }}>{otherNom?.[0]?.toUpperCase() ?? "?"}</span>
                    </div>
                  )}
                </div>
                <div className="px-4 py-3 flex gap-1 items-center"
                  style={{ borderRadius: "18px 18px 18px 5px", background: C.surface, border: `1px solid ${C.hairline}` }}>
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

      {/* Scroll to bottom */}
      {showScrollBtn && (
        <div className="absolute bottom-24 right-4 z-30">
          <button onClick={scrollToBottom} className="flex items-center justify-center rounded-full shadow-lg relative"
            style={{ width: 38, height: 38, background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)", boxShadow: "0 4px 16px rgba(0,0,0,0.12)" }}>
            <ChevronDown size={18} style={{ color: "var(--text)" }} />
            {unreadBelow > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-white px-1"
                style={{ background: "var(--rose)", fontSize: 10, fontWeight: 800 }}>
                {unreadBelow}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Archive banner */}
      {isArchived && (
        <div className="shrink-0 px-3 pb-3" style={{ borderTop: "1px solid var(--border)", background: "var(--bg)", paddingTop: 12 }}>
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-center gap-2 rounded-xl px-4 py-3"
              style={{ background: "rgba(0,0,0,0.04)", border: "1px solid var(--border-2)" }}>
              <FileArchive size={14} style={{ color: "var(--muted)" }} />
              <p className="text-xs font-medium" style={{ color: "var(--muted)" }}>Projet terminé — conversation archivée</p>
            </div>
          </div>
        </div>
      )}

      {/* Input bar */}
      {!isArchived && (
        <div className="shrink-0"
          style={{ background: "rgba(240,240,245,0.94)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", borderTop: "1px solid rgba(0,0,0,0.07)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          <div className="max-w-2xl mx-auto px-3 py-2.5">
            <form onSubmit={handleSend} className="flex items-end gap-2">
              <input ref={mediaInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileChange} />
              <input ref={fileInputRef}  type="file" accept=".pdf,.doc,.docx,.zip,.txt,.xls,.xlsx,.ppt,.pptx" className="hidden" onChange={handleFileChange} />

              {!hasText && role === "founder" && (
                <button type="button" onClick={openSprintModal} className="btn-icon shrink-0" style={{ width: 38, height: 38 }}>
                  <BellRing size={17} />
                </button>
              )}

              {!hasText && (
                <div className="relative shrink-0">
                  {showAttach && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowAttach(false)} />
                      <div className="absolute bottom-12 left-0 z-20 overflow-hidden"
                        style={{ background: "#fff", borderRadius: 16, border: "1px solid var(--border-2)", boxShadow: "var(--shadow-md)", width: 180 }}>
                        <button type="button" onClick={() => { setShowAttach(false); mediaInputRef.current?.click(); }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold transition-colors" style={{ color: C.ink }}>
                          <ImageIcon size={16} strokeWidth={2} style={{ color: C.muted }} /> Photo / Vidéo
                        </button>
                        <div className="mx-3 h-px" style={{ background: C.hairline }} />
                        <button type="button" onClick={() => { setShowAttach(false); fileInputRef.current?.click(); }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold transition-colors" style={{ color: C.ink }}>
                          <FileText size={16} strokeWidth={2} style={{ color: C.muted }} /> Fichier
                        </button>
                      </div>
                    </>
                  )}
                  <button type="button" onClick={() => setShowAttach(!showAttach)} disabled={uploading} className="btn-icon" style={{ width: 38, height: 38 }}>
                    {uploading
                      ? <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--rose-border)", borderTopColor: "var(--rose)" }} />
                      : <Paperclip size={17} />}
                  </button>
                </div>
              )}

              {!hasText && (
                <div className="relative shrink-0">
                  {showEmoji && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowEmoji(false)} />
                      <div className="absolute bottom-12 left-0 z-20">
                        <EmojiPicker
                          onEmojiClick={(e: EmojiClickData) => { setContent((p) => p + e.emoji); setShowEmoji(false); }}
                          height={360} width={300} searchDisabled={false} skinTonesDisabled previewConfig={{ showPreview: false }}
                        />
                      </div>
                    </>
                  )}
                  <button type="button" onClick={() => setShowEmoji(!showEmoji)} className="btn-icon" style={{ width: 38, height: 38 }}>
                    <Smile size={17} />
                  </button>
                </div>
              )}

              <input
                type="text" value={content} onChange={handleInput} placeholder="Message…" maxLength={5000}
                className="flex-1 text-sm" autoComplete="off"
                style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)", borderRadius: 20, padding: "10px 16px", outline: "none", color: "var(--text)", boxShadow: "0 1px 2px rgba(0,0,0,0.03)", fontFamily: "var(--font-sans)" }}
                onFocus={(e) => { e.target.style.borderColor = "var(--rose)"; e.target.style.boxShadow = "0 0 0 3px rgba(244,63,94,0.10)"; }}
                onBlur={(e)  => { e.target.style.borderColor = "rgba(0,0,0,0.10)"; e.target.style.boxShadow = "0 1px 2px rgba(0,0,0,0.03)"; }}
              />

              <button type="submit" disabled={!hasText || sending} className="shrink-0 flex items-center justify-center rounded-full"
                style={{ width: 38, height: 38, background: hasText ? C.rose : C.hairline, border: "none", cursor: hasText ? "pointer" : "default", transform: hasText ? "scale(1)" : "scale(0.90)", opacity: sending ? 0.6 : 1, transition: "all 0.18s cubic-bezier(0.34, 1.26, 0.64, 1)" }}>
                <ArrowUp size={17} color={hasText ? "#fff" : C.muted} strokeWidth={2.5} />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Sprint modal ── */}
      {showSprintModal && (
        <div className="fixed inset-0 flex items-end justify-center px-4"
          style={{ zIndex: 60, background: "rgba(0,0,0,0.42)", backdropFilter: "blur(4px)", paddingBottom: 24 }}
          onClick={() => setShowSprintModal(false)}>
          <div className="w-full max-w-sm flex flex-col"
            style={{ background: "#fff", borderRadius: 24, boxShadow: "0 24px 64px rgba(0,0,0,0.18)", maxHeight: "78vh", overflow: "hidden" }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-8 h-1 rounded-full" style={{ background: "rgba(0,0,0,0.12)" }} />
            </div>
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
            <div className="overflow-y-auto flex-1 px-5 py-4">
              {sprintLoading ? (
                <div className="flex justify-center py-8"><div className="spinner" /></div>
              ) : sprints.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm" style={{ color: "var(--muted)" }}>Aucun sprint créé sur ce projet.</p>
                  <button onClick={() => { setShowSprintModal(false); router.push(`/projets/${conversation?.project_id}/gestion`); }}
                    className="text-sm font-semibold mt-2" style={{ color: "var(--rose)" }}>Créer un sprint →</button>
                </div>
              ) : (
                <>
                  <p className="label mb-2">Sprint</p>
                  <div className="flex flex-col gap-1.5 mb-4">
                    {sprints.map((s) => {
                      const isSelected = selectedSprint?.id === s.id;
                      const daysLeft = Math.ceil((new Date(s.date_fin).getTime() - Date.now()) / 86400000);
                      return (
                        <button key={s.id} onClick={() => setSelectedSprint(s)}
                          className="flex items-center justify-between px-3.5 py-3 rounded-xl text-left transition-all"
                          style={{ background: isSelected ? "var(--rose-soft)" : "rgba(0,0,0,0.03)", border: isSelected ? "1px solid var(--rose-border)" : "1px solid transparent" }}>
                          <div>
                            <p className="text-sm font-semibold" style={{ color: isSelected ? "var(--rose-hover)" : "var(--text)" }}>{s.nom}</p>
                            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                              {new Date(s.date_fin).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
                              {daysLeft > 0 ? ` · J-${daysLeft}` : daysLeft === 0 ? " · aujourd'hui" : " · terminé"}
                            </p>
                          </div>
                          <span className="text-xs font-semibold px-2 py-0.5"
                            style={{ borderRadius: 6, border: `1px solid ${C.hairline}`, background: C.surface, color: s.statut === "en_cours" ? C.ink : C.muted }}>
                            {s.statut === "en_cours" ? "En cours" : s.statut === "termine" ? "Terminé" : "À venir"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {selectedSprint && (() => {
                    const tasks = sprintTasks.filter((t) => t.sprint_id === selectedSprint.id);
                    const done   = tasks.filter((t) => t.statut === "done");
                    const inProg = tasks.filter((t) => t.statut === "en_cours" || t.statut === "review");
                    const todo   = tasks.filter((t) => t.statut === "todo");
                    const Section = ({ label, items, icon, color }: { label: string; items: SprintTask[]; icon: React.ReactNode; color: string }) =>
                      items.length > 0 ? (
                        <div className="mb-3">
                          <div className="flex items-center gap-1.5 mb-1.5">{icon}<span className="text-xs font-bold" style={{ color }}>{label} ({items.length})</span></div>
                          {items.map((t) => (<div key={t.id} className="flex items-center gap-2 py-1"><div className="w-1 h-1 rounded-full shrink-0" style={{ background: color }} /><span className="text-xs truncate" style={{ color: "var(--text-2)" }}>{t.titre}</span></div>))}
                        </div>
                      ) : null;
                    return tasks.length === 0 ? (
                      <p className="text-xs text-center py-4" style={{ color: "var(--muted)" }}>Aucune tâche dans ce sprint.</p>
                    ) : (
                      <div className="rounded-xl p-3.5" style={{ background: "rgba(0,0,0,0.03)", border: "1px solid var(--border)" }}>
                        <p className="label mb-3">Aperçu du message</p>
                        <Section label="Terminé" items={done}   icon={<CheckCircle2 size={12} style={{ color: C.ink }} />} color={C.ink} />
                        <Section label="En cours" items={inProg} icon={<RotateCcw    size={12} style={{ color: C.ink }} />}  color={C.ink} />
                        <Section label="À faire"  items={todo}   icon={<Circle       size={12} style={{ color: C.muted }} />} color={C.muted} />
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
            {!sprintLoading && sprints.length > 0 && (
              <div className="px-5 pb-5 pt-3 shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
                <button onClick={sendSprintReminder} disabled={!selectedSprint} className="btn-primary w-full" style={{ padding: "13px 0", fontSize: 14 }}>
                  <BellRing size={14} /> Envoyer le rappel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Call modal ── */}
      {showCallModal && (
        <div className="fixed inset-0 z-60 flex items-end justify-center bg-black/50 px-4 pb-8"
          onClick={() => setShowCallModal(false)}>
          <div style={{ width: "100%", maxWidth: 384, background: C.surface, borderRadius: 20, border: `1px solid ${C.hairline}`, padding: 24 }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div style={{ width: 40, height: 40, borderRadius: 12, background: C.ink, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Video size={18} strokeWidth={1.8} style={{ color: "#fff" }} />
                </div>
                <div>
                  <p style={{ fontFamily: "var(--font-sans)", fontSize: 17, fontWeight: 600, color: C.ink, margin: 0 }}>Appel vidéo</p>
                  <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>via Jitsi Meet</p>
                </div>
              </div>
              <button onClick={() => setShowCallModal(false)} style={{ width: 32, height: 32, borderRadius: 10, background: C.canvas, border: `1px solid ${C.hairline}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.muted, fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
            <p style={{ fontSize: 14, color: C.muted, margin: "0 0 20px", lineHeight: 1.55 }}>
              Un appel va être démarré avec <strong style={{ color: C.ink }}>{otherNom}</strong>. Les deux participants doivent cliquer sur &quot;Rejoindre&quot; pour se connecter.
            </p>
            <button onClick={startCall}
              style={{ width: "100%", padding: "14px 0", borderRadius: 12, fontSize: 14, fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: C.rose, border: "none", cursor: "pointer" }}>
              <Video size={16} strokeWidth={2} /> Démarrer l&apos;appel
            </button>
          </div>
        </div>
      )}

      {/* ── Meeting modal ── */}
      {showMeetingModal && (
        <div className="fixed inset-0 z-60 flex items-end justify-center bg-black/50 px-4 pb-6"
          onClick={() => setShowMeetingModal(false)}>
          <div style={{ width: "100%", maxWidth: 384, background: C.surface, borderRadius: 20, border: `1px solid ${C.hairline}`, padding: 24, display: "flex", flexDirection: "column", gap: 16 }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div style={{ width: 40, height: 40, borderRadius: 12, background: C.ink, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Calendar size={18} strokeWidth={1.8} style={{ color: "#fff" }} />
                </div>
                <div>
                  <p style={{ fontFamily: "var(--font-sans)", fontSize: 17, fontWeight: 600, color: C.ink, margin: 0 }}>Planifier une réunion</p>
                  <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Lien Jitsi généré automatiquement</p>
                </div>
              </div>
              <button onClick={() => setShowMeetingModal(false)} style={{ width: 32, height: 32, borderRadius: 10, background: C.canvas, border: `1px solid ${C.hairline}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.muted, fontSize: 18, lineHeight: 1 }}>×</button>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: C.muted, marginBottom: 8 }}>Titre</label>
              <input value={meetingTitle} onChange={(e) => setMeetingTitle(e.target.value)}
                style={{ width: "100%", padding: "11px 14px", borderRadius: 12, border: `1px solid ${C.hairline}`, background: C.surface, fontSize: 14, color: C.ink, outline: "none" }}
                placeholder="Réunion hebdo, Demo, Stand-up..." />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: C.muted, marginBottom: 8 }}>Date *</label>
                <input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)}
                  style={{ width: "100%", padding: "11px 14px", borderRadius: 12, border: `1px solid ${C.hairline}`, background: C.surface, fontSize: 14, color: C.ink, outline: "none", fontVariantNumeric: "tabular-nums" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: C.muted, marginBottom: 8 }}>Heure *</label>
                <input type="time" value={meetingTime} onChange={(e) => setMeetingTime(e.target.value)}
                  style={{ width: "100%", padding: "11px 14px", borderRadius: 12, border: `1px solid ${C.hairline}`, background: C.surface, fontSize: 14, color: C.ink, outline: "none", fontVariantNumeric: "tabular-nums" }} />
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: C.muted, marginBottom: 8 }}>Durée</label>
              <div className="flex gap-2">
                {[30, 60, 90].map((d) => (
                  <button key={d} onClick={() => setMeetingDuration(d)}
                    className="flex-1 py-2 text-xs font-bold transition-colors"
                    style={{ borderRadius: 10, background: meetingDuration === d ? C.ink : C.surface, color: meetingDuration === d ? "#fff" : C.muted, border: meetingDuration === d ? `1px solid ${C.ink}` : `1px solid ${C.hairline}`, cursor: "pointer", fontVariantNumeric: "tabular-nums" }}>
                    {d} min
                  </button>
                ))}
              </div>
            </div>

            <button onClick={scheduleMeeting} disabled={meetingCreating || !meetingDate || !meetingTime}
              style={{ width: "100%", padding: "14px 0", borderRadius: 12, fontSize: 14, fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: C.rose, border: "none", cursor: "pointer", opacity: (meetingCreating || !meetingDate || !meetingTime) ? 0.4 : 1 }}>
              {meetingCreating
                ? <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "lk-spin 0.8s linear infinite" }} />
                : <><Calendar size={15} strokeWidth={2} /> Planifier la réunion</>}
            </button>
            <style>{`@keyframes lk-spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        </div>
      )}
    </div>
  );
}
