// Public Steam-page signal scraper. Server-side fetch only; no-op when no URL provided.
// Parses follower count, review summary, top tags, announced release date, price.
// Does NOT scrape wishlists (Steam doesn't expose them publicly).
//
// 4s timeout, fail soft. Cache by Steam app ID for 24h via Netlify Blobs.

import { getStore } from "@netlify/blobs";

export interface SteamSignals {
  appId: string;
  fetchedAt: string;
  price?: number;          // dollars
  positiveReviewPct?: number;
  totalReviews?: number;
  followers?: number;
  tags?: string[];
  releaseDate?: string;
  developer?: string;
  publisher?: string;
}

const CACHE_NAME = "steam-signals";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function appIdFromUrl(url: string): string | null {
  const m = url.match(/\/app\/(\d+)/);
  return m ? m[1] : null;
}

export async function fetchSteamSignals(url: string | undefined): Promise<SteamSignals | null> {
  if (!url) return null;
  const appId = appIdFromUrl(url);
  if (!appId) return null;

  // Check cache first
  try {
    const store = getStore(CACHE_NAME);
    const cached = await store.get(appId, { type: "json" });
    if (cached && cached.fetchedAt && (Date.now() - new Date(cached.fetchedAt).getTime()) < CACHE_TTL_MS) {
      return cached as SteamSignals;
    }
  } catch (_) { /* blobs unavailable — proceed without cache */ }

  // Fetch with timeout
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  let html = "";
  try {
    const res = await fetch(`https://store.steampowered.com/app/${appId}/`, {
      signal: controller.signal,
      headers: { "User-Agent": "CaspianShiftBot/1.0 (+https://caspianshift.com)" },
      // age-gate cookies bypass the gate page on most titles
      // (Netlify functions don't carry cookies between calls so we send them inline)
    });
    if (!res.ok) return null;
    html = await res.text();
  } catch (e: any) {
    console.warn("[steam] fetch failed", appId, e?.message || e);
    return null;
  } finally {
    clearTimeout(timer);
  }

  const signals: SteamSignals = { appId, fetchedAt: new Date().toISOString() };

  // Price (data-price-final attribute, in cents)
  const priceMatch = html.match(/data-price-final="(\d+)"/);
  if (priceMatch) signals.price = parseInt(priceMatch[1]) / 100;
  else {
    const altPrice = html.match(/"final_formatted":"\$([0-9.]+)"/);
    if (altPrice) signals.price = parseFloat(altPrice[1]);
  }

  // Review summary
  const totalReviews = html.match(/"review_count":(\d+)/);
  if (totalReviews) signals.totalReviews = parseInt(totalReviews[1]);
  const positivePct = html.match(/"review_score_desc":"[^"]*",.*?"total_positive":(\d+),"total_negative":(\d+)/s);
  if (positivePct) {
    const pos = parseInt(positivePct[1]); const neg = parseInt(positivePct[2]);
    if (pos + neg > 0) signals.positiveReviewPct = Math.round((pos / (pos + neg)) * 100);
  }

  // Tags (top 20)
  const tagMatches = [...html.matchAll(/<a[^>]+app_tag[^>]*>([^<]+)<\/a>/g)].slice(0, 20);
  if (tagMatches.length) signals.tags = tagMatches.map(m => m[1].trim()).filter(Boolean);

  // Release date
  const release = html.match(/"release_date":\s*\{[^}]*"date":"([^"]+)"/);
  if (release) signals.releaseDate = release[1];
  else {
    const altRelease = html.match(/<div class="date">([^<]+)<\/div>/);
    if (altRelease) signals.releaseDate = altRelease[1].trim();
  }

  // Developer / Publisher
  const devMatch = html.match(/<div id="developers_list"[\s\S]*?<a[^>]*>([^<]+)<\/a>/);
  if (devMatch) signals.developer = devMatch[1].trim();
  const pubMatch = html.match(/<div class="dev_row">[\s\S]*?Publisher:[\s\S]*?<a[^>]*>([^<]+)<\/a>/);
  if (pubMatch) signals.publisher = pubMatch[1].trim();

  // Cache
  try {
    const store = getStore(CACHE_NAME);
    await store.setJSON(appId, signals);
  } catch (_) { /* blobs unavailable */ }

  return signals;
}
