// GET /api/caspian?fundingType=...&genre=...&country=...
// Returns up to 3 recommendation cards from the matching reference DB.
// publisher    → Publisher DB filtered by genre
// crowdfunding → Crowdfunding DB filtered by genre
// grant        → Grant DB filtered by country

import type { Handler } from "@netlify/functions";
import { CaspianQuerySchema, zodError } from "./_shared/validate";
import { queryCaspianCards } from "./_shared/notion";
import { ok, methodNotAllowed, log, rateLimit, clientIp } from "./_shared/http";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed(["GET"]);
  const ip = clientIp(event);
  if (!rateLimit(ip, 60, 60 * 60 * 1000)) {
    return { statusCode: 429, body: JSON.stringify({ error: "Too many requests" }) };
  }
  const parsed = CaspianQuerySchema.safeParse({
    fundingType: event.queryStringParameters?.fundingType,
    genre:       event.queryStringParameters?.genre,
    country:     event.queryStringParameters?.country,
  });
  if (!parsed.success) return zodError(parsed.error);

  const t0 = Date.now();
  const cards = await queryCaspianCards(parsed.data.fundingType, {
    genre: parsed.data.genre,
    country: parsed.data.country,
  });
  log("caspian", { fundingType: parsed.data.fundingType, count: cards.length, ms: Date.now() - t0 });
  return ok({ ok: true, cards });
};
