// POST /api/step3 — Budget step. PATCHes the row, writes Pre-Release Budget total.

import type { Handler } from "@netlify/functions";
import { Step3Schema, zodError } from "./_shared/validate";
import { patchStep3 } from "./_shared/notion";
import { ok, methodNotAllowed, log, rateLimit, clientIp, parseJson } from "./_shared/http";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed(["POST"]);
  const ip = clientIp(event);
  if (!rateLimit(ip, 60, 60 * 60 * 1000)) {
    return { statusCode: 429, body: JSON.stringify({ error: "Too many requests" }) };
  }
  const body = parseJson(event.body);
  const parsed = Step3Schema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);
  const d = parsed.data;

  // Pre-Release Budget = sum of user-provided line items (blank = 0). Per spec §4.
  const preReleaseTotal =
    (d.devQaBudget        || 0)
    + (d.artBudget        || 0)
    + (d.musicBudget      || 0)
    + (d.localizationBudget || 0)
    + (d.marketingBudget  || 0);

  const t0 = Date.now();
  const wrote = await patchStep3(d, preReleaseTotal);
  log("step3", { notionPageId: d.notionPageId, wrote, preReleaseTotal, ms: Date.now() - t0 });
  return ok({ ok: true });
};
