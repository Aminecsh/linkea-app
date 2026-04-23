"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    async function checkUnread() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: roleData } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      const role = roleData?.role;
      if (!role || role === "admin") return;

      let convQuery;
      if (role === "founder") {
        const { data: p } = await supabase.from("profiles_founder").select("id").eq("user_id", user.id).maybeSingle();
        if (!p) return;
        convQuery = await supabase.from("conversations").select("id").eq("founder_id", p.id);
      } else {
        const { data: p } = await supabase.from("profiles_developer").select("id").eq("user_id", user.id).maybeSingle();
        if (!p) return;
        convQuery = await supabase.from("conversations").select("id").eq("developer_id", p.id);
      }

      const convIds = convQuery?.data?.map((c: { id: string }) => c.id) ?? [];
      if (convIds.length === 0) return;

      // Vérifie si des messages non lus existent
      let total = 0;
      for (const convId of convIds) {
        const lastRead = localStorage.getItem(`lastRead_${convId}`) ?? "1970-01-01";
        const { count } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("conversation_id", convId)
          .neq("sender_id", user.id)
          .gt("created_at", lastRead);
        total += count ?? 0;
      }
      setUnreadCount(total);
    }

    checkUnread();
  }, [pathname]);

  const tabs = [
    { label: "Projets",    icon: "🔍", href: "/projets" },
    { label: "Messages",   icon: "💬", href: "/messages" },
    { label: "Mon profil", icon: "👤", href: "/profil" },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50">
      <div className="max-w-3xl mx-auto flex">
        {tabs.map((tab) => {
          const active = pathname.startsWith(tab.href);
          const showBadge = tab.href === "/messages" && unreadCount > 0 && !pathname.startsWith("/messages");
          return (
            <button
              key={tab.href}
              onClick={() => router.push(tab.href)}
              className="flex-1 flex flex-col items-center gap-1 py-3 transition-colors relative"
              style={{ color: active ? "#ec4899" : "#94a3b8" }}
            >
              <span className="text-xl relative">
                {tab.icon}
                {showBadge && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-pink-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 border border-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </span>
              <span className="text-xs font-semibold">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
