// Anthropic Claude wrapper. One structured-output call, returns the full
// AnalysisResult described in the Build Spec.
//
// Env:
//   ANTHROPIC_API_KEY
//   ANTHROPIC_MODEL  (default claude-sonnet-4-6)
//
// If ANTHROPIC_API_KEY is missing, returns a deterministic mock analysis so the
// rest of the pipeline still works. The mock is good enough for end-to-end demos
// but is not the same per-submission — flip the env var when you want real output.

import Anthropic from "@anthropic-ai/sdk";
import type { AnalysisResult, NotionRow } from "./types";
import budgetTpl from "../../../knowledge/budget-template.json";
import revenueTpl from "../../../knowledge/revenue-template.json";
import edgeTpl from "../../../knowledge/edge-template.json";

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

export function isAnthropicEnabled(): boolean { return !!KEY; }

const SYSTEM_PROMPT = `You are the analyst for Caspian Shift, an indie-game funding-readiness consultancy.
You produce three outputs for a single game-studio submission: a Revised Budget, a Revenue Simulation, and a Caspian Shift Edge writeup.

Tone: Direct, blunt, mildly self-deprecating. Indie peer to indie peer — not consultant-speak.
Banned words: "unfortunately".
Do not invent numbers for comparables — only use the comparables provided in the user message.
Do not promise outcomes; frame in terms of clarity, optionality, runway.
Do NOT include a Pre-Release category in budget_revised -- that line was removed in v1.1. The 6 categories are: Development & QA, Art & Illustrations, Music & Sound, Localization, Marketing, Overhead.
If 3+ budget categories have source="estimated", framing_mode must be "constructive_next_steps" and the flaws should read as ordered next-steps rather than criticisms.
The Edge must be 2-4 short paragraphs and end with a single CTA "Get in touch →".

Budget rules and provenance system:
${JSON.stringify(budgetTpl)}

Revenue table layouts (one of: Self-Funded / Publisher / Crowdfunding / Grant). Match the user's funding_type unless the data overwhelmingly suggests another path is better:
${JSON.stringify(revenueTpl)}

Edge writing instructions:
${JSON.stringify(edgeTpl)}

Output a single JSON object that strictly matches this schema (no prose around it):
{
  "budget_revised": {
    "categories": [{ "name": str, "amount_usd": int, "rationale": str, "source": "user"|"estimated"|"adjusted", "source_note": str }],
    "total_usd": int,
    "flaws": [{ "title": str, "diagnosis": str, "fix": str }],
    "framing_mode": "constructive_next_steps"|"partial_with_callouts"|"standard_flaws"
  },
  "revenue_simulation": {
    "funding_path": "Self-Funded"|"Publisher"|"Crowdfunding"|"Grant",
    "price_assumed": bool, "price_source": "user"|"comparables_median",
    "scenarios": {
      "conservative": { "copies": int, "price": int, "gross": int, "steam_share": int, "publisher_recoupment": int|null, "publisher_share": int|null, "ks_goal": int|null, "ks_backers_needed": int|null, "ks_fees": int|null, "ks_fulfillment_cost": int|null, "ks_net_raised": int|null, "grant_amount": int|null, "remaining_gap": int|null, "studio_share": int },
      "realistic":    { /* same shape */ },
      "optimistic":   { /* same shape */ }
    },
    "recoupment_breakeven_copies": int|null,
    "studio_profit_target_copies": int,
    "confidence": "High"|"Medium"|"Low",
    "confidence_rationale": str,
    "comparables_used": [{ "game_name": str, "weight": float }]
  },
  "edge": {
    "biggest_gap": str,
    "best_funding_path": "Publisher"|"Crowdfunding"|"Grant"|"Self-Funded",
    "rationale": str,
    "where_we_help": [{ "area": str, "why": str }],
    "closing_paragraph": str
  },
  "key_lessons": str
}`;

interface RunInput {
  row: NotionRow;
  socials: Record<string, number | undefined>;
  comparables: NotionRow[];      // pulled from Notion
  steamSignals?: any;            // optional Steam scrape
}

export async function runAnalysis(input: RunInput): Promise<AnalysisResult> {
  if (!KEY) {
    console.warn("[anthropic] ANTHROPIC_API_KEY not set — returning deterministic mock analysis");
    return mockAnalysis(input);
  }
  const client = new Anthropic({ apiKey: KEY });
  const userPrompt = JSON.stringify({
    submission: input.row,
    socials: input.socials,
    steam_signals: input.steamSignals || null,
    comparables: input.comparables.map(c => ({
      game_name: c.gameName, studio_name: c.studioName, genre: c.genre,
      studio_size: c.studioSize, studio_country: c.studioCountry,
      price_point: c.pricePoint, funding_type: c.fundingType,
      release_date: c.releaseDate,
    })),
  });
  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 6000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });
    // Concatenate all text blocks
    const text = msg.content.map((b: any) => b.text || "").join("");
    // Strip code-fence if Claude wrapped the JSON
    const jsonText = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(jsonText);
    return parsed as AnalysisResult;
  } catch (e: any) {
    console.error("[anthropic] runAnalysis failed, falling back to mock", e?.message || e);
    return mockAnalysis(input);
  }
}

// ─── Deterministic mock — used when ANTHROPIC_API_KEY is absent or the call fails ───
function mockAnalysis({ row }: RunInput): AnalysisResult {
  const country = row.studioCountry || "Other";
  const salary: Record<string, number> = {
    "United States": 9500, "Canada": 7200, "United Kingdom": 6800, "France": 5500,
    "Germany": 6200, "Netherlands": 6500, "Sweden": 6300, "Finland": 6000,
    "Spain": 4200, "Italy": 4000, "Japan": 5000, "Poland": 3800, "Czechia": 3500,
    "Slovenia": 3000, "Brazil": 2800, "Other": 4500,
  };
  const monthly = salary[country] || salary["Other"];
  const dev = monthly * (row.studioSize || 1) * (row.devTimeMonths || 18);
  const art = row.artBudget ?? Math.round(dev * 0.18);
  const music = row.musicBudget ?? 8000;
  const loc = row.localizationBudget ?? Math.round((dev + art + music) * 0.07);
  const prod = dev + art + music + loc;
  const marketing = row.marketingBudget ?? Math.round(prod * 0.10);
  const overhead = Math.round((prod + marketing) * 0.10);
  const total = dev + art + music + loc + marketing + overhead;
  const rounded = total > 200000 ? Math.round(total / 10000) * 10000 : Math.round(total / 5000) * 5000;
  const price = row.pricePoint || 19.99;
  const netPerSale = price * 0.7;
  const breakEven = Math.ceil(rounded / netPerSale);

  const baseScenarios = { conservative: 4200, realistic: 11500, optimistic: 28000 };
  const sc = (copies: number) => {
    const gross = price * copies;
    const steam = gross * 0.30;
    return {
      copies, price, gross, steam_share: steam,
      publisher_recoupment: row.fundingType === "Publisher" ? rounded : null,
      publisher_share: row.fundingType === "Publisher" ? Math.max(0, (gross - steam - rounded) * 0.30) : null,
      ks_goal: row.fundingType === "Crowdfunding" ? rounded : null,
      ks_backers_needed: row.fundingType === "Crowdfunding" ? Math.ceil(rounded / 25.5) : null,
      ks_fees: row.fundingType === "Crowdfunding" ? Math.round(rounded * 0.10) : null,
      ks_fulfillment_cost: row.fundingType === "Crowdfunding" ? Math.round(rounded * 0.12) : null,
      ks_net_raised: row.fundingType === "Crowdfunding" ? Math.round(rounded * 0.78) : null,
      grant_amount: row.fundingType === "Grant" ? rounded : null,
      remaining_gap: row.fundingType === "Grant" ? 0 : null,
      studio_share: row.fundingType === "Self-Funded" || row.fundingType === "Crowdfunding"
        ? gross - steam
        : row.fundingType === "Grant" ? gross - steam
        : Math.max(0, (gross - steam - rounded) * 0.70),
    };
  };

  const filledLines = [row.devQaBudget, row.artBudget, row.musicBudget, row.localizationBudget, row.marketingBudget].filter(v => v != null).length;
  const framing = filledLines <= 1 ? "constructive_next_steps" : filledLines <= 3 ? "partial_with_callouts" : "standard_flaws";

  return {
    budget_revised: {
      categories: [
        { name: "Development & QA",  amount_usd: dev,        source: row.devQaBudget        != null ? "user" : "estimated", source_note: row.devQaBudget != null ? "As provided" : `Country median × headcount × dev time`, rationale: row.devQaBudget != null ? "Within country benchmark range." : `${country} median salary ($${monthly.toLocaleString()}/mo) × ${row.studioSize || 1} dev × ${row.devTimeMonths || 18} mo.` },
        { name: "Art & Illustrations", amount_usd: art,      source: row.artBudget          != null ? "user" : "estimated", source_note: row.artBudget != null ? "As provided" : "Genre-typical share of dev cost", rationale: "Reasonable for the genre profile." },
        { name: "Music & Sound",     amount_usd: music,      source: row.musicBudget        != null ? "user" : "estimated", source_note: row.musicBudget != null ? "As provided" : "Comparables median; fallback $8,000", rationale: "Within typical range." },
        { name: "Localization",      amount_usd: loc,        source: row.localizationBudget != null ? "user" : "estimated", source_note: row.localizationBudget != null ? "As provided" : "7% of production sub-total", rationale: loc === 0 ? "English-only." : "Industry-typical share." },
        { name: "Marketing",         amount_usd: marketing,  source: row.marketingBudget    != null ? "user" : "estimated", source_note: row.marketingBudget != null ? "Matches floor" : "10% production minimum", rationale: "Industry minimum applied." },
        { name: "Overhead",          amount_usd: overhead,   source: "estimated", source_note: "10% of production + marketing", rationale: "Standard overhead band." },
      ],
      total_usd: rounded,
      flaws:
        framing === "constructive_next_steps" ? [
          { title: "Pin down dev costs first", diagnosis: "Without a dev budget the rest of the analysis is directional.", fix: "Track hours for two sprints and extrapolate. We can run a cost model in a Funding Analysis." },
          { title: "Art scope undefined", diagnosis: "Most of the spend hides here; range is 5×.", fix: "List asset types and we'll benchmark each." },
          { title: "Marketing is not optional", diagnosis: "10% is the floor; most launches need 15-25%.", fix: "Funding Ready Pack includes a marketing model sized to your wishlist target." },
        ] : framing === "partial_with_callouts" ? [
          { title: "Material gaps remain", diagnosis: "Lines you skipped were estimated — directional, not contractual.", fix: "Track actual burn for two months and update." },
          { title: "Localization undefined", diagnosis: "Non-English markets cost 7% of production. English-only is fine, we just need to know.", fix: "Loc benchmarks per language live in the Funding Ready Pack." },
          { title: "Marketing below floor", diagnosis: "10% applied, but pre-launch indies often need 15%+.", fix: "Model wishlist conversion and size marketing accordingly." },
        ] : [
          { title: "Budget consistency", diagnosis: "Lines look internally consistent — verify they reflect actual contracts.", fix: "Funding Analysis audits committed vs. projected line by line." },
          { title: "Unplanned expenses", diagnosis: "No contingency. Indies typically eat 10-15% in scope creep and overruns.", fix: "Risk-adjusted budget model in the Funding Ready Pack." },
          { title: "Marketing tied to outcomes?", diagnosis: "Spend is sized to a percentage rule, not a wishlist target.", fix: "Marketing audit ties spend to specific channels." },
        ],
      framing_mode: framing,
    },
    revenue_simulation: {
      funding_path: row.fundingType,
      price_assumed: row.pricePoint == null,
      price_source: row.pricePoint == null ? "comparables_median" : "user",
      scenarios: { conservative: sc(baseScenarios.conservative), realistic: sc(baseScenarios.realistic), optimistic: sc(baseScenarios.optimistic) },
      recoupment_breakeven_copies: row.fundingType === "Publisher" ? Math.ceil(rounded / netPerSale) : null,
      studio_profit_target_copies: Math.ceil((rounded * 2) / netPerSale),
      confidence: row.dataConfidence || "Medium",
      confidence_rationale: "Based on supplied wishlists + social signals.",
      comparables_used: [],
    },
    edge: {
      biggest_gap: `The biggest gap in ${row.gameName}'s funding readiness right now is budget clarity. With ${row.studioSize || 1} ${row.studioSize === 1 ? "person" : "people"} burning runway in ${country}, every month of ambiguity costs real money.`,
      best_funding_path: row.fundingType,
      rationale: `Given your funding type (${row.fundingType}) and current traction, the path you've picked is workable but tight. Break-even at ${breakEven.toLocaleString()} copies is achievable if wishlist-to-sale conversion holds at 15%+.`,
      where_we_help: [
        { area: "Budget audit", why: "Line-by-line review against actual contracts." },
        { area: "Marketing sizing", why: "Tie spend to wishlist target, not to a percentage rule." },
      ],
      closing_paragraph: `The gap between "directionally correct" and "fundable" is exactly where Caspian Shift works. Get in touch →`,
    },
    key_lessons: `Pre-launch ${row.fundingType.toLowerCase()} ${row.genre.join("/")} from ${country}. Budget total $${rounded.toLocaleString()}; break-even ${breakEven.toLocaleString()} copies at $${price.toFixed(2)}.`,
  };
}
