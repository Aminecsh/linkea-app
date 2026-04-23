"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";

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
  projects: { titre: string };
  profiles_founder: { nom: string; user_id: string };
  profiles_developer: { nom: string; user_id: string };
};

export default function ChatPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [content, setContent] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }
      setUserId(user.id);

      const { data: roleData } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      setRole(roleData?.role ?? null);

      const { data: conv } = await supabase
        .from("conversations")
        .select("id, projects(titre), profiles_founder(nom, user_id), profiles_developer(nom, user_id)")
        .eq("id", id)
        .maybeSingle();

      if (!conv) { router.push("/messages"); return; }
      setConversation(conv as Conversation);

      const { data: msgs } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", id)
        .order("created_at", { ascending: true });

      setMessages(msgs ?? []);
      localStorage.setItem(`lastRead_${id}`, new Date().toISOString());
      setLoading(false);
    }
    load();
  }, [id, router]);

  // Realtime : messages + typing
  useEffect(() => {
    if (loading || !userId) return;

    const channel = supabase.channel(`chat:${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` },
        (payload) => {
          const newMsg = payload.new as Message;
          if (newMsg.sender_id !== userId) {
            setMessages((prev) => [...prev, newMsg]);
            setOtherTyping(false);
            localStorage.setItem(`lastRead_${id}`, new Date().toISOString());
          }
        }
      )
      .on("broadcast", { event: "typing" }, (payload) => {
        if (payload.payload.sender_id !== userId) {
          setOtherTyping(true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setOtherTyping(false), 2500);
        }
      })
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [id, loading, userId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, otherTyping]);

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

    await supabase.from("messages").insert({
      conversation_id: id,
      sender_id: userId,
      content: newMsg.content,
    });

    // Notification in-app à l'autre participant
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

    const ext = file.name.split(".").pop();
    const path = `${id}/${crypto.randomUUID()}.${ext}`;

    const { error } = await supabase.storage.from("chat-files").upload(path, file);
    if (error) { setUploading(false); return; }

    const { data: urlData } = supabase.storage.from("chat-files").getPublicUrl(path);
    const fileUrl = urlData.publicUrl;
    const fileType = file.type;

    const newMsg: Message = {
      id: crypto.randomUUID(),
      sender_id: userId,
      content: "",
      file_url: fileUrl,
      file_type: fileType,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, newMsg]);

    await supabase.from("messages").insert({
      conversation_id: id,
      sender_id: userId,
      content: "",
      file_url: fileUrl,
      file_type: fileType,
    });

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-pink-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  const otherNom = role === "founder"
    ? conversation?.profiles_developer?.nom
    : conversation?.profiles_founder?.nom;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={() => router.push("/messages")} className="text-slate-400 hover:text-slate-600 text-sm font-medium shrink-0">←</button>
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white font-black shrink-0">
            {otherNom?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-bold text-slate-900 text-sm leading-none">{otherNom}</p>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${role === "founder" ? "bg-blue-50 text-blue-500" : "bg-pink-50 text-pink-500"}`}>
                {role === "founder" ? "Dev" : "Founder"}
              </span>
            </div>
            <p className={`text-xs mt-0.5 transition-all ${otherTyping ? "text-pink-400 font-medium" : "text-slate-400"}`}>
              {otherTyping ? "En train d'écrire..." : `📋 ${conversation?.projects?.titre}`}
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 max-w-2xl mx-auto w-full">
        {messages.length === 0 && (
          <div className="text-center py-12 text-slate-400 text-sm">
            Début de la conversation — dites bonjour 👋
          </div>
        )}
        <div className="flex flex-col gap-2">
          {messages.map((m) => {
            const isMe = m.sender_id === userId;
            const isImage = m.file_type?.startsWith("image/");
            const isPdf = m.file_type === "application/pdf";
            const isFile = !!m.file_url;

            return (
              <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                {isFile ? (
                  <div className={`max-w-[75%] rounded-2xl overflow-hidden ${isMe ? "rounded-br-sm" : "rounded-bl-sm"}`}>
                    {isImage ? (
                      <a href={m.file_url} target="_blank" rel="noreferrer">
                        <img src={m.file_url} alt="image" className="max-w-[260px] rounded-2xl object-cover cursor-pointer hover:opacity-90 transition-opacity" />
                      </a>
                    ) : (
                      <a
                        href={m.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold ${isMe ? "bg-gradient-to-br from-pink-500 to-pink-600 text-white" : "bg-white border border-slate-200 text-slate-700"}`}
                      >
                        <span className="text-xl">{isPdf ? "📄" : "📎"}</span>
                        <span className="truncate max-w-[160px]">{m.file_url?.split("/").pop()}</span>
                        <span className="text-xs opacity-70 shrink-0">↗</span>
                      </a>
                    )}
                  </div>
                ) : (
                  <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    isMe
                      ? "bg-gradient-to-br from-pink-500 to-pink-600 text-white rounded-br-sm"
                      : "bg-white border border-slate-200 text-slate-800 rounded-bl-sm"
                  }`}>
                    {m.content}
                  </div>
                )}
              </div>
            );
          })}

          {/* Typing indicator */}
          {otherTyping && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200 px-4 py-2.5 rounded-2xl rounded-bl-sm flex gap-1 items-center">
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          )}
        </div>
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t border-slate-200 px-4 py-3 sticky bottom-0">
        <div className="max-w-2xl mx-auto">
          <form onSubmit={handleSend} className="flex gap-2 items-center">
            {/* Inputs fichiers cachés */}
            <input ref={mediaInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileChange} />
            <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.zip,.txt,.xls,.xlsx,.ppt,.pptx" className="hidden" onChange={handleFileChange} />

            {/* Bouton attach + menu */}
            <div className="relative shrink-0">
              {showAttachMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowAttachMenu(false)} />
                  <div className="absolute bottom-12 left-0 bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden z-20 w-48">
                    <button
                      type="button"
                      onClick={() => { setShowAttachMenu(false); mediaInputRef.current?.click(); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <span className="text-xl">🖼️</span> Photo / Vidéo
                    </button>
                    <div className="h-px bg-slate-100 mx-3" />
                    <button
                      type="button"
                      onClick={() => { setShowAttachMenu(false); fileInputRef.current?.click(); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <span className="text-xl">📄</span> Fichier
                    </button>
                  </div>
                </>
              )}
              <button
                type="button"
                onClick={() => setShowAttachMenu(!showAttachMenu)}
                disabled={uploading}
                className="w-10 h-10 flex items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:text-pink-500 hover:border-pink-300 transition-all"
              >
                {uploading ? (
                  <span className="w-4 h-4 rounded-full border-2 border-pink-400 border-t-transparent animate-spin" />
                ) : (
                  <span className="text-lg">📎</span>
                )}
              </button>
            </div>
            {/* Emoji picker */}
            <div className="relative shrink-0">
              {showEmoji && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowEmoji(false)} />
                  <div className="absolute bottom-12 left-0 z-20">
                    <EmojiPicker
                      onEmojiClick={(e: EmojiClickData) => {
                        setContent((prev) => prev + e.emoji);
                        setShowEmoji(false);
                      }}
                      height={380}
                      width={320}
                      searchDisabled={false}
                      skinTonesDisabled
                      previewConfig={{ showPreview: false }}
                    />
                  </div>
                </>
              )}
              <button
                type="button"
                onClick={() => setShowEmoji(!showEmoji)}
                className="w-10 h-10 flex items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:text-yellow-500 hover:border-yellow-300 transition-all text-lg"
              >
                😊
              </button>
            </div>

            <input
              type="text"
              value={content}
              onChange={handleInput}
              placeholder="Écris un message..."
              className="input-field py-3 text-sm flex-1"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={!content.trim() || sending}
              className="btn-pink px-5 py-3 text-sm shrink-0"
            >
              Envoyer
            </button>
          </form>
        </div>
      </div>

    </div>
  );
}
