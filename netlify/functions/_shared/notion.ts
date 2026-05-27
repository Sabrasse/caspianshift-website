// Notion wrapper — Game Case Studies (writes + reads).
//
// Env:
//   NOTION_API_KEY  — internal-integration token
//   NOTION_DB_ID    — Game Case Studies (default kept for back-compat)
//
// If NOTION_API_KEY is missing, every operation is a no-op that returns null —
// the rest of the pipeline keeps working in mock mode (handy for local dev).

import { Client } from "@notionhq/client";
import type {
  Step1Body, Step2Body, Step3Body,
  NotionRow, GameStatus, FundingType,
  PublisherCard, GrantCard, CrowdfundingCard, BudgetBucket,
} from "./types";

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_DB_ID = process.env.NOTION_DB_ID || "34abb949947480b2b326c2fe922f384c";
const NOTION_PUBLISHER_DB_ID = process.env.NOTION_PUBLISHER_DB_ID || "325bb949947480c88dbbcb4216d897be";
const NOTION_GRANT_DB_ID = process.env.NOTION_GRANT_DB_ID || "325bb94994748004ad8ee4b6046f72cd";
const NOTION_CROWDFUNDING_DB_ID = process.env.NOTION_CROWDFUNDING_DB_ID || "325bb94994748051918ec544fbf138df";
const NOTION_COUNTRY_DB_ID = process.env.NOTION_COUNTRY_DB_ID || "360bb949947480b0aa44fffa53e67e8a";
const NOTION_GENRE_DB_ID = process.env.NOTION_GENRE_DB_ID || "805403bd7be34a859cfee44634dec9ff";

let _client: Client | null = null;
function client(): Client | null {
  if (!NOTION_API_KEY) return null;
  if (_client) return _client;
  _client = new Client({ auth: NOTION_API_KEY });
  return _client;
}

export function isNotionEnabled(): boolean { return !!NOTION_API_KEY; }

// ─── Country DB (shared relation target) ────────────────────────────────
// The Game Case Studies / Publishers / Grants DBs all link to this single
// Countries DB via a relation property named "Country". We cache the name↔id
// map at module scope: warm invocations reuse it; cold starts pay a one-time
// paginated query. Lookups are case-insensitive with a small alias table to
// absorb the legacy short-form names ("USA", "UK", …).
const COUNTRY_ALIASES: Record<string, string[]> = {
  "United States":  ["USA", "US"],
  "United Kingdom": ["UK"],
  "Czechia":        ["Czech", "Czech Republic"],
};
let _countryByName: Map<string, string> | null = null;  // lowercased name → page id
let _countryById:   Map<string, string> | null = null;  // page id → canonical name
let _countryLoad:   Promise<void> | null = null;

async function ensureCountryMaps(c: Client): Promise<void> {
  if (_countryByName && _countryById) return;
  if (_countryLoad) return _countryLoad;
  _countryLoad = (async () => {
    const byName = new Map<string, string>();
    const byId   = new Map<string, string>();
    let cursor: string | undefined = undefined;
    let failed = false;
    try {
      do {
        const res: any = await c.databases.query({
          database_id: NOTION_COUNTRY_DB_ID,
          ...(cursor ? { start_cursor: cursor } : {}),
          page_size: 100,
        });
        for (const page of (res.results || [])) {
          const props = page.properties || {};
          let title = "";
          for (const k of Object.keys(props)) {
            if (props[k]?.type === "title") {
              title = props[k]?.title?.[0]?.plain_text || "";
              break;
            }
          }
          if (!title) continue;
          byName.set(title.toLowerCase(), page.id);
          byId.set(page.id, title);
        }
        cursor = res.has_more ? res.next_cursor : undefined;
      } while (cursor);
    } catch (e: any) {
      failed = true;
      const code = e?.code || e?.status || "unknown";
      console.error(
        `[notion] ensureCountryMaps failed (${code}): ${e?.message || e}. ` +
        `Check that the Countries DB (${NOTION_COUNTRY_DB_ID}) is shared with the integration.`,
      );
    }
    _countryByName = byName;
    _countryById   = byId;
    if (!failed) {
      console.log(`[notion] ensureCountryMaps: loaded ${byName.size} countries`);
    }
  })();
  return _countryLoad;
}

async function countryPageIdByName(c: Client, name: string): Promise<string | null> {
  if (!name) return null;
  await ensureCountryMaps(c);
  const direct = _countryByName?.get(name.toLowerCase());
  if (direct) return direct;
  for (const alias of (COUNTRY_ALIASES[name] || [])) {
    const hit = _countryByName?.get(alias.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

async function countryNameById(c: Client, id: string): Promise<string> {
  if (!id) return "";
  await ensureCountryMaps(c);
  return _countryById?.get(id) ?? "";
}

// ─── Genres DB (shared relation target) ─────────────────────────────────
// Game Case Studies / Publishers / Crowdfunding all link to the Genres DB via
// a relation property named "Genres". Same caching pattern as Countries: cold
// start pays a one-time paginated query, warm invocations reuse the maps.
let _genreByName: Map<string, string> | null = null;  // lowercased name → page id
let _genreById:   Map<string, string> | null = null;  // page id → canonical name
let _genreLoad:   Promise<void> | null = null;

async function ensureGenreMaps(c: Client): Promise<void> {
  if (_genreByName && _genreById) return;
  if (_genreLoad) return _genreLoad;
  _genreLoad = (async () => {
    const byName = new Map<string, string>();
    const byId   = new Map<string, string>();
    let cursor: string | undefined = undefined;
    let failed = false;
    try {
      do {
        const res: any = await c.databases.query({
          database_id: NOTION_GENRE_DB_ID,
          ...(cursor ? { start_cursor: cursor } : {}),
          page_size: 100,
        });
        for (const page of (res.results || [])) {
          const props = page.properties || {};
          let title = "";
          for (const k of Object.keys(props)) {
            if (props[k]?.type === "title") {
              title = props[k]?.title?.[0]?.plain_text || "";
              break;
            }
          }
          if (!title) continue;
          byName.set(title.toLowerCase(), page.id);
          byId.set(page.id, title);
        }
        cursor = res.has_more ? res.next_cursor : undefined;
      } while (cursor);
    } catch (e: any) {
      failed = true;
      const code = e?.code || e?.status || "unknown";
      console.error(
        `[notion] ensureGenreMaps failed (${code}): ${e?.message || e}. ` +
        `Check that the Genres DB (${NOTION_GENRE_DB_ID}) is shared with the integration.`,
      );
    }
    _genreByName = byName;
    _genreById   = byId;
    if (!failed) {
      console.log(`[notion] ensureGenreMaps: loaded ${byName.size} genres`);
    }
  })();
  return _genreLoad;
}

async function genrePageIdByName(c: Client, name: string): Promise<string | null> {
  if (!name) return null;
  await ensureGenreMaps(c);
  return _genreByName?.get(name.toLowerCase()) ?? null;
}

/** All genre names from the Genres DB, alphabetically. [] in mock mode. */
export async function listGenres(): Promise<string[]> {
  const c = client();
  if (!c) return [];
  await ensureGenreMaps(c);
  return Array.from(_genreById?.values() ?? []).sort((a, b) => a.localeCompare(b));
}

// Auto-discover the property name on `sourceDbId` whose type is "relation" and
// whose target database is `targetDbId`. Cached per source DB so renames in
// Notion self-heal on the next cold start (no code change required).
const _relPropCache = new Map<string, string | null>();   // key: sourceDbId|targetDbId
function _normId(s: string): string { return (s || "").replace(/-/g, "").toLowerCase(); }

async function findRelationPropName(c: Client, sourceDbId: string, targetDbId: string): Promise<string | null> {
  const key = `${_normId(sourceDbId)}|${_normId(targetDbId)}`;
  if (_relPropCache.has(key)) return _relPropCache.get(key)!;
  try {
    const db: any = await c.databases.retrieve({ database_id: sourceDbId });
    const props = db?.properties || {};
    const targetNorm = _normId(targetDbId);
    for (const [name, prop] of Object.entries<any>(props)) {
      if (prop?.type !== "relation") continue;
      const rdb = _normId(prop?.relation?.database_id || "");
      if (rdb === targetNorm) {
        _relPropCache.set(key, name);
        console.log(`[notion] resolved relation prop on ${sourceDbId} → "${name}" (target ${targetDbId})`);
        return name;
      }
    }
    console.error(
      `[notion] no relation property targeting ${targetDbId} found on ${sourceDbId}. ` +
      `Available: ${Object.keys(props).join(", ")}`,
    );
    _relPropCache.set(key, null);
    return null;
  } catch (e: any) {
    console.error(`[notion] findRelationPropName failed for ${sourceDbId}`, e?.message || e);
    return null;
  }
}

/** Property names in the Game Case Studies DB — must match exactly. */
// Note: the Genres property name is resolved via findRelationPropName(NOTION_DB_ID,
// NOTION_GENRE_DB_ID) — the user has renamed it once already, so we no longer hardcode.
const P = {
  GameName:      "Game Name",
  StudioName:    "Studio Name",
  Status:        "Status",
  StudioSize:    "Developers",
  StudioCountry: "Country",
  ReleaseDate:   "Release Date",
  FundingType:   "Funding Type",
  SteamUrl:      "Steam Page URL",
  DevTime:       "Dev Time (months)",
  DevQa:         "Dev and QA Budget",
  Art:           "Art Budget",
  Music:         "Music Budget",
  Loc:           "Localization Budget",
  Marketing:     "Marketing Budget",
  Overhead:      "Overhead Budget",
  PreRelease:    "Pre-Release Budget",
  SourceType:    "Source Type",
};

/** Property names in the Publishers DB — must match exactly. */
// Same caveat as `P`: the Genres relation prop is resolved at runtime via
// findRelationPropName(NOTION_PUBLISHER_DB_ID, NOTION_GENRE_DB_ID).
const PUB = {
  Name:          "Publisher Name",
  Country:       "Country",
  Budget:        "Budget",
  ReleasedGames: "Released Games",
  TotalRevenue:  "Total Revenue",
  PitchLink:     "Pitch Link",
};

/** Property names in the Crowdfunding DB — must match exactly. */
// Genres relation prop is resolved at runtime via findRelationPropName.
const CROWD = {
  Name:         "Game Name",
  RaisedAmount: "Raised Amount",    // number, USD
  Backers:      "Backers",          // number
  CampaignUrl:  "Campaign URL",     // url
};

/** Property names in the Grants DB — must match exactly. */
const GRANT = {
  Name:                "Grant Name",
  Country:             "Country",          // multi_select
  Type:                "Type",             // select: Grant | Award | Tax Credit | Repayable Advance
  ApplicationCadence:  "Application Cadence", // select: Annual | Quarterly | One-off | Rolling
  Link:                "Link",
  Status:              "Status",           // select: Active | Closed | Upcoming
  MaximumAmount:       "Maximum Amount",   // number, used for sort
};

// ─── Step 1: create the Notion row, return its page id ──────────────────
export async function createStep1Row(body: Step1Body): Promise<{ notionPageId: string | null }> {
  const c = client();
  if (!c) {
    console.warn("[notion] NOTION_API_KEY not set — no row created");
    return { notionPageId: null };
  }
  try {
    await ensureGenreMaps(c);
    const genreRelations: Array<{ id: string }> = [];
    const missing: string[] = [];
    for (const name of body.genre) {
      const id = await genrePageIdByName(c, name);
      if (id) genreRelations.push({ id });
      else missing.push(name);
    }
    if (missing.length) {
      const dbSize = _genreByName?.size ?? 0;
      console.warn(
        `[notion] createStep1Row: genres ${JSON.stringify(missing)} not found in Genres DB ` +
        `(${dbSize} entries loaded) — skipping`,
      );
    }
    const genreProp = await findRelationPropName(c, NOTION_DB_ID, NOTION_GENRE_DB_ID);
    const properties: any = {
      [P.GameName]:    { title:       [{ text: { content: body.gameName } }] },
      [P.Status]:      { select:      { name: body.status } },
      [P.ReleaseDate]: { date:        { start: body.releaseDate.length === 7 ? body.releaseDate + "-01" : body.releaseDate } },
      [P.SourceType]:  { select:      { name: "CS Pilot" } },
    };
    if (genreProp) properties[genreProp] = { relation: genreRelations };
    const page = await c.pages.create({
      parent: { database_id: NOTION_DB_ID },
      properties,
    });
    return { notionPageId: page.id };
  } catch (e: any) {
    console.error("[notion] createStep1Row failed", e?.message || e);
    return { notionPageId: null };
  }
}


// ─── Step 2: PATCH studio fields by page id ─────────────────────────────
export async function patchStep2(body: Step2Body): Promise<boolean> {
  const c = client();
  if (!c) return false;
  try {
    const props: any = {
      [P.StudioName]:    { rich_text:   [{ text: { content: body.studioName } }] },
      [P.StudioSize]:    { number:      body.studioSize },
      [P.FundingType]:   { multi_select: body.fundingType.map(name => ({ name })) },
    };
    const countryId = await countryPageIdByName(c, body.studioCountry);
    if (countryId) {
      props[P.StudioCountry] = { relation: [{ id: countryId }] };
    } else if (body.studioCountry) {
      const dbSize = _countryByName?.size ?? 0;
      console.warn(
        `[notion] patchStep2: country "${body.studioCountry}" not found in Countries DB ` +
        `(${dbSize} entries loaded) — leaving relation empty`,
      );
    }
    if (body.steamPageUrl) props[P.SteamUrl] = { url: body.steamPageUrl };
    await c.pages.update({ page_id: body.notionPageId, properties: props });
    return true;
  } catch (e: any) {
    console.error("[notion] patchStep2 failed", e?.message || e);
    return false;
  }
}

// ─── Step 3: PATCH budget fields + Pre-Release Budget total ─────────────
export async function patchStep3(body: Step3Body, preReleaseTotal: number): Promise<boolean> {
  const c = client();
  if (!c) return false;
  const props: any = {
    [P.DevTime]:    { number: body.devTimeMonths },
    [P.PreRelease]: { number: preReleaseTotal },
  };
  if (body.devQaBudget != null)        props[P.DevQa]     = { number: body.devQaBudget };
  if (body.artBudget != null)          props[P.Art]       = { number: body.artBudget };
  if (body.musicBudget != null)        props[P.Music]     = { number: body.musicBudget };
  if (body.localizationBudget != null) props[P.Loc]       = { number: body.localizationBudget };
  if (body.marketingBudget != null)    props[P.Marketing] = { number: body.marketingBudget };
  if (body.overheadBudget != null)     props[P.Overhead]  = { number: body.overheadBudget };
  try {
    await c.pages.update({ page_id: body.notionPageId, properties: props });
    return true;
  } catch (e: any) {
    console.error("[notion] patchStep3 failed", e?.message || e);
    return false;
  }
}

// ─── Read the row (used by /api/results to render) ──────────────────────
export async function readRow(notionPageId: string): Promise<NotionRow | null> {
  const c = client();
  if (!c) return null;
  try {
    const page: any = await c.pages.retrieve({ page_id: notionPageId });
    const p = page.properties || {};
    const countryRel = (p[P.StudioCountry]?.relation || []) as Array<{ id: string }>;
    const countryPageId = countryRel[0]?.id || "";
    const countryName = countryPageId ? await countryNameById(c, countryPageId) : "";
    const genreProp = await findRelationPropName(c, NOTION_DB_ID, NOTION_GENRE_DB_ID);
    const genreRel = (genreProp ? (p[genreProp]?.relation || []) : []) as Array<{ id: string }>;
    const genrePageIds = genreRel.map(r => r.id).filter(Boolean);
    if (genrePageIds.length) await ensureGenreMaps(c);
    const genre = genrePageIds.map(id => _genreById?.get(id) || "").filter(Boolean);
    return {
      pageId: notionPageId,
      gameName:      p[P.GameName]?.title?.[0]?.plain_text || "",
      status:        (p[P.Status]?.select?.name || "In Development") as GameStatus,
      genre,
      genrePageIds: genrePageIds.length ? genrePageIds : undefined,
      releaseDate:   p[P.ReleaseDate]?.date?.start || "",
      studioName:    p[P.StudioName]?.rich_text?.[0]?.plain_text || "",
      studioSize:    p[P.StudioSize]?.number || 1,
      studioCountry: countryName || "Other",
      studioCountryPageId: countryPageId || undefined,
      fundingType:   ((p[P.FundingType]?.multi_select || []).map((g: any) => g.name)) as FundingType[],
      steamPageUrl:  p[P.SteamUrl]?.url ?? undefined,
      devTimeMonths:      p[P.DevTime]?.number ?? undefined,
      devQaBudget:        p[P.DevQa]?.number ?? undefined,
      artBudget:          p[P.Art]?.number ?? undefined,
      musicBudget:        p[P.Music]?.number ?? undefined,
      localizationBudget: p[P.Loc]?.number ?? undefined,
      marketingBudget:    p[P.Marketing]?.number ?? undefined,
      overheadBudget:     p[P.Overhead]?.number ?? undefined,
      preReleaseBudget:   p[P.PreRelease]?.number ?? undefined,
    };
  } catch (e: any) {
    console.error("[notion] readRow failed", e?.message || e);
    return null;
  }
}

// ─── Publishers query (Funding Path · Publisher) ────────────────────────
// Fallback chain when fewer than 3 results match all three criteria:
// drop Country first, then Budget, then Genre. Sorted by Total Revenue desc
// so the most established publishers surface first.
function pubFilters(opts: { countryPageId?: string; budgetBucket?: BudgetBucket; genrePageIds?: string[]; genresProp?: string | null }): any[] {
  const filters: any[] = [];
  if (opts.countryPageId) filters.push({ property: PUB.Country, relation: { contains: opts.countryPageId } });
  if (opts.budgetBucket)  filters.push({ property: PUB.Budget,  select:   { equals:   opts.budgetBucket } });
  if (opts.genresProp && opts.genrePageIds && opts.genrePageIds.length) {
    // Match if the publisher's Genres relation contains ANY of the user's genre page ids.
    filters.push({ or: opts.genrePageIds.map(id => ({ property: opts.genresProp!, relation: { contains: id } })) });
  }
  return filters;
}

function rowToPublisherCard(page: any, genresProp: string | null): PublisherCard {
  const p = page.properties || {};
  const countryRel = (p[PUB.Country]?.relation || []) as Array<{ id: string }>;
  const firstCountryId = countryRel[0]?.id || "";
  const genreRel = (genresProp ? (p[genresProp]?.relation || []) : []) as Array<{ id: string }>;
  return {
    name:          p[PUB.Name]?.title?.[0]?.plain_text || "Untitled",
    country:       firstCountryId ? (_countryById?.get(firstCountryId) || "") : "",
    budget:        (p[PUB.Budget]?.select?.name || null) as BudgetBucket | null,
    genres:        genreRel.map(r => _genreById?.get(r.id) || "").filter(Boolean),
    releasedGames: typeof p[PUB.ReleasedGames]?.number === "number" ? p[PUB.ReleasedGames].number : 0,
    totalRevenue:  typeof p[PUB.TotalRevenue]?.number === "number" ? p[PUB.TotalRevenue].number : 0,
    pitchLink:     p[PUB.PitchLink]?.url || null,
  };
}

export async function queryPublishers(opts: {
  countryPageId?: string;
  budgetBucket?: BudgetBucket;
  genrePageIds?: string[];
}): Promise<PublisherCard[]> {
  const c = client();
  if (!c) return [];
  await ensureCountryMaps(c);
  await ensureGenreMaps(c);
  const genresProp = await findRelationPropName(c, NOTION_PUBLISHER_DB_ID, NOTION_GENRE_DB_ID);
  const sorts = [{ property: PUB.TotalRevenue, direction: "descending" as const }];

  // Fallback chain: full → drop country → drop budget → drop genre (i.e. unfiltered top 3).
  const passes: Array<{ countryPageId?: string; budgetBucket?: BudgetBucket; genrePageIds?: string[] }> = [
    { countryPageId: opts.countryPageId, budgetBucket: opts.budgetBucket, genrePageIds: opts.genrePageIds },
    {                                    budgetBucket: opts.budgetBucket, genrePageIds: opts.genrePageIds },
    {                                                                     genrePageIds: opts.genrePageIds },
    {},
  ];

  const seen = new Set<string>();
  const out: PublisherCard[] = [];

  for (const pass of passes) {
    if (out.length >= 3) break;
    const f = pubFilters({ ...pass, genresProp });
    const filter = f.length === 0 ? undefined : (f.length === 1 ? f[0] : { and: f });
    try {
      const res: any = await c.databases.query({
        database_id: NOTION_PUBLISHER_DB_ID,
        ...(filter ? { filter } : {}),
        sorts,
        page_size: 10,
      });
      for (const page of (res.results || [])) {
        if (out.length >= 3) break;
        if (seen.has(page.id)) continue;
        seen.add(page.id);
        out.push(rowToPublisherCard(page, genresProp));
      }
    } catch (e: any) {
      console.error("[notion] queryPublishers pass failed", e?.message || e);
    }
  }
  return out.slice(0, 3);
}

// ─── Grants query (Funding Path · Grant) ────────────────────────────────
// Hard country filter (relation contains). Returns [] if no grant matches the country —
// the frontend hides the whole section in that case. Sorted by Maximum Amount desc so
// the largest grants surface first; Status != Closed to skip retired programs.
function rowToGrantCard(page: any, country: string): GrantCard {
  const p = page.properties || {};
  return {
    name:               p[GRANT.Name]?.title?.[0]?.plain_text || "Untitled",
    country,
    type:               p[GRANT.Type]?.select?.name || null,
    applicationCadence: p[GRANT.ApplicationCadence]?.select?.name || null,
    link:               p[GRANT.Link]?.url || null,
  };
}

export async function queryGrants(opts: { countryPageId: string }): Promise<GrantCard[]> {
  const c = client();
  if (!c) return [];
  if (!opts.countryPageId) return [];
  await ensureCountryMaps(c);
  const countryDisplay = _countryById?.get(opts.countryPageId) || "";
  try {
    const res: any = await c.databases.query({
      database_id: NOTION_GRANT_DB_ID,
      filter: {
        and: [
          { property: GRANT.Country, relation: { contains: opts.countryPageId } },
          { property: GRANT.Status,  select:   { does_not_equal: "Closed" } },
        ],
      },
      sorts: [{ property: GRANT.MaximumAmount, direction: "descending" }],
      page_size: 3,
    });
    return (res.results || []).slice(0, 3).map((page: any) => rowToGrantCard(page, countryDisplay));
  } catch (e: any) {
    console.error("[notion] queryGrants failed", e?.message || e);
    return [];
  }
}

// ─── Crowdfunding query (Funding Path · Crowdfunding) ───────────────────
// Filter: genre relation contains ANY of the user's genres. Sorted by Raised
// Amount desc so the largest comparable campaigns surface first. Fallback to
// unfiltered top 3 when fewer than 3 genre-matched results.
// Read CROWD.Name regardless of whether it's the page title or a rich_text column.
// If neither yields text, fall back to whichever property is the actual title (only
// one per DB) so we never render "Untitled" when a name does exist somewhere.
function readGameName(p: any): string {
  const named = p[CROWD.Name];
  const fromNamed =
    named?.title?.[0]?.plain_text
    || named?.rich_text?.[0]?.plain_text
    || "";
  if (fromNamed) return fromNamed;
  for (const k of Object.keys(p)) {
    if (p[k]?.type === "title") {
      return p[k]?.title?.[0]?.plain_text || "";
    }
  }
  return "";
}

function rowToCrowdfundingCard(page: any, genresProp: string | null): CrowdfundingCard {
  const p = page.properties || {};
  const genreRel = (genresProp ? (p[genresProp]?.relation || []) : []) as Array<{ id: string }>;
  return {
    name:         readGameName(p) || "Untitled",
    genres:       genreRel.map(r => _genreById?.get(r.id) || "").filter(Boolean),
    raisedAmount: typeof p[CROWD.RaisedAmount]?.number === "number" ? p[CROWD.RaisedAmount].number : 0,
    backers:      typeof p[CROWD.Backers]?.number === "number" ? p[CROWD.Backers].number : 0,
    campaignUrl:  p[CROWD.CampaignUrl]?.url || null,
  };
}

export async function queryCrowdfunding(opts: {
  genrePageIds?: string[];
}): Promise<CrowdfundingCard[]> {
  const c = client();
  if (!c) return [];
  await ensureGenreMaps(c);
  const genresProp = await findRelationPropName(c, NOTION_CROWDFUNDING_DB_ID, NOTION_GENRE_DB_ID);
  const sorts = [{ property: CROWD.RaisedAmount, direction: "descending" as const }];

  // Fallback chain: genre-only → unfiltered top 3.
  const passes: Array<{ genrePageIds?: string[] }> = [
    { genrePageIds: opts.genrePageIds },
    {},
  ];

  const seen = new Set<string>();
  const out: CrowdfundingCard[] = [];

  for (const pass of passes) {
    if (out.length >= 3) break;
    const filter = (genresProp && pass.genrePageIds && pass.genrePageIds.length)
      ? { or: pass.genrePageIds.map(id => ({ property: genresProp, relation: { contains: id } })) }
      : undefined;
    try {
      const res: any = await c.databases.query({
        database_id: NOTION_CROWDFUNDING_DB_ID,
        ...(filter ? { filter } : {}),
        sorts,
        page_size: 10,
      });
      for (const page of (res.results || [])) {
        if (out.length >= 3) break;
        if (seen.has(page.id)) continue;
        seen.add(page.id);
        out.push(rowToCrowdfundingCard(page, genresProp));
      }
    } catch (e: any) {
      console.error("[notion] queryCrowdfunding pass failed", e?.message || e);
    }
  }
  return out.slice(0, 3);
}
