"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  LayoutDashboard,
  Users,
  MessageCircle,
  Search,
  User,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import NotifToast from "@/components/NotifToast";

type Tab = {
  label: string;
  icon: React.ElementType;
  href: string;
};

export default function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);
  const [role, setRole] = useState<string | null>(null);
  const [isBanned, setIsBanned] = useState(false);

  useEffect(() => {
    async function checkUnread() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const now = new Date().toISOString();
      const { data: ban } = await supabase
        .from("bans").select("id").eq("user_id", user.id).eq("is_active", true)
        .or(`expires_at.is.null,expires_at.gt.${now}`).limit(1).maybeSingle();
      if (ban) {
        setIsBanned(true);
        if (!pathname.startsWith("/messages") && !pathname.startsWith("/support")) {
          router.push("/messages");
        }
        return;
      }

      const { data: roleData } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      const r = roleData?.role;
      setRole(r ?? null);
      if (!r || r === "admin") return;

      let convQuery;
      if (r === "founder") {
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

  if (role === "admin") return null;

  if (isBanned) {
    return (
      <div
        className="fixed bottom-0 left-0 right-0 z-50"
        style={{
          background: "rgba(242,242,247,0.85)",
          backdropFilter: "blur(32px) saturate(200%)",
          WebkitBackdropFilter: "blur(32px) saturate(200%)",
          borderTop: "1px solid rgba(244,63,94,0.15)",
          boxShadow: "0 -4px 24px rgba(244,63,94,0.08)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div className="max-w-lg mx-auto flex items-stretch h-[60px]">
          <button
            onClick={() => router.push("/messages")}
            className="flex-1 flex flex-col items-center justify-center gap-[3px] transition-all duration-200"
          >
            <MessageCircle size={22} strokeWidth={2.2} style={{ color: "var(--rose)" }} />
            <span className="text-[10px] font-semibold tracking-tight" style={{ color: "var(--rose)" }}>
              Support
            </span>
          </button>
          <button
            onClick={async () => { await supabase.auth.signOut(); router.push("/connexion"); }}
            className="flex-1 flex flex-col items-center justify-center gap-[3px] transition-all duration-200 opacity-50 hover:opacity-80"
          >
            <LogOut size={20} strokeWidth={2} style={{ color: "var(--text)" }} />
            <span className="text-[10px] font-semibold tracking-tight" style={{ color: "var(--muted)" }}>
              Déconnexion
            </span>
          </button>
        </div>
      </div>
    );
  }

  const tabs: Tab[] = role === "founder"
    ? [
        { label: "Projets",  icon: LayoutDashboard, href: "/profil"   },
        { label: "Devs",     icon: Users,           href: "/devs"     },
        { label: "Messages", icon: MessageCircle,   href: "/messages" },
      ]
    : [
        { label: "Projets",  icon: Search,          href: "/projets"  },
        { label: "Messages", icon: MessageCircle,   href: "/messages" },
        { label: "Profil",   icon: User,            href: "/profil"   },
      ];

  return (
    <>
      <NotifToast />
    <div
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{
        background: "rgba(242,242,247,0.85)",
        backdropFilter: "blur(32px) saturate(200%)",
        WebkitBackdropFilter: "blur(32px) saturate(200%)",
        borderTop: "1px solid rgba(0,0,0,0.06)",
        boxShadow: "0 -4px 24px rgba(0,0,0,0.06)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div className="max-w-lg mx-auto flex items-stretch h-[60px]">
        {tabs.map((tab) => {
          const active = pathname.startsWith(tab.href);
          const showBadge = tab.href === "/messages" && unreadCount > 0 && !pathname.startsWith("/messages");
          const Icon = tab.icon;

          return (
            <button
              key={tab.href}
              onClick={() => router.push(tab.href)}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-[3px] transition-all duration-200 relative",
                active ? "opacity-100" : "opacity-40 hover:opacity-60"
              )}
            >
              <span className="relative">
                <Icon
                  size={22}
                  strokeWidth={active ? 2.2 : 1.8}
                  style={{ color: active ? "var(--rose)" : "var(--text)" }}
                  className="transition-all duration-200"
                />
                {showBadge && (
                  <span
                    className="absolute -top-1 -right-1.5 min-w-[16px] h-4 flex items-center justify-center px-1 text-white font-bold rounded-full border-2 border-white"
                    style={{
                      fontSize: 9,
                      background: "var(--rose)",
                      boxShadow: "0 2px 6px rgba(244,63,94,0.4)",
                    }}
                  >
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </span>
              <span
                className="text-[10px] font-semibold tracking-tight transition-all duration-200"
                style={{ color: active ? "var(--rose)" : "var(--muted)" }}
              >
                {tab.label}
              </span>
              {active && (
                <span
                  className="absolute top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                  style={{ background: "var(--rose)" }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
    </>
  );
}
