import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkUsage, trackUsage, MONTHLY_TOKEN_LIMIT } from "@/lib/ai-usage";
import { githubSyncSchema, validationError } from "@/lib/validation";

type GithubCommit = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { name: string; date: string } | null;
  };
  author: { login: string } | null;
};

type CommitRow = {
  sha: string;
  message: string;
  author_name: string | null;
  author_login: string | null;
  url: string;
  committed_at: string;
  ai_summary: string | null;
};

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const token = authHeader.slice(7);

  const parsed = githubSyncSchema.safeParse(await req.json());
  if (!parsed.success) return validationError(parsed.error);
  const { projectId } = parsed.data;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { data: project } = await supabase
    .from("projects")
    .select("id, titre, description, github_repo")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
  if (!project.github_repo) return NextResponse.json({ error: "Aucun repo GitHub lié" }, { status: 400 });

  // 1. Dernier commit connu → ne récupérer que les nouveaux
  const { data: lastCommit } = await supabase
    .from("project_commits")
    .select("committed_at")
    .eq("project_id", projectId)
    .order("committed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const since = lastCommit?.committed_at
    ? new Date(new Date(lastCommit.committed_at).getTime() + 1000).toISOString()
    : undefined;

  const ghUrl = new URL(`https://api.github.com/repos/${project.github_repo}/commits`);
  ghUrl.searchParams.set("per_page", "30");
  if (since) ghUrl.searchParams.set("since", since);

  const ghHeaders: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) ghHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const ghRes = await fetch(ghUrl, { headers: ghHeaders });
  if (!ghRes.ok) {
    const msg = ghRes.status === 404
      ? "Repo introuvable — vérifie qu'il est public et que le nom est correct (owner/repo)."
      : `Erreur GitHub (${ghRes.status})`;
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const ghCommits = (await ghRes.json()) as GithubCommit[];

  const newRows: CommitRow[] = ghCommits
    .filter((c) => c.commit.author?.date)
    .map((c) => ({
      sha: c.sha,
      message: c.commit.message.split("\n")[0].slice(0, 500),
      author_name: c.commit.author?.name ?? null,
      author_login: c.author?.login ?? null,
      url: c.html_url,
      committed_at: c.commit.author!.date,
      ai_summary: null,
    }));

  // Traduit une liste de messages de commits en français simple (un seul appel groupé)
  async function translateCommits(messages: string[]): Promise<string[] | null> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || messages.length === 0) return null;
    const { ok } = await checkUsage(supabase, user!.id);
    if (!ok) return null;

    try {
      const anthropic = new Anthropic({ apiKey });
      const list = messages.map((m, i) => `${i}. ${m}`).join("\n");
      const prompt = `Voici des messages de commits Git techniques. Traduis chacun en une phrase simple en français, compréhensible par un client non-développeur (ex: "Ajout de l'authentification JWT" → "Mise en place de la connexion sécurisée des utilisateurs"). Réponds UNIQUEMENT en JSON valide : {"traductions": ["...", "..."]} dans le même ordre, sans texte avant ou après.

${list}`;

      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      });

      const content = response.content[0];
      const total = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
      if (total > 0) await trackUsage(supabase, user!.id, total);

      if (content.type !== "text") return null;
      const match = content.text.match(/\{[\s\S]*\}/);
      if (!match) return null;
      const { traductions } = JSON.parse(match[0]) as { traductions: string[] };
      return traductions;
    } catch (e) {
      console.error("[GitHub sync] traduction Linkeo échouée", e);
      return null;
    }
  }

  // 2. Traduction Linkeo des nouveaux commits (un seul appel pour tous), puis insertion
  if (newRows.length > 0) {
    const traductions = await translateCommits(newRows.map((r) => r.message));
    traductions?.forEach((t, i) => { if (newRows[i]) newRows[i].ai_summary = t; });

    await supabase.from("project_commits").upsert(
      newRows.map((r) => ({ project_id: projectId, ...r })),
      { onConflict: "project_id,sha" }
    );
  }

  // 2bis. Rattrapage des commits déjà stockés mais jamais traduits (ex: clé Anthropic ajoutée après coup)
  const { data: untranslated } = await supabase
    .from("project_commits")
    .select("id, message")
    .eq("project_id", projectId)
    .is("ai_summary", null)
    .limit(30);

  if (untranslated && untranslated.length > 0) {
    const traductions = await translateCommits(untranslated.map((c) => c.message));
    if (traductions) {
      await Promise.all(untranslated.map((c, i) =>
        traductions[i]
          ? supabase.from("project_commits").update({ ai_summary: traductions[i] }).eq("id", c.id)
          : Promise.resolve()
      ));
    }
  }

  // 3. Digest du jour (si des commits ont eu lieu aujourd'hui)
  const todayStr = new Date().toISOString().slice(0, 10);
  const { data: todayCommits } = await supabase
    .from("project_commits")
    .select("message, ai_summary, committed_at")
    .eq("project_id", projectId)
    .gte("committed_at", `${todayStr}T00:00:00.000Z`);

  let digest: { summary_fr: string; commit_count: number; digest_date: string } | null = null;

  if (todayCommits && todayCommits.length > 0) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const { ok } = await checkUsage(supabase, user.id);
    let summaryFr = `${todayCommits.length} commit${todayCommits.length > 1 ? "s" : ""} aujourd'hui sur le projet.`;

    if (apiKey && ok) {
      try {
        const anthropic = new Anthropic({ apiKey });
        const list = todayCommits.map((c) => `- ${c.ai_summary ?? c.message}`).join("\n");
        const prompt = `Résume ces changements de code effectués aujourd'hui sur le projet "${project.titre}", en 1 à 2 phrases simples en français pour un client non-développeur. Pas de jargon technique, pas de liste, juste un résumé fluide.

${list}`;
        const response = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 300,
          messages: [{ role: "user", content: prompt }],
        });
        const content = response.content[0];
        const total = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
        if (total > 0) await trackUsage(supabase, user.id, total);
        if (content.type === "text") summaryFr = content.text.trim();
      } catch (e) {
        console.error("[GitHub sync] digest échoué", e);
      }
    }

    digest = { summary_fr: summaryFr, commit_count: todayCommits.length, digest_date: todayStr };
    await supabase.from("project_activity_digests").upsert(
      { project_id: projectId, digest_date: todayStr, summary_fr: summaryFr, commit_count: todayCommits.length },
      { onConflict: "project_id,digest_date" }
    );
  } else {
    const { data: existingDigest } = await supabase
      .from("project_activity_digests")
      .select("summary_fr, commit_count, digest_date")
      .eq("project_id", projectId)
      .eq("digest_date", todayStr)
      .maybeSingle();
    if (existingDigest) digest = existingDigest;
  }

  const { data: recentCommits } = await supabase
    .from("project_commits")
    .select("sha, message, ai_summary, author_name, author_login, url, committed_at")
    .eq("project_id", projectId)
    .order("committed_at", { ascending: false })
    .limit(20);

  return NextResponse.json({
    commits: recentCommits ?? [],
    digest,
    synced: newRows.length,
  });
}
