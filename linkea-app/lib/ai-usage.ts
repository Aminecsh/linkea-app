import { SupabaseClient } from "@supabase/supabase-js";

export const MONTHLY_TOKEN_LIMIT = 100_000;

export function currentMonth() {
  return new Date().toISOString().slice(0, 7); // "2026-06"
}

export async function checkUsage(supabase: SupabaseClient, userId: string): Promise<{ ok: boolean; used: number }> {
  const { data } = await supabase
    .from("ai_usage")
    .select("tokens_used")
    .eq("user_id", userId)
    .eq("month", currentMonth())
    .maybeSingle();
  const used = data?.tokens_used ?? 0;
  return { ok: used < MONTHLY_TOKEN_LIMIT, used };
}

export async function trackUsage(supabase: SupabaseClient, userId: string, tokens: number) {
  const month = currentMonth();
  const { data: existing } = await supabase
    .from("ai_usage")
    .select("tokens_used")
    .eq("user_id", userId)
    .eq("month", month)
    .maybeSingle();

  const newTotal = (existing?.tokens_used ?? 0) + tokens;
  await supabase.from("ai_usage").upsert(
    { user_id: userId, month, tokens_used: newTotal },
    { onConflict: "user_id,month" }
  );
}
