// POST /api/capture-email — opportunistic email capture from the results page.
// Patches Submission Email on the Notion row, renders the results into a PDF,
// and sends an HTML email + PDF attachment via Resend. Idempotent on
// (submissionId, email).

import type { Handler } from "@netlify/functions";
import { CaptureEmailSchema, zodError } from "./_shared/validate";
import { patchEmail, readRow } from "./_shared/notion";
import { sendResults } from "./_shared/email";
import { renderResultsPdf } from "./_shared/pdf";
import { getResults } from "./_shared/kv";
import { ok, bad, methodNotAllowed, log, rateLimit, clientIp, parseJson } from "./_shared/http";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed(["POST"]);
  const ip = clientIp(event);
  if (!rateLimit(ip, 20, 60 * 60 * 1000)) {
    return { statusCode: 429, body: JSON.stringify({ error: "Too many requests" }) };
  }
  const body = parseJson(event.body);
  const parsed = CaptureEmailSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);
  const { submissionId, email } = parsed.data;
  const t0 = Date.now();

  // PATCH the Notion row. (Logged but not in PII fields.)
  const wrote = await patchEmail(submissionId, email);

  // Pull row + cached results so the email can include a snapshot
  const [row, results] = await Promise.all([readRow(submissionId), getResults(submissionId)]);

  let pdfSent = false;
  if (row && results && results.status === "ready") {
    const host = (event.headers?.host || "caspianshift.com").toString();
    const protocol = host.includes("localhost") ? "http" : "https";
    const resultsUrl = `${protocol}://${host}/budget?id=${encodeURIComponent(submissionId)}`;
    let pdfBuffer: Buffer | null = null;
    try {
      pdfBuffer = await renderResultsPdf({ submissionId, resultsUrl });
    } catch (e: any) {
      console.warn("[capture-email] PDF render failed:", e?.message || e);
    }
    const sent = await sendResults({
      to: email,
      row,
      results,
      pdfBuffer: pdfBuffer || undefined,
      resultsUrl,
    });
    pdfSent = sent.ok;
  }

  log("capture-email", { submissionId, wroteNotion: wrote, sent: pdfSent, ms: Date.now() - t0 });
  // Don't expose whether the email was actually delivered — return ok regardless,
  // so attackers can't probe for valid submissionIds.
  return ok({ ok: true });
};
