// GET /api/results?notionPageId=...
// Synchronous: reads the Notion row, derives the revised budget + revenue simulation.

import type { Handler } from "@netlify/functions";
import { ResultsQuerySchema, zodError } from "./_shared/validate";
import { readRow } from "./_shared/notion";
import {
  COPIES_SOLD, GRANT_AMOUNTS, CROWDFUNDING_TIERS,
  type NotionRow, type BudgetLine, type ResultsPayload, type RevenueSimulation,
} from "./_shared/types";
import { ok, bad, notFound, methodNotAllowed, log } from "./_shared/http";

const COUNTRY_SALARIES: Record<string, number> = {
  "United States": 9500, "Canada": 7200, "United Kingdom": 6800, "France": 5500,
  "Germany": 6200, "Netherlands": 6500, "Sweden": 6300, "Finland": 6000,
  "Spain": 4200, "Italy": 4000, "Japan": 5000, "Poland": 3800, "Czechia": 3500,
  "Slovenia": 3000, "Brazil": 2800, "Other": 4500,
};
const NARRATIVE_GENRES = new Set(["RPG", "Visual Novel", "Adventure", "Narrative"]);
const MECHANICAL_GENRES = new Set(["Strategy", "Roguelike", "Card Game", "Puzzle"]);
const DEFAULT_PRICE = 19.99;
const STEAM_CUT = 0.30;

function deriveBudget(row: NotionRow): { lines: BudgetLine[]; total_usd: number } {
  const country = row.studioCountry || "Other";
  const monthly = COUNTRY_SALARIES[country] ?? COUNTRY_SALARIES["Other"];
  const studioSize = row.studioSize || 1;
  const devTime = row.devTimeMonths || 12;

  // Dev & QA
  const devEstimate = monthly * studioSize * devTime;
  const dev: BudgetLine = row.devQaBudget != null
    ? { key: "dev", label: "Development & QA", amount_usd: row.devQaBudget, source: "user",
        rationale: `As provided — within ${country} salary range for your team.` }
    : { key: "dev", label: "Development & QA", amount_usd: devEstimate, source: "estimated",
        rationale: `${country} median salary ($${monthly.toLocaleString()}/mo) × ${studioSize} dev${studioSize === 1 ? "" : "s"} × ${devTime} months.` };

  // Art — share of dev cost based on genre
  const narrativeHeavy = (row.genre || []).some(g => NARRATIVE_GENRES.has(g));
  const mechanical     = (row.genre || []).some(g => MECHANICAL_GENRES.has(g));
  const artShare = narrativeHeavy ? 0.25 : mechanical ? 0.10 : 0.18;
  const art: BudgetLine = row.artBudget != null
    ? { key: "art", label: "Art & Illustrations", amount_usd: row.artBudget, source: "user",
        rationale: "As provided — within typical genre range." }
    : { key: "art", label: "Art & Illustrations", amount_usd: Math.round(devEstimate * artShare), source: "estimated",
        rationale: `Genre-typical share of dev cost (${Math.round(artShare * 100)}%).` };

  // Music
  const music: BudgetLine = row.musicBudget != null
    ? { key: "music", label: "Music & Sound", amount_usd: row.musicBudget, source: "user", rationale: "As provided." }
    : { key: "music", label: "Music & Sound", amount_usd: 8000, source: "estimated",
        rationale: "Comparables median; fallback $8,000." };

  // Localization
  const productionSoFar = dev.amount_usd + art.amount_usd + music.amount_usd;
  const loc: BudgetLine = row.localizationBudget != null
    ? { key: "loc", label: "Localization", amount_usd: row.localizationBudget, source: "user",
        rationale: row.localizationBudget === 0 ? "English-only — no localization budget." : "As provided." }
    : { key: "loc", label: "Localization", amount_usd: Math.round(productionSoFar * 0.07), source: "estimated",
        rationale: "7% of production sub-total (industry typical for 4–6 languages)." };

  // Marketing — minimum 10% of production sub-total
  const productionSubtotal = productionSoFar + loc.amount_usd;
  const marketingFloor = Math.round(productionSubtotal * 0.10);
  const marketing: BudgetLine = row.marketingBudget != null && row.marketingBudget >= marketingFloor
    ? { key: "marketing", label: "Marketing", amount_usd: row.marketingBudget, source: "user",
        rationale: "As provided — above the 10% production minimum." }
    : { key: "marketing", label: "Marketing", amount_usd: marketingFloor, source: "estimated",
        rationale: "Industry minimum: 10% of production sub-total." };

  // Overhead — always estimated, 10% of production + marketing
  const overheadAmount = Math.round((productionSubtotal + marketing.amount_usd) * 0.10);
  const overhead: BudgetLine = {
    key: "overhead", label: "Overhead", amount_usd: overheadAmount, source: "estimated",
    rationale: "10% of production + marketing.",
  };

  const lines = [dev, art, music, loc, marketing, overhead];
  const raw = lines.reduce((s, l) => s + l.amount_usd, 0);
  const total_usd = raw > 200000 ? Math.round(raw / 10000) * 10000 : Math.round(raw / 5000) * 5000;
  return { lines, total_usd };
}

function buildRevenue(fundingType: NotionRow["fundingType"], totalBudget: number): RevenueSimulation {
  const price = DEFAULT_PRICE;
  const buildBase = (copies: number) => {
    const gross = price * copies;
    const steam_share = gross * STEAM_CUT;
    return { copies, price, gross, steam_share, studio_share: gross - steam_share };
  };

  if (fundingType === "Self-Funded") {
    const [c, r, o] = COPIES_SOLD;
    return {
      funding_path: "Self-Funded", price,
      scenarios: { conservative: buildBase(c), realistic: buildBase(r), optimistic: buildBase(o) },
    };
  }

  if (fundingType === "Publisher") {
    const recoupment = totalBudget;
    const buildPub = (copies: number) => {
      const base = buildBase(copies);
      const net = base.gross - base.steam_share;
      const postRecoup = Math.max(net - recoupment, 0);
      return {
        ...base,
        publisher_recoupment: recoupment,
        publisher_share: postRecoup * 0.30,
        studio_share: postRecoup * 0.70,
      };
    };
    const [c, r, o] = COPIES_SOLD;
    return {
      funding_path: "Publisher", price,
      scenarios: { conservative: buildPub(c), realistic: buildPub(r), optimistic: buildPub(o) },
    };
  }

  if (fundingType === "Grant") {
    const [g1, g2, g3] = GRANT_AMOUNTS;
    const buildGrant = (copies: number, grantAmount: number) => {
      const base = buildBase(copies);
      return {
        ...base,
        grant_amount: grantAmount,
        remaining_gap: Math.max(totalBudget - grantAmount, 0),
      };
    };
    const [c, r, o] = COPIES_SOLD;
    return {
      funding_path: "Grant", price,
      scenarios: { conservative: buildGrant(c, g1), realistic: buildGrant(r, g2), optimistic: buildGrant(o, g3) },
    };
  }

  // Crowdfunding — equal-weight tier distribution to reach total budget revised
  const tiers = CROWDFUNDING_TIERS.map(t => ({
    label: t.label,
    price: t.price,
    backers: Math.ceil(totalBudget / 4 / t.price),
  }));
  const total_backers = tiers.reduce((s, t) => s + t.backers, 0);
  const total_raised = tiers.reduce((s, t) => s + t.backers * t.price, 0);
  return {
    funding_path: "Crowdfunding", price,
    crowdfunding: { tiers, total_backers, total_raised },
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
  if (!row.fundingType || !row.studioName) {
    return bad("Submission incomplete — Studio step missing");
  }
  const budget = deriveBudget(row);
  const revenue = buildRevenue(row.fundingType, budget.total_usd);
  const payload: ResultsPayload = {
    status: "ready",
    studio_name: row.studioName,
    game_name: row.gameName,
    funding_type: row.fundingType,
    budget,
    revenue,
    generatedAt: new Date().toISOString(),
  };
  log("results", { notionPageId: parsed.data.notionPageId, status: "ready", total: budget.total_usd, ms: Date.now() - t0 });
  return ok(payload);
};
