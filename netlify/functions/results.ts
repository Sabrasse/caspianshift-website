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

function deriveBudget(row: NotionRow): { lines: BudgetLine[]; total_usd: number } {
  const country = row.studioCountry || "Other";
  const monthly = COUNTRY_SALARIES[country] ?? COUNTRY_SALARIES["Other"];
  const studioSize = row.studioSize || 1;
  const devTime = row.devTimeMonths || 12;
  const devs = `${studioSize} dev${studioSize === 1 ? "" : "s"}`;

  // Dev & QA — anchor
  const devEstimate = monthly * studioSize * devTime;
  const dev = classify({
    key: "dev", label: "Development & QA",
    userVal: row.devQaBudget,
    estimate: devEstimate,
    rationales: {
      blank: `${country}: $${monthly.toLocaleString()}/month × ${devs} × ${devTime} months ≈ $${devEstimate.toLocaleString()}.`,
      coherent: `Within ${country} salary range for ${devs} over ${devTime} months.`,
      below: `Below ${country} costs for ${devs} × ${devTime} months, under-budgeted?`,
      above: `Above ${country} costs, likely a senior team or extended scope.`,
    },
  });

  // Art — 20% of Dev cascade
  const artEstimate = Math.round(dev.cascadeValue * 0.20);
  const art = classify({
    key: "art", label: "Art & Illustrations",
    userVal: row.artBudget,
    estimate: artEstimate,
    rationales: {
      blank: "20% of Dev, standard minimum rate for indie games.",
      coherent: "Within typical art share, proportional to your dev scope.",
      below: "Below standard costs, limited art scope?",
      above: "Above standard costs, likely an art-heavy scope or outsourced work.",
    },
  });

  // Music — 5% of (Dev + Art) cascade
  const musicEstimate = Math.round((dev.cascadeValue + art.cascadeValue) * 0.05);
  const music = classify({
    key: "music", label: "Music & Sound",
    userVal: row.musicBudget,
    estimate: musicEstimate,
    rationales: {
      blank: "5% of Dev + Art, usually dedicated to custom soundtrack and SFX.",
      coherent: "Within typical audio share, fits a hybrid stock + custom approach.",
      below: "Below standard costs, stock music only?",
      above: "Above standard costs, likely custom-scored or licensed tracks.",
    },
  });

  // Localization — 5% of (Dev + Art + Music) cascade. $0 falls through to "below".
  const locEstimate = Math.round((dev.cascadeValue + art.cascadeValue + music.cascadeValue) * 0.05);
  const loc = classify({
    key: "loc", label: "Localization",
    userVal: row.localizationBudget,
    estimate: locEstimate,
    rationales: {
      blank: "5% of Dev + Art + Music, typical for 4 to 6 supported languages.",
      coherent: "Within typical localization share, fits 4 to 6 languages.",
      below: "Below standard costs, limited language coverage?",
      above: "Above standard costs, likely broad language coverage planned.",
    },
  });

  // Marketing — 15% of (Dev + Art + Music + Loc) cascade
  const marketingEstimate = Math.round((dev.cascadeValue + art.cascadeValue + music.cascadeValue + loc.cascadeValue) * 0.15);
  const marketing = classify({
    key: "marketing", label: "Marketing",
    userVal: row.marketingBudget,
    estimate: marketingEstimate,
    rationales: {
      blank: "15% of production subtotal, minimum industry standard.",
      coherent: "Within recommended marketing range, supports a real launch push.",
      below: "Below the 15% production minimum, risk of poor visibility on launch.",
      above: "Above the 15% minimum, strong visibility budget planned.",
    },
  });

  // Overhead — 5% of (Dev + Art + Music + Loc + Marketing) cascade
  const overheadEstimate = Math.round((dev.cascadeValue + art.cascadeValue + music.cascadeValue + loc.cascadeValue + marketing.cascadeValue) * 0.05);
  const overhead = classify({
    key: "overhead", label: "Overhead",
    userVal: row.overheadBudget,
    estimate: overheadEstimate,
    rationales: {
      blank: "5% of production + marketing, covers trailer, capsule art, legal, tools, contingency.",
      coherent: "Within typical overhead range, fits standard launch operations.",
      below: "Below standard overhead, limited contingency for unknowns?",
      above: "Above standard overhead, likely broader operations or larger contingency.",
    },
  });

  const lines = [dev.line, art.line, music.line, loc.line, marketing.line, overhead.line];
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
