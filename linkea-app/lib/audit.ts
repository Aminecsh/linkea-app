import { supabase } from "@/lib/supabase";

export async function logAudit(userId: string, action: string, metadata?: Record<string, unknown>) {
  await supabase.from("audit_logs").insert({ user_id: userId, action, metadata }).throwOnError().catch(() => {});
}
