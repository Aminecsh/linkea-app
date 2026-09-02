import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

// Client service_role — utilisé uniquement côté test (setup/teardown), jamais exposé au navigateur.
// Playwright charge .env.local via playwright.config.ts avant que ce module ne soit importé.
// `realtime.transport` : Node 20 n'a pas de WebSocket natif (requis par @supabase/supabase-js
// même quand on n'utilise pas le realtime) — on lui fournit celui du package `ws`.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: WebSocket as never },
  }
);
