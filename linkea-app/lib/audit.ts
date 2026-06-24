import { supabase } from "@/lib/supabase";

export type AuditAction =
  | "login"
  | "logout"
  | "password_change"
  | "2fa_enabled"
  | "2fa_disabled"
  | "account_deleted"
  | "report_submitted"
  | "ban_applied"
  | "ban_lifted"
  | "data_exported"
  | "profile_updated";

export async function logAudit(
  userId: string,
  action: AuditAction,
  meta?: Record<string, unknown>
) {
  // fire-and-forget — ne bloque jamais l'action principale
  supabase.from("audit_logs").insert({
    user_id: userId,
    action,
    metadata: meta ?? {},
  }).then(({ error }) => {
    if (error) console.warn("[audit]", action, error.message);
  });
}
