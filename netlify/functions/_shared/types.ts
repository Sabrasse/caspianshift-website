// Shared TypeScript interfaces for the Budget Tool functions.

export type GameStatus =
  | "Concept" | "Prototype" | "Vertical Slice" | "Demo"
  | "In Development" | "Alpha" | "Beta";

export type FundingType = "Self-Funded" | "Crowdfunding" | "Publisher" | "Grant";

export interface Step1Body {
  steamUrl?: string;
  gameName: string;
  status: GameStatus;
  genre: string[];
  studioName: string;
  studioSize: number;
  studioCountry: string;
  releaseDate: string;        // YYYY-MM-DD or YYYY-MM
  pricePoint?: number;
  fundingType: FundingType;
}

export interface Step2Body {
  submissionId: string;
  devTimeMonths: number;
  devQaBudget?: number;
  artBudget?: number;
  musicBudget?: number;
  localizationBudget?: number;
  marketingBudget?: number;
}

export interface Step3Body {
  submissionId: string;
  currentWishlists?: number;
  socials: {
    twitter?: number; tiktok?: number;
    youtube?: number; discord?: number; reddit?: number;
  };
  nextFestPlanned: boolean;
  primaryMarketingChannel?: string;
  comparables: Array<{ gameName: string; steamUrl?: string }>;
  _hp?: string;  // honeypot
}

export interface CaptureEmailBody {
  submissionId: string;
  email: string;
}

// Provenance of a budget line item
export type Provenance = "user" | "estimated" | "adjusted";

export interface BudgetCategory {
  name: string;
  amount_usd: number;
  rationale: string;
  source: Provenance;
  source_note: string;
}
export interface BudgetRevised {
  categories: BudgetCategory[];
  total_usd: number;
  flaws: Array<{ title: string; diagnosis: string; fix: string }>;
  framing_mode: "constructive_next_steps" | "partial_with_callouts" | "standard_flaws";
}

export interface RevenueScenario {
  copies: number;
  price: number;
  gross: number;
  steam_share: number;
  publisher_recoupment: number | null;
  publisher_share: number | null;
  ks_goal: number | null;
  ks_backers_needed: number | null;
  ks_fees: number | null;
  ks_fulfillment_cost: number | null;
  ks_net_raised: number | null;
  grant_amount: number | null;
  remaining_gap: number | null;
  studio_share: number;
}
export interface RevenueSimulation {
  funding_path: FundingType;
  price_assumed: boolean;
  price_source: "user" | "comparables_median";
  scenarios: { conservative: RevenueScenario; realistic: RevenueScenario; optimistic: RevenueScenario };
  recoupment_breakeven_copies: number | null;
  studio_profit_target_copies: number;
  confidence: "High" | "Medium" | "Low";
  confidence_rationale: string;
  comparables_used: Array<{ game_name: string; weight: number }>;
}

export interface Edge {
  biggest_gap: string;
  best_funding_path: FundingType;
  rationale: string;
  where_we_help: Array<{ area: string; why: string }>;
  closing_paragraph: string;
}

export interface AnalysisResult {
  budget_revised: BudgetRevised;
  revenue_simulation: RevenueSimulation;
  edge: Edge;
  key_lessons: string;
}

// Shape stored in KV under submissionId
export type ResultsStored =
  | { status: "pending" }
  | { status: "ready"; budget: BudgetRevised; revenue: RevenueSimulation; edge: Edge; generatedAt: string }
  | { status: "error"; message: string };

// Raw row in Notion (subset we actually read/write)
export interface NotionRow {
  pageId: string;
  submissionId: string;
  steamUrl?: string;
  gameName: string;
  status: GameStatus;
  genre: string[];
  studioName: string;
  studioSize: number;
  studioCountry: string;
  releaseDate: string;
  pricePoint?: number;
  fundingType: FundingType;
  devTimeMonths?: number;
  devQaBudget?: number;
  artBudget?: number;
  musicBudget?: number;
  localizationBudget?: number;
  marketingBudget?: number;
  preReleaseBudget?: number;
  currentWishlists?: number;
  primaryMarketingChannel?: string;
  nextFestPlanned?: boolean;
  sourceType: string;          // "CS Pilot" for tool submissions
  dataConfidence: "High" | "Medium" | "Low";
  submissionEmail?: string;
  sourceUrl?: string;
  keyLessons?: string;
}
