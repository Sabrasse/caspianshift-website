// Zod schemas for each request body.
import { z } from "zod";

export const Step1Schema = z.object({
  gameName: z.string().min(1, "Game name is required").max(280),
  status: z.enum(["Concept","Prototype","Vertical Slice","Demo","In Development","Alpha","Beta"]),
  genre: z.array(z.string().min(1)).min(1, "Pick at least one genre").max(10),
  releaseDate: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, "Release date must be YYYY-MM or YYYY-MM-DD"),
  similarGame: z.string().min(1).max(280).optional(),
});

export const Step2Schema = z.object({
  notionPageId: z.string().min(1),
  studioName: z.string().min(1, "Studio name is required").max(280),
  studioSize: z.number().int().min(1, "Studio size must be at least 1"),
  studioCountry: z.string().min(1),
  fundingType: z.enum(["Self-Funded","Crowdfunding","Publisher","Grant"]),
});

export const Step3Schema = z.object({
  notionPageId: z.string().min(1),
  devTimeMonths: z.number().int().min(1).max(160),
  devQaBudget: z.number().int().nonnegative().optional(),
  artBudget: z.number().int().nonnegative().optional(),
  musicBudget: z.number().int().nonnegative().optional(),
  localizationBudget: z.number().int().nonnegative().optional(),
  marketingBudget: z.number().int().nonnegative().optional(),
});

export const ResultsQuerySchema = z.object({
  notionPageId: z.string().min(1),
});

export const CaspianQuerySchema = z.object({
  fundingType: z.enum(["Publisher","Crowdfunding","Grant"]),
  genre: z.string().min(1).optional(),
  country: z.string().min(1).optional(),
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
