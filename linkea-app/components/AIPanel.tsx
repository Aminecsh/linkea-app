"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github.css";
import { supabase } from "@/lib/supabase";

type Message = { role: "user" | "assistant"; content: string };

type Props = {
  projectId: string;
  projectTitre: string;
  onClose: () => void;
  onRoadmapGenerated?: (sprints: RoadmapSprint[]) => void;
};

export type RoadmapSprint = {
  nom: string;
  objectif: string;
  duree_jours: number;
  taches: string[];
};

const QUICK_ACTIONS = [
  { label: "📋 Cadrer mon MVP", prompt: "Aide-moi à cadrer le MVP de ce projet. Quelles sont les fonctionnalités essentielles à développer en priorité ?" },
  { label: "🗓 Générer roadmap", prompt: "ROADMAP" },
  { label: "✍️ Rédiger la fiche", prompt: "FICHE" },
  { label: "⚙️ Choisir la stack", prompt: "Quelle stack technique recommandes-tu pour ce projet et pourquoi ?" },
  { label: "⏱ Estimer le temps", prompt: "Combien de temps faut-il pour développer ce projet en partant de zéro ?" },
];

function extractQuestions(content: string): string[] {
  const lines = content.split("\n");
  const questions: string[] = [];
  for (const line of lines) {
    const clean = line.replace(/^[-*•#>\d.\s]+/, "").trim();
    if (clean.endsWith("?") && clean.length > 10 && clean.length < 200) {
      questions.push(clean);
    }
  }
  return questions.slice(0, 6);
}

function extractSuggestions(content: string): { clean: string; suggestions: string[] } {
  const match = content.match(/\{"suggestions":\s*\[([^\]]*)\]\}/);
  if (!match) return { clean: content, suggestions: [] };
  try {
    const parsed = JSON.parse(match[0]);
    const suggestions: string[] = parsed.suggestions ?? [];
    const clean = content.replace(match[0], "").trim();
    return { clean, suggestions };
  } catch {
    return { clean: content, suggestions: [] };
  }
}

// Bloc de code avec bouton copier
function CodeBlock({ children, className }: { children?: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  const code = String(children).replace(/\n$/, "");
  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="relative group my-2">
      <button
        onClick={copy}
        className="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded bg-[#1A2138] text-white/70 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copied ? "Copié !" : "📋 Copier"}
      </button>
      <pre className={`${className ?? ""} rounded-xl !text-xs !p-4 overflow-x-auto`}>
        <code>{children}</code>
      </pre>
    </div>
  );
}

function MdMessage({ content, streaming }: { content: string; streaming?: boolean }) {
  const { clean, suggestions: _ } = extractSuggestions(content);
  return (
    <div className="prose prose-sm max-w-none prose-headings:text-[#1A2138] prose-headings:font-bold prose-headings:mt-3 prose-headings:mb-1 prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-code:bg-[#E5E5EA] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono prose-table:text-xs prose-hr:my-3">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          code({ className, children, ...props }) {
            const isBlock = className?.includes("language-");
            if (isBlock) return <CodeBlock className={className}>{children}</CodeBlock>;
            return <code className={className} {...props}>{children}</code>;
          },
        }}
      >
        {clean}
      </ReactMarkdown>
      {streaming && <span className="inline-block w-0.5 h-4 bg-[#D4537E] ml-0.5 animate-blink align-text-bottom" />}
    </div>
  );
}

function QuestionForm({ questions, onSubmit, disabled }: {
  questions: string[];
  onSubmit: (answers: string) => void;
  disabled: boolean;
}) {
  const [answers, setAnswers] = useState<Record<number, string>>({});

  function handleSubmit() {
    const compiled = questions
      .map((q, i) => `**${q}**\n${answers[i]?.trim() || "—"}`)
      .join("\n\n");
    onSubmit(compiled);
  }

  const allAnswered = questions.every((_, i) => answers[i]?.trim());

  return (
    <div className="mt-2 ml-8 flex flex-col gap-2">
      {questions.map((q, i) => (
        <div key={i} className="bg-white border border-[#E5E5EA] rounded-xl p-3 flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-[#1A2138]">{q}</p>
          <input
            type="text"
            value={answers[i] ?? ""}
            onChange={e => setAnswers(prev => ({ ...prev, [i]: e.target.value }))}
            onKeyDown={e => { if (e.key === "Enter" && allAnswered) handleSubmit(); }}
            placeholder="Ta réponse..."
            disabled={disabled}
            className="text-sm border border-[#E5E5EA] rounded-lg px-3 py-2 focus:outline-none focus:border-[#D4537E] transition-colors disabled:opacity-50"
          />
        </div>
      ))}
      <button
        onClick={handleSubmit}
        disabled={!allAnswered || disabled}
        className="self-start mt-1 px-4 py-2 rounded-xl bg-[#1A2138] hover:bg-[#2A3252] disabled:opacity-40 text-white text-xs font-semibold transition-colors flex items-center gap-1.5"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z" /></svg>
        Envoyer mes réponses
      </button>
    </div>
  );
}

function MessageActions({ content, onRegenerate, isLast }: {
  content: string;
  onRegenerate?: () => void;
  isLast: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const { clean } = extractSuggestions(content);

  function copy() {
    navigator.clipboard.writeText(clean);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-1 mt-1.5 ml-8 opacity-0 group-hover:opacity-100 transition-opacity">
      <button onClick={copy} title="Copier"
        className="text-[10px] px-2 py-1 rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5EA] text-[#8A8579] transition-colors">
        {copied ? "✓ Copié" : "📋 Copier"}
      </button>
      {isLast && onRegenerate && (
        <button onClick={onRegenerate} title="Régénérer"
          className="text-[10px] px-2 py-1 rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5EA] text-[#8A8579] transition-colors">
          🔄 Régénérer
        </button>
      )}
      <button onClick={() => setFeedback("up")}
        className={`text-[10px] px-2 py-1 rounded-lg transition-colors ${feedback === "up" ? "bg-[#E5E5EA] text-[#1A2138]" : "bg-[#F5F5F7] hover:bg-[#E5E5EA] text-[#8A8579]"}`}>
        👍
      </button>
      <button onClick={() => setFeedback("down")}
        className={`text-[10px] px-2 py-1 rounded-lg transition-colors ${feedback === "down" ? "bg-[#E5E5EA] text-[#1A2138]" : "bg-[#F5F5F7] hover:bg-[#E5E5EA] text-[#8A8579]"}`}>
        👎
      </button>
    </div>
  );
}

const STORAGE_KEY = (id: string) => `linkeo_chat_${id}`;

const WELCOME_MSG = (titre: string): Message => ({
  role: "assistant",
  content: `Bonjour ! Je suis **Linkeo**, ton chef de projet IA.\n\nJe prends en charge **${titre}**. Je peux structurer ton MVP, générer une roadmap, identifier les risques ou prioriser ton backlog avec MoSCoW.\n\nPar où on commence ?`,
});

export default function AIPanel({ projectId, projectTitre, onClose, onRoadmapGenerated }: Props) {
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window === "undefined") return [WELCOME_MSG(projectTitre)];
    try {
      const saved = localStorage.getItem(STORAGE_KEY(projectId));
      if (saved) {
        const parsed = JSON.parse(saved) as Message[];
        if (parsed.length > 0) return parsed;
      }
    } catch { /* ignore */ }
    return [WELCOME_MSG(projectTitre)];
  });
  const [answeredIdx, setAnsweredIdx] = useState<Set<number>>(new Set());
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [roadmapLoading, setRoadmapLoading] = useState(false);
  const [ficheLoading, setFicheLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Persist conversation to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY(projectId), JSON.stringify(messages));
    } catch { /* ignore */ }
  }, [messages, projectId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 96) + "px";
  }, [input]);

  function clearHistory() {
    const fresh = [WELCOME_MSG(projectTitre)];
    setMessages(fresh);
    setAnsweredIdx(new Set());
    setError(null);
    try { localStorage.removeItem(STORAGE_KEY(projectId)); } catch { /* ignore */ }
  }

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || streaming) return;
    setError(null);

    if (content === "ROADMAP") { await generateRoadmap(); return; }
    if (content === "FICHE")   { await generateFiche();   return; }

    const userMsg: Message = { role: "user", content };
    const newMessages: Message[] = [...messages, userMsg];
    setMessages([...newMessages, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);

    try {
      const token = await getToken();
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ messages: newMessages, projectId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Erreur serveur");
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.token) {
              accumulated += parsed.token;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: accumulated };
                return updated;
              });
            }
          } catch (e) {
            if ((e as Error).message !== "Unexpected token") throw e;
          }
        }
      }
    } catch (e) {
      setError((e as Error).message);
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setStreaming(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, streaming, projectId]);

  function handleFormSubmit(msgIdx: number, answers: string) {
    setAnsweredIdx(prev => new Set(prev).add(msgIdx));
    sendMessage(answers);
  }

  function handleRegenerate() {
    const lastUser = [...messages].reverse().find(m => m.role === "user");
    if (lastUser) {
      setMessages(prev => prev.slice(0, -2));
      setTimeout(() => sendMessage(lastUser.content), 50);
    }
  }

  async function generateRoadmap() {
    setRoadmapLoading(true);
    setMessages(prev => [...prev, { role: "user", content: "Génère une roadmap de sprints pour mon projet." }]);
    try {
      const token = await getToken();
      const res = await fetch("/api/ai/roadmap", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur serveur");

      const sprints: RoadmapSprint[] = data.sprints ?? [];
      const preview = sprints.map((s, i) =>
        `**Sprint ${i + 1} — ${s.nom}**\n_${s.objectif}_\n${s.taches.map(t => `• ${t}`).join("\n")}`
      ).join("\n\n");

      setMessages(prev => [...prev, {
        role: "assistant",
        content: `Voici ta roadmap générée ✨\n\n${preview}\n\n${onRoadmapGenerated ? "✅ J'ai ajouté ces sprints à ton projet !" : ""}`,
      }]);
      onRoadmapGenerated?.(sprints);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRoadmapLoading(false);
    }
  }

  async function generateFiche() {
    setFicheLoading(true);
    setMessages(prev => [...prev, { role: "user", content: "Génère une fiche projet optimisée pour attirer les bons développeurs." }]);
    try {
      const token = await getToken();
      const res = await fetch("/api/ai/fiche", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ idee: projectTitre }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur serveur");

      const content = `Voici ta fiche projet optimisée ✨\n\n**Titre :** ${data.titre}\n\n**Description :** ${data.description}\n\n**Stack recommandée :** ${data.stack_souhaitee}\n\n**Fonctionnalités MVP :**\n${(data.fonctionnalites_mvp ?? []).map((f: string) => `• ${f}`).join("\n")}\n\n**Profil dev idéal :** ${data.profil_dev_ideal}`;
      setMessages(prev => [...prev, { role: "assistant", content }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFicheLoading(false);
    }
  }

  const isLoading = streaming || roadmapLoading || ficheLoading;

  return (
    <>
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        .animate-blink { animation: blink 1s step-end infinite; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .msg-fade { animation: fadeUp 200ms ease forwards; }
      `}</style>

      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4 bg-black/40">
        <div className="w-full sm:max-w-lg bg-white sm:rounded-2xl flex flex-col shadow-2xl" style={{ height: "85vh" }}>

          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E5E5EA] shrink-0">
            <div className="w-8 h-8 rounded-xl bg-[#1A2138] flex items-center justify-center text-white text-sm font-bold shrink-0">✦</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[#1A2138]">Linkeo · Chef de projet IA</p>
              <p className="text-xs text-[#8A8579] truncate">{projectTitre}</p>
            </div>
            <button onClick={clearHistory} title="Nouvelle conversation" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F5F5F7] text-[#8A8579] hover:text-[#1A2138] transition-colors text-sm">↺</button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F5F5F7] text-[#8A8579] hover:text-[#1A2138] transition-colors text-lg">✕</button>
          </div>

          {/* Quick actions */}
          <div className="px-4 py-2.5 border-b border-[#E5E5EA] flex gap-2 overflow-x-auto scrollbar-hide shrink-0">
            {QUICK_ACTIONS.map((a) => (
              <button key={a.label} onClick={() => sendMessage(a.prompt)} disabled={isLoading}
                className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border border-[#E5E5EA] bg-white text-[#8A8579] hover:border-[#1A2138] hover:text-[#1A2138] transition-all disabled:opacity-40">
                {a.label}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
            {messages.map((msg, i) => {
              const isAssistant = msg.role === "assistant";
              const isStreamingThis = streaming && i === messages.length - 1 && isAssistant;
              const questions = isAssistant ? extractQuestions(msg.content) : [];
              const { suggestions } = extractSuggestions(msg.content);
              const showForm = questions.length >= 2 && !answeredIdx.has(i) && i === messages.length - 1 && !isLoading;
              const showSuggestions = suggestions.length > 0 && !isStreamingThis && i === messages.length - 1 && !isLoading;
              const isLastAssistant = isAssistant && i === messages.length - 1;

              return (
                <div key={i} className="flex flex-col msg-fade group">
                  <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    {isAssistant && (
                      <div className="w-6 h-6 rounded-lg bg-[#1A2138] flex items-center justify-center text-white text-xs font-bold shrink-0 mr-2 mt-1">✦</div>
                    )}
                    <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-[#D4537E] text-white rounded-br-md"
                        : "bg-[#F5F5F7] text-[#1A2138] rounded-bl-md border border-[#E5E5EA]"
                    }`}>
                      {isAssistant ? (
                        <MdMessage content={msg.content} streaming={isStreamingThis} />
                      ) : (
                        <span className="whitespace-pre-wrap">{msg.content}</span>
                      )}
                    </div>
                  </div>

                  {/* Actions au hover */}
                  {isAssistant && msg.content && !isStreamingThis && (
                    <MessageActions
                      content={msg.content}
                      onRegenerate={handleRegenerate}
                      isLast={isLastAssistant}
                    />
                  )}

                  {/* Formulaire questions */}
                  {showForm && (
                    <QuestionForm
                      questions={questions}
                      onSubmit={(answers) => handleFormSubmit(i, answers)}
                      disabled={isLoading}
                    />
                  )}

                  {/* Suggestions cliquables */}
                  {showSuggestions && (
                    <div className="ml-8 mt-2 flex flex-wrap gap-2">
                      {suggestions.map((s, si) => (
                        <button key={si} onClick={() => sendMessage(s)} disabled={isLoading}
                          className="text-xs px-3 py-1.5 rounded-full border border-[#E5E5EA] text-[#1A2138] bg-white hover:bg-[#F5F5F7] hover:border-[#1A2138] transition-all disabled:opacity-40">
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {(roadmapLoading || ficheLoading) && (
              <div className="flex justify-start msg-fade">
                <div className="w-6 h-6 rounded-lg bg-[#1A2138] flex items-center justify-center text-white text-xs font-bold shrink-0 mr-2 mt-1">✦</div>
                <div className="bg-[#F5F5F7] border border-[#E5E5EA] px-4 py-3 rounded-2xl rounded-bl-md flex gap-1 items-center">
                  <span className="w-1.5 h-1.5 bg-[#8A8579] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 bg-[#8A8579] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 bg-[#8A8579] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}

            {error && (
              <div className="text-xs text-[#D4537E] bg-white border border-[#D4537E] rounded-xl px-3 py-2 text-center">
                ❌ {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-[#E5E5EA] shrink-0">
            <div className="flex gap-2 items-end">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                placeholder="Ou écris directement à Linkeo..."
                rows={1}
                disabled={isLoading}
                className="flex-1 resize-none border border-[#E5E5EA] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#D4537E] transition-colors disabled:opacity-50 overflow-hidden"
                style={{ minHeight: 40, maxHeight: 96 }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isLoading}
                className="w-10 h-10 rounded-xl bg-[#1A2138] hover:bg-[#2A3252] disabled:opacity-40 flex items-center justify-center text-white transition-colors shrink-0"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z" /></svg>
              </button>
            </div>
            <p className="text-[10px] text-[#8A8579]/60 text-center mt-2">Linkeo · Chef de projet IA · Propulsé par Claude</p>
          </div>
        </div>
      </div>
    </>
  );
}
