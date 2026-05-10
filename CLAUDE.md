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
caspian (GET) ─→ queries Publisher / Crowdfunding / Grant DB; returns ≤ 3 cards
```

- `step1.ts` validates the Game body and calls `createStep1Row` to create the Notion row, returning `{ ok, notionPageId }`.
- `step2.ts`, `step3.ts` — thin wrappers around `patchStep2` / `patchStep3` keyed by `notionPageId`. `step3.ts` computes `Pre-Release Budget = sum of user-provided line items (blank → 0)` per spec §4 and writes it to Notion alongside the line items.
- `results.ts` — synchronous endpoint. Reads the row, applies the budget derivation rules: country salary × headcount × dev time for the Dev anchor; flat shares cascade off the running subtotal — Art = 20% of Dev, Music = 5% of (Dev + Art), Loc = 5% of (Dev + Art + Music), Marketing = 15% of (Dev + Art + Music + Loc), Overhead = 5% of (Dev + Art + Music + Loc + Marketing). Each line is classified blank/coherent/below/above against a ±50% band; below cascades defensively against the estimate, above cascades with the user value. Total rounds to $5K bands under $200K, $10K bands above. Hardcoded constants live in `_shared/types.ts`: `COPIES_SOLD = [500, 5000, 50000]`, `GRANT_AMOUNTS = [25000, 50000, 100000]`, `CROWDFUNDING_TIERS = [{$15}, {$25}, {$30}, {$50}]`. Crowdfunding backers per tier = `ceil(totalBudget / 4 / tier_price)` (equal-weight, Decisions Log #12).
- `caspian.ts` — routes `Publisher` / `Crowdfunding` / `Grant` to the matching reference DB. Filter is `Genre` (multi-select) for Publisher/Crowdfunding and `Country` (select) for Grant. Card title comes from `Publisher Name` / `Crowdfunding Name` / `Grant Name`; description is auto-formatted from `Total Revenue` / `Raised Amount` / `Maximum Grant Amount`; tags are taken from the filter column. There is no per-card URL — every "Get in Touch" CTA links to `/#contact`.

### `netlify/functions/_shared/`
- `types.ts` — request bodies, `ResultsPayload`, `NotionRow`, the hardcoded scenario constants, and the `RevenueSimulation` discriminated union (Self-Funded/Publisher/Grant share a `scenarios` shape; Crowdfunding has a separate `crowdfunding` shape with the 4-tier table).
- `notion.ts` — wraps `@notionhq/client`. The `P` constant holds the **exact** column names on the Game Case Studies DB; `R` holds the column names on the three reference DBs. PATCHes go through `c.pages.update({ page_id })` directly — no submissionId lookup hop (v2 simplification).
- `validate.ts` — zod schemas for each request body plus `CaspianQuerySchema`.
- `http.ts` — response helpers + per-IP `rateLimit` Map.

### Notion DB schema (must exist)
- **Game Case Studies** — main submissions DB. Columns referenced: `Game Name` (title), `Studio Name`, `Status`, `Genre`, `Developers`, `Studio Country`, `Release Date`, `Funding Type`, `Dev Time (months)`, `Dev and QA Budget`, `Art Budget`, `Music Budget`, `Localization Budget`, `Marketing Budget`, `Overhead Budget`, `Pre-Release Budget`, `Source Type`. New rows get `Source Type=CS Pilot`.
- **Publisher DB** — title `Publisher Name`, amount `Total Revenue`, filter `Genre` (multi-select).
- **Crowdfunding DB** — title `Crowdfunding Name`, amount `Raised Amount`, filter `Genre` (multi-select).
- **Grant DB** — title `Grant Name`, amount `Maximum Grant Amount`, filter `Country` (select).

### Mock-mode invariant
**Every Notion call degrades to a no-op when `NOTION_API_KEY` is missing**, so a fresh checkout with empty `.env` runs end-to-end in mock mode:
- No `NOTION_API_KEY` → `notion.ts` returns `null`/`[]` everywhere. `step1` returns `{ notionPageId: null }`; the frontend then can't call PATCH/GET for real, so it relies on its in-page `buildLocalResults()` mock (a deterministic mirror of `results.ts`).
- No reference DB id (`NOTION_PUBLISHER_DB_ID` etc.) → `queryCaspianCards` returns `[]` and the frontend renders a generic "Get in touch" fallback card.

When adding a new external integration, follow this pattern — never hard-fail on a missing key.

### Routing (`netlify.toml`)
- `/budget` and `/budget/` rewrite to `/budget.html` (status 200, not 301 — preserves the URL).
- `/api/*` rewrites to `/.netlify/functions/:splat`.
- Stricter CSP applies to `/budget*` only (`connect-src 'self'`); `index.html` keeps the looser site-wide policy.

## Conventions

- Don't include PII in `log()` calls. The current logs include `notionPageId`, `gameName`, and timing — no email or address fields exist in v2.
- The Notion column names in `_shared/notion.ts` (`P` and `R` constants) must stay in sync with the actual DB schema. If a column is renamed in Notion, update both — there's no schema migration, and silent failures are easy to miss.
- `tsconfig.json` has `strict: false` / `noImplicitAny: false` — don't tighten without checking that nothing in the function bundles regresses.
