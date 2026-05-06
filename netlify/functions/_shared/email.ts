// Transactional email — Resend implementation.
// Env: EMAIL_API_KEY, EMAIL_FROM (e.g. hello@caspianshift.com).
// If EMAIL_API_KEY is missing, sendResults logs a warning and returns false (no-op).

import { Resend } from "resend";
import type { ResultsStored, NotionRow } from "./types";

const KEY = process.env.EMAIL_API_KEY;
const FROM = process.env.EMAIL_FROM || "Caspian Shift <hello@caspianshift.com>";

export function isEmailEnabled(): boolean { return !!KEY; }

export async function sendResults({
  to,
  row,
  results,
  pdfBuffer,
  resultsUrl,
}: {
  to: string;
  row: NotionRow;
  results: Extract<ResultsStored, { status: "ready" }>;
  pdfBuffer?: Buffer;
  resultsUrl: string;
}): Promise<{ ok: boolean; messageId?: string }> {
  if (!KEY) {
    console.warn("[email] EMAIL_API_KEY not set — skipping send to", to);
    return { ok: false };
  }
  const resend = new Resend(KEY);
  const subject = `Your Caspian Shift funding analysis: ${row.gameName}`;
  const html = renderEmailHtml({ row, results, resultsUrl });
  try {
    const r = await resend.emails.send({
      from: FROM,
      to: [to],
      subject,
      html,
      attachments: pdfBuffer ? [{ filename: `${row.gameName.replace(/[^a-z0-9]+/gi, "_")}_analysis.pdf`, content: pdfBuffer }] : undefined,
    });
    return { ok: !r.error, messageId: r.data?.id };
  } catch (e: any) {
    console.error("[email] send failed", e?.message || e);
    return { ok: false };
  }
}

function renderEmailHtml({ row, results, resultsUrl }: { row: NotionRow; results: Extract<ResultsStored, { status: "ready" }>; resultsUrl: string }) {
  const total = results.budget.total_usd.toLocaleString();
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(row.gameName)} — Funding Analysis</title></head>
<body style="font-family:Arial, Helvetica, sans-serif;background:#0D0112;color:#FAF0CA;margin:0;padding:0;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
    <h1 style="font-family:Georgia,serif;color:#fff;margin:0 0 8px;">${escapeHtml(row.gameName)}</h1>
    <div style="color:rgba(250,240,202,.6);font-size:13px;margin-bottom:24px;">Caspian Shift · Funding Analysis · ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
    <div style="border:2px solid #17BEBB;padding:20px;margin-bottom:16px;background:rgba(23,190,187,0.05);">
      <div style="color:#17BEBB;font-size:11px;text-transform:uppercase;letter-spacing:.18em;margin-bottom:6px;">Total revised budget</div>
      <div style="font-size:28px;color:#fff;font-weight:700;">$${total}</div>
    </div>
    <div style="border:2px solid #FC7A1E;padding:20px;margin-bottom:16px;background:rgba(252,122,30,0.05);">
      <div style="color:#FC7A1E;font-size:11px;text-transform:uppercase;letter-spacing:.18em;margin-bottom:6px;">Confidence</div>
      <div style="font-size:18px;color:#fff;font-weight:700;">${escapeHtml(results.revenue.confidence)}</div>
    </div>
    <p style="line-height:1.6;color:rgba(250,240,202,.85);font-size:15px;">${escapeHtml(results.edge.biggest_gap)}</p>
    <p style="line-height:1.6;color:rgba(250,240,202,.85);font-size:15px;">${escapeHtml(results.edge.rationale)}</p>
    <p style="line-height:1.6;color:rgba(250,240,202,.85);font-size:15px;">${escapeHtml(results.edge.closing_paragraph)}</p>
    <div style="margin:32px 0;text-align:center;">
      <a href="${escapeHtml(resultsUrl)}" style="background:#D52941;color:#fff;text-decoration:none;padding:12px 28px;border-radius:999px;font-weight:700;display:inline-block;">View full analysis →</a>
    </div>
    <div style="border-top:1px solid rgba(23,190,187,.18);padding-top:16px;color:rgba(250,240,202,.4);font-size:12px;">
      Caspian Shift · <a href="https://caspianshift.com" style="color:#17BEBB;">caspianshift.com</a><br>
      You're receiving this because you requested an emailed copy from the Budget Tool. We won't add you to any mailing list — this is the only message we'll send unless you reach out.
    </div>
  </div>
</body></html>`;
}
function escapeHtml(s: string) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"} as any)[c]); }
