# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — `netlify dev` on http://localhost:8888. Serves the static HTML and runs the functions locally; `/api/*` rewrites and `/budget` redirects only work through this proxy (not via opening the file directly).
- `npm run deploy` — `netlify deploy --prod`.
- No test suite, no lint, no build step. Functions are bundled by Netlify with esbuild from TS at deploy time (see `netlify.toml`); `tsc` is only used by the editor — there is no compile step to run.

## Architecture

Two-page marketing site with a serverless Funding Analysis tool. **No framework, no build pipeline** — `index.html` and `budget.html` are hand-written vanilla HTML/CSS/JS files served as-is by Netlify (`publish = "."`). The Funding Analysis is a 3-step wizard backed by Netlify Functions in `netlify/functions/`.

### Frontend
- `index.html` — marketing site (sections: hero, services, about, contact).
- `budget.html` — single-file SPA built with a tiny `h(tag, attrs, ...children)` helper instead of React. State machine has four pages (`landing → wizard → loading → results`) and persists to `localStorage` under `cs_funding_tool_v2` / `cs_funding_pageid_v2`. Wizard steps: **Game (1) → Studio (2) → Budget (3)**. Step 1 returns a `notionPageId`; steps 2 and 3 PATCH that page id directly. After step 3, a single `GET /api/results?notionPageId=…` returns the full payload (no polling). The page falls back to `buildLocalResults()` (deterministic mirror of `results.ts`) when opened on `file://` or against an unconfigured backend.

### Backend (Netlify Functions, TypeScript)

```
step1 (POST)  ─→ creates Notion row, returns notionPageId
step2 (POST)  ─→ PATCHes studio fields by notionPageId
step3 (POST)  ─→ PATCHes budget fields by notionPageId; writes Pre-Release Budget
results (GET) ─→ reads the Notion row, runs deterministic budget + revenue math, returns ResultsPayload
```

- `step1.ts` validates the Game body and calls `createStep1Row` to create the Notion row, returning `{ ok, notionPageId }`.
- `step2.ts`, `step3.ts` — thin wrappers around `patchStep2` / `patchStep3` keyed by `notionPageId`. `step2.ts` writes `Funding Type` as a Notion **multi-select** (the user can pick any combination of Self-Funded / Crowdfunding / Publisher / Grant). `step3.ts` computes `Pre-Release Budget = sum of user-provided line items (blank → 0)` per spec §4 and writes it to Notion alongside the line items.
- `results.ts` — synchronous endpoint. Reads the row, applies the budget derivation rules: country salary × headcount × dev time for the Dev anchor; flat shares cascade off the running subtotal — Art = 20% of Dev, Music = 5% of (Dev + Art), Loc = 5% of (Dev + Art + Music), Marketing = 15% of (Dev + Art + Music + Loc), Overhead = 5% of (Dev + Art + Music + Loc + Marketing). Each line is classified blank/coherent/below/above against a ±50% band; below cascades defensively against the estimate, above cascades with the user value. Total rounds to $5K bands under $200K, $10K bands above. Revenue simulation is funding-agnostic: 3 scenarios (Conservative / Realistic / Optimistic) using `COPIES_SOLD = [500, 5000, 50000]` from `_shared/types.ts`. Each scenario returns `copies_sold`, `gross_revenue` (= price × copies), `net_revenue` (= gross × 0.70 after Steam's 30% cut), and `studio_share` (same as net_revenue in this self-funded math — kept as a distinct field for downstream extension).

### `netlify/functions/_shared/`
- `types.ts` — request bodies, `ResultsPayload`, `NotionRow`, and the single `RevenueSimulation` shape (`{ price, scenarios: { conservative, realistic, optimistic } }`).
- `notion.ts` — wraps `@notionhq/client`. The `P` constant holds the **exact** column names on the Game Case Studies DB. PATCHes go through `c.pages.update({ page_id })` directly — no submissionId lookup hop (v2 simplification).
- `validate.ts` — zod schemas for each request body. `Step2Schema.fundingType` is `z.array(...).min(1)`.
- `http.ts` — response helpers + per-IP `rateLimit` Map.

### Notion DB schema (must exist)
- **Game Case Studies** — main submissions DB. Columns referenced: `Game Name` (title), `Studio Name`, `Status`, `Genre` (multi-select), `Developers`, `Studio Country`, `Release Date`, `Funding Type` (**multi-select**), `Dev Time (months)`, `Dev and QA Budget`, `Art Budget`, `Music Budget`, `Localization Budget`, `Marketing Budget`, `Overhead Budget`, `Pre-Release Budget`, `Source Type`. New rows get `Source Type=CS Pilot`.

### Mock-mode invariant
**Every Notion call degrades to a no-op when `NOTION_API_KEY` is missing**, so a fresh checkout with empty `.env` runs end-to-end in mock mode:
- No `NOTION_API_KEY` → `notion.ts` returns `null` everywhere. `step1` returns `{ notionPageId: null }`; the frontend then can't call PATCH/GET for real, so it relies on its in-page `buildLocalResults()` mock (a deterministic mirror of `results.ts`).

When adding a new external integration, follow this pattern — never hard-fail on a missing key.

### Routing (`netlify.toml`)
- `/budget` and `/budget/` rewrite to `/budget.html` (status 200, not 301 — preserves the URL).
- `/api/*` rewrites to `/.netlify/functions/:splat`.
- Stricter CSP applies to `/budget*` only (`connect-src 'self'`); `index.html` keeps the looser site-wide policy.

## Conventions

- Don't include PII in `log()` calls. The current logs include `notionPageId`, `gameName`, and timing — no email or address fields exist in v2.
- The Notion column names in `_shared/notion.ts` (`P` constants) must stay in sync with the actual DB schema. If a column is renamed in Notion, update them — there's no schema migration, and silent failures are easy to miss.
- `tsconfig.json` has `strict: false` / `noImplicitAny: false` — don't tighten without checking that nothing in the function bundles regresses.
