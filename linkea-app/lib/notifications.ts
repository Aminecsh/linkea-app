import { supabase } from "./supabase";

export async function sendNotif({
  userId,
  projectId,
  type,
  title,
  body,
  link,
}: {
  userId: string;
  projectId?: string;
  type: string;
  title: string;
  body: string;
  link?: string;
}) {
  const { error } = await supabase.from("notifications").insert({
    user_id: userId,
    ...(projectId ? { project_id: projectId } : {}),
    type,
    title,
    body,
    ...(link ? { link } : {}),
  });
  if (error) console.error("[sendNotif]", error.message, { userId, type });
}
