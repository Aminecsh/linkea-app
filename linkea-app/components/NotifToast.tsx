"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Notif = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  project_id: string | null;
  read: boolean;
  created_at: string;
};

type Toast = Notif & { visible: boolean };

const TYPE_ICON: Record<string, string> = {
  task_status:        "✅",
  task_assigned:      "📌",
  sprint_status:      "🗓",
  nouveau_message:    "💬",
  nouveau_candidat:   "🎉",
  candidature_acceptee: "🤝",
  candidature_refusee:  "📭",
  contrat_disponible: "📄",
  default:            "🔔",
};

const TYPE_COLOR: Record<string, string> = {
  task_status:          "border-l-green-400",
  task_assigned:        "border-l-violet-400",
  sprint_status:        "border-l-blue-400",
  nouveau_message:      "border-l-indigo-400",
  nouveau_candidat:     "border-l-amber-400",
  candidature_acceptee: "border-l-green-400",
  candidature_refusee:  "border-l-slate-300",
  contrat_disponible:   "border-l-violet-400",
  default:              "border-l-slate-300",
};

export default function NotifToast() {
  const [userId, setUserId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const shownIds = useRef<Set<string>>(new Set());
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  const showToast = useCallback((notif: Notif) => {
    if (shownIds.current.has(notif.id)) return;
    shownIds.current.add(notif.id);

    setToasts((prev) => [...prev, { ...notif, visible: false }]);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setToasts((prev) => prev.map((t) => t.id === notif.id ? { ...t, visible: true } : t));
      });
    });

    supabase.from("notifications").update({ read: true }).eq("id", notif.id);

    setTimeout(() => {
      setToasts((prev) => prev.map((t) => t.id === notif.id ? { ...t, visible: false } : t));
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== notif.id)), 400);
    }, 5000);
  }, []);

  // Fetch unread notifications from last 60s on mount
  useEffect(() => {
    if (!userId) return;
    const since = new Date(Date.now() - 60_000).toISOString();
    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .eq("read", false)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .then(({ data }) => (data ?? []).forEach((n) => showToast(n as Notif)));
  }, [userId, showToast]);

  // Realtime
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`toast_${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          const notif = payload.new as Notif;
          if (notif.user_id !== userId) return;
          showToast(notif);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, showToast]);

  function dismiss(id: string) {
    setToasts((prev) => prev.map((t) => t.id === id ? { ...t, visible: false } : t));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 400);
  }

  function navigate(t: Toast) {
    dismiss(t.id);
    const dest = t.link ?? (t.project_id ? `/projets/${t.project_id}/gestion` : null);
    if (dest) router.push(dest);
  }

  if (!toasts.length) return null;

  return (
    <>
      <style>{`
        @keyframes slideDown {
          from { opacity:0; transform:translateY(-110%) scale(0.95); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
        @keyframes slideUp {
          from { opacity:1; transform:translateY(0) scale(1); }
          to   { opacity:0; transform:translateY(-110%) scale(0.95); }
        }
        .toast-in  { animation: slideDown 320ms cubic-bezier(0.34,1.56,0.64,1) forwards; }
        .toast-out { animation: slideUp   320ms cubic-bezier(0.4,0,0.2,1) forwards; }
      `}</style>

      <div className="fixed top-4 left-0 right-0 z-[100] flex flex-col items-center gap-2 pointer-events-none px-4">
        {toasts.map((t) => {
          const color = TYPE_COLOR[t.type] ?? TYPE_COLOR.default;
          const clickable = !!(t.link || t.project_id);
          return (
            <div key={t.id} className={`${t.visible ? "toast-in" : "toast-out"} pointer-events-auto w-full max-w-sm`}>
              <div
                onClick={() => clickable && navigate(t)}
                className={`flex items-start gap-3 bg-white rounded-2xl shadow-2xl border border-slate-100 border-l-4 ${color} px-4 py-3 transition-transform ${clickable ? "cursor-pointer active:scale-[0.98]" : ""}`}
                style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.05)" }}
              >
                <span className="text-xl shrink-0 mt-0.5">{TYPE_ICON[t.type] ?? TYPE_ICON.default}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{t.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{t.body}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); dismiss(t.id); }}
                  className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors text-xs mt-0.5"
                >✕</button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
