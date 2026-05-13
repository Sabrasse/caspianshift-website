// GET /api/results?notionPageId=...
// Synchronous: reads the Notion row, derives the revised budget + revenue simulation.

import type { Handler } from "@netlify/functions";
import { ResultsQuerySchema, zodError } from "./_shared/validate";
import { readRow, queryPublishers, queryGrants } from "./_shared/notion";
import {
  COPIES_SOLD,
  type NotionRow, type BudgetLine, type ResultsPayload, type RevenueSimulation,
  type FundingPathSection, type BudgetBucket,
  type FundingType,
} from "./_shared/types";
import { ok, bad, notFound, methodNotAllowed, log } from "./_shared/http";

const COUNTRY_SALARIES: Record<string, number> = {
  "United States": 9500, "Canada": 7200, "United Kingdom": 6800, "France": 5500,
  "Germany": 6200, "Netherlands": 6500, "Sweden": 6300, "Finland": 6000,
  "Australia": 6500, "Spain": 4200, "Italy": 4000, "Japan": 5000, "Poland": 3800,
  "Czechia": 3500, "Slovenia": 3000, "Mexico": 3000, "Brazil": 2800, "Other": 4500,
};
const DEFAULT_PRICE = 19.99;
const STEAM_CUT = 0.30;

// ±50% band around our estimate. Below = orange flag (cascade defensively against
// our estimate). Above = white amount (cascade with user value — likely scope choice).
const FLAG_BAND = 0.5;

type LineRationales = { blank: string; coherent: string; below: string; above: string };

function classify(args: {
  key: BudgetLine["key"]; label: string; userVal?: number; estimate: number; rationales: LineRationales;
}): { line: BudgetLine; cascadeValue: number } {
  const { key, label, userVal, estimate, rationales } = args;
  if (userVal == null) {
    return {
      line: { key, label, amount_usd: estimate, source: "estimated", rationale: rationales.blank },
      cascadeValue: estimate,
    };
  }
  const ratio = estimate > 0 ? userVal / estimate : 1;
  if (ratio < 1 - FLAG_BAND) {
    // Below — display user value with warning, but cascade with estimate (defensive)
    return {
      line: { key, label, amount_usd: userVal, source: "below", rationale: rationales.below },
      cascadeValue: estimate,
    };
  }
  if (ratio > 1 + FLAG_BAND) {
    // Above — display user value, cascade with user value (intentional scope)
    return {
      line: { key, label, amount_usd: userVal, source: "above", rationale: rationales.above },
      cascadeValue: userVal,
    };
  }
  // Coherent
  return {
    line: { key, label, amount_usd: userVal, source: "user", rationale: rationales.coherent },
    cascadeValue: userVal,
  };
}

function band(raw: number): number {
  return raw > 200000 ? Math.round(raw / 10000) * 10000 : Math.round(raw / 5000) * 5000;
}

function deriveBudget(row: NotionRow): { lines: BudgetLine[]; total_usd: number; total_provided: number; total_revised: number } {
  const country = row.studioCountry || "Other";
  const monthly = COUNTRY_SALARIES[country] ?? COUNTRY_SALARIES["Other"];
  const studioSize = row.studioSize || 1;
  const devTime = row.devTimeMonths || 12;
  const devs = `${studioSize} dev${studioSize === 1 ? "" : "s"}`;

  // Single pure-estimate cascade (anchored on country × team × time). Every line is
  // classified against the same pure value that's displayed in the Revised column —
  // one source of truth, no dual-cascade drift.

  // Dev & QA — anchor
  const devRevised = monthly * studioSize * devTime;
  const dev = classify({
    key: "dev", label: "Development & QA",
    userVal: row.devQaBudget,
    estimate: devRevised,
    rationales: {
      blank: `Average salary in ${country} for ${devs} * ${devTime} months.`,
      coherent: `Fits our data range in ${country} for ${devs} * ${devTime} months.`,
      below: `Below our data range in ${country} for ${devs} * ${devTime} months.`,
      above: `Above our data range in ${country} for ${devs} * ${devTime} months.`,
    },
  });

  // Art — 20% of Dev
  const artRevised = Math.round(devRevised * 0.20);
  const primaryGenre = (row.genre && row.genre[0]) || "indie";
  const art = classify({
    key: "art", label: "Art & Illustrations",
    userVal: row.artBudget,
    estimate: artRevised,
    rationales: {
      blank: `20% of Dev & QA, standard for ${primaryGenre} games.`,
      coherent: `Fits our data range for similar ${primaryGenre} games.`,
      below: `Below our data range for similar ${primaryGenre} games.`,
      above: `Above our data range for similar ${primaryGenre} games.`,
    },
  });

  // Music — 5% of (Dev + Art)
  const musicRevised = Math.round((devRevised + artRevised) * 0.05);
  const music = classify({
    key: "music", label: "Music & Sound",
    userVal: row.musicBudget,
    estimate: musicRevised,
    rationales: {
      blank: "5% of Dev + Art, evolve with game scope.",
      coherent: `Fits our data range for similar ${primaryGenre} games.`,
      below: `Below our data range for similar ${primaryGenre} games.`,
      above: `Above our data range for similar ${primaryGenre} games.`,
    },
  });

  // Localization — 5% of (Dev + Art + Music)
  const locRevised = Math.round((devRevised + artRevised + musicRevised) * 0.05);
  const loc = classify({
    key: "loc", label: "Localization",
    userVal: row.localizationBudget,
    estimate: locRevised,
    rationales: {
      blank: "5% of Dev + Art + Music, evolve with country coverage.",
      coherent: `Fits our data range for similar ${primaryGenre} games.`,
      below: `Below our data range for similar ${primaryGenre} games.`,
      above: `Above our data range for similar ${primaryGenre} games.`,
    },
  });

  // Marketing — 15% of (Dev + Art + Music + Loc)
  const marketingRevised = Math.round((devRevised + artRevised + musicRevised + locRevised) * 0.15);
  const marketing = classify({
    key: "marketing", label: "Marketing",
    userVal: row.marketingBudget,
    estimate: marketingRevised,
    rationales: {
      blank: "15% of production subtotal, to be spent wisely!",
      coherent: `Fits our data range for similar released ${primaryGenre} games.`,
      below: `Below our data range for similar released ${primaryGenre} games.`,
      above: `Above our data range for similar released ${primaryGenre} games.`,
    },
  });

  // Overhead — 5% of (Dev + Art + Music + Loc + Marketing)
  const overheadRevised = Math.round((devRevised + artRevised + musicRevised + locRevised + marketingRevised) * 0.05);
  const overhead = classify({
    key: "overhead", label: "Overhead",
    userVal: row.overheadBudget,
    estimate: overheadRevised,
    rationales: {
      blank: "An additional 5% to add breathing room to your budget.",
      coherent: `Fits our data range for similar ${primaryGenre} games.`,
      below: `Below our data range for similar ${primaryGenre} games.`,
      above: `Above our data range for similar ${primaryGenre} games.`,
    },
  });

  const provideds: (number | null)[] = [
    row.devQaBudget ?? null, row.artBudget ?? null, row.musicBudget ?? null,
    row.localizationBudget ?? null, row.marketingBudget ?? null, row.overheadBudget ?? null,
  ];
  const reviseds = [devRevised, artRevised, musicRevised, locRevised, marketingRevised, overheadRevised];
  const baseLines = [dev.line, art.line, music.line, loc.line, marketing.line, overhead.line];

  const lines: BudgetLine[] = baseLines.map((l, i) => ({ ...l, provided: provideds[i], revised: reviseds[i] }));
  // Hybrid total: only coherent ('user') passes through the user's value (we accept it);
  // blank, below and above all use the pure estimate (we fill in / push back). Drives revenue scenarios.
  const hybridRaw = lines.reduce((s, l) => {
    const useProvided = l.source === "user" && l.provided != null;
    return s + (useProvided ? (l.provided as number) : l.revised);
  }, 0);
  const total_usd = band(hybridRaw);
  const total_provided = provideds.reduce((s: number, v) => s + (v ?? 0), 0);
  const total_revised = total_usd; // alias for the frontend payload
  return { lines, total_usd, total_provided, total_revised };
}

// Bucket the user's revised budget for matching against the Publishers DB Budget select.
// Thresholds: < $100K = Low, $100K–$500K = Medium, > $500K = High.
function bucketBudget(amount: number): BudgetBucket {
  if (amount < 100_000) return "Low";
  if (amount <= 500_000) return "Medium";
  return "High";
}

// User form uses long-form country names ("United States"); the Publishers DB uses
// short forms ("USA"). Aliases the few divergent cases so country matching works.
const COUNTRY_TO_PUB_DB: Record<string, string> = {
  "United States":  "USA",
  "United Kingdom": "UK",
  "Czechia":        "Czech",
};
function aliasCountryForPublishers(c: string): string {
  return COUNTRY_TO_PUB_DB[c] || c;
}

// The Grants DB uses "UK" and "Czech Republic" — diverges from publishers in the Czech case.
const COUNTRY_TO_GRANT_DB: Record<string, string> = {
  "United Kingdom": "UK",
  "Czechia":        "Czech Republic",
};
function aliasCountryForGrants(c: string): string {
  return COUNTRY_TO_GRANT_DB[c] || c;
}

// Builds the funding-path sections in render order: Publisher first (if selected),
// Grant second (if selected AND has country matches). When neither real-data path
// applies, falls back to a single placeholder card for Crowdfunding/Self.
async function buildFundingPaths(row: NotionRow, totalUsd: number): Promise<FundingPathSection[]> {
  const set = new Set(row.fundingType || []);
  const sections: FundingPathSection[] = [];

  if (set.has("Publisher")) {
    const items = await queryPublishers({
      country:      aliasCountryForPublishers(row.studioCountry),
      budgetBucket: bucketBudget(totalUsd),
      genres:       row.genre || [],
    });
    sections.push({ kind: "publisher", items });
  }

  if (set.has("Grant")) {
    const items = await queryGrants({ country: aliasCountryForGrants(row.studioCountry) });
    if (items.length > 0) sections.push({ kind: "grant", items });
  }

  if (sections.length === 0) {
    sections.push({ kind: set.has("Crowdfunding") ? "crowdfunding" : "self" });
  }
  return sections;
}

function buildRevenue(): RevenueSimulation {
  const price = DEFAULT_PRICE;
  const buildBase = (copies: number) => {
    const gross_revenue = price * copies;
    const net_revenue = gross_revenue * (1 - STEAM_CUT);
    return { copies_sold: copies, gross_revenue, net_revenue, studio_share: net_revenue };
  };
  const [c, r, o] = COPIES_SOLD;
  return {
    price,
    scenarios: { conservative: buildBase(c), realistic: buildBase(r), optimistic: buildBase(o) },
  };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed(["GET"]);
  const parsed = ResultsQuerySchema.safeParse({
    notionPageId: event.queryStringParameters?.notionPageId,
  });
  if (!parsed.success) return zodError(parsed.error);

  const t0 = Date.now();
  const row = await readRow(parsed.data.notionPageId);
  if (!row) {
    log("results", { notionPageId: parsed.data.notionPageId, status: "not-found" });
    return notFound("Submission not found");
  }
  if (!row.fundingType?.length || !row.studioName) {
    return bad("Submission incomplete — Studio step missing");
  }
  const budget = deriveBudget(row);
  const revenue = buildRevenue();
  const funding_paths = await buildFundingPaths(row, budget.total_usd);
  const payload: ResultsPayload = {
    status: "ready",
    studio_name: row.studioName,
    game_name: row.gameName,
    studio_country: row.studioCountry,
    genre: row.genre || [],
    funding_type: row.fundingType,
    budget,
    revenue,
    funding_paths,
    generatedAt: new Date().toISOString(),
  };
  const pubSection = funding_paths.find(s => s.kind === "publisher");
  const grantSection = funding_paths.find(s => s.kind === "grant");
  log("results", {
    notionPageId: parsed.data.notionPageId, status: "ready",
    total: budget.total_usd,
    fundingPaths: funding_paths.map(s => s.kind).join(","),
    publishers: pubSection && pubSection.kind === "publisher" ? pubSection.items.length : 0,
    grants:     grantSection && grantSection.kind === "grant" ? grantSection.items.length : 0,
    ms: Date.now() - t0,
  });
  return ok(payload);
};
