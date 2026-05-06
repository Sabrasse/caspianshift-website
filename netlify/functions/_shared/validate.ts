// Zod schemas for each request body. Reject early with human-readable errors.
import { z } from "zod";

export const Step1Schema = z.object({
  steamUrl: z.string().url().regex(/store\.steampowered\.com\/app\//i, "Steam URL must look like store.steampowered.com/app/...").optional(),
  gameName: z.string().min(1, "Game name is required").max(280),
  status: z.enum(["Concept","Prototype","Vertical Slice","Demo","In Development","Alpha","Beta"]),
  genre: z.array(z.string().min(1)).min(1, "Pick at least one genre").max(10),
  studioName: z.string().min(1, "Studio name is required").max(280),
  studioSize: z.number().int().min(1, "Studio size must be at least 1"),
  studioCountry: z.string().min(1),
  releaseDate: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, "Release date must be YYYY-MM or YYYY-MM-DD"),
  pricePoint: z.number().positive().max(100, "Price must be at most $100").optional(),
  fundingType: z.enum(["Self-Funded","Crowdfunding","Publisher","Grant"]),
});

export const Step2Schema = z.object({
  submissionId: z.string().min(1),
  devTimeMonths: z.number().int().min(1).max(160),
  devQaBudget: z.number().int().nonnegative().optional(),
  artBudget: z.number().int().nonnegative().optional(),
  musicBudget: z.number().int().nonnegative().optional(),
  localizationBudget: z.number().int().nonnegative().optional(),
  marketingBudget: z.number().int().nonnegative().optional(),
});

export const Step3Schema = z.object({
  submissionId: z.string().min(1),
  currentWishlists: z.number().int().nonnegative().optional(),
  socials: z.object({
    twitter: z.number().int().nonnegative().optional(),
    tiktok: z.number().int().nonnegative().optional(),
    youtube: z.number().int().nonnegative().optional(),
    discord: z.number().int().nonnegative().optional(),
    reddit: z.number().int().nonnegative().optional(),
  }).default({}),
  nextFestPlanned: z.boolean(),
  primaryMarketingChannel: z.string().optional(),
  comparables: z.array(z.object({
    gameName: z.string().min(1),
    steamUrl: z.string().url().optional(),
  })).max(3).default([]),
  // Honeypot — must be empty. Bots will fill it.
  _hp: z.string().max(0, "spam").optional(),
});

export const CaptureEmailSchema = z.object({
  submissionId: z.string().min(1),
  email: z.string().email("Invalid email address"),
});

/** Build a 400 JSON response from a ZodError. */
export function zodError(err: unknown): { statusCode: number; body: string; headers: Record<string, string> } {
  const issues = (err && typeof err === "object" && "issues" in (err as any) && Array.isArray((err as any).issues))
    ? (err as any).issues.map((i: any) => ({ path: i.path.join("."), message: i.message }))
    : [{ path: "", message: String(err) }];
  return {
    statusCode: 400,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ error: "ValidationError", issues }),
  };
}
