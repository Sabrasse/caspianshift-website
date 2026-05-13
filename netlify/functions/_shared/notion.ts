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
  PublisherCard, GrantCard, BudgetBucket,
} from "./types";

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_DB_ID = process.env.NOTION_DB_ID || "34abb949947480b2b326c2fe922f384c";
const NOTION_PUBLISHER_DB_ID = process.env.NOTION_PUBLISHER_DB_ID || "325bb949947480c88dbbcb4216d897be";
const NOTION_GRANT_DB_ID = process.env.NOTION_GRANT_DB_ID || "325bb94994748004ad8ee4b6046f72cd";

let _client: Client | null = null;
function client(): Client | null {
  if (!NOTION_API_KEY) return null;
  if (_client) return _client;
  _client = new Client({ auth: NOTION_API_KEY });
  return _client;
}

export function isNotionEnabled(): boolean { return !!NOTION_API_KEY; }

/** Property names in the Game Case Studies DB — must match exactly. */
const P = {
  GameName:      "Game Name",
  StudioName:    "Studio Name",
  Status:        "Status",
  Genre:         "Genre",
  StudioSize:    "Developers",
  StudioCountry: "Studio Country",
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
const PUB = {
  Name:          "Publisher Name",
  Country:       "Country",
  Budget:        "Budget",
  Genre:         "Genre",
  ReleasedGames: "Released Games",
  TotalRevenue:  "Total Revenue",
  PitchLink:     "Pitch Link",
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
    const page = await c.pages.create({
      parent: { database_id: NOTION_DB_ID },
      properties: {
        [P.GameName]:    { title:        [{ text: { content: body.gameName } }] },
        [P.Status]:      { select:       { name: body.status } },
        [P.Genre]:       { multi_select: body.genre.map(name => ({ name })) },
        [P.ReleaseDate]: { date:         { start: body.releaseDate.length === 7 ? body.releaseDate + "-01" : body.releaseDate } },
        [P.SourceType]:  { select:       { name: "CS Pilot" } },
      } as any,
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
      [P.StudioCountry]: { select:      { name: body.studioCountry } },
      [P.FundingType]:   { multi_select: body.fundingType.map(name => ({ name })) },
    };
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
    return {
      pageId: notionPageId,
      gameName:      p[P.GameName]?.title?.[0]?.plain_text || "",
      status:        (p[P.Status]?.select?.name || "In Development") as GameStatus,
      genre:         (p[P.Genre]?.multi_select || []).map((g: any) => g.name),
      releaseDate:   p[P.ReleaseDate]?.date?.start || "",
      studioName:    p[P.StudioName]?.rich_text?.[0]?.plain_text || "",
      studioSize:    p[P.StudioSize]?.number || 1,
      studioCountry: p[P.StudioCountry]?.select?.name || "Other",
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
function pubFilters(opts: { country?: string; budgetBucket?: BudgetBucket; genres?: string[] }): any[] {
  const filters: any[] = [];
  if (opts.country)      filters.push({ property: PUB.Country, select: { equals: opts.country } });
  if (opts.budgetBucket) filters.push({ property: PUB.Budget,  select: { equals: opts.budgetBucket } });
  if (opts.genres && opts.genres.length) {
    // Match if the publisher's Genre multi-select contains ANY of the user's genres.
    filters.push({ or: opts.genres.map(g => ({ property: PUB.Genre, multi_select: { contains: g } })) });
  }
  return filters;
}

function rowToPublisherCard(page: any): PublisherCard {
  const p = page.properties || {};
  return {
    name:          p[PUB.Name]?.title?.[0]?.plain_text || "Untitled",
    country:       p[PUB.Country]?.select?.name || "",
    budget:        (p[PUB.Budget]?.select?.name || null) as BudgetBucket | null,
    genres:        (p[PUB.Genre]?.multi_select || []).map((g: any) => g.name),
    releasedGames: typeof p[PUB.ReleasedGames]?.number === "number" ? p[PUB.ReleasedGames].number : 0,
    totalRevenue:  typeof p[PUB.TotalRevenue]?.number === "number" ? p[PUB.TotalRevenue].number : 0,
    pitchLink:     p[PUB.PitchLink]?.url || null,
  };
}

export async function queryPublishers(opts: {
  country?: string;
  budgetBucket?: BudgetBucket;
  genres?: string[];
}): Promise<PublisherCard[]> {
  const c = client();
  if (!c) return [];
  const sorts = [{ property: PUB.TotalRevenue, direction: "descending" as const }];

  // Fallback chain: full → drop country → drop budget → drop genre (i.e. unfiltered top 3).
  const passes: Array<{ country?: string; budgetBucket?: BudgetBucket; genres?: string[] }> = [
    { country: opts.country,    budgetBucket: opts.budgetBucket, genres: opts.genres },
    {                           budgetBucket: opts.budgetBucket, genres: opts.genres },
    {                                                            genres: opts.genres },
    {},
  ];

  const seen = new Set<string>();
  const out: PublisherCard[] = [];

  for (const pass of passes) {
    if (out.length >= 3) break;
    const f = pubFilters(pass);
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
        out.push(rowToPublisherCard(page));
      }
    } catch (e: any) {
      console.error("[notion] queryPublishers pass failed", e?.message || e);
    }
  }
  return out.slice(0, 3);
}

// ─── Grants query (Funding Path · Grant) ────────────────────────────────
// Hard country filter (multi_select contains). Returns [] if no grant matches the country —
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

export async function queryGrants(opts: { country: string }): Promise<GrantCard[]> {
  const c = client();
  if (!c) return [];
  if (!opts.country) return [];
  try {
    const res: any = await c.databases.query({
      database_id: NOTION_GRANT_DB_ID,
      filter: {
        and: [
          { property: GRANT.Country, multi_select: { contains: opts.country } },
          { property: GRANT.Status,  select:       { does_not_equal: "Closed" } },
        ],
      },
      sorts: [{ property: GRANT.MaximumAmount, direction: "descending" }],
      page_size: 3,
    });
    return (res.results || []).slice(0, 3).map((page: any) => rowToGrantCard(page, opts.country));
  } catch (e: any) {
    console.error("[notion] queryGrants failed", e?.message || e);
    return [];
  }
}
