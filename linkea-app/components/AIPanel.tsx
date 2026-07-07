                                        "use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github.css";
import { supabase } from "@/lib/supabase";

type Message = { role: "user" | "assistant"; content: string };

export type HealthIndicator = { label: string; value: string; status: "good" | "warn" | "bad" };
export type HealthData = {
  score: number;
  label: string;
  color: string;
  indicators: HealthIndicator[];
  recommendations: string[];
};

export type RoadmapSprint = {
  nom: string;
  objectif: string;
  duree_jours: number;
  taches: string[];
};

type Props = {
  projectId: string;
  projectTitre: string;
  onClose: () => void;
  onRoadmapGenerated?: (sprints: RoadmapSprint[]) => void;
  activeSprint?: { id: string; nom: string; objectif?: string };
  healthData?: HealthData;
};

function buildQuickActions(activeSprint?: Props["activeSprint"]) {
  const base = [
    { label: "🎯 Scoper le MVP",   prompt: "SCOPE"   },
    { label: "🗓 Roadmap",          prompt: "ROADMAP" },
    { label: "✍️ Fiche projet",     prompt: "FICHE"   },
    { label: "⚙️ Stack technique",  prompt: "Quelle stack technique recommandes-tu pour ce projet et pourquoi ?" },
    { label: "⏱ Estimation",        prompt: "Combien de temps faut-il pour développer ce projet en partant de zéro ?" },
    { label: "⚠️ Risques",          prompt: "Quels sont les principaux risques de ce projet et comment les mitiger ?" },
  ];
  if (activeSprint) base.unshift({ label: "📋 Check-in sprint", prompt: "CHECK_IN" });
  return base;
}

function extractQuestions(content: string): string[] {
  const lines = content.split("\n");
  const questions: string[] = [];
  for (const line of lines) {
    const clean = line.replace(/^[-*•#>\d.\s]+/, "").trim();
    if (clean.endsWith("?") && clean.length > 10 && clean.length < 200) questions.push(clean);
  }
  return questions.slice(0, 6);
}

function extractSuggestions(content: string): { clean: string; suggestions: string[] } {
  const match = content.match(/\{"suggestions":\s*\[([^\]]*)\]\}/);
  if (!match) return { clean: content, suggestions: [] };
  try {
    const parsed = JSON.parse(match[0]);
    return { clean: content.replace(match[0], "").trim(), suggestions: parsed.suggestions ?? [] };
  } catch {
    return { clean: content, suggestions: [] };
  }
}

function CodeBlock({ children, className }: { children?: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  const code = String(children).replace(/\n$/, "");
  return (
    <div className="relative group my-2">
      <button onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
        style={{
          position: "absolute", top: 8, right: 8, fontSize: 11, fontWeight: 600,
          padding: "3px 8px", borderRadius: 7, background: "rgba(255,255,255,0.12)",
          color: "rgba(255,255,255,0.7)", border: "none", cursor: "pointer",
          opacity: 0, transition: "opacity 0.15s",
        }}
        className="group-hover:!opacity-100"
      >
        {copied ? "Copié ✓" : "Copier"}
      </button>
      <pre className={`${className ?? ""} rounded-xl !text-xs !p-4 overflow-x-auto`}><code>{children}</code></pre>
    </div>
  );
}

function MdMessage({ content, streaming }: { content: string; streaming?: boolean }) {
  const { clean } = extractSuggestions(content);
  return (
    <div style={{ fontSize: 14, lineHeight: 1.65, color: "var(--text)" }}
      className="prose prose-sm max-w-none
        prose-headings:font-bold prose-headings:tracking-tight prose-headings:mt-3 prose-headings:mb-1.5
        prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5
        prose-code:bg-black/[0.06] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-xs prose-code:font-mono
        prose-strong:font-semibold prose-strong:text-[var(--text)]
        prose-table:text-xs prose-hr:my-3 prose-hr:border-[var(--border)]">
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
      {streaming && (
        <span style={{
          display: "inline-block", width: 2, height: 14,
          background: "var(--rose)", marginLeft: 2, borderRadius: 1,
          verticalAlign: "text-bottom", animation: "lk-blink 1s step-end infinite",
        }} />
      )}
    </div>
  );
}

function QuestionForm({ questions, onSubmit, disabled }: {
  questions: string[];
  onSubmit: (answers: string) => void;
  disabled: boolean;
}) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const allAnswered = questions.every((_, i) => answers[i]?.trim());

  return (
    <div style={{ marginTop: 8, marginLeft: 36, display: "flex", flexDirection: "column", gap: 8 }}>
      {questions.map((q, i) => (
        <div key={i} style={{
          background: "#fff",
          border: "1px solid var(--border-2)",
          borderRadius: 14,
          padding: "10px 14px",
          boxShadow: "var(--shadow-xs)",
        }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", margin: "0 0 6px", lineHeight: 1.4 }}>{q}</p>
          <input
            type="text"
            value={answers[i] ?? ""}
            onChange={e => setAnswers(prev => ({ ...prev, [i]: e.target.value }))}
            onKeyDown={e => { if (e.key === "Enter" && allAnswered) onSubmit(questions.map((q2, j) => `**${q2}**\n${answers[j]?.trim() || "—"}`).join("\n\n")); }}
            placeholder="Ta réponse…"
            disabled={disabled}
            style={{
              width: "100%", padding: "8px 12px",
              border: "1px solid var(--border)",
              borderRadius: 10, fontSize: 13,
              color: "var(--text)", background: "var(--bg)",
              outline: "none", transition: "border-color 0.15s",
            }}
          />
        </div>
      ))}
      <button
        onClick={() => onSubmit(questions.map((q, i) => `**${q}**\n${answers[i]?.trim() || "—"}`).join("\n\n"))}
        disabled={!allAnswered || disabled}
        style={{
          alignSelf: "flex-start",
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "8px 16px", borderRadius: 10,
          background: "var(--text)", color: "#fff",
          border: "none", fontSize: 13, fontWeight: 600,
          cursor: allAnswered && !disabled ? "pointer" : "not-allowed",
          opacity: allAnswered && !disabled ? 1 : 0.38,
          transition: "opacity 0.15s",
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z" /></svg>
        Envoyer
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

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 4,
      marginTop: 4, marginLeft: 36,
      opacity: 0, transition: "opacity 0.15s",
    }} className="msg-actions">
      {[
        { label: copied ? "✓ Copié" : "Copier", action: () => { navigator.clipboard.writeText(clean); setCopied(true); setTimeout(() => setCopied(false), 2000); } },
        ...(isLast && onRegenerate ? [{ label: "Régénérer", action: onRegenerate }] : []),
      ].map((btn) => (
        <button key={btn.label} onClick={btn.action} style={{
          fontSize: 11, fontWeight: 500, padding: "3px 9px", borderRadius: 8,
          background: "#fff", border: "1px solid var(--border-2)",
          color: "var(--muted)", cursor: "pointer",
          transition: "all 0.14s", boxShadow: "var(--shadow-xs)",
        }}>
          {btn.label}
        </button>
      ))}
      {(["up", "down"] as const).map((v) => (
        <button key={v} onClick={() => setFeedback(v)} style={{
          fontSize: 11, padding: "3px 7px", borderRadius: 8,
          background: feedback === v ? "var(--rose-soft)" : "#fff",
          border: feedback === v ? "1px solid var(--rose-border)" : "1px solid var(--border-2)",
          cursor: "pointer", transition: "all 0.14s", boxShadow: "var(--shadow-xs)",
        }}>
          {v === "up" ? "👍" : "👎"}
        </button>
      ))}
    </div>
  );
}

function HealthBadge({ data }: { data: HealthData }) {
  const [expanded, setExpanded] = useState(false);

  const tagClass = data.score >= 80 ? "tag tag-green"
    : data.score >= 50 ? "tag tag-amber"
    : "tag tag-red";

  const indicatorColor = (s: HealthIndicator["status"]) =>
    s === "good" ? "var(--green)" : s === "warn" ? "var(--amber)" : "var(--red)";

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setExpanded(v => !v)} className={tagClass}
        style={{ cursor: "pointer", letterSpacing: 0, fontWeight: 700, fontSize: 11 }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: data.score >= 80 ? "var(--green)" : data.score >= 50 ? "var(--amber)" : "var(--red)",
          flexShrink: 0,
        }} />
        {data.score} · {data.label}
      </button>

      {expanded && (
        <div style={{
          position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 10,
          width: 256, background: "#fff",
          border: "1px solid var(--border)",
          borderRadius: 18,
          boxShadow: "var(--shadow-lg)",
          padding: 16,
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--subtle)", margin: 0 }}>
            Santé du projet
          </p>
          {data.indicators.map((ind, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--text-2)" }}>{ind.label}</span>
              <span style={{
                fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 100,
                background: ind.status === "good" ? "var(--green-soft)" : ind.status === "warn" ? "var(--amber-soft)" : "var(--red-soft)",
                color: indicatorColor(ind.status),
                border: `1px solid ${ind.status === "good" ? "var(--green-border)" : ind.status === "warn" ? "var(--amber-border)" : "var(--red-border)"}`,
              }}>
                {ind.value}
              </span>
            </div>
          ))}
          {data.recommendations.length > 0 && (
            <div style={{ paddingTop: 10, borderTop: "1px solid var(--border)", marginTop: 2 }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--subtle)", margin: "0 0 8px" }}>
                Recommandations
              </p>
              {data.recommendations.map((r, i) => (
                <p key={i} style={{ fontSize: 11, color: "var(--text-2)", lineHeight: 1.5, margin: "0 0 4px", display: "flex", gap: 6 }}>
                  <span style={{ color: "var(--rose)", flexShrink: 0 }}>→</span> {r}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CheckinBanner({ sprintNom, onDismiss, onStart }: {
  sprintNom: string;
  onDismiss: () => void;
  onStart: () => void;
}) {
  return (
    <div style={{
      margin: "0 12px 8px",
      padding: "12px 14px",
      borderRadius: 16,
      background: "var(--rose-soft)",
      border: "1px solid var(--rose-border)",
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 10, flexShrink: 0,
        background: "var(--rose)", display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 15,
      }}>
        📋
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: "var(--rose-hover)", margin: "0 0 2px" }}>Check-in suggéré</p>
        <p style={{ fontSize: 11, color: "var(--rose-hover)", opacity: 0.8, margin: 0, lineHeight: 1.4 }}>
          Sprint <strong>{sprintNom}</strong> en cours
        </p>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button onClick={onStart} style={{
          fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 9,
          background: "var(--rose)", color: "#fff", border: "none", cursor: "pointer",
          boxShadow: "var(--shadow-rose)", transition: "all 0.15s",
        }}>
          Lancer
        </button>
        <button onClick={onDismiss} style={{
          fontSize: 11, fontWeight: 600, padding: "6px 10px", borderRadius: 9,
          background: "rgba(244,63,94,0.12)", color: "var(--rose-hover)", border: "none", cursor: "pointer",
          transition: "all 0.15s",
        }}>
          Ignorer
        </button>
      </div>
    </div>
  );
}

const STORAGE_KEY = (id: string) => `linkeo_chat_${id}`;
const CHECKIN_KEY = (id: string) => `lk_checkin_${id}`;

const WELCOME_MSG = (titre: string): Message => ({
  role: "assistant",
  content: `Bonjour ! Je suis **Linkeo**, ton chef de projet IA.\n\nJe prends en charge **${titre}**. Je peux cadrer ton MVP, générer une roadmap, identifier les risques ou faire un check-in sprint.\n\nPar où on commence ?`,
});

// ── Composant principal ──────────────────────────────────────────────────────

export default function AIPanel({ projectId, projectTitre, onClose, onRoadmapGenerated, activeSprint, healthData }: Props) {
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
  const [answeredIdx, setAnsweredIdx]     = useState<Set<number>>(new Set());
  const [input, setInput]                 = useState("");
  const [streaming, setStreaming]         = useState(false);
  const [roadmapLoading, setRoadmapLoading] = useState(false);
  const [ficheLoading, setFicheLoading]   = useState(false);
  const [showCheckinBanner, setShowCheckinBanner] = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const checkinRef  = useRef(false);

  const QUICK_ACTIONS = buildQuickActions(activeSprint);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem(STORAGE_KEY(projectId), JSON.stringify(messages)); } catch { /* ignore */ }
  }, [messages, projectId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streaming]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 96) + "px";
  }, [input]);

  useEffect(() => {
    if (checkinRef.current || !activeSprint || messages.length > 1) return;
    const lastCheckin = localStorage.getItem(CHECKIN_KEY(projectId));
    if (lastCheckin && (Date.now() - new Date(lastCheckin).getTime()) / 86_400_000 < 7) return;
    checkinRef.current = true;
    setShowCheckinBanner(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearHistory() {
    setMessages([WELCOME_MSG(projectTitre)]);
    setAnsweredIdx(new Set());
    setError(null);
    setShowCheckinBanner(false);
    checkinRef.current = false;
    try { localStorage.removeItem(STORAGE_KEY(projectId)); } catch { /* ignore */ }
  }

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || streaming) return;
    setError(null);
    setShowCheckinBanner(false);
    if (content === "ROADMAP") { await generateRoadmap(); return; }
    if (content === "FICHE")   { await generateFiche();   return; }
    if (content === "SCOPE")   { await generateScope();   return; }
    if (content === "CHECK_IN") {
      if (activeSprint) {
        localStorage.setItem(CHECKIN_KEY(projectId), new Date().toISOString());
        await doSend(`📋 Check-in — ${activeSprint.nom}${activeSprint.objectif ? `\nObjectif : ${activeSprint.objectif}` : ""}\n\nFais un point complet sur ce sprint : avancement des tâches, risques identifiés, et ta recommandation pour la suite.`);
      }
      return;
    }
    await doSend(content);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, streaming, projectId, activeSprint]);

  async function doSend(content: string) {
    const userMsg: Message = { role: "user", content };
    const newMessages: Message[] = [...messages, userMsg];
    setMessages([...newMessages, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);

    const healthCtx = healthData
      ? `\n\n[SANTÉ PROJET: score=${healthData.score}/100 (${healthData.label}). ${healthData.indicators.map(i => `${i.label}=${i.value}`).join(", ")}. ${healthData.recommendations.length ? `Actions suggérées: ${healthData.recommendations.join("; ")}` : ""}]`
      : "";

    const withCtx = newMessages.map((m, i) =>
      i === 0 && m.role === "user" && healthCtx ? { ...m, content: m.content + healthCtx } : m
    );

    try {
      const token = await getToken();
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: withCtx, projectId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Erreur serveur");

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") break;
          try {
            const p = JSON.parse(raw);
            if (p.error) throw new Error(p.error);
            if (p.token) {
              acc += p.token;
              setMessages(prev => { const u = [...prev]; u[u.length - 1] = { role: "assistant", content: acc }; return u; });
            }
          } catch (e) { if ((e as Error).message !== "Unexpected token") throw e; }
        }
      }
    } catch (e) {
      setError((e as Error).message);
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setStreaming(false);
    }
  }

  function handleFormSubmit(msgIdx: number, answers: string) {
    setAnsweredIdx(prev => new Set(prev).add(msgIdx));
    sendMessage(answers);
  }

  function handleRegenerate() {
    const last = [...messages].reverse().find(m => m.role === "user");
    if (last) { setMessages(prev => prev.slice(0, -2)); setTimeout(() => sendMessage(last.content), 50); }
  }

  async function generateRoadmap() {
    setRoadmapLoading(true);
    setMessages(prev => [...prev, { role: "user", content: "Génère une roadmap de sprints pour mon projet." }]);
    try {
      const token = await getToken();
      const res  = await fetch("/api/ai/roadmap", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ projectId }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur serveur");
      const sprints: RoadmapSprint[] = data.sprints ?? [];
      const preview = sprints.map((s, i) => `**Sprint ${i + 1} — ${s.nom}**\n_${s.objectif}_\n${s.taches.map(t => `• ${t}`).join("\n")}`).join("\n\n");
      setMessages(prev => [...prev, { role: "assistant", content: `Voici ta roadmap ✨\n\n${preview}\n\n${onRoadmapGenerated ? "✅ Sprints ajoutés à ton projet !" : ""}` }]);
      onRoadmapGenerated?.(sprints);
    } catch (e) { setError((e as Error).message); }
    finally { setRoadmapLoading(false); }
  }

  async function generateFiche() {
    setFicheLoading(true);
    setMessages(prev => [...prev, { role: "user", content: "Génère une fiche projet optimisée pour attirer les bons développeurs." }]);
    try {
      const token = await getToken();
      const res  = await fetch("/api/ai/fiche", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ idee: projectTitre }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur serveur");
      setMessages(prev => [...prev, { role: "assistant", content: `Fiche optimisée ✨\n\n**Titre :** ${data.titre}\n\n**Description :** ${data.description}\n\n**Stack :** ${data.stack_souhaitee}\n\n**MVP :**\n${(data.fonctionnalites_mvp ?? []).map((f: string) => `• ${f}`).join("\n")}\n\n**Profil dev :** ${data.profil_dev_ideal}` }]);
    } catch (e) { setError((e as Error).message); }
    finally { setFicheLoading(false); }
  }

  async function generateScope() {
    setMessages(prev => [...prev, { role: "user", content: "Je veux cadrer le MVP de mon projet." }]);
    setStreaming(true);
    setInput("");
    const scopePrompt = `L'utilisateur veut cadrer le MVP de son projet. Pose-lui exactement 5 questions clés pour construire le cahier des charges MVP, dans cet ordre :\n1. Quel est le problème principal que tu résous et pour qui ?\n2. Quelle est la fonctionnalité numéro 1 sans laquelle le produit n'a pas de valeur ?\n3. Qui sont tes concurrents directs et quelle est ta différenciation ?\n4. Quelle est ta cible d'utilisateurs pour le lancement (volume, profil) ?\n5. Quelle est ta contrainte principale : délai, budget, ou ressources techniques ?\nFormule chaque question de façon concise sur une ligne distincte, se terminant par un point d'interrogation. Pas d'explication, juste les 5 questions numérotées.`;
    try {
      const token = await getToken();
      const res = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ messages: [{ role: "user", content: scopePrompt }], projectId }) });
      if (!res.ok) throw new Error("Erreur serveur");
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      setMessages(prev => [...prev, { role: "assistant", content: "" }]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") break;
          try { const p = JSON.parse(raw); if (p.token) { acc += p.token; setMessages(prev => { const u = [...prev]; u[u.length - 1] = { role: "assistant", content: acc }; return u; }); } } catch { /* ignore */ }
        }
      }
    } catch (e) { setError((e as Error).message); setMessages(prev => prev.slice(0, -1)); }
    finally { setStreaming(false); }
  }

  const isLoading = streaming || roadmapLoading || ficheLoading;

  return (
    <>
      <style>{`
        @keyframes lk-blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes lk-bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-5px)} }
        @keyframes lk-fade-up { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .msg-fade { animation: lk-fade-up 0.2s ease forwards; }
        .ai-msg:hover .msg-actions { opacity: 1 !important; }
      `}</style>

      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 50,
          background: "rgba(17,17,24,0.45)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      />

      {/* Panel */}
      <div style={{
        position: "fixed", zIndex: 51,
        bottom: 0, left: 0, right: 0,
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        padding: "0 0 env(safe-area-inset-bottom,0px)",
        pointerEvents: "none",
      }}>
        <div
          onClick={e => e.stopPropagation()}
          style={{
            width: "100%", maxWidth: 520,
            height: "88vh",
            background: "#ffffff",
            borderRadius: "28px 28px 0 0",
            boxShadow: "0 -8px 40px rgba(17,17,24,0.12), 0 -2px 12px rgba(17,17,24,0.06)",
            display: "flex", flexDirection: "column",
            overflow: "hidden",
            pointerEvents: "all",
            border: "1px solid var(--border)",
            borderBottom: "none",
          }}
        >
          {/* ── Header ── */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "16px 16px 14px",
            borderBottom: "1px solid var(--border)",
            background: "rgba(255,255,255,0.92)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            flexShrink: 0,
          }}>
            {/* AI avatar */}
            <div style={{
              width: 36, height: 36, borderRadius: 12, flexShrink: 0,
              background: "linear-gradient(135deg, #8b5cf6 0%, #f43f5e 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: 16, fontWeight: 800,
              boxShadow: "0 2px 10px rgba(139,92,246,0.35)",
            }}>
              ✦
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: 0, letterSpacing: "-0.02em" }}>
                Linkeo{" "}
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  background: "linear-gradient(135deg, var(--violet), var(--rose))",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  letterSpacing: 0,
                }}>
                  · IA
                </span>
              </p>
              <p style={{ fontSize: 11, color: "var(--muted)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>
                {projectTitre}
              </p>
            </div>

            {/* Health badge */}
            {healthData && <HealthBadge data={healthData} />}

            {/* Reset */}
            <button onClick={clearHistory} title="Nouvelle conversation"
              style={{
                width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 9, background: "transparent", border: "1px solid var(--border)",
                color: "var(--muted)", cursor: "pointer", fontSize: 16, flexShrink: 0,
                transition: "all 0.14s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "var(--muted)"; }}
            >
              ↺
            </button>

            {/* Close */}
            <button onClick={onClose}
              style={{
                width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 9, background: "transparent", border: "1px solid var(--border)",
                color: "var(--muted)", cursor: "pointer", fontSize: 18, flexShrink: 0,
                transition: "all 0.14s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--red-soft)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--red)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--red-border)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "var(--muted)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; }}
            >
              ✕
            </button>
          </div>

          {/* ── Quick actions ── */}
          <div style={{
            padding: "10px 14px",
            borderBottom: "1px solid var(--border)",
            display: "flex", gap: 6,
            overflowX: "auto", flexShrink: 0,
            msOverflowStyle: "none", scrollbarWidth: "none",
          }}>
            {QUICK_ACTIONS.map((a) => (
              <button key={a.label} onClick={() => sendMessage(a.prompt)} disabled={isLoading}
                style={{
                  flexShrink: 0, fontSize: 12, fontWeight: 600,
                  padding: "6px 13px", borderRadius: 100,
                  border: "1px solid var(--border-2)",
                  background: "#fff",
                  color: "var(--text-2)",
                  cursor: isLoading ? "not-allowed" : "pointer",
                  opacity: isLoading ? 0.38 : 1,
                  transition: "all 0.14s",
                  boxShadow: "var(--shadow-xs)",
                  whiteSpace: "nowrap",
                  letterSpacing: "-0.01em",
                }}
                onMouseEnter={e => { if (!isLoading) { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--rose-border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--rose-hover)"; (e.currentTarget as HTMLButtonElement).style.background = "var(--rose-soft)"; } }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-2)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-2)"; (e.currentTarget as HTMLButtonElement).style.background = "#fff"; }}
              >
                {a.label}
              </button>
            ))}
          </div>

          {/* ── Check-in banner ── */}
          {showCheckinBanner && activeSprint && (
            <div style={{ padding: "8px 12px 0", flexShrink: 0 }}>
              <CheckinBanner
                sprintNom={activeSprint.nom}
                onDismiss={() => { setShowCheckinBanner(false); localStorage.setItem(CHECKIN_KEY(projectId), new Date().toISOString()); }}
                onStart={() => { setShowCheckinBanner(false); sendMessage("CHECK_IN"); }}
              />
            </div>
          )}

          {/* ── Messages ── */}
          <div style={{
            flex: 1, overflowY: "auto",
            padding: "16px 14px",
            display: "flex", flexDirection: "column", gap: 16,
            msOverflowStyle: "none", scrollbarWidth: "none",
          }}>
            {messages.map((msg, i) => {
              const isAI = msg.role === "assistant";
              const isStreamingThis = streaming && i === messages.length - 1 && isAI;
              const questions = isAI ? extractQuestions(msg.content) : [];
              const { suggestions } = extractSuggestions(msg.content);
              const showForm = questions.length >= 2 && !answeredIdx.has(i) && i === messages.length - 1 && !isLoading;
              const showSugg = suggestions.length > 0 && !isStreamingThis && i === messages.length - 1 && !isLoading;

              return (
                <div key={i} className={`flex flex-col msg-fade${isAI ? " ai-msg" : ""}`}>
                  <div style={{ display: "flex", justifyContent: isAI ? "flex-start" : "flex-end" }}>

                    {/* AI avatar */}
                    {isAI && (
                      <div style={{
                        width: 28, height: 28, borderRadius: 9, flexShrink: 0, marginRight: 8, marginTop: 2,
                        background: "linear-gradient(135deg, #8b5cf6 0%, #f43f5e 100%)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#fff", fontSize: 12, fontWeight: 800,
                        boxShadow: "0 1px 6px rgba(139,92,246,0.25)",
                      }}>
                        ✦
                      </div>
                    )}

                    {/* Bubble */}
                    <div style={{
                      maxWidth: "82%",
                      padding: isAI ? "12px 14px" : "10px 14px",
                      borderRadius: isAI ? "18px 18px 18px 4px" : "18px 18px 4px 18px",
                      ...(isAI
                        ? {
                            background: "#ffffff",
                            border: "1px solid var(--border)",
                            boxShadow: "var(--shadow-sm)",
                          }
                        : {
                            background: "linear-gradient(145deg, #f43f5e 0%, #e8304f 60%, #d4264b 100%)",
                            color: "#fff",
                            boxShadow: "var(--shadow-rose)",
                          }
                      ),
                    }}>
                      {isAI
                        ? <MdMessage content={msg.content} streaming={isStreamingThis} />
                        : <span style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{msg.content}</span>
                      }
                    </div>
                  </div>

                  {/* Actions hover */}
                  {isAI && msg.content && !isStreamingThis && (
                    <MessageActions content={msg.content} onRegenerate={handleRegenerate} isLast={i === messages.length - 1} />
                  )}

                  {/* Question form */}
                  {showForm && (
                    <QuestionForm
                      questions={questions}
                      onSubmit={(answers) => handleFormSubmit(i, answers)}
                      disabled={isLoading}
                    />
                  )}

                  {/* Suggestions */}
                  {showSugg && (
                    <div style={{ marginTop: 8, marginLeft: 36, display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {suggestions.map((s, si) => (
                        <button key={si} onClick={() => sendMessage(s)} disabled={isLoading}
                          style={{
                            fontSize: 12, fontWeight: 500, padding: "5px 12px", borderRadius: 100,
                            border: "1px solid var(--border-2)", background: "#fff",
                            color: "var(--text-2)", cursor: "pointer",
                            boxShadow: "var(--shadow-xs)", transition: "all 0.14s",
                            letterSpacing: "-0.01em",
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--rose-border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--rose-hover)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-2)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-2)"; }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Typing dots */}
            {(roadmapLoading || ficheLoading) && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }} className="msg-fade">
                <div style={{
                  width: 28, height: 28, borderRadius: 9, flexShrink: 0,
                  background: "linear-gradient(135deg, #8b5cf6 0%, #f43f5e 100%)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: 12, fontWeight: 800,
                }}>
                  ✦
                </div>
                <div style={{
                  padding: "12px 16px", borderRadius: "18px 18px 18px 4px",
                  background: "#fff", border: "1px solid var(--border)",
                  boxShadow: "var(--shadow-sm)",
                  display: "flex", gap: 5, alignItems: "center",
                }}>
                  {[0, 150, 300].map((d) => (
                    <span key={d} style={{
                      width: 6, height: 6, borderRadius: "50%",
                      background: "var(--muted)",
                      animation: `lk-bounce 1.2s ease-in-out ${d}ms infinite`,
                      display: "inline-block",
                    }} />
                  ))}
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{
                fontSize: 12, color: "var(--red)", background: "var(--red-soft)",
                border: "1px solid var(--red-border)", borderRadius: 12,
                padding: "10px 14px", textAlign: "center",
              }}>
                ⚠️ {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* ── Input ── */}
          <div style={{
            padding: "12px 14px 14px",
            borderTop: "1px solid var(--border)",
            background: "#fff",
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                placeholder="Écris à Linkeo…"
                rows={1}
                disabled={isLoading}
                style={{
                  flex: 1, resize: "none",
                  padding: "11px 14px",
                  border: "1px solid var(--border-2)",
                  borderRadius: 14, fontSize: 14,
                  color: "var(--text)", background: "var(--bg)",
                  outline: "none",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                  minHeight: 42, maxHeight: 96,
                  overflow: "hidden",
                  lineHeight: 1.5,
                  fontFamily: "inherit",
                  boxShadow: "var(--shadow-xs)",
                  letterSpacing: "-0.01em",
                  opacity: isLoading ? 0.5 : 1,
                }}
                onFocus={e => { e.currentTarget.style.borderColor = "var(--rose)"; e.currentTarget.style.boxShadow = "0 0 0 3px var(--rose-soft), var(--shadow-xs)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "var(--border-2)"; e.currentTarget.style.boxShadow = "var(--shadow-xs)"; }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isLoading}
                style={{
                  width: 42, height: 42, borderRadius: 13, flexShrink: 0,
                  background: !input.trim() || isLoading
                    ? "var(--bg)"
                    : "linear-gradient(145deg, #f43f5e 0%, #e8304f 60%, #d4264b 100%)",
                  border: !input.trim() || isLoading ? "1px solid var(--border-2)" : "none",
                  color: !input.trim() || isLoading ? "var(--subtle)" : "#fff",
                  cursor: !input.trim() || isLoading ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.16s cubic-bezier(0.34,1.26,0.64,1)",
                  boxShadow: !input.trim() || isLoading ? "none" : "var(--shadow-rose)",
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z" /></svg>
              </button>
            </div>
            <p style={{
              fontSize: 10, color: "var(--subtle)", textAlign: "center",
              marginTop: 8, letterSpacing: "0.02em",
            }}>
              Linkeo · Chef de projet IA · Propulsé par Claude
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
