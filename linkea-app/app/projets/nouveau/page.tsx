"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, ArrowRight, AlertCircle, Plus, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STACKS = ["React", "Node.js", "Flutter", "Python", "Vue.js", "Laravel", "Swift", "Kotlin", "Next.js", "TypeScript"];

const DEADLINES: { value: string; label: string; sub: string }[] = [
  { value: "2 semaines", label: "2 semaines", sub: "Sprint court" },
  { value: "1 mois",     label: "1 mois",     sub: "MVP ciblé"   },
  { value: "2 mois",     label: "2 mois",     sub: "Projet solide" },
  { value: "3 mois",     label: "3 mois",     sub: "Ambitieux"   },
  { value: "Flexible",   label: "Flexible",   sub: "À définir"   },
];

const DESC_MAX = 500;

export default function NouveauProjet() {
  const router = useRouter();
  const customInputRef = useRef<HTMLInputElement>(null);

  const [founderId, setFounderId]       = useState<string | null>(null);
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState("");
  const [step, setStep]                 = useState<1 | 2>(1);

  // Step 1
  const [titre, setTitre]               = useState("");
  const [description, setDescription]   = useState("");

  // Step 2
  const [selectedStacks, setSelectedStacks] = useState<string[]>([]);
  const [customStack, setCustomStack]   = useState("");
  const [showCustom, setShowCustom]     = useState(false);
  const [deadline, setDeadline]         = useState("");

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

  async function handleSubmit() {
    if (!founderId || !deadline) return;
    setSaving(true);
    setError("");

    const { error: dbError } = await supabase.from("projects").insert({
      founder_id: founderId,
      titre: titre.trim(),
      description: description.trim(),
      stack_souhaitee: selectedStacks.join(", "),
      deadline,
      statut: "pending",
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <span className="spinner" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12" style={{ background: "var(--bg)" }}>

      {/* Ambient blob */}
      <div
        className="fixed -top-20 -right-20 w-80 h-80 rounded-full pointer-events-none opacity-20"
        style={{ background: "radial-gradient(circle, rgba(244,63,94,0.20) 0%, transparent 70%)", filter: "blur(60px)" }}
        aria-hidden
      />

      <div className="w-full max-w-md relative z-10">

        {/* Top nav */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => step === 1 ? router.push("/profil") : setStep(1)}
            className="inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-60"
            style={{ color: "var(--muted)" }}
          >
            <ArrowLeft size={14} strokeWidth={2} />
            {step === 1 ? "Retour" : "Étape précédente"}
          </button>

          {/* Progress */}
          <div className="flex items-center gap-2">
            {[1, 2].map((n) => (
              <div
                key={n}
                className="transition-all duration-300"
                style={{
                  height: 4,
                  borderRadius: 99,
                  width: step >= n ? 24 : 12,
                  background: step >= n ? "var(--rose)" : "rgba(0,0,0,0.10)",
                }}
              />
            ))}
            <span className="text-xs font-semibold ml-1" style={{ color: "var(--muted)" }}>
              {step}/2
            </span>
          </div>
        </div>

        <div className="card p-8">

          {/* ── STEP 1 ────────────────────────────────────── */}
          {step === 1 && (
            <>
              <div className="mb-7">
                <span className="tag tag-rose mb-4 inline-flex">Étape 1 · Le projet</span>
                <h1 className="text-2xl font-black tracking-tight leading-tight mb-1.5" style={{ color: "var(--text)" }}>
                  Décris ton projet
                </h1>
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  Sois précis — les meilleurs devs lisent chaque mot.
                </p>
              </div>

              <div className="flex flex-col gap-4">
                <div>
                  <label className="label mb-1.5 block">Titre du projet</label>
                  <input
                    value={titre}
                    onChange={(e) => setTitre(e.target.value)}
                    placeholder="Ex : App de mise en relation étudiants"
                    className="input-field"
                    maxLength={80}
                    autoFocus
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="label">Description</label>
                    <span
                      className="text-[11px] font-semibold tabular-nums"
                      style={{ color: description.length > DESC_MAX * 0.85 ? "var(--rose)" : "var(--subtle)" }}
                    >
                      {description.length}/{DESC_MAX}
                    </span>
                  </div>
                  <textarea
                    value={description}
                    onChange={(e) => {
                      if (e.target.value.length <= DESC_MAX) setDescription(e.target.value);
                    }}
                    placeholder="Décris ton projet, le problème qu'il résout, les fonctionnalités clés..."
                    rows={5}
                    className="input-field resize-none"
                  />
                  {/* Progress bar description */}
                  <div className="mt-1.5 h-0.5 rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.06)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-200"
                      style={{
                        width: `${(description.length / DESC_MAX) * 100}%`,
                        background: description.length > DESC_MAX * 0.85 ? "var(--rose)" : "var(--blue)",
                      }}
                    />
                  </div>
                </div>

                <button
                  onClick={handleStep1Next}
                  disabled={!titre.trim() || !description.trim()}
                  className="btn-primary w-full mt-2"
                >
                  Suivant <ArrowRight size={15} strokeWidth={2.2} />
                </button>
              </div>
            </>
          )}

          {/* ── STEP 2 ────────────────────────────────────── */}
          {step === 2 && (
            <>
              <div className="mb-7">
                <span className="tag tag-blue mb-4 inline-flex">Étape 2 · Les besoins</span>
                <h1 className="text-2xl font-black tracking-tight leading-tight mb-1.5" style={{ color: "var(--text)" }}>
                  Stack & deadline
                </h1>
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  Les devs filtrent par stack — choisis bien.
                </p>
              </div>

              <div className="flex flex-col gap-6">

                {/* Stack chips */}
                <div>
                  <label className="label mb-3 block">Stack souhaitée</label>
                  <div className="flex flex-wrap gap-2">
                    {STACKS.map((s) => {
                      const active = selectedStacks.includes(s);
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => toggleStack(s)}
                          className="transition-all duration-150"
                          style={{
                            padding: "6px 13px",
                            borderRadius: 99,
                            fontSize: 13,
                            fontWeight: 600,
                            border: active ? "1px solid var(--blue-border)" : "1px solid rgba(0,0,0,0.09)",
                            background: active ? "var(--blue-soft)" : "#fff",
                            color: active ? "var(--blue)" : "var(--muted)",
                            boxShadow: active ? "none" : "var(--shadow-xs)",
                          }}
                        >
                          {active && <Check size={11} strokeWidth={2.5} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />}
                          {s}
                        </button>
                      );
                    })}

                    {/* Stacks custom ajoutées */}
                    {selectedStacks
                      .filter((s) => !STACKS.includes(s))
                      .map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => removeStack(s)}
                          className="flex items-center gap-1.5 transition-all duration-150"
                          style={{
                            padding: "6px 12px",
                            borderRadius: 99,
                            fontSize: 13,
                            fontWeight: 600,
                            border: "1px solid var(--blue-border)",
                            background: "var(--blue-soft)",
                            color: "var(--blue)",
                          }}
                        >
                          {s} <X size={11} strokeWidth={2.5} />
                        </button>
                      ))
                    }

                    {/* Bouton + Autre */}
                    {!showCustom && (
                      <button
                        type="button"
                        onClick={() => { setShowCustom(true); setTimeout(() => customInputRef.current?.focus(), 50); }}
                        className="flex items-center gap-1 transition-all duration-150"
                        style={{
                          padding: "6px 12px",
                          borderRadius: 99,
                          fontSize: 13,
                          fontWeight: 600,
                          border: "1px dashed rgba(0,0,0,0.15)",
                          background: "transparent",
                          color: "var(--muted)",
                        }}
                      >
                        <Plus size={12} strokeWidth={2.5} /> Autre
                      </button>
                    )}
                  </div>

                  {/* Input custom stack */}
                  {showCustom && (
                    <div className="flex gap-2 mt-3">
                      <input
                        ref={customInputRef}
                        value={customStack}
                        onChange={(e) => setCustomStack(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomStack(); } if (e.key === "Escape") setShowCustom(false); }}
                        placeholder="Ex : Supabase, GraphQL..."
                        className="input-field"
                        style={{ padding: "9px 14px", fontSize: 13 }}
                      />
                      <button
                        type="button"
                        onClick={addCustomStack}
                        className="btn-primary shrink-0"
                        style={{ padding: "0 16px", fontSize: 13 }}
                      >
                        Ajouter
                      </button>
                    </div>
                  )}
                </div>

                {/* Deadline radio cards */}
                <div>
                  <label className="label mb-3 block">Deadline souhaitée</label>
                  <div className="grid grid-cols-2 gap-2">
                    {DEADLINES.map((d) => {
                      const active = deadline === d.value;
                      return (
                        <button
                          key={d.value}
                          type="button"
                          onClick={() => setDeadline(d.value)}
                          className={cn("text-left transition-all duration-150", d.value === "Flexible" && "col-span-2")}
                          style={{
                            padding: "12px 14px",
                            borderRadius: 14,
                            border: active ? "1.5px solid var(--rose-border)" : "1px solid rgba(0,0,0,0.09)",
                            background: active ? "var(--rose-soft)" : "#fff",
                            boxShadow: active ? "none" : "var(--shadow-xs)",
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className="font-bold text-sm"
                              style={{ color: active ? "var(--rose-hover)" : "var(--text)" }}
                            >
                              {d.label}
                            </span>
                            {active && (
                              <span
                                className="w-4 h-4 rounded-full flex items-center justify-center"
                                style={{ background: "var(--rose)" }}
                              >
                                <Check size={9} strokeWidth={3} color="white" />
                              </span>
                            )}
                          </div>
                          <span
                            className="text-xs font-medium"
                            style={{ color: active ? "var(--rose)" : "var(--muted)" }}
                          >
                            {d.sub}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {error && (
                  <div
                    className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl text-sm"
                    style={{ background: "var(--red-soft)", border: "1px solid var(--red-border)", color: "var(--red)" }}
                  >
                    <AlertCircle size={15} strokeWidth={2} className="shrink-0 mt-0.5" />
                    {error}
                  </div>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={saving || !deadline}
                  className="btn-primary w-full"
                >
                  {saving
                    ? <span className="spinner" style={{ width: 17, height: 17, borderWidth: 2 }} />
                    : <>Soumettre mon projet <ArrowRight size={15} strokeWidth={2.2} /></>
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
