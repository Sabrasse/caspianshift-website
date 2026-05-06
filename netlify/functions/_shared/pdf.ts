// PDF rendering — puppeteer-core + @sparticuz/chromium for Netlify serverless.
// Renders /budget?id={submissionId}&print=true into A4 portrait PDF.
//
// First cold start can take 4-8 seconds while Chromium unzips. Subsequent calls
// reuse the same Lambda warm container and run sub-second.

import type { ResultsStored, NotionRow } from "./types";

export async function renderResultsPdf({
  submissionId,
  resultsUrl,
}: {
  submissionId: string;
  resultsUrl: string;
}): Promise<Buffer | null> {
  let chromium: any, puppeteer: any;
  try {
    // Defer require so missing deps don't crash boot when running mock-only locally.
    chromium = (await import("@sparticuz/chromium")).default;
    puppeteer = (await import("puppeteer-core")).default;
  } catch (e: any) {
    console.warn("[pdf] puppeteer/chromium not installed — skipping PDF generation");
    return null;
  }

  let browser: any = null;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
    const page = await browser.newPage();
    // print=true triggers our print stylesheet (hides nav + CTAs, A4 layout)
    const url = resultsUrl.includes("?")
      ? `${resultsUrl}&print=true`
      : `${resultsUrl}?print=true`;
    await page.goto(url, { waitUntil: "networkidle0", timeout: 25000 });
    // Wait for results to render — they fetch from /api/results
    await page.waitForSelector(".cs-card", { timeout: 20000 });
    const buf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", right: "14mm", bottom: "16mm", left: "14mm" },
    });
    return Buffer.from(buf);
  } catch (e: any) {
    console.error("[pdf] render failed for", submissionId, e?.message || e);
    return null;
  } finally {
    if (browser) try { await browser.close(); } catch (_) { /* ignore */ }
  }
}
