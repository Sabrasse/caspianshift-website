// Tiny HTTP helpers shared by all functions.

const STD_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

export function ok(body: any, headers: Record<string, string> = {}) {
  return { statusCode: 200, headers: { ...STD_HEADERS, ...headers }, body: JSON.stringify(body) };
}
export function created(body: any) {
  return { statusCode: 201, headers: STD_HEADERS, body: JSON.stringify(body) };
}
export function bad(message: string, extras: any = {}) {
  return { statusCode: 400, headers: STD_HEADERS, body: JSON.stringify({ error: message, ...extras }) };
}
export function unauth() {
  return { statusCode: 401, headers: STD_HEADERS, body: JSON.stringify({ error: "Unauthorized" }) };
}
export function notFound(message = "Not found") {
  return { statusCode: 404, headers: STD_HEADERS, body: JSON.stringify({ error: message }) };
}
export function methodNotAllowed(allowed: string[]) {
  return { statusCode: 405, headers: { ...STD_HEADERS, Allow: allowed.join(", ") }, body: JSON.stringify({ error: "Method not allowed" }) };
}
export function serverError(message = "Internal error") {
  return { statusCode: 500, headers: STD_HEADERS, body: JSON.stringify({ error: message }) };
}

export function parseJson<T = any>(body: string | null | undefined): T | null {
  if (!body) return null;
  try { return JSON.parse(body) as T; } catch { return null; }
}

/** Structured log line. Don't include PII (no email; game name is OK). */
export function log(fn: string, fields: Record<string, any>) {
  console.log(JSON.stringify({ fn, ts: new Date().toISOString(), ...fields }));
}

// ── Rate limiter (per IP, in-memory). Sufficient for the v1 traffic profile.
//    For higher traffic, swap in Netlify Blobs or Upstash.
const buckets = new Map<string, { count: number; resetAt: number }>();
export function rateLimit(ip: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || now > b.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= max) return false;
  b.count++;
  return true;
}

/** Get caller IP from event headers. Netlify sets x-nf-client-connection-ip. */
export function clientIp(event: any): string {
  return (event?.headers?.["x-nf-client-connection-ip"]
    || event?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim()
    || event?.headers?.["client-ip"]
    || "unknown").toString();
}
