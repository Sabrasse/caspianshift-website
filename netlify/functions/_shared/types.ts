// Shared TypeScript interfaces for the Funding Analysis functions.

export type GameStatus =
  | "Concept" | "Prototype" | "Vertical Slice" | "Demo"
  | "In Development" | "Alpha" | "Beta";

export type FundingType = "Self-Funded" | "Crowdfunding" | "Publisher" | "Grant";

// ─── Request bodies ─────────────────────────────────────────────────
// Step 1 (Game): creates the Notion row.
export interface Step1Body {
  gameName: string;
  status: GameStatus;
  genre: string[];
  releaseDate: string;          // YYYY-MM or YYYY-MM-DD
}

// Step 2 (Studio): PATCHes the row created in Step 1.
export interface Step2Body {
  notionPageId: string;
  studioName: string;
  studioSize: number;
  studioCountry: string;
  fundingType: FundingType;
}

// Step 3 (Budget): PATCHes the row and writes Pre-Release Budget total.
export interface Step3Body {
  notionPageId: string;
  devTimeMonths: number;
  devQaBudget?: number;
  artBudget?: number;
  musicBudget?: number;
  localizationBudget?: number;
  marketingBudget?: number;
  overheadBudget?: number;
}

// ─── Notion row shape (subset we read/write) ────────────────────────
export interface NotionRow {
  pageId: string;
  gameName: string;
  status: GameStatus;
  genre: string[];
  releaseDate: string;
  studioName: string;
  studioSize: number;
  studioCountry: string;
  fundingType: FundingType;
  devTimeMonths?: number;
  devQaBudget?: number;
  artBudget?: number;
  musicBudget?: number;
  localizationBudget?: number;
  marketingBudget?: number;
  overheadBudget?: number;
  preReleaseBudget?: number;
}

// ─── Result shape returned by /api/results ──────────────────────────
export type Provenance = "user" | "estimated" | "below" | "above";

export interface BudgetLine {
  key: "dev" | "art" | "music" | "loc" | "marketing" | "overhead";
  label: string;
  amount_usd: number;
  source: Provenance;
  rationale: string;
  provided: number | null;  // user-submitted value, null if blank
  revised: number;           // pure-estimate cascade (blanks-only)
}

export interface BudgetRevised {
  lines: BudgetLine[];
  total_usd: number;          // cascade-aware total (drives revenue scenarios)
  total_provided: number;      // sum of provided non-null values, raw
  total_revised: number;       // sum of revised values, banded
}

// Hardcoded scenarios (Decisions Log #6/#7).
export const COPIES_SOLD = [500, 5000, 50000] as const;
export const GRANT_AMOUNTS = [25000, 50000, 100000] as const;
export const CROWDFUNDING_TIERS = [
  { label: "Tier 1", price: 15 },
  { label: "Tier 2", price: 25 },
  { label: "Tier 3", price: 30 },
  { label: "Tier 4", price: 50 },
] as const;

export interface ScenarioBase {
  copies: number;
  price: number;
  gross: number;
  steam_share: number;
  studio_share: number;
}
export interface ScenarioPublisher extends ScenarioBase {
  publisher_recoupment: number;
  publisher_share: number;
}
export interface ScenarioGrant extends ScenarioBase {
  grant_amount: number;
  remaining_gap: number;
}

export interface CrowdfundingTier {
  label: string;
  price: number;
  backers: number;
}
export interface CrowdfundingResult {
  tiers: CrowdfundingTier[];
  total_backers: number;
  total_raised: number;
}

export type RevenueSimulation =
  | { funding_path: "Self-Funded";   price: number; scenarios: { conservative: ScenarioBase;      realistic: ScenarioBase;      optimistic: ScenarioBase } }
  | { funding_path: "Publisher";     price: number; scenarios: { conservative: ScenarioPublisher; realistic: ScenarioPublisher; optimistic: ScenarioPublisher } }
  | { funding_path: "Grant";         price: number; scenarios: { conservative: ScenarioGrant;     realistic: ScenarioGrant;     optimistic: ScenarioGrant } }
  | { funding_path: "Crowdfunding";  price: number; crowdfunding: CrowdfundingResult };

export interface ResultsPayload {
  status: "ready";
  studio_name: string;
  game_name: string;
  funding_type: FundingType;
  budget: BudgetRevised;
  revenue: RevenueSimulation;
  generatedAt: string;
}

// ─── Caspian Shift recommendation cards ─────────────────────────────
export type CaspianFundingType = "Publisher" | "Crowdfunding" | "Grant";

export interface CaspianCard {
  title: string;
  description: string;
  tags: string[];
}
