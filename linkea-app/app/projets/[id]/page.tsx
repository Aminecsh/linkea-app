"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, Calendar, Check, Send } from "lucide-react";

const C = {
  ink:      "#1A2138",
  rose:     "#D4537E",
  muted:    "#8A8579",
  hairline: "#ECE7DD",
  canvas:   "#FAF8F4",
  surface:  "#FFFFFF",
} as const;

type Project = {
  id: string;
  titre: string;
  description: string;
  stack_souhaitee: string;
  deadline: string;
  statut: string;
  profiles_founder: {
    nom: string;
    ecole?: string;
    user_id: string;
    avatar_url?: string;
  };
};

export default function ProjectDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [project, setProject]       = useState<Project | null>(null);
  const [role, setRole]             = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [developerId, setDeveloperId] = useState<string | null>(null);
  const [hasApplied, setHasApplied] = useState(false);
  const [applying, setApplying]     = useState(false);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }
      setCurrentUserId(user.id);

      const { data: roleData } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      const r = roleData?.role ?? null;
      setRole(r);

      const { data: proj } = await supabase
        .from("projects")
        .select("id, titre, description, stack_souhaitee, deadline, statut, profiles_founder(nom, ecole, user_id, avatar_url)")
        .eq("id", id)
        .maybeSingle();

      if (!proj) { router.push("/projets"); return; }
      const raw = proj as unknown as Record<string, unknown>;
      if (Array.isArray(raw.profiles_founder)) raw.profiles_founder = raw.profiles_founder[0] ?? null;
      setProject(raw as unknown as Project);

      if (r === "developer") {
        const { data: profile } = await supabase
          .from("profiles_developer").select("id").eq("user_id", user.id).maybeSingle();
        if (profile) {
          setDeveloperId(profile.id);
          const { data: cand } = await supabase
            .from("candidatures").select("id").eq("project_id", id).eq("developer_id", profile.id).maybeSingle();
          setHasApplied(!!cand);
        }
      }

      setLoading(false);
    }
    load();
  }, [id, router]);

  async function handleCandidater() {
    if (!developerId || applying || hasApplied) return;
    setApplying(true);

    await supabase.from("candidatures").insert({
      project_id: id,
      developer_id: developerId,
      statut: "pending",
    });

    const projRaw = project as unknown as { founder_id?: string };
    if (projRaw?.founder_id) {
      const { data: founderData } = await supabase
        .from("profiles_founder").select("user_id, email").eq("id", projRaw.founder_id).maybeSingle();
      if (founderData?.user_id) {
        await supabase.from("notifications").insert({
          user_id: founderData.user_id,
          type: "nouveau_candidat",
          title: "Nouveau candidat",
          body: `Un dev a candidaté sur "${project?.titre}"`,
          link: `/projets/${id}/candidats`,
        });
      }
    }

    setHasApplied(true);
    setApplying(false);
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: C.canvas, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${C.hairline}`, borderTopColor: C.ink, animation: "lk-spin 0.8s linear infinite" }} />
        <style>{`@keyframes lk-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!project) return null;

  const stacks  = project.stack_souhaitee?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  const isOwner = role === "founder" && project.profiles_founder?.user_id === currentUserId;
  const founder = project.profiles_founder;

  return (
    <div style={{ minHeight: "100vh", background: C.canvas, paddingBottom: "calc(80px + env(safe-area-inset-bottom, 0px))" }}>
      <style>{`@keyframes lk-spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header sticky */}
      <div style={{
        position: "sticky", top: 0, zIndex: 20,
        background: "rgba(250,248,244,0.85)",
        backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        borderBottom: `1px solid ${C.hairline}`,
        padding: "0 20px",
      }}>
        <div style={{ maxWidth: 680, margin: "0 auto", height: 52, display: "flex", alignItems: "center" }}>
          <button
            onClick={() => router.back()}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.muted, padding: 0 }}
          >
            <ArrowLeft size={15} strokeWidth={2} /> Retour
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "28px 20px 0" }}>

        {/* Card principale */}
        <div style={{ background: C.surface, border: `1px solid ${C.hairline}`, borderRadius: 20, padding: "28px 24px", marginBottom: 16 }}>

          {/* Founder */}
          <button
            onClick={() => router.push(`/profil/${founder?.user_id}`)}
            style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", background: "none", border: "none", cursor: "pointer", padding: "0 0 20px", borderBottom: `1px solid ${C.hairline}`, marginBottom: 24, textAlign: "left" }}
          >
            {founder?.avatar_url ? (
              <img src={founder.avatar_url} alt={founder.nom}
                style={{ width: 44, height: 44, borderRadius: 12, objectFit: "cover", border: `1px solid ${C.hairline}`, flexShrink: 0 }} />
            ) : (
              <div style={{ width: 44, height: 44, borderRadius: 12, background: C.ink, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 18, fontWeight: 600, color: "#fff" }}>
                  {founder?.nom?.[0]?.toUpperCase() ?? "?"}
                </span>
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: C.ink, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{founder?.nom}</p>
              {founder?.ecole && (
                <p style={{ fontSize: 12, color: C.muted, margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{founder.ecole}</p>
              )}
            </div>
            <span style={{ fontSize: 12, color: C.muted, flexShrink: 0 }}>Voir le profil →</span>
          </button>

          {/* Titre */}
          <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 26, fontWeight: 700, color: C.ink, margin: "0 0 16px", lineHeight: 1.2 }}>
            {project.titre}
          </h1>

          {/* Deadline */}
          {project.deadline && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 8, border: `1px solid ${C.hairline}`, background: C.canvas, marginBottom: 20 }}>
              <Calendar size={12} strokeWidth={2} style={{ color: C.muted }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>{project.deadline}</span>
            </div>
          )}

          {/* Stack */}
          {stacks.length > 0 && (
            <div style={{ marginBottom: 22 }}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: C.muted, margin: "0 0 10px" }}>Stack souhaitée</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {stacks.map((s) => (
                  <span key={s} style={{ fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 8, border: `1px solid ${C.hairline}`, background: C.surface, color: C.ink }}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {project.description && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: C.muted, margin: "0 0 10px" }}>Description</p>
              <p style={{ fontSize: 14, color: C.ink, lineHeight: 1.65, margin: 0 }}>{project.description}</p>
            </div>
          )}
        </div>

        {/* CTA owner */}
        {isOwner && project.statut === "pending" && (
          <button
            onClick={() => router.push(`/projets/${id}/modifier`)}
            style={{ width: "100%", padding: "14px 0", borderRadius: 14, background: C.ink, color: "#fff", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            Modifier ce projet
          </button>
        )}
      </div>

      {/* CTA dev — sticky bottom */}
      {role === "developer" && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 40,
          padding: "12px 20px",
          paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
          background: "rgba(250,248,244,0.95)",
          backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
          borderTop: `1px solid ${C.hairline}`,
        }}>
          <div style={{ maxWidth: 680, margin: "0 auto" }}>
            <button
              onClick={handleCandidater}
              disabled={hasApplied || applying}
              style={{
                width: "100%", padding: "14px 0", borderRadius: 14, fontSize: 14, fontWeight: 700,
                cursor: hasApplied ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                background: hasApplied ? C.surface : C.rose,
                color:      hasApplied ? C.muted   : "#fff",
                border: hasApplied ? `1px solid ${C.hairline}` : "none",
              } as React.CSSProperties}
            >
              {applying
                ? <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "lk-spin 0.8s linear infinite" }} />
                : hasApplied
                  ? <><Check size={15} strokeWidth={2.5} /> Candidature envoyée</>
                  : <><Send size={14} strokeWidth={2} /> Candidater à ce projet</>
              }
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
