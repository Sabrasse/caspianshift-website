// POST /api/match-creators — Creator Matcher tool.
// Queries the Creator & Media Notion DB for creators whose Genres overlap any
// of the user-selected genres, balanced across Low/Medium/High audience tiers.
// When NOTION_API_KEY is missing, returns an empty list and the frontend falls
// back to its in-page mock (mirrors the funding mock-mode invariant in CLAUDE.md).
//
// When the user fills the optional "Similar Game" field, we trigger the n8n
// discovery workflow (YouTube → Notion) and *await its completion* before
// querying the Creator & Media DB — so newly discovered creators surface in
// the same response. Discovery is capped at 8s so the whole handler stays
// under Netlify's default 10s function timeout; on timeout we proceed to the
// query regardless and the latest rows still surface on the next search.

import type { Handler } from "@netlify/functions";
import { MatchCreatorsSchema, zodError } from "./_shared/validate";
import { queryCreators, genrePageIdsFromNames, createMatcherRows } from "./_shared/notion";
import { ok, methodNotAllowed, log, rateLimit, clientIp, parseJson } from "./_shared/http";

const DEFAULT_LIMIT = 6;
const DISCOVERY_MAX_N = 3;
const DISCOVERY_TIMEOUT_MS = 8000;

async function triggerCreatorDiscovery(opts: {
  similarGame: string;
  genres: string[];
}): Promise<{ ok: boolean; status: string; ms: number }> {
  const url = process.env.N8N_CREATOR_DISCOVERY_WEBHOOK_URL;
  const started = Date.now();
  if (!url) return { ok: false, status: "no-webhook-url", ms: 0 };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        similarGame: opts.similarGame,
        genres: opts.genres,
        maxN: DISCOVERY_MAX_N,
      }),
      signal: controller.signal,
    });
    return { ok: res.ok, status: `http-${res.status}`, ms: Date.now() - started };
  } catch (e: any) {
    return {
      ok: false,
      status: e?.name === "AbortError" ? "timeout" : (e?.message || "error"),
      ms: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed(["POST"]);
  const ip = clientIp(event);
  if (!rateLimit(ip, 60, 60 * 60 * 1000)) {
    return { statusCode: 429, body: JSON.stringify({ error: "Too many searches, try again later." }) };
  }
  const body = parseJson(event.body);
  const parsed = MatchCreatorsSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const t0 = Date.now();
  const genrePageIds = await genrePageIdsFromNames(parsed.data.genres);
  const similar = (parsed.data.similarGame || "").trim();

  // Kick off the Game Case Studies write in parallel with the discovery →
  // query chain; it's an independent best-effort side effect.
  const matcherWrite = createMatcherRows({
    gameName: parsed.data.gameName,
    genrePageIds,
    similarGame: parsed.data.similarGame,
  });

  // Await discovery before querying so any new rows n8n writes during this
  // call appear in the result set. Discovery failure (timeout, missing URL,
  // workflow error) never blocks the query.
  const discovery = similar
    ? await triggerCreatorDiscovery({ similarGame: similar, genres: parsed.data.genres })
    : { ok: false, status: "skipped-no-similar-game", ms: 0 };

  const creators = await queryCreators({ genrePageIds, limit: DEFAULT_LIMIT });
  const written = await matcherWrite;

  log("match-creators", {
    gameName: parsed.data.gameName,
    genreCount: parsed.data.genres.length,
    resolvedGenres: genrePageIds.length,
    hasSimilarGame: !!similar,
    matched: creators.length,
    rowsCreated: written.pageIds.length,
    discovery: discovery.status,
    discoveryMs: discovery.ms,
    ms: Date.now() - t0,
  });

  return ok({ ok: true, creators });
};
