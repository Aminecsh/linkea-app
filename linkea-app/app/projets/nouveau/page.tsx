"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import React from "react";
import { ArrowLeft, ArrowRight, AlertCircle, Plus, X, Check, Sparkles, PenLine, Send } from "lucide-react";

type ChatMessage = { role: "user" | "assistant"; content: string };

const READY_MARKER = /\{"ready_for_fiche"\s*:\s*true\}/;

function stripMarkdown(text: string): string {
  return text.replace(/\*\*/g, "").replace(/^#+\s*/gm, "").replace(/^[-*]\s+/gm, "");
}

const STACKS = ["React", "Node.js", "Flutter", "Python", "Vue.js", "Laravel", "Swift", "Kotlin", "Next.js", "TypeScript"];

const DESC_MAX = 500;

function formatDateFR(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  const months = ["jan.", "fév.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

export default function NouveauProjet() {
  const router = useRouter();
  const customInputRef = useRef<HTMLInputElement>(null);

  const [founderId, setFounderId]       = useState<string | null>(null);
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState("");
  const [step, setStep]                 = useState<0 | 1 | 2>(0);

  // Step 0 · Linkeo intake (chat guidé)
  const [linkeoActive, setLinkeoActive] = useState(false);
  const [messages, setMessages]         = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput]       = useState("");
  const [streaming, setStreaming]       = useState(false);
  const [readyForFiche, setReadyForFiche] = useState(false);
  const [ficheLoading, setFicheLoading] = useState(false);
  const [linkeoError, setLinkeoError]   = useState("");
  const messagesEndRef                  = useRef<HTMLDivElement>(null);

  // Step 1
  const [titre, setTitre]               = useState("");
  const [description, setDescription]   = useState("");

  // Step 2
  const [selectedStacks, setSelectedStacks] = useState<string[]>([]);
  const [customStack, setCustomStack]   = useState("");
  const [showCustom, setShowCustom]     = useState(false);
  const [dateDebut, setDateDebut]       = useState("");
  const [dateFin, setDateFin]           = useState("");
  const [budget, setBudget]             = useState("");

  useEffect(() => {
    async function checkAccess() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }

      const { data: roleData } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).single();
      if (roleData?.role !== "founder") { router.push("/"); return; }

      const { data: profile } = await supabase
        .from("profiles_founder").select("id").eq("user_id", user.id).single();
      if (!profile) { router.push("/onboarding"); return; }

      setFounderId(profile.id);
      setLoading(false);
    }
    checkAccess();
  }, [router]);

  function toggleStack(s: string) {
    setSelectedStacks((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }

  function addCustomStack() {
    const val = customStack.trim();
    if (!val || selectedStacks.includes(val)) return;
    setSelectedStacks((prev) => [...prev, val]);
    setCustomStack("");
    setShowCustom(false);
  }

  function removeStack(s: string) {
    setSelectedStacks((prev) => prev.filter((x) => x !== s));
  }

  function handleStep1Next() {
    if (!titre.trim()) return;
    if (!description.trim()) return;
    setStep(2);
  }

  async function sendToLinkeo(text: string) {
    if (!text.trim() || streaming) return;
    const nextMessages = [...messages, { role: "user" as const, content: text.trim() }];
    setMessages(nextMessages);
    setChatInput("");
    setStreaming(true);
    setLinkeoError("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ messages: nextMessages }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Erreur serveur");
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      if (reader) {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";
          for (const chunk of chunks) {
            if (!chunk.startsWith("data: ")) continue;
            const payload = chunk.slice(6);
            if (payload === "[DONE]") continue;
            const parsed = JSON.parse(payload);
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.token) {
              acc += parsed.token;
              const snapshot = acc;
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: snapshot };
                return copy;
              });
            }
          }
        }
      }

      if (READY_MARKER.test(acc)) {
        const cleaned = acc.replace(READY_MARKER, "").trim();
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: cleaned };
          return copy;
        });
        setReadyForFiche(true);
      }
    } catch (e) {
      setLinkeoError((e as Error).message);
    } finally {
      setStreaming(false);
    }
  }

  function startLinkeoChat() {
    setLinkeoActive(true);
    sendToLinkeo("Bonjour, je veux déposer un projet mais je ne sais pas trop comment m'y prendre, aide-moi.");
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleGenerateFiche() {
    setFicheLoading(true);
    setLinkeoError("");

    const transcript = messages
      .filter((m) => m.content.trim())
      .map((m) => `${m.role === "user" ? "Porteur de projet" : "Linkeo"} : ${m.content.trim()}`)
      .join("\n\n")
      .slice(0, 4000);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/ai/fiche", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ idee: transcript }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur serveur");

      setTitre(stripMarkdown(data.titre ?? "").slice(0, 80));

      const mvpLines = Array.isArray(data.fonctionnalites_mvp) && data.fonctionnalites_mvp.length
        ? `\n\nFonctionnalités clés :\n${data.fonctionnalites_mvp.map((f: string) => `- ${stripMarkdown(f)}`).join("\n")}`
        : "";
      const profil = data.profil_dev_ideal ? `\n\nProfil dev recherché : ${stripMarkdown(data.profil_dev_ideal)}` : "";
      setDescription(`${stripMarkdown(data.description ?? "")}${mvpLines}${profil}`.slice(0, DESC_MAX));

      const stackRaw = String(data.stack_souhaitee ?? "").trim();
      if (stackRaw && !/au choix|pas de préférence|non précisé/i.test(stackRaw)) {
        const stacks = stackRaw.split(",").map((s: string) => s.trim()).filter(Boolean);
        setSelectedStacks(stacks);
      }

      setDateDebut(todayISO());

      const semaines = Number(data.delai_semaines);
      if (Number.isFinite(semaines) && semaines > 0) {
        const fin = new Date();
        fin.setDate(fin.getDate() + semaines * 7);
        setDateFin(fin.toISOString().split("T")[0]);
      }

      const budgetEstime = Number(data.budget_estime_eur);
      if (Number.isFinite(budgetEstime) && budgetEstime > 0) {
        setBudget(String(Math.round(budgetEstime)));
      }

      setLinkeoActive(false);
      setStep(1);
    } catch (e) {
      setLinkeoError((e as Error).message);
    } finally {
      setFicheLoading(false);
    }
  }

  async function handleSubmit() {
    if (!founderId || !dateFin) return;
    setSaving(true);
    setError("");

    const deadlineStr = dateDebut
      ? `Du ${formatDateFR(dateDebut)} au ${formatDateFR(dateFin)}`
      : `Avant le ${formatDateFR(dateFin)}`;

    const { error: dbError } = await supabase.from("projects").insert({
      founder_id: founderId,
      titre: titre.trim(),
      description: description.trim(),
      stack_souhaitee: selectedStacks.join(", "),
      deadline: deadlineStr,
      statut: "pending",
      budget: budget ? Number(budget) : null,
    });

    if (dbError) {
      setError(dbError.message);
      setSaving(false);
      return;
    }

    router.push("/profil");
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FAF8F4" }}>
        <div style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid #1A2138", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const sInput: React.CSSProperties = { width: "100%", padding: "11px 14px", borderRadius: 10, border: "1px solid #ECE7DD", background: "#fff", color: "#1A2138", fontSize: 13, fontWeight: 500, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
  const sNavy:  React.CSSProperties = { width: "100%", padding: "13px 0", borderRadius: 12, background: "#1A2138", color: "#fff", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 };
  const sLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: "#8A8579", display: "block", marginBottom: 10 };

  return (
    <div style={{ minHeight: "100vh", background: "#FAF8F4", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .lk-n-input:focus { outline: 2px solid #D4537E; outline-offset: -1px; border-color: #D4537E !important; }
        .lk-n-navy:hover:not(:disabled) { background: #2A3252 !important; }
        .lk-n-navy:disabled { opacity: 0.4; }
        .lk-n-chip:focus-visible { outline: 2px solid #D4537E; outline-offset: 2px; }
        .lk-n-deadline:focus-visible { outline: 2px solid #D4537E; outline-offset: 2px; border-radius: 14px; }
      `}</style>

      <div style={{ width: "100%", maxWidth: 440 }}>

        {/* Top nav */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <button
            onClick={() => {
              if (step === 0 && linkeoActive) { setLinkeoActive(false); setMessages([]); setReadyForFiche(false); return; }
              if (step === 0) { router.push("/profil"); return; }
              if (step === 1) { setStep(0); return; }
              setStep(1);
            }}
            style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#8A8579", padding: 0 }}
          >
            <ArrowLeft size={14} strokeWidth={2} />
            {step === 0 ? "Retour" : "Étape précédente"}
          </button>

          {/* Progress dots */}
          {step > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {[1, 2].map((n) => (
                <div key={n} style={{ height: 4, borderRadius: 99, width: step >= n ? 24 : 10, background: step >= n ? "#D4537E" : "#ECE7DD", transition: "width 0.2s, background 0.2s" }} />
              ))}
              <span style={{ fontSize: 11, fontWeight: 700, color: "#8A8579", marginLeft: 4 }}>{step}/2</span>
            </div>
          )}
        </div>

        {/* Card */}
        <div style={{ background: "#fff", border: "1px solid #ECE7DD", borderRadius: 20, padding: "32px 28px" }}>

          {/* ── STEP 0 · CHOIX ── */}
          {step === 0 && !linkeoActive && (
            <>
              <div style={{ marginBottom: 28 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: "#8A8579", display: "block", marginBottom: 12 }}>Nouveau projet</span>
                <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 26, fontWeight: 600, color: "#1A2138", margin: "0 0 6px", letterSpacing: "-0.03em", lineHeight: 1.15 }}>
                  Comment veux-tu procéder ?
                </h1>
                <p style={{ fontSize: 13, color: "#8A8579", margin: 0, lineHeight: 1.6 }}>Tu peux te faire aider pour bien cibler ton besoin, ou remplir directement le formulaire.</p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <button
                  onClick={startLinkeoChat}
                  className="lk-n-chip"
                  style={{ display: "flex", alignItems: "flex-start", gap: 12, textAlign: "left", padding: "18px 16px", borderRadius: 14, border: "1.5px solid #1A2138", background: "#1A2138", cursor: "pointer" }}
                >
                  <Sparkles size={18} strokeWidth={2} style={{ color: "#D4537E", flexShrink: 0, marginTop: 1 }} />
                  <span>
                    <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 3 }}>Déposer mon projet avec Linkeo</span>
                    <span style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>Réponds à quelques questions, Linkeo rédige ta fiche projet pour toi.</span>
                  </span>
                </button>

                <button
                  onClick={() => setStep(1)}
                  className="lk-n-chip"
                  style={{ display: "flex", alignItems: "flex-start", gap: 12, textAlign: "left", padding: "18px 16px", borderRadius: 14, border: "1px solid #ECE7DD", background: "#fff", cursor: "pointer" }}
                >
                  <PenLine size={18} strokeWidth={2} style={{ color: "#8A8579", flexShrink: 0, marginTop: 1 }} />
                  <span>
                    <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "#1A2138", marginBottom: 3 }}>Remplir moi-même</span>
                    <span style={{ display: "block", fontSize: 12, color: "#8A8579", lineHeight: 1.5 }}>Tu connais déjà précisément ton besoin.</span>
                  </span>
                </button>
              </div>
            </>
          )}

          {/* ── STEP 0 · CHAT LINKEO ── */}
          {step === 0 && linkeoActive && (
            <>
              <div style={{ marginBottom: 18 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: "#D4537E", marginBottom: 12 }}>
                  <Sparkles size={12} strokeWidth={2.5} /> Avec Linkeo
                </span>
                <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 24, fontWeight: 600, color: "#1A2138", margin: "0 0 6px", letterSpacing: "-0.03em", lineHeight: 1.15 }}>
                  Parle-moi de ton projet
                </h1>
                <p style={{ fontSize: 13, color: "#8A8579", margin: 0, lineHeight: 1.6 }}>Réponds simplement, avec tes mots — aucune connaissance technique requise.</p>
              </div>

              {/* Fil de discussion */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: 340, overflowY: "auto", padding: "4px 2px", marginBottom: 14 }}>
                {messages.map((m, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                    <div style={{
                      maxWidth: "85%", padding: "10px 14px", borderRadius: 14,
                      borderBottomRightRadius: m.role === "user" ? 4 : 14,
                      borderBottomLeftRadius: m.role === "assistant" ? 4 : 14,
                      background: m.role === "user" ? "#1A2138" : "#FAF8F4",
                      color: m.role === "user" ? "#fff" : "#1A2138",
                      fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap",
                    }}>
                      {stripMarkdown(m.content) || (streaming && i === messages.length - 1 ? "…" : "")}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {linkeoError && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(212,83,126,0.3)", background: "rgba(212,83,126,0.05)", color: "#D4537E", fontSize: 13, marginBottom: 14 }}>
                  <AlertCircle size={14} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
                  {linkeoError}
                </div>
              )}

              {/* Zone de saisie */}
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendToLinkeo(chatInput); } }}
                  placeholder="Écris ta réponse ici..."
                  disabled={streaming}
                  className="lk-n-input"
                  style={{ ...sInput, flex: 1 }}
                />
                <button
                  onClick={() => sendToLinkeo(chatInput)}
                  disabled={streaming || !chatInput.trim()}
                  className="lk-n-navy"
                  style={{ ...sNavy, width: "auto", padding: "0 16px", borderRadius: 10, flexShrink: 0 }}
                >
                  <Send size={15} strokeWidth={2} />
                </button>
              </div>

              {(readyForFiche || messages.filter((m) => m.role === "user").length >= 3) && (
                <button onClick={handleGenerateFiche} disabled={ficheLoading || streaming} className="lk-n-navy" style={sNavy}>
                  {ficheLoading
                    ? <div style={{ width: 17, height: 17, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "spin 0.8s linear infinite" }} />
                    : <>Générer ma fiche projet <Sparkles size={15} strokeWidth={2} /></>
                  }
                </button>
              )}
            </>
          )}

          {/* ── STEP 1 ── */}
          {step === 1 && (
            <>
              <div style={{ marginBottom: 28 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: "#8A8579", display: "block", marginBottom: 12 }}>Étape 1 · Le projet</span>
                <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 26, fontWeight: 600, color: "#1A2138", margin: "0 0 6px", letterSpacing: "-0.03em", lineHeight: 1.15 }}>
                  Décris ton projet
                </h1>
                <p style={{ fontSize: 13, color: "#8A8579", margin: 0, lineHeight: 1.6 }}>Sois précis — les meilleurs devs lisent chaque mot.</p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div>
                  <label style={sLabel}>Titre du projet</label>
                  <input
                    value={titre}
                    onChange={(e) => setTitre(e.target.value)}
                    placeholder="Ex : App de mise en relation étudiants"
                    maxLength={80}
                    autoFocus
                    className="lk-n-input"
                    style={sInput}
                  />
                </div>

                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <label style={{ ...sLabel, margin: 0 }}>Description</label>
                    <span style={{ fontSize: 11, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: description.length > DESC_MAX * 0.85 ? "#D4537E" : "#8A8579" }}>
                      {description.length}/{DESC_MAX}
                    </span>
                  </div>
                  <textarea
                    value={description}
                    onChange={(e) => { if (e.target.value.length <= DESC_MAX) setDescription(e.target.value); }}
                    placeholder="Décris ton projet, le problème qu'il résout, les fonctionnalités clés..."
                    rows={5}
                    className="lk-n-input"
                    style={{ ...sInput, resize: "none" }}
                  />
                  <div style={{ marginTop: 6, height: 3, borderRadius: 99, background: "#ECE7DD", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 99, transition: "width 0.2s", width: `${(description.length / DESC_MAX) * 100}%`, background: description.length > DESC_MAX * 0.85 ? "#D4537E" : "#1A2138" }} />
                  </div>
                </div>

                <button onClick={handleStep1Next} disabled={!titre.trim() || !description.trim()} className="lk-n-navy" style={{ ...sNavy, marginTop: 4 }}>
                  Suivant <ArrowRight size={15} strokeWidth={2} />
                </button>
              </div>
            </>
          )}

          {/* ── STEP 2 ── */}
          {step === 2 && (
            <>
              <div style={{ marginBottom: 28 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: "#8A8579", display: "block", marginBottom: 12 }}>Étape 2 · Les besoins</span>
                <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 26, fontWeight: 600, color: "#1A2138", margin: "0 0 6px", letterSpacing: "-0.03em", lineHeight: 1.15 }}>
                  Stack & deadline
                </h1>
                <p style={{ fontSize: 13, color: "#8A8579", margin: 0, lineHeight: 1.6 }}>Les devs filtrent par stack — choisis bien.</p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

                {/* Stack chips */}
                <div>
                  <label style={sLabel}>Stack souhaitée</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {STACKS.map((s) => {
                      const active = selectedStacks.includes(s);
                      return (
                        <button key={s} type="button" onClick={() => toggleStack(s)} className="lk-n-chip"
                          style={{ padding: "6px 13px", borderRadius: 8, fontSize: 12, fontWeight: 600, border: active ? "1.5px solid #1A2138" : "1px solid #ECE7DD", background: active ? "#1A2138" : "#fff", color: active ? "#fff" : "#8A8579", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, transition: "all 0.12s" }}>
                          {active && <Check size={10} strokeWidth={2.5} />}
                          {s}
                        </button>
                      );
                    })}

                    {/* Stacks custom */}
                    {selectedStacks.filter((s) => !STACKS.includes(s)).map((s) => (
                      <button key={s} type="button" onClick={() => removeStack(s)} className="lk-n-chip"
                        style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, border: "1.5px solid #1A2138", background: "#1A2138", color: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
                        {s} <X size={10} strokeWidth={2.5} />
                      </button>
                    ))}

                    {!showCustom && (
                      <button type="button" onClick={() => { setShowCustom(true); setTimeout(() => customInputRef.current?.focus(), 50); }} className="lk-n-chip"
                        style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, border: "1px dashed #ECE7DD", background: "transparent", color: "#8A8579", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <Plus size={11} strokeWidth={2.5} /> Autre
                      </button>
                    )}
                  </div>

                  {showCustom && (
                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                      <input ref={customInputRef} value={customStack} onChange={(e) => setCustomStack(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomStack(); } if (e.key === "Escape") setShowCustom(false); }}
                        placeholder="Ex : Supabase, GraphQL…" className="lk-n-input" style={{ ...sInput, flex: 1 }} />
                      <button type="button" onClick={addCustomStack} className="lk-n-navy"
                        style={{ ...sNavy, width: "auto", padding: "0 18px", borderRadius: 10, flexShrink: 0 }}>
                        Ajouter
                      </button>
                    </div>
                  )}
                </div>

                {/* Dates */}
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <label style={sLabel}>Calendrier du projet</label>

                  {/* Début souhaité */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 600, color: "#8A8579", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.8px" }}>Début souhaité</p>
                      <input
                        type="date"
                        value={dateDebut}
                        min={todayISO()}
                        onChange={(e) => {
                          setDateDebut(e.target.value);
                          if (dateFin && e.target.value > dateFin) setDateFin("");
                        }}
                        className="lk-n-input"
                        style={{ ...sInput, colorScheme: "light" }}
                      />
                      <p style={{ fontSize: 11, color: "#8A8579", margin: "5px 0 0" }}>Optionnel</p>
                    </div>

                    <div>
                      <p style={{ fontSize: 11, fontWeight: 600, color: "#1A2138", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.8px" }}>Date de rendu <span style={{ color: "#D4537E" }}>*</span></p>
                      <input
                        type="date"
                        value={dateFin}
                        min={dateDebut || todayISO()}
                        onChange={(e) => setDateFin(e.target.value)}
                        className="lk-n-input"
                        style={{ ...sInput, colorScheme: "light", borderColor: !dateFin ? "#ECE7DD" : "#1A2138" }}
                      />
                      <p style={{ fontSize: 11, color: "#8A8579", margin: "5px 0 0" }}>Requis</p>
                    </div>
                  </div>

                  {/* Aperçu */}
                  {dateFin && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, border: "1px solid #ECE7DD", background: "#FAF8F4" }}>
                      <Check size={13} strokeWidth={2.5} style={{ color: "#1A2138", flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#1A2138" }}>
                        {dateDebut
                          ? `Du ${formatDateFR(dateDebut)} au ${formatDateFR(dateFin)}`
                          : `Avant le ${formatDateFR(dateFin)}`}
                      </span>
                    </div>
                  )}
                </div>

                {/* Budget */}
                <div>
                  <label style={sLabel}>Budget (€)</label>
                  <div style={{ position: "relative" }}>
                    <input
                      type="number"
                      min={0}
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                      placeholder="Ex : 500"
                      className="lk-n-input"
                      style={{ ...sInput, paddingRight: 32 }}
                    />
                    <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 13, fontWeight: 600, color: "#8A8579" }}>€</span>
                  </div>
                  <p style={{ fontSize: 11, color: "#8A8579", margin: "5px 0 0" }}>Optionnel — le dev reçoit 90 % du montant</p>
                </div>

                {error && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(212,83,126,0.3)", background: "rgba(212,83,126,0.05)", color: "#D4537E", fontSize: 13 }}>
                    <AlertCircle size={14} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
                    {error}
                  </div>
                )}

                <button onClick={handleSubmit} disabled={saving || !dateFin} className="lk-n-navy" style={sNavy}>
                  {saving
                    ? <div style={{ width: 17, height: 17, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "spin 0.8s linear infinite" }} />
                    : <>Soumettre mon projet <ArrowRight size={15} strokeWidth={2} /></>
                  }
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
