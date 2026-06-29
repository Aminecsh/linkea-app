"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import React from "react";
import { ArrowLeft, ArrowRight, AlertCircle, Plus, X, Check } from "lucide-react";

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

// Parse "Du 15 juil. 2026 au 30 sept. 2026" or "Avant le 30 sept. 2026" → ISO dates
function parseDeadline(str: string): { dateDebut: string; dateFin: string } {
  const months: Record<string, string> = {
    "jan.": "01", "fév.": "02", "mars": "03", "avr.": "04",
    "mai": "05", "juin": "06", "juil.": "07", "août": "08",
    "sept.": "09", "oct.": "10", "nov.": "11", "déc.": "12",
  };
  function toISO(d: string, m: string, y: string): string {
    return `${y}-${months[m] ?? "01"}-${d.padStart(2, "0")}`;
  }
  const rDu = /^Du (\d+) (\S+) (\d{4}) au (\d+) (\S+) (\d{4})$/;
  const rAvant = /^Avant le (\d+) (\S+) (\d{4})$/;
  const mDu = str.match(rDu);
  if (mDu) return { dateDebut: toISO(mDu[1], mDu[2], mDu[3]), dateFin: toISO(mDu[4], mDu[5], mDu[6]) };
  const mAv = str.match(rAvant);
  if (mAv) return { dateDebut: "", dateFin: toISO(mAv[1], mAv[2], mAv[3]) };
  return { dateDebut: "", dateFin: "" };
}

export default function ModifierProjet() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const customInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");
  const [step, setStep]           = useState<1 | 2>(1);

  const [titre, setTitre]         = useState("");
  const [description, setDescription] = useState("");
  const [selectedStacks, setSelectedStacks] = useState<string[]>([]);
  const [customStack, setCustomStack] = useState("");
  const [showCustom, setShowCustom]   = useState(false);
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin]     = useState("");

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }

      const { data: roleData } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      if (roleData?.role !== "founder") { router.push("/"); return; }

      const { data: proj } = await supabase
        .from("projects")
        .select("id, titre, description, stack_souhaitee, deadline, statut, profiles_founder(user_id)")
        .eq("id", id)
        .maybeSingle();

      if (!proj) { router.push("/projets"); return; }

      const pf = proj.profiles_founder as unknown as { user_id: string } | null;
      if (pf?.user_id !== user.id) { router.push("/projets"); return; }
      if (proj.statut !== "pending") { router.push("/profil"); return; }

      setTitre(proj.titre ?? "");
      setDescription(proj.description ?? "");
      setSelectedStacks(
        proj.stack_souhaitee ? proj.stack_souhaitee.split(",").map((s: string) => s.trim()).filter(Boolean) : []
      );
      if (proj.deadline) {
        const { dateDebut: db, dateFin: df } = parseDeadline(proj.deadline);
        setDateDebut(db);
        setDateFin(df);
      }
      setLoading(false);
    }
    load();
  }, [id, router]);

  function toggleStack(s: string) {
    setSelectedStacks((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
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

  async function handleSubmit() {
    if (!dateFin) return;
    setSaving(true);
    setError("");

    const deadlineStr = dateDebut
      ? `Du ${formatDateFR(dateDebut)} au ${formatDateFR(dateFin)}`
      : `Avant le ${formatDateFR(dateFin)}`;

    const { error: dbError } = await supabase.from("projects").update({
      titre: titre.trim(),
      description: description.trim(),
      stack_souhaitee: selectedStacks.join(", "),
      deadline: deadlineStr,
    }).eq("id", id);

    if (dbError) { setError(dbError.message); setSaving(false); return; }
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
      `}</style>

      <div style={{ width: "100%", maxWidth: 440 }}>

        {/* Top nav */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <button
            onClick={() => step === 1 ? router.back() : setStep(1)}
            style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#8A8579", padding: 0 }}
          >
            <ArrowLeft size={14} strokeWidth={2} />
            {step === 1 ? "Retour" : "Étape précédente"}
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {[1, 2].map((n) => (
              <div key={n} style={{ height: 4, borderRadius: 99, width: step >= n ? 24 : 10, background: step >= n ? "#D4537E" : "#ECE7DD", transition: "width 0.2s, background 0.2s" }} />
            ))}
            <span style={{ fontSize: 11, fontWeight: 700, color: "#8A8579", marginLeft: 4 }}>{step}/2</span>
          </div>
        </div>

        {/* Card */}
        <div style={{ background: "#fff", border: "1px solid #ECE7DD", borderRadius: 20, padding: "32px 28px" }}>

          {/* ── STEP 1 ── */}
          {step === 1 && (
            <>
              <div style={{ marginBottom: 28 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: "#8A8579", display: "block", marginBottom: 12 }}>Modifier · Le projet</span>
                <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 26, fontWeight: 600, color: "#1A2138", margin: "0 0 6px", letterSpacing: "-0.03em", lineHeight: 1.15 }}>
                  Ton projet
                </h1>
                <p style={{ fontSize: 13, color: "#8A8579", margin: 0, lineHeight: 1.6 }}>Modifie les infos ci-dessous.</p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div>
                  <label style={sLabel}>Titre du projet</label>
                  <input value={titre} onChange={(e) => setTitre(e.target.value)}
                    placeholder="Ex : App de mise en relation étudiants"
                    maxLength={80} autoFocus className="lk-n-input" style={sInput} />
                </div>

                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <label style={{ ...sLabel, margin: 0 }}>Description</label>
                    <span style={{ fontSize: 11, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: description.length > DESC_MAX * 0.85 ? "#D4537E" : "#8A8579" }}>
                      {description.length}/{DESC_MAX}
                    </span>
                  </div>
                  <textarea value={description}
                    onChange={(e) => { if (e.target.value.length <= DESC_MAX) setDescription(e.target.value); }}
                    placeholder="Décris ton projet…" rows={5}
                    className="lk-n-input" style={{ ...sInput, resize: "none" }} />
                  <div style={{ marginTop: 6, height: 3, borderRadius: 99, background: "#ECE7DD", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 99, transition: "width 0.2s", width: `${(description.length / DESC_MAX) * 100}%`, background: description.length > DESC_MAX * 0.85 ? "#D4537E" : "#1A2138" }} />
                  </div>
                </div>

                <button onClick={() => { if (titre.trim() && description.trim()) setStep(2); }}
                  disabled={!titre.trim() || !description.trim()} className="lk-n-navy" style={{ ...sNavy, marginTop: 4 }}>
                  Suivant <ArrowRight size={15} strokeWidth={2} />
                </button>
              </div>
            </>
          )}

          {/* ── STEP 2 ── */}
          {step === 2 && (
            <>
              <div style={{ marginBottom: 28 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: "#8A8579", display: "block", marginBottom: 12 }}>Modifier · Les besoins</span>
                <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 26, fontWeight: 600, color: "#1A2138", margin: "0 0 6px", letterSpacing: "-0.03em", lineHeight: 1.15 }}>
                  Stack & deadline
                </h1>
                <p style={{ fontSize: 13, color: "#8A8579", margin: 0, lineHeight: 1.6 }}>Ajuste selon tes besoins actuels.</p>
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
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 600, color: "#8A8579", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.8px" }}>Début souhaité</p>
                      <input type="date" value={dateDebut} min={todayISO()}
                        onChange={(e) => { setDateDebut(e.target.value); if (dateFin && e.target.value > dateFin) setDateFin(""); }}
                        className="lk-n-input" style={{ ...sInput, colorScheme: "light" }} />
                      <p style={{ fontSize: 11, color: "#8A8579", margin: "5px 0 0" }}>Optionnel</p>
                    </div>
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 600, color: "#1A2138", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.8px" }}>Date de rendu <span style={{ color: "#D4537E" }}>*</span></p>
                      <input type="date" value={dateFin} min={dateDebut || todayISO()}
                        onChange={(e) => setDateFin(e.target.value)}
                        className="lk-n-input" style={{ ...sInput, colorScheme: "light", borderColor: !dateFin ? "#ECE7DD" : "#1A2138" }} />
                      <p style={{ fontSize: 11, color: "#8A8579", margin: "5px 0 0" }}>Requis</p>
                    </div>
                  </div>
                  {dateFin && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, border: "1px solid #ECE7DD", background: "#FAF8F4" }}>
                      <Check size={13} strokeWidth={2.5} style={{ color: "#1A2138", flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#1A2138" }}>
                        {dateDebut ? `Du ${formatDateFR(dateDebut)} au ${formatDateFR(dateFin)}` : `Avant le ${formatDateFR(dateFin)}`}
                      </span>
                    </div>
                  )}
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
                    : <>Enregistrer les modifications <ArrowRight size={15} strokeWidth={2} /></>
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
