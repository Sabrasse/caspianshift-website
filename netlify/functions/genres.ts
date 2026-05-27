// GET /api/genres — Returns the Genres DB rows as a flat list of names,
// alphabetically sorted, so the funding form's genre picker stays in sync
// with the Notion DB without re-deploying. Empty array in mock mode.

import type { Handler } from "@netlify/functions";
import { listGenres } from "./_shared/notion";
import { ok, methodNotAllowed, log } from "./_shared/http";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed(["GET"]);
  const t0 = Date.now();
  const genres = await listGenres();
  log("genres", { count: genres.length, ms: Date.now() - t0 });
  return ok({ genres });
};
