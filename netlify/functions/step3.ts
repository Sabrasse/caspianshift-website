// POST /api/step3 — final step. Patches traction fields, computes Data Confidence,
// upserts comparable rows, then triggers /api/analyse-background and returns
// immediately so the loading screen can poll /api/results.

import type { Handler } from "@netlify/functions";
import { Step3Schema, zodError } from "./_shared/validate";
import { patchStep3, upsertComparable } from "./_shared/notion";
import { putResults } from "./_shared/kv";
import { ok, methodNotAllowed, log, rateLimit, clientIp, parseJson } from "./_shared/http";

function deriveConfidence(socials: Record<string, number | undefined>, wishlists?: number): "High" | "Medium" | "Low" {
  let signals = 0;
  if (wishlists && wishlists > 0) signals++;
  for (const k of Object.keys(socials || {})) {
    if ((socials[k] || 0) > 0) signals++;
    if (signals >= 4) break;
  }
  if (signals >= 3) return "High";
  if (signals >= 1) return "Medium";
  return "Low";
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed(["POST"]);
  const ip = clientIp(event);
  if (!rateLimit(ip, 5, 60 * 60 * 1000)) {
    return { statusCode: 429, body: JSON.stringify({ error: "Too many submissions, try again later." }) };
  }
  const body = parseJson(event.body);
  const parsed = Step3Schema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);
  const { submissionId, socials, currentWishlists, comparables } = parsed.data;
  const confidence = deriveConfidence(socials, currentWishlists);

  const t0 = Date.now();
  // Patch traction
  await patchStep3(submissionId, parsed.data, confidence);
  // Upsert comparables (don't block on failures)
  await Promise.allSettled((comparables || []).map(c => upsertComparable(c)));

  // Mark KV as pending so the polling endpoint has something to return
  await putResults(submissionId, { status: "pending" });

  // Kick off background analysis. We invoke it via a fetch to its own URL so
  // it runs in a separate Lambda — Netlify routes /.netlify/functions/foo to the
  // function regardless of where you fire from.
  const host = (event.headers?.host || "").toString();
  const protocol = host.includes("localhost") ? "http" : "https";
  const targetUrl = `${protocol}://${host}/.netlify/functions/analyse-background`;
  // Fire-and-forget — don't await the response
  fetch(targetUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-token": process.env.INTERNAL_TOKEN || "" },
    body: JSON.stringify({ submissionId }),
  }).catch(e => console.warn("[step3] could not kick off analyse-background:", e?.message || e));

  log("step3", { submissionId, confidence, comparables: (comparables || []).length, ms: Date.now() - t0 });
  return ok({ ok: true });
};
