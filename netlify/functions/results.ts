// GET /api/results?id={submissionId}
// Polled every 2s by the loading screen.

import type { Handler } from "@netlify/functions";
import { getResults } from "./_shared/kv";
import { ok, methodNotAllowed, bad, log } from "./_shared/http";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed(["GET"]);
  const id = event.queryStringParameters?.id;
  if (!id) return bad("Missing id");
  const r = await getResults(id);
  if (!r) {
    log("results", { submissionId: id, status: "missing" });
    return ok({ status: "pending" });
  }
  if (r.status === "ready") log("results", { submissionId: id, status: "ready" });
  return ok(r);
};
