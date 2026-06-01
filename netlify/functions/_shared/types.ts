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
  fundingType: FundingType[];
  steamPageUrl?: string;
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
  genrePageIds?: string[];        // Notion page ids of the related Genre rows (relation → Genres DB)
  releaseDate: string;
  studioName: string;
  studioSize: number;
  studioCountry: string;
  studioCountryPageId?: string;   // Notion page id of the related Country row (relation → Countries DB)
  fundingType: FundingType[];
  steamPageUrl?: string;
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

export interface ScenarioBase {
  copies_sold: number;
  gross_revenue: number;
  net_revenue: number;
  studio_share: number;
}

export interface RevenueSimulation {
  price: number;
  scenarios: { conservative: ScenarioBase; realistic: ScenarioBase; optimistic: ScenarioBase };
}

// ─── Funding Path sections (rendered after the budget) ──────────────────
// Real-data sections (Publisher, Grant) stack when both are selected; otherwise a
// single placeholder card (Crowdfunding or Self) renders.
export type BudgetBucket = "Low" | "Medium" | "High";

export interface PublisherCard {
  name: string;
  country: string;
  budget: BudgetBucket | null;
  genres: string[];
  releasedGames: number;
  totalRevenue: number;
  pitchLink: string | null;
}

export interface GrantCard {
  name: string;
  country: string;                // The matched country (single, derived from user's studio country)
  type: string | null;            // Grant | Award | Tax Credit | Repayable Advance
  applicationCadence: string | null;  // Annual | Quarterly | One-off | Rolling
  link: string | null;
}

export interface CrowdfundingCard {
  name: string;
  country: string;                 // Resolved from the Country relation to the Countries DB
  genres: string[];
  raisedAmount: number;            // USD
  backers: number;
  campaignUrl: string | null;
}

// Creator & Media Database card. Powers the Creator Matcher tool (/matcher).
// Only the YouTuber type is populated today; other types may be added later.
export interface CreatorCard {
  name: string;
  type: string;                    // "YouTuber" today; future: Streamer | Writer | Podcast | TikTok
  genres: string[];
  audience: number;                // subscriber / follower count
  channelUrl: string | null;
}

// POST /api/match-creators — fields collected by the Creator Matcher form.
// Backend uses genres for filtering; gameName + similarGame are captured for
// logging today and for future similar-game boost (n8n workflow, separate).
export interface MatchCreatorsBody {
  gameName: string;
  genres: string[];
  similarGame?: string;
}

export type FundingPathSection =
  | { kind: "publisher"; items: PublisherCard[] }
  | { kind: "grant"; items: GrantCard[] }
  | { kind: "crowdfunding"; items: CrowdfundingCard[] }
  | { kind: "self" };

export interface ResultsPayload {
  status: "ready";
  studio_name: string;
  game_name: string;
  studio_country: string;
  genre: string[];
  funding_type: FundingType[];
  budget: BudgetRevised;
  revenue: RevenueSimulation;
  funding_paths: FundingPathSection[];
  generatedAt: string;
}
