"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

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

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

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

  return (
    <div className="relative">
      <button
        onClick={handleOpen}
        className="relative w-10 h-10 flex items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:text-pink-500 hover:border-pink-300 transition-all"
      >
        <span className="text-lg">🔔</span>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-pink-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 border border-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl z-20 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="font-bold text-slate-900 text-sm">Notifications</p>
            </div>
            {notifs.length === 0 ? (
              <div className="px-4 py-8 text-center text-slate-400 text-sm">Aucune notification</div>
            ) : (
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
                {notifs.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={`px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors ${!n.read ? "bg-pink-50" : ""}`}
                  >
                    <p className={`text-sm font-semibold ${!n.read ? "text-pink-700" : "text-slate-900"}`}>{n.title}</p>
                    {n.body && <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{n.body}</p>}
                    <p className="text-xs text-slate-300 mt-1">
                      {new Date(n.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
