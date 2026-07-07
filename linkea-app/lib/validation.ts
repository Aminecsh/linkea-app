import { z } from "zod";
import { NextResponse } from "next/server";

export const uuid = z.string().uuid();

export const disputeCreateSchema = z.object({
  projectId: uuid,
  paymentId: uuid,
  devUserId: uuid,
  reason: z.string().trim().min(5, "Le motif doit contenir au moins 5 caractères.").max(1000),
});

export const disputeResolveSchema = z.object({
  disputeId: uuid,
  decision: z.enum(["dev", "founder"]),
  adminNote: z.string().trim().max(1000).nullable().optional(),
});

export const paymentReleaseSchema = z.object({
  projectId: uuid,
});

export const aiChatSchema = z.object({
  projectId: uuid.optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(4000),
      })
    )
    .min(1)
    .max(40),
});

export const aiMatchingSchema = z.object({
  projectId: uuid,
  devs: z
    .array(
      z.object({
        id: uuid,
        nom: z.string().max(200),
        competences: z.array(z.string().max(100)).max(50).optional(),
        ecole: z.string().max(200).optional(),
        dispo_heures_semaine: z.number().min(0).max(168).optional(),
        score: z.number().min(0).max(5).optional(),
        reviewCount: z.number().min(0).optional(),
      })
    )
    .min(1)
    .max(50),
});

export const aiRoadmapSchema = z.object({
  projectId: uuid,
});

export const aiFicheSchema = z.object({
  idee: z.string().trim().min(10, "Décris ton idée en au moins 10 caractères.").max(1000),
  stack: z.string().trim().max(300).optional(),
  deadline: z.string().trim().max(100).optional(),
});

export const aiHealthSchema = z.object({
  projectId: uuid,
});

export function validationError(error: z.ZodError) {
  return NextResponse.json(
    { error: "Données invalides", details: error.issues.map((i) => i.message) },
    { status: 400 }
  );
}
