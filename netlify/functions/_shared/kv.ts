// Results KV store — Netlify Blobs.
// We stash the analysis result under submissionId so the loading screen can poll for it.
//
// Falls back to an in-memory Map if Netlify Blobs isn't available (e.g. running
// `netlify dev` without auth). This keeps local development working at the cost
// of losing data when the dev process restarts.

import { getStore } from "@netlify/blobs";
import type { ResultsStored } from "./types";

const STORE_NAME = "budget-results";
const TTL_DAYS = 14;

const memCache = new Map<string, { ts: number; value: ResultsStored }>();

export async function putResults(submissionId: string, value: ResultsStored): Promise<void> {
  try {
    const store = getStore(STORE_NAME);
    await store.setJSON(submissionId, value);
    return;
  } catch (e: any) {
    console.warn("[kv] Netlify Blobs unavailable — using in-memory cache.", e?.message || e);
  }
  memCache.set(submissionId, { ts: Date.now(), value });
}

export async function getResults(submissionId: string): Promise<ResultsStored | null> {
  try {
    const store = getStore(STORE_NAME);
    const v = await store.get(submissionId, { type: "json" });
    if (v) return v as ResultsStored;
  } catch (e: any) {
    console.warn("[kv] Netlify Blobs read failed — checking memory cache.", e?.message || e);
  }
  const mem = memCache.get(submissionId);
  if (mem) {
    if (Date.now() - mem.ts > TTL_DAYS * 24 * 60 * 60 * 1000) {
      memCache.delete(submissionId);
      return null;
    }
    return mem.value;
  }
  return null;
}
