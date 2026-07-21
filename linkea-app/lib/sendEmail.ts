import { supabase } from "@/lib/supabase";

export async function sendEmail(type: string, to: string, data: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  await fetch("/api/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ type, to, data }),
  });
}
