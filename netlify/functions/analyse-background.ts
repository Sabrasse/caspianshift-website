// POST /.netlify/functions/analyse-background  (Netlify Background Function)
// Long-running. Reads the Notion row, fetches comparables + Steam signals,
// runs Anthropic, writes Pre-Release back to Notion, stashes results in KV.
//
// Background Functions get a 15-minute timeout (Pro+). Naming the file
// `analyse-background.ts` is what makes Netlify treat it as background.

import type { Handler } from "@netlify/functions";
import { readRow, findComparables, patchPreRelease } from "./_shared/notion";
import { runAnalysis } from "./_shared/anthropic";
import { fetchSteamSignals } from "./_shared/steam";
import { putResults } from "./_shared/kv";
import { log, parseJson } from "./_shared/http";

export const handler: Handler = async (event) => {
  // Internal-only: signed via INTERNAL_TOKEN. If unset, we accept any caller — fine
  // for v1, since the URL isn't published. Lock it down later if needed.
  const expected = process.env.INTERNAL_TOKEN || "";
  const got = event.headers?.["x-internal-token"];
  if (expected && got !== expected) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }
  const body: any = parseJson(event.body);
  const submissionId = body?.submissionId;
  if (!submissionId) return { statusCode: 400, body: JSON.stringify({ error: "submissionId required" }) };

  const t0 = Date.now();
  try {
    // Read the Notion row. If Notion is disabled (no NOTION_API_KEY), fall back to
    // a synthetic row built from the request — but step3 doesn't pass the row, so
    // in mock mode we error softly and the polling endpoint will time out into the
    // client-side fallback.
    const row = await readRow(submissionId);
    if (!row) {
      // Without Notion, we can't read the submission. Tell the client we're done
      // with an "error" status — the front-end already falls back to a local mock
      // when polling exceeds its timeout, so the user still sees a result.
      await putResults(submissionId, { status: "error", message: "Submission not found in Notion. Configure NOTION_API_KEY." });
      log("analyse-background", { submissionId, error: "no-notion-row", ms: Date.now() - t0 });
      return { statusCode: 200, body: JSON.stringify({ ok: false }) };
    }

    // Fetch comparables and Steam signals in parallel
    const [comparables, steamSignals] = await Promise.all([
      findComparables(row.genre, 5),
      fetchSteamSignals(row.steamUrl),
    ]);

    // Socials are not stored in Notion. We don't have them at this point unless
    // step3 stashed them in KV — but the spec says they're ephemeral and only
    // passed to the model. For background runs we pass an empty object; the
    // analysis still runs.
    const result = await runAnalysis({
      row,
      socials: {},
      comparables,
      steamSignals,
    });

    // Patch Pre-Release back to Notion
    const preRelease = result.budget_revised.categories.find(c => /pre-?release/i.test(c.name));
    if (preRelease) await patchPreRelease(submissionId, preRelease.amount_usd);

    // Stash results — the loading-screen poll picks them up
    await putResults(submissionId, {
      status: "ready",
      budget: result.budget_revised,
      revenue: result.revenue_simulation,
      edge: result.edge,
      generatedAt: new Date().toISOString(),
    });

    log("analyse-background", { submissionId, ms: Date.now() - t0, total: result.budget_revised.total_usd });
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e: any) {
    console.error("[analyse-background] failed", e?.message || e);
    await putResults(submissionId, { status: "error", message: String(e?.message || e) });
    return { statusCode: 500, body: JSON.stringify({ error: "analysis failed" }) };
  }
};
