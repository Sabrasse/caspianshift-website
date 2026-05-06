// POST /api/step1
// Validates Step 1 body, creates a new Notion row tagged Source Type=CS Pilot,
// returns a stable submissionId for the rest of the wizard.

import type { Handler } from "@netlify/functions";
import { Step1Schema, zodError } from "./_shared/validate";
import { createStep1Row } from "./_shared/notion";
import { ok, methodNotAllowed, log, rateLimit, clientIp, parseJson } from "./_shared/http";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed(["POST"]);
  const ip = clientIp(event);
  if (!rateLimit(ip, 30, 60 * 60 * 1000)) {
    return { statusCode: 429, body: JSON.stringify({ error: "Too many submissions, try again later." }) };
  }
  const body = parseJson(event.body);
  const parsed = Step1Schema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);
  const t0 = Date.now();
  const { submissionId, notionPageId } = await createStep1Row(parsed.data);
  log("step1", { submissionId, notion: !!notionPageId, gameName: parsed.data.gameName, ms: Date.now() - t0 });
  return ok({ submissionId, notionPageId });
};
