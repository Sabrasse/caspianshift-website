// Notion wrapper — Game Case Studies database.
//
// Env vars:
//   NOTION_API_KEY  — internal-integration token (Notion → Settings → Integrations → New)
//   NOTION_DB_ID    — 34abb949947480b2b326c2fe922f384c (Game Case Studies)
//
// If the env vars are missing, every operation is a no-op that logs a warning and returns
// a synthesised submissionId — the rest of the pipeline keeps working in mock mode.

import { Client } from "@notionhq/client";
import type { Step1Body, Step2Body, Step3Body, NotionRow, GameStatus, FundingType } from "./types";

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_DB_ID = process.env.NOTION_DB_ID || "34abb949947480b2b326c2fe922f384c";

let _client: Client | null = null;
function client(): Client | null {
  if (!NOTION_API_KEY) return null;
  if (_client) return _client;
  _client = new Client({ auth: NOTION_API_KEY });
  return _client;
}

export function isNotionEnabled(): boolean { return !!NOTION_API_KEY; }

/** Property names in the Notion database — must match exactly. */
const P = {
  GameName: "Game Name",
  StudioName: "Studio Name",
  Status: "Status",
  Genre: "Genre",
  StudioSize: "Studio Size",
  StudioCountry: "Studio Country",
  ReleaseDate: "Release Date",
  PricePoint: "Price Point",
  FundingType: "Funding Type",
  SteamUrl: "Steam Page URL",
  DevTime: "Dev Time (months)",
  DevQa: "Dev and QA Budget",
  Art: "Art Budget",
  Music: "Music Budget",
  Loc: "Localization Budget",
  Marketing: "Marketing Budget",
  PreRelease: "Pre-Release Budget",
  Wishlists: "Current Wishlists",
  PrimaryChannel: "Primary Marketing Channel",
  NextFest: "Next Fest",
  SourceType: "Source Type",
  DataConfidence: "Data Confidence",
  SubmissionEmail: "Submission Email",
  SourceUrl: "Source URL",
  KeyLessons: "Key Lessons",
  SubmissionId: "Submission ID", // custom — used to look up rows by our internal id
};

function uuid(): string {
  // Lightweight UUID v4 (good enough for submission IDs)
  if (typeof crypto !== "undefined" && (crypto as any).randomUUID) return (crypto as any).randomUUID();
  return "ss-" + Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
}

/** Step 1: create a new row tagged Source Type=CS Pilot, Data Confidence=Medium. */
export async function createStep1Row(body: Step1Body): Promise<{ submissionId: string; notionPageId: string | null }> {
  const submissionId = uuid();
  const c = client();
  if (!c) {
    console.warn("[notion] NOTION_API_KEY not set — returning synthesised submissionId");
    return { submissionId, notionPageId: null };
  }
  try {
    const page = await c.pages.create({
      parent: { database_id: NOTION_DB_ID },
      properties: {
        [P.GameName]:      { title:       [{ text: { content: body.gameName } }] },
        [P.StudioName]:    { rich_text:   [{ text: { content: body.studioName } }] },
        [P.Status]:        { select:      { name: body.status } },
        [P.Genre]:         { multi_select: body.genre.map(name => ({ name })) },
        [P.StudioSize]:    { number:       body.studioSize },
        [P.StudioCountry]: { select:      { name: body.studioCountry } },
        [P.ReleaseDate]:   { date:        { start: body.releaseDate.length === 7 ? body.releaseDate + "-01" : body.releaseDate } },
        [P.FundingType]:   { select:      { name: body.fundingType } },
        ...(body.steamUrl   ? { [P.SteamUrl]:   { url: body.steamUrl } } : {}),
        ...(body.pricePoint ? { [P.PricePoint]: { number: body.pricePoint } } : {}),
        [P.SourceType]:     { select:      { name: "CS Pilot" } },
        [P.DataConfidence]: { select:      { name: "Medium" } },
        [P.SubmissionId]:   { rich_text:   [{ text: { content: submissionId } }] },
      } as any,
    });
    return { submissionId, notionPageId: page.id };
  } catch (e: any) {
    console.error("[notion] createStep1Row failed", e?.message || e);
    return { submissionId, notionPageId: null };
  }
}

/** Look up a Notion page id by submissionId (set on Step 1). */
export async function findPageBySubmissionId(submissionId: string): Promise<string | null> {
  const c = client();
  if (!c) return null;
  try {
    const res = await c.databases.query({
      database_id: NOTION_DB_ID,
      filter: { property: P.SubmissionId, rich_text: { equals: submissionId } },
      page_size: 1,
    } as any);
    return res.results.length ? res.results[0].id : null;
  } catch (e: any) {
    console.error("[notion] findPageBySubmissionId failed", e?.message || e);
    return null;
  }
}

/** Step 2: PATCH budget fields (skip undefined). */
export async function patchStep2(submissionId: string, body: Step2Body): Promise<boolean> {
  const c = client();
  if (!c) return false;
  const pageId = await findPageBySubmissionId(submissionId);
  if (!pageId) return false;
  const props: any = {
    [P.DevTime]: { number: body.devTimeMonths },
  };
  if (body.devQaBudget != null)        props[P.DevQa]     = { number: body.devQaBudget };
  if (body.artBudget != null)          props[P.Art]       = { number: body.artBudget };
  if (body.musicBudget != null)        props[P.Music]     = { number: body.musicBudget };
  if (body.localizationBudget != null) props[P.Loc]       = { number: body.localizationBudget };
  if (body.marketingBudget != null)    props[P.Marketing] = { number: body.marketingBudget };
  try {
    await c.pages.update({ page_id: pageId, properties: props });
    return true;
  } catch (e: any) {
    console.error("[notion] patchStep2 failed", e?.message || e);
    return false;
  }
}

/** Step 3: PATCH traction fields + recompute Data Confidence. */
export async function patchStep3(submissionId: string, body: Step3Body, derivedConfidence: "High" | "Medium" | "Low"): Promise<boolean> {
  const c = client();
  if (!c) return false;
  const pageId = await findPageBySubmissionId(submissionId);
  if (!pageId) return false;
  const props: any = {
    [P.NextFest]: { checkbox: !!body.nextFestPlanned },
    [P.DataConfidence]: { select: { name: derivedConfidence } },
  };
  if (body.currentWishlists != null) props[P.Wishlists] = { number: body.currentWishlists };
  if (body.primaryMarketingChannel)  props[P.PrimaryChannel] = { select: { name: body.primaryMarketingChannel } };
  try {
    await c.pages.update({ page_id: pageId, properties: props });
    return true;
  } catch (e: any) {
    console.error("[notion] patchStep3 failed", e?.message || e);
    return false;
  }
}

/** PATCH the Pre-Release Budget after Anthropic analysis. */
export async function patchPreRelease(submissionId: string, preReleaseUsd: number): Promise<boolean> {
  const c = client();
  if (!c) return false;
  const pageId = await findPageBySubmissionId(submissionId);
  if (!pageId) return false;
  try {
    await c.pages.update({ page_id: pageId, properties: { [P.PreRelease]: { number: preReleaseUsd } } });
    return true;
  } catch (e: any) {
    console.error("[notion] patchPreRelease failed", e?.message || e);
    return false;
  }
}

/** PATCH Submission Email (capture-email endpoint). */
export async function patchEmail(submissionId: string, email: string): Promise<boolean> {
  const c = client();
  if (!c) return false;
  const pageId = await findPageBySubmissionId(submissionId);
  if (!pageId) return false;
  try {
    await c.pages.update({ page_id: pageId, properties: { [P.SubmissionEmail]: { email } } });
    return true;
  } catch (e: any) {
    console.error("[notion] patchEmail failed", e?.message || e);
    return false;
  }
}

/** Read the row by submissionId, decode into NotionRow. Used by analyse-background. */
export async function readRow(submissionId: string): Promise<NotionRow | null> {
  const c = client();
  if (!c) return null;
  const pageId = await findPageBySubmissionId(submissionId);
  if (!pageId) return null;
  try {
    const page: any = await c.pages.retrieve({ page_id: pageId });
    const p = page.properties || {};
    return {
      pageId,
      submissionId,
      gameName:      p[P.GameName]?.title?.[0]?.plain_text || "",
      studioName:    p[P.StudioName]?.rich_text?.[0]?.plain_text || "",
      status:        (p[P.Status]?.select?.name || "In Development") as GameStatus,
      genre:         (p[P.Genre]?.multi_select || []).map((g: any) => g.name),
      studioSize:    p[P.StudioSize]?.number || 1,
      studioCountry: p[P.StudioCountry]?.select?.name || "Other",
      releaseDate:   p[P.ReleaseDate]?.date?.start || "",
      pricePoint:    p[P.PricePoint]?.number ?? undefined,
      fundingType:   (p[P.FundingType]?.select?.name || "Self-Funded") as FundingType,
      steamUrl:      p[P.SteamUrl]?.url || undefined,
      devTimeMonths: p[P.DevTime]?.number ?? undefined,
      devQaBudget:        p[P.DevQa]?.number ?? undefined,
      artBudget:          p[P.Art]?.number ?? undefined,
      musicBudget:        p[P.Music]?.number ?? undefined,
      localizationBudget: p[P.Loc]?.number ?? undefined,
      marketingBudget:    p[P.Marketing]?.number ?? undefined,
      preReleaseBudget:   p[P.PreRelease]?.number ?? undefined,
      currentWishlists:   p[P.Wishlists]?.number ?? undefined,
      primaryMarketingChannel: p[P.PrimaryChannel]?.select?.name || undefined,
      nextFestPlanned:    p[P.NextFest]?.checkbox ?? undefined,
      sourceType:         p[P.SourceType]?.select?.name || "CS Pilot",
      dataConfidence:     (p[P.DataConfidence]?.select?.name || "Medium") as "High" | "Medium" | "Low",
      submissionEmail:    p[P.SubmissionEmail]?.email || undefined,
    };
  } catch (e: any) {
    console.error("[notion] readRow failed", e?.message || e);
    return null;
  }
}

/** Pull up to N comparable rows: same Source Type ≠ "CS Pilot", overlapping genre. */
export async function findComparables(genre: string[], n = 5): Promise<NotionRow[]> {
  const c = client();
  if (!c) return [];
  if (!genre || !genre.length) return [];
  try {
    const res: any = await c.databases.query({
      database_id: NOTION_DB_ID,
      filter: {
        and: [
          { property: P.SourceType, select: { does_not_equal: "CS Pilot" } },
          { or: genre.map(g => ({ property: P.Genre, multi_select: { contains: g } })) },
        ],
      },
      page_size: Math.max(n, 5),
    });
    return (res.results || []).map((page: any) => {
      const p = page.properties || {};
      return {
        pageId: page.id,
        submissionId: p[P.SubmissionId]?.rich_text?.[0]?.plain_text || page.id,
        gameName:      p[P.GameName]?.title?.[0]?.plain_text || "",
        studioName:    p[P.StudioName]?.rich_text?.[0]?.plain_text || "",
        status:        (p[P.Status]?.select?.name || "In Development") as GameStatus,
        genre:         (p[P.Genre]?.multi_select || []).map((g: any) => g.name),
        studioSize:    p[P.StudioSize]?.number || 1,
        studioCountry: p[P.StudioCountry]?.select?.name || "Other",
        releaseDate:   p[P.ReleaseDate]?.date?.start || "",
        pricePoint:    p[P.PricePoint]?.number ?? undefined,
        fundingType:   (p[P.FundingType]?.select?.name || "Self-Funded") as FundingType,
        sourceType:    p[P.SourceType]?.select?.name || "",
        dataConfidence: (p[P.DataConfidence]?.select?.name || "Medium") as "High" | "Medium" | "Low",
      } as NotionRow;
    });
  } catch (e: any) {
    console.error("[notion] findComparables failed", e?.message || e);
    return [];
  }
}

/** Create or update a comparable row by Steam URL or game name. */
export async function upsertComparable(c: { gameName: string; steamUrl?: string }, signals?: any): Promise<void> {
  const cli = client();
  if (!cli) return;
  try {
    let existing: string | null = null;
    if (c.steamUrl) {
      const res: any = await cli.databases.query({
        database_id: NOTION_DB_ID,
        filter: { property: P.SteamUrl, url: { equals: c.steamUrl } },
        page_size: 1,
      });
      if (res.results.length) existing = res.results[0].id;
    }
    if (!existing && c.gameName) {
      const res: any = await cli.databases.query({
        database_id: NOTION_DB_ID,
        filter: { property: P.GameName, title: { equals: c.gameName } },
        page_size: 1,
      });
      if (res.results.length) existing = res.results[0].id;
    }
    if (existing) return; // don't overwrite manual case studies
    await cli.pages.create({
      parent: { database_id: NOTION_DB_ID },
      properties: {
        [P.GameName]:    { title: [{ text: { content: c.gameName } }] },
        [P.SourceType]:  { select: { name: "CS Pilot" } },
        [P.DataConfidence]: { select: { name: "Low" } },
        ...(c.steamUrl ? { [P.SteamUrl]: { url: c.steamUrl } } : {}),
        ...(signals?.price ? { [P.PricePoint]: { number: signals.price } } : {}),
      } as any,
    });
  } catch (e: any) {
    console.error("[notion] upsertComparable failed", e?.message || e);
  }
}
