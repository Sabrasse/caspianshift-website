// Notion wrapper — Game Case Studies (writes) + Publisher / Crowdfunding / Grant (reads).
//
// Env:
//   NOTION_API_KEY              — internal-integration token
//   NOTION_DB_ID                — Game Case Studies (default kept for back-compat)
//   NOTION_PUBLISHER_DB_ID      — Publisher recommendations DB
//   NOTION_CROWDFUNDING_DB_ID   — Crowdfunding recommendations DB
//   NOTION_GRANT_DB_ID          — Grant recommendations DB
//
// If NOTION_API_KEY is missing, every operation is a no-op that returns null/empty —
// the rest of the pipeline keeps working in mock mode (handy for local dev).

import { Client } from "@notionhq/client";
import type {
  Step1Body, Step2Body, Step3Body,
  NotionRow, GameStatus, FundingType,
  CaspianCard, CaspianFundingType,
} from "./types";

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_DB_ID = process.env.NOTION_DB_ID || "34abb949947480b2b326c2fe922f384c";
const NOTION_PUBLISHER_DB_ID    = process.env.NOTION_PUBLISHER_DB_ID || "";
const NOTION_CROWDFUNDING_DB_ID = process.env.NOTION_CROWDFUNDING_DB_ID || "";
const NOTION_GRANT_DB_ID        = process.env.NOTION_GRANT_DB_ID || "";

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
  StudioSize:    "Studio Size",
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
  PreRelease:    "Pre-Release Budget",
  SourceType:    "Source Type",
};

/** Property names on the three reference DBs. */
const R = {
  Publisher:    { title: "Publisher Name",    amount: "Total Revenue",        filter: "Genre" },
  Crowdfunding: { title: "Crowdfunding Name", amount: "Raised Amount",        filter: "Genre" },
  Grant:        { title: "Grant Name",        amount: "Maximum Grant Amount", filter: "Country" },
} as const;

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

// ─── Step 1: create a comparable row for "Similar Game" if provided ─────
export async function createComparable(gameName: string): Promise<void> {
  const c = client();
  if (!c) return;
  const name = gameName.trim();
  if (!name) return;
  try {
    // Don't duplicate if a row with this title already exists
    const existing: any = await c.databases.query({
      database_id: NOTION_DB_ID,
      filter: { property: P.GameName, title: { equals: name } },
      page_size: 1,
    });
    if (existing.results.length) return;
    await c.pages.create({
      parent: { database_id: NOTION_DB_ID },
      properties: {
        [P.GameName]:   { title: [{ text: { content: name } }] },
        [P.SourceType]: { select: { name: "CS Pilot" } },
      } as any,
    });
  } catch (e: any) {
    console.error("[notion] createComparable failed", e?.message || e);
  }
}

// ─── Step 2: PATCH studio fields by page id ─────────────────────────────
export async function patchStep2(body: Step2Body): Promise<boolean> {
  const c = client();
  if (!c) return false;
  try {
    await c.pages.update({
      page_id: body.notionPageId,
      properties: {
        [P.StudioName]:    { rich_text:   [{ text: { content: body.studioName } }] },
        [P.StudioSize]:    { number:      body.studioSize },
        [P.StudioCountry]: { select:      { name: body.studioCountry } },
        [P.FundingType]:   { select:      { name: body.fundingType } },
      } as any,
    });
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
      fundingType:   (p[P.FundingType]?.select?.name || "Self-Funded") as FundingType,
      devTimeMonths:      p[P.DevTime]?.number ?? undefined,
      devQaBudget:        p[P.DevQa]?.number ?? undefined,
      artBudget:          p[P.Art]?.number ?? undefined,
      musicBudget:        p[P.Music]?.number ?? undefined,
      localizationBudget: p[P.Loc]?.number ?? undefined,
      marketingBudget:    p[P.Marketing]?.number ?? undefined,
      preReleaseBudget:   p[P.PreRelease]?.number ?? undefined,
    };
  } catch (e: any) {
    console.error("[notion] readRow failed", e?.message || e);
    return null;
  }
}

// ─── Caspian Shift recommendation cards ─────────────────────────────────
function dbConfigFor(fundingType: CaspianFundingType): { id: string; props: typeof R.Publisher } | null {
  if (fundingType === "Publisher")    return NOTION_PUBLISHER_DB_ID    ? { id: NOTION_PUBLISHER_DB_ID,    props: R.Publisher }    : null;
  if (fundingType === "Crowdfunding") return NOTION_CROWDFUNDING_DB_ID ? { id: NOTION_CROWDFUNDING_DB_ID, props: R.Crowdfunding } : null;
  if (fundingType === "Grant")        return NOTION_GRANT_DB_ID        ? { id: NOTION_GRANT_DB_ID,        props: R.Grant }        : null;
  return null;
}

function formatAmountDescription(fundingType: CaspianFundingType, amount: number | null | undefined): string {
  if (amount == null) {
    if (fundingType === "Publisher")    return "Active publisher";
    if (fundingType === "Crowdfunding") return "Past campaign";
    return "Active grant program";
  }
  const human =
    amount >= 1_000_000 ? `$${(amount / 1_000_000).toFixed(amount >= 10_000_000 ? 0 : 1)}M`
    : amount >= 1_000   ? `$${Math.round(amount / 1_000)}K`
    : `$${amount.toLocaleString()}`;
  if (fundingType === "Publisher")    return `${human} lifetime revenue`;
  if (fundingType === "Crowdfunding") return `${human} raised`;
  return `Up to ${human}`;
}

export async function queryCaspianCards(
  fundingType: CaspianFundingType,
  opts: { genre?: string; country?: string },
): Promise<CaspianCard[]> {
  const c = client();
  if (!c) return [];
  const cfg = dbConfigFor(fundingType);
  if (!cfg) return [];
  const filterValue = fundingType === "Grant" ? opts.country : opts.genre;
  const filter = filterValue
    ? (fundingType === "Grant"
        ? { property: cfg.props.filter, select:       { equals:   filterValue } }
        : { property: cfg.props.filter, multi_select: { contains: filterValue } })
    : undefined;
  try {
    const res: any = await c.databases.query({
      database_id: cfg.id,
      ...(filter ? { filter } : {}),
      page_size: 3,
    });
    return (res.results || []).slice(0, 3).map((page: any) => {
      const p = page.properties || {};
      const titleProp = p[cfg.props.title];
      const amountProp = p[cfg.props.amount];
      const filterProp = p[cfg.props.filter];

      const title = titleProp?.title?.[0]?.plain_text
        || titleProp?.rich_text?.[0]?.plain_text
        || "Untitled";
      const amount: number | null = typeof amountProp?.number === "number" ? amountProp.number : null;

      // Tags: filter column value (genre multi-select or country select)
      const tags: string[] = [];
      if (fundingType === "Grant") {
        if (filterProp?.select?.name) tags.push(filterProp.select.name);
      } else {
        for (const g of (filterProp?.multi_select || []).slice(0, 2)) {
          if (g?.name) tags.push(g.name);
        }
      }

      return {
        title,
        description: formatAmountDescription(fundingType, amount),
        tags,
      };
    });
  } catch (e: any) {
    console.error("[notion] queryCaspianCards failed", e?.message || e);
    return [];
  }
}
