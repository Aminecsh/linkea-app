"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

type Notif = {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  project_id: string | null;
  created_at: string;
};

const TYPE_ICON: Record<string, string> = {
  task_status:   "✅",
  task_assigned: "📌",
  sprint_status: "🗓",
  default:       "🔔",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  return `il y a ${Math.floor(h / 24)}j`;
}

export default function NotifBell() {
  const [userId, setUserId] = useState<string | null>(null);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  // Load notifications
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => setNotifs((data as Notif[]) ?? []));
  }, [userId]);

  // Realtime subscription
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifs_${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          setNotifs((prev) => [payload.new as Notif, ...prev]);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  async function markAllRead() {
    if (!userId) return;
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    await supabase.from("notifications").update({ read: true }).eq("user_id", userId).eq("read", false);
  }

  async function handleClick(n: Notif) {
    if (!n.read) {
      setNotifs((prev) => prev.map((x) => x.id === n.id ? { ...x, read: true } : x));
      await supabase.from("notifications").update({ read: true }).eq("id", n.id);
    }
    setOpen(false);
    if (n.project_id) router.push(`/projets/${n.project_id}/gestion`);
  }

  const unread = notifs.filter((n) => !n.read).length;
  if (!userId) return null;

  return (
    <div ref={ref} className="fixed top-4 right-4 z-50">
      {/* Bell button */}
      <button
        onClick={() => { setOpen((v) => !v); if (!open && unread > 0) markAllRead(); }}
        className="relative w-10 h-10 rounded-2xl bg-white shadow-lg border border-slate-100 flex items-center justify-center hover:shadow-xl transition-shadow"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center px-1 rounded-full bg-rose-500 text-white font-bold border-2 border-white"
            style={{ fontSize: 9 }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-12 right-0 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden"
          style={{ animation: "fadeUp 150ms ease forwards" }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-bold text-slate-900">Notifications</p>
            {notifs.some((n) => !n.read) && (
              <button onClick={markAllRead} className="text-xs text-violet-600 hover:text-violet-700 font-medium">
                Tout marquer lu
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
            {notifs.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400">
                <p className="text-2xl mb-2">🔔</p>
                Aucune notification
              </div>
            ) : notifs.map((n) => (
              <button key={n.id} onClick={() => handleClick(n)}
                className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-slate-50 transition-colors ${!n.read ? "bg-violet-50/60" : ""}`}>
                <span className="text-lg shrink-0 mt-0.5">{TYPE_ICON[n.type] ?? TYPE_ICON.default}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold text-slate-900 truncate ${!n.read ? "font-bold" : ""}`}>{n.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{timeAgo(n.created_at)}</p>
                </div>
                {!n.read && <span className="w-2 h-2 rounded-full bg-violet-500 shrink-0 mt-1.5" />}
              </button>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  );
}
