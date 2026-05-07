// POST /api/step1 — Game step.
// Creates the Notion row and returns its page id. Steps 2/3 PATCH that page id directly.

import type { Handler } from "@netlify/functions";
import { Step1Schema, zodError } from "./_shared/validate";
import { createStep1Row, createComparable } from "./_shared/notion";
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
  const { notionPageId } = await createStep1Row(parsed.data);
  if (parsed.data.similarGame) {
    // Don't block the response on the comparable row
    createComparable(parsed.data.similarGame).catch(() => { /* logged in helper */ });
  }
  log("step1", { notionPageId, gameName: parsed.data.gameName, ms: Date.now() - t0 });
  return ok({ ok: true, notionPageId });
};
