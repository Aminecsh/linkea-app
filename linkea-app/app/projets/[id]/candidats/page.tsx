"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppNav from "@/components/AppNav";

type Candidature = {
  id: string;
  statut: string;
  created_at: string;
  profiles_developer: {
    id: string;
    nom: string;
    ecole: string;
    competences: string[];
    github: string;
    linkedin: string;
    dispo_heures_semaine: number;
    user_id: string;
    avatar_url?: string;
  };
};

type Project = {
  id: string;
  titre: string;
  statut: string;
  description?: string;
  stack_souhaitee?: string;
  deadline?: string;
  profiles_founder?: {
    nom: string;
    ecole?: string;
  };
};

export default function CandidatsPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [candidatures, setCandidatures] = useState<Candidature[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [founderId, setFounderId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }

      const { data: roleData } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      if (roleData?.role !== "founder") { router.push("/projets"); return; }

      const { data: profile } = await supabase
        .from("profiles_founder").select("id").eq("user_id", user.id).maybeSingle();
      if (!profile) { router.push("/profil"); return; }
      setFounderId(profile.id);

      const { data: proj } = await supabase
        .from("projects")
        .select("id, titre, statut, description, stack_souhaitee, deadline, profiles_founder(nom, ecole)")
        .eq("id", id)
        .eq("founder_id", profile.id)
        .maybeSingle();

      if (!proj) { router.push("/profil"); return; }
      setProject(proj as unknown as Project);

      const { data: cands } = await supabase
        .from("candidatures")
        .select("id, statut, created_at, profiles_developer(id, nom, ecole, competences, github, linkedin, dispo_heures_semaine, user_id, avatar_url)")
        .eq("project_id", id)
        .order("created_at", { ascending: true });

      setCandidatures((cands as unknown as Candidature[]) ?? []);
      setLoading(false);
    }
    load();
  }, [id, router]);

  async function handleAccept(candidatureId: string, developerId: string, developerUserId: string) {
    setActing(candidatureId);

    await supabase.from("candidatures").update({ statut: "accepted" }).eq("id", candidatureId);
    await supabase.from("candidatures").update({ statut: "refused" }).eq("project_id", id).neq("id", candidatureId);
    await supabase.from("projects").update({ statut: "matched" }).eq("id", id);

    // Créer la conversation
    const fId = founderId ?? (await supabase.from("profiles_founder").select("id").eq("user_id", (await supabase.auth.getUser()).data.user!.id).maybeSingle()).data?.id;
    if (fId) {
      const { error: convError } = await supabase.from("conversations").insert({
        project_id: id,
        founder_id: fId,
        developer_id: developerId,
      });
      if (convError) console.error("Conversation error:", convError.message);
    }

    // Créer le contrat en base + notifier les deux parties
    const acceptedCand = candidatures.find((c) => c.id === candidatureId);
    const fId2 = fId ?? founderId;
    if (acceptedCand && project && fId2) {
      const contractData = {
        projet: {
          id: project.id,
          titre: project.titre,
          description: project.description,
          stack_souhaitee: project.stack_souhaitee,
          deadline: project.deadline,
        },
        founder: {
          nom: project.profiles_founder?.nom ?? "Founder",
          ecole: project.profiles_founder?.ecole,
        },
        dev: {
          nom: acceptedCand.profiles_developer.nom,
          ecole: acceptedCand.profiles_developer.ecole,
          competences: acceptedCand.profiles_developer.competences,
          dispo_heures_semaine: acceptedCand.profiles_developer.dispo_heures_semaine,
          github: acceptedCand.profiles_developer.github,
        },
        matchDate: new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }),
      };

      const { data: newContract } = await supabase.from("contracts").insert({
        project_id: id,
        founder_id: fId2,
        developer_id: developerId,
        data: contractData,
      }).select().maybeSingle();

      if (newContract) {
        const contractLink = `/contrat/${newContract.id}`;

        // Notif founder
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (currentUser) {
          await supabase.from("notifications").insert({
            user_id: currentUser.id,
            type: "contrat_disponible",
            title: "Contrat disponible 📄",
            body: `La lettre de mission pour "${project.titre}" est prête à signer.`,
            link: contractLink,
          });
        }

        // Notif dev
        if (developerUserId) {
          await supabase.from("notifications").insert({
            user_id: developerUserId,
            type: "contrat_disponible",
            title: "Contrat disponible 📄",
            body: `Tu as été sélectionné pour "${project.titre}". Signe ta lettre de mission !`,
            link: contractLink,
          });
        }
      }
    }

    // Notification in-app au dev accepté
    if (developerUserId) {
      await supabase.from("notifications").insert({
        user_id: developerUserId,
        type: "candidature_acceptee",
        title: "Candidature acceptée ✓",
        body: `Tu as été sélectionné pour "${project?.titre}"`,
        link: "/messages",
      });
    }

    // Email au dev accepté
    const { data: devProfile } = await supabase.from("profiles_developer").select("email").eq("id", developerId).maybeSingle();
    if (devProfile?.email && project) {
      await fetch("/api/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "candidature_acceptee", to: devProfile.email, data: { projetTitre: project.titre } }),
      });
    }

    // Emails aux devs refusés
    const refusedCands = candidatures.filter((c) => c.id !== candidatureId && c.statut === "pending");
    for (const c of refusedCands) {
      const { data: refDevProfile } = await supabase.from("profiles_developer").select("email").eq("id", c.profiles_developer.id).maybeSingle();
      if (refDevProfile?.email && project) {
        await fetch("/api/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "candidature_refusee", to: refDevProfile.email, data: { projetTitre: project.titre } }),
        });
      }
    }

    const { data: cands } = await supabase
      .from("candidatures")
      .select("id, statut, created_at, profiles_developer(id, nom, ecole, competences, github, linkedin, dispo_heures_semaine, user_id)")
      .eq("project_id", id)
      .order("created_at", { ascending: true });

    setCandidatures((cands as unknown as Candidature[]) ?? []);
    setProject((prev) => prev ? { ...prev, statut: "matched" } : prev);
    setActing(null);
  }

  async function handleRefuse(candidatureId: string) {
    setActing(candidatureId);
    await supabase.from("candidatures").update({ statut: "refused" }).eq("id", candidatureId);

    // Notification in-app + email au dev refusé
    const cand = candidatures.find((c) => c.id === candidatureId);
    if (cand && project) {
      const { data: devUserRef } = await supabase.from("profiles_developer").select("user_id, email").eq("id", cand.profiles_developer.id).maybeSingle();
      if (devUserRef?.user_id) {
        await supabase.from("notifications").insert({
          user_id: devUserRef.user_id,
          type: "candidature_refusee",
          title: "Candidature non retenue",
          body: `Ta candidature pour "${project.titre}" n'a pas été retenue`,
          link: "/projets",
        });
      }
      if (devUserRef?.email) {
        await fetch("/api/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "candidature_refusee", to: devUserRef.email, data: { projetTitre: project.titre } }),
        });
      }
    }
    setCandidatures((prev) => prev.map((c) => c.id === candidatureId ? { ...c, statut: "refused" } : c));
    setActing(null);
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#F5F5F7", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid #E5E5EA", borderTopColor: "#1A2138", animation: "lk-spin 0.8s linear infinite" }} />
        <style>{`@keyframes lk-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const pending = candidatures.filter((c) => c.statut === "pending");
  const accepted = candidatures.filter((c) => c.statut === "accepted");
  const refused = candidatures.filter((c) => c.statut === "refused");

  return (
    <div className="min-h-screen pb-10 pl-sidebar" style={{ background: "#F5F5F7" }}>
      <AppNav />

      {/* Header */}
      <div className="px-4 py-4 sticky top-0 z-10" style={{ background: "rgba(255,255,255,0.9)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderBottom: "1px solid #E5E5EA" }}>
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={() => router.push("/profil")}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#8A8579", padding: 0 }}>
            ← Retour
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="truncate" style={{ fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 700, color: "#1A2138", margin: 0 }}>{project?.titre}</h1>
            <p style={{ fontSize: 11, color: "#8A8579", margin: 0, fontVariantNumeric: "tabular-nums" }}>{candidatures.length} candidature{candidatures.length > 1 ? "s" : ""}</p>
          </div>
          {project?.statut === "matched" && (
            <span className="shrink-0" style={{ fontSize: 11, fontWeight: 600, border: "1px solid #E5E5EA", background: "#fff", color: "#1A2138", padding: "4px 11px", borderRadius: 7 }}>
              Matchée
            </span>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">

        {candidatures.length === 0 && (
          <div className="text-center py-20" style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E5EA" }}>
            <p style={{ fontSize: 13, color: "#8A8579", margin: 0 }}>Aucune candidature pour l&apos;instant.</p>
            <p style={{ fontSize: 13, color: "#8A8579", margin: "4px 0 0" }}>Les devs intéressés apparaîtront ici.</p>
          </div>
        )}

        {/* Candidatures en attente */}
        {pending.length > 0 && (
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: "#8A8579", margin: "0 0 12px" }}>
              En attente ({pending.length})
            </p>
            <div className="flex flex-col gap-3">
              {pending.map((c) => (
                <CandidatCard
                  key={c.id}
                  c={c}
                  acting={acting}
                  onAccept={() => handleAccept(c.id, c.profiles_developer.id, c.profiles_developer.user_id)}
                  onRefuse={() => handleRefuse(c.id)}
                  showActions={project?.statut !== "matched"}
                />
              ))}
            </div>
          </div>
        )}

        {/* Candidature acceptée */}
        {accepted.length > 0 && (
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: "#1A2138", margin: "0 0 12px" }}>
              Dev sélectionné
            </p>
            <div className="flex flex-col gap-3">
              {accepted.map((c) => (
                <CandidatCard key={c.id} c={c} acting={acting} showActions={false} />
              ))}
            </div>
          </div>
        )}

        {/* Candidatures refusées */}
        {refused.length > 0 && (
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: "#8A8579", margin: "0 0 12px" }}>
              Refusés ({refused.length})
            </p>
            <div className="flex flex-col gap-3 opacity-50">
              {refused.map((c) => (
                <CandidatCard key={c.id} c={c} acting={acting} showActions={false} />
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function CandidatCard({
  c,
  acting,
  onAccept,
  onRefuse,
  showActions,
}: {
  c: Candidature;
  acting: string | null;
  onAccept?: () => void;
  onRefuse?: () => void;
  showActions: boolean;
}) {
  const dev = c.profiles_developer;
  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E5EA", padding: 20 }}>
      <div className="flex items-start gap-4">
        {dev.avatar_url ? (
          <img src={dev.avatar_url} alt={dev.nom} className="shrink-0" style={{ width: 44, height: 44, borderRadius: 12, objectFit: "cover", border: "1px solid #E5E5EA" }} />
        ) : (
          <div className="shrink-0" style={{ width: 44, height: 44, borderRadius: 12, background: "#1A2138", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 17, fontWeight: 600, color: "#fff", lineHeight: 1 }}>{dev.nom?.[0]?.toUpperCase() ?? "?"}</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1A2138", margin: 0 }}>{dev.nom}</h3>
          {dev.ecole && <p style={{ fontSize: 12, color: "#8A8579", margin: "2px 0 8px" }}>{dev.ecole}</p>}

          {dev.competences?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {dev.competences.map((comp) => (
                <span key={comp} style={{ fontSize: 11, fontWeight: 600, border: "1px solid #E5E5EA", background: "#fff", color: "#1A2138", padding: "3px 9px", borderRadius: 7 }}>
                  {comp}
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-4 mb-4" style={{ fontSize: 12, color: "#8A8579" }}>
            {dev.dispo_heures_semaine && <span style={{ fontVariantNumeric: "tabular-nums" }}>{dev.dispo_heures_semaine}h/semaine</span>}
            {dev.github && (
              <a href={dev.github} target="_blank" rel="noreferrer" style={{ color: "#1A2138", textDecoration: "underline" }} onClick={(e) => e.stopPropagation()}>
                GitHub ↗
              </a>
            )}
            {dev.linkedin && (
              <a href={dev.linkedin} target="_blank" rel="noreferrer" style={{ color: "#1A2138", textDecoration: "underline" }} onClick={(e) => e.stopPropagation()}>
                LinkedIn ↗
              </a>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            <a
              href={`/profil/${dev.user_id}`}
              style={{ display: "inline-flex", alignItems: "center", padding: "8px 16px", borderRadius: 10, border: "1px solid #E5E5EA", background: "#fff", color: "#8A8579", fontSize: 13, fontWeight: 600, textDecoration: "none" }}
            >
              Voir le profil
            </a>
            {showActions && (
              <>
                <button
                  onClick={onAccept}
                  disabled={acting === c.id}
                  style={{ padding: "8px 20px", borderRadius: 10, background: "#D4537E", color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: acting === c.id ? 0.6 : 1 }}
                >
                  {acting === c.id ? "..." : "Accepter"}
                </button>
                <button
                  onClick={onRefuse}
                  disabled={acting === c.id}
                  style={{ padding: "8px 20px", borderRadius: 10, border: "1px solid #E5E5EA", background: "#fff", color: "#8A8579", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: acting === c.id ? 0.6 : 1 }}
                >
                  Refuser
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
