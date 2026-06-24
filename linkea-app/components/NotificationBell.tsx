"use client";

import { useEffect, useState } from "react";
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
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [developerId, setDeveloperId] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());

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

  return (
    <div className="relative">
      <button
        onClick={handleOpen}
        className="btn-icon relative"
        aria-label="Notifications"
      >
        <Bell size={17} strokeWidth={1.8} />
        {unread > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center px-1 text-white font-bold rounded-full border-2 border-white"
            style={{
              fontSize: 9,
              background: "var(--rose)",
              boxShadow: "0 2px 6px rgba(244,63,94,0.4)",
            }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-11 w-[320px] rounded-2xl overflow-hidden z-40"
            style={{
              background: "#ffffff",
              border: "1px solid rgba(0,0,0,0.09)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)",
            }}
          >
            {/* Header */}
            <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
              <p className="font-bold text-sm" style={{ color: "var(--text)" }}>Notifications</p>
            </div>

            {notifs.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell size={24} strokeWidth={1.5} className="mx-auto mb-2" style={{ color: "var(--subtle)" }} />
                <p className="text-sm" style={{ color: "var(--muted)" }}>Aucune notification</p>
              </div>
            ) : (
              <div className="max-h-[360px] overflow-y-auto">
                {notifs.map((n) => {
                  const projectId = n.type === "pin" ? n.link?.split("/projets/")[1] : null;
                  const isApplied = projectId ? applied.has(projectId) : false;
                  return (
                    <div
                      key={n.id}
                      onClick={() => handleClick(n)}
                      className={cn(
                        "px-4 py-3 cursor-pointer transition-colors",
                        !n.read
                          ? "bg-[rgba(244,63,94,0.04)]"
                          : "hover:bg-[rgba(0,0,0,0.02)]"
                      )}
                      style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}
                    >
                      <div className="flex items-start gap-2.5">
                        {/* Dot unread */}
                        <span
                          className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: !n.read ? "var(--rose)" : "transparent" }}
                        />
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-sm font-semibold leading-snug"
                            style={{ color: !n.read ? "var(--rose-hover)" : "var(--text)" }}
                          >
                            {n.title}
                          </p>
                          {n.body && (
                            <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--muted)" }}>
                              {n.body}
                            </p>
                          )}
                          <div className="flex items-center justify-between mt-1.5 gap-2">
                            <p className="text-[11px]" style={{ color: "var(--subtle)" }}>
                              {new Date(n.created_at).toLocaleDateString("fr-FR", {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                            {n.type === "pin" && developerId && (
                              <button
                                onClick={(e) => handleCandidater(e, n)}
                                disabled={isApplied || applying === projectId}
                                className={cn(
                                  "text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all flex items-center gap-1",
                                  isApplied
                                    ? "cursor-default"
                                    : "btn-primary"
                                )}
                                style={isApplied ? {
                                  background: "var(--green-soft)",
                                  color: "var(--green)",
                                  border: "1px solid var(--green-border)",
                                } : { padding: "5px 10px", fontSize: 11 }}
                              >
                                {applying === projectId ? (
                                  "..."
                                ) : isApplied ? (
                                  <><Check size={11} /> Candidaté</>
                                ) : (
                                  <>Candidater <ArrowRight size={11} /></>
                                )}
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
        </>
      )}
    </div>
  );
}
