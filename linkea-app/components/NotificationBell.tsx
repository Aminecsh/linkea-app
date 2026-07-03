"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Bell, Check, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Notif = {
  id: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  read: boolean;
  created_at: string;
};

export default function NotificationBell() {
  const router = useRouter();
  const bellRef = useRef<HTMLButtonElement>(null);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, right: 0 });
  const [userId, setUserId] = useState<string | null>(null);
  const [developerId, setDeveloperId] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: roleData } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();

      if (roleData?.role === "developer") {
        const { data: profile } = await supabase
          .from("profiles_developer").select("id").eq("user_id", user.id).maybeSingle();
        if (profile) setDeveloperId(profile.id);
      }

      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      setNotifs(data ?? []);
    }
    load();
  }, []);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifs:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => { setNotifs((prev) => [payload.new as Notif, ...prev]); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const unread = notifs.filter((n) => !n.read).length;

  async function handleOpen() {
    const next = !open;
    if (next && bellRef.current) {
      // Lire la position AVANT que le hover transform ne soit appliqué
      const rect = bellRef.current.getBoundingClientRect();
      setDropPos({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
    setOpen(next);
    if (next && unread > 0 && userId) {
      await supabase.from("notifications").update({ read: true }).eq("user_id", userId).eq("read", false);
      setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    }
  }

  function handleClick(n: Notif) {
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  async function handleCandidater(e: React.MouseEvent, n: Notif) {
    e.stopPropagation();
    if (!developerId || !n.link || applying) return;

    const projectId = n.link.split("/projets/")[1];
    if (!projectId || applied.has(projectId)) return;

    setApplying(projectId);

    const { error } = await supabase.from("candidatures").insert({
      project_id: projectId,
      developer_id: developerId,
      statut: "pending",
    });

    if (!error) {
      setApplied((prev) => new Set([...prev, projectId]));

      const { data: proj } = await supabase
        .from("projects").select("titre, founder_id").eq("id", projectId).maybeSingle();
      if (proj?.founder_id) {
        const { data: founder } = await supabase
          .from("profiles_founder").select("user_id").eq("id", proj.founder_id).maybeSingle();
        if (founder?.user_id) {
          await supabase.from("notifications").insert({
            user_id: founder.user_id,
            type: "nouveau_candidat",
            title: "Nouveau candidat",
            body: `Un dev a candidaté sur "${proj.titre}"`,
            link: `/projets/${projectId}/candidats`,
          });
        }
      }

      setOpen(false);
      router.push(n.link);
    }

    setApplying(null);
  }

  const dropdown = open && mounted ? createPortal(
    <>
      {/* Overlay fermeture */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 9998 }}
        onClick={() => setOpen(false)}
      />
      {/* Panel — rendu dans document.body, hors de tout stacking context parent */}
      <div
        style={{
          position: "fixed",
          top: dropPos.top,
          right: dropPos.right,
          width: 320,
          zIndex: 9999,
          background: "#ffffff",
          border: "1px solid rgba(0,0,0,0.09)",
          borderRadius: 16,
          boxShadow: "0 8px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
          <p style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>Notifications</p>
        </div>

        {notifs.length === 0 ? (
          <div style={{ padding: "40px 16px", textAlign: "center" }}>
            <Bell size={24} strokeWidth={1.5} style={{ color: "var(--subtle)", margin: "0 auto 8px" }} />
            <p style={{ fontSize: 14, color: "var(--muted)" }}>Aucune notification</p>
          </div>
        ) : (
          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            {notifs.map((n) => {
              const projectId = n.type === "pin" ? n.link?.split("/projets/")[1] : null;
              const isApplied = projectId ? applied.has(projectId) : false;
              return (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  style={{
                    padding: "12px 16px",
                    cursor: "pointer",
                    borderBottom: "1px solid rgba(0,0,0,0.04)",
                    background: !n.read ? "rgba(244,63,94,0.04)" : "transparent",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <span style={{
                      marginTop: 6, width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                      background: !n.read ? "var(--rose)" : "transparent",
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontSize: 14, fontWeight: 600, lineHeight: 1.3,
                        color: !n.read ? "var(--rose-hover)" : "var(--text)",
                      }}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="line-clamp-2" style={{ fontSize: 12, marginTop: 2, color: "var(--muted)" }}>
                          {n.body}
                        </p>
                      )}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6, gap: 8 }}>
                        <p style={{ fontSize: 11, color: "var(--subtle)" }}>
                          {new Date(n.created_at).toLocaleDateString("fr-FR", {
                            day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                          })}
                        </p>
                        {n.type === "pin" && developerId && (
                          <button
                            onClick={(e) => handleCandidater(e, n)}
                            disabled={isApplied || applying === projectId}
                            className={cn(
                              "text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all flex items-center gap-1",
                              isApplied ? "cursor-default" : "btn-primary"
                            )}
                            style={isApplied ? {
                              background: "#FAF8F4",
                              color: "#1A2138",
                              border: "1px solid #ECE7DD",
                            } : { padding: "5px 10px", fontSize: 11 }}
                          >
                            {applying === projectId ? "..." : isApplied
                              ? <><Check size={11} /> Candidaté</>
                              : <>Candidater <ArrowRight size={11} /></>
                            }
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>,
    document.body
  ) : null;

  return (
    <div className="relative">
      <button
        ref={bellRef}
        onClick={handleOpen}
        className="btn-icon relative"
        aria-label="Notifications"
      >
        <Bell size={17} strokeWidth={1.8} />
        {unread > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center px-1 text-white font-bold rounded-full border-2 border-white"
            style={{ fontSize: 9, background: "var(--rose)", boxShadow: "0 2px 6px rgba(244,63,94,0.4)" }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {dropdown}
    </div>
  );
}
