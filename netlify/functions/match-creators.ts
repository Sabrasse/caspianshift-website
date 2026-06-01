// POST /api/match-creators — Creator Matcher tool.
// Queries the Creator & Media Notion DB for creators whose Genres overlap any
// of the user-selected genres, sorted by Audience desc. When NOTION_API_KEY is
// missing, returns an empty list and the frontend falls back to its in-page
// mock (mirrors the funding mock-mode invariant in CLAUDE.md).

import type { Handler } from "@netlify/functions";
import { MatchCreatorsSchema, zodError } from "./_shared/validate";
import { queryCreators, genrePageIdsFromNames, createMatcherRows } from "./_shared/notion";
import { ok, methodNotAllowed, log, rateLimit, clientIp, parseJson } from "./_shared/http";

const DEFAULT_LIMIT = 6;

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
  // Query the creator DB and append the submission to Game Case Studies in
  // parallel. The write is best-effort — its failure must never block the
  // user-facing creator list from rendering.
  const [creators, written] = await Promise.all([
    queryCreators({ genrePageIds, limit: DEFAULT_LIMIT }),
    createMatcherRows({
      gameName: parsed.data.gameName,
      genrePageIds,
      similarGame: parsed.data.similarGame,
    }),
  ]);

  log("match-creators", {
    gameName: parsed.data.gameName,
    genreCount: parsed.data.genres.length,
    resolvedGenres: genrePageIds.length,
    hasSimilarGame: !!(parsed.data.similarGame || "").trim(),
    matched: creators.length,
    rowsCreated: written.pageIds.length,
    ms: Date.now() - t0,
  });

  return ok({ ok: true, creators });
};
