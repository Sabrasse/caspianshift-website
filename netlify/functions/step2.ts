// POST /api/step2 — PATCH the Notion row with budget fields.

import type { Handler } from "@netlify/functions";
import { Step2Schema, zodError } from "./_shared/validate";
import { patchStep2 } from "./_shared/notion";
import { ok, methodNotAllowed, log, rateLimit, clientIp, parseJson } from "./_shared/http";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed(["POST"]);
  const ip = clientIp(event);
  if (!rateLimit(ip, 60, 60 * 60 * 1000)) {
    return { statusCode: 429, body: JSON.stringify({ error: "Too many requests" }) };
  }
  const body = parseJson(event.body);
  const parsed = Step2Schema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);
  const t0 = Date.now();
  const wrote = await patchStep2(parsed.data.submissionId, parsed.data);
  log("step2", { submissionId: parsed.data.submissionId, wrote, ms: Date.now() - t0 });
  return ok({ ok: true });
};
