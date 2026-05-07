# 🛠️ Funding Tool — Build Spec v2

**Status:** Build-ready — handoff to Claude Code
**Hosting target:** budget.html (existing static site, same stack)
**Backend:** Notion DB + Vercel Functions
**Last revised:** 2026-05-07

---

## TL;DR

Funding Analysis is a 3-step web form on budget.html that collects game, studio, and budget data from indie developers, persists each submission progressively to a Notion DB, and generates four funding-path simulations (Self-Funded, Publisher, Crowdfunding, Grant) plus a Caspian Shift panel with DB-backed recommendations. v2 restructures the step layout (Game → Studio → Budget), fixes a silent Step 1–2 data-loss bug where no Notion rows were created, replaces AI-generated Caspian Shift copy with live Notion DB cards, and removes the email capture and "What's Next" sections.

---

## 1. Form / UI Structure

3-step wizard on budget.html. **Step 1 creates the Notion row and returns `notionPageId`. Steps 2–3 update that row.**

### Step 1 — Game
Subtitle: *"What game are you building?"*

- **Game Name** → `Game Name` column (text, required)
- **Status** → `Status` column (select, required)
- **Genre** → `Genre` column (multi-select, required)
- **Release Date** → `Release Date` column (date, required)
- **Similar Game** → creates a comparables row with `Steam Page URL` populated (optional)

System fields on Step 1 submit: `submissionId` (UUID, generated client-side), `notionPageId` (returned from API, persisted in session).

### Step 2 — Studio
Subtitle: *"What's the profile of your studio?"*

- **Studio Name** → `Studio Name` column (text, required)
- **Studio Size** → `Studio Size` column (number, required)
- **Studio Country** → `Studio Country` column (select, required)
- **Funding Type** → `Funding Type` column (select: Self-Funded / Publisher / Crowdfunding / Grant, required)

Updates the row from Step 1 using `notionPageId`.

### Step 3 — Budget
Subtitle: *"Fill in what you know. Blank fields are fine — we'll estimate from comparable games."*

- **Dev Time** → `Dev Time (months)` column (number, required)
- **Dev & QA Budget** → `Dev and QA Budget` column (number, optional)
- **Art Budget** → `Art Budget` column (number, optional)
- **Music & Sound Budget** → `Music Budget` column (number, optional)
- **Localization Budget** → `Localization Budget` column (number, optional)
- **Marketing Budget** → `Marketing Budget` column (number, optional)
- **Total Budget** (sum, displayed) → stored as `Pre-Release Budget` column (number, **TO ADD to DB**)

---

## 2. Data Model

Primary DB: 📊 Game Case Studies

### New column to add before deploy
- `Pre-Release Budget` — number, sum of Dev & QA + Art + Music + Localization + Marketing. **TO ADD.**

### Reference DBs (Caspian Shift — read only)
- 📊 Publisher DB — queried by genre
- 📊 Crowdfunding DB — queried by genre
- 📊 Grant DB — queried by studio country

---

## 3. Outputs

### Budget Revised panel
One revised benchmark per budget line with a one-liner explanation. Removes: Confidence score, "3 Flaws we caught" section.

### Revenue Simulation — Self-Funded / Publisher / Grant
Three columns: Conservative / Realistic / Optimistic. Copies sold fixed at 500 / 5,000 / 50,000. Grant amounts fixed at $25k / $50k / $100k. "Studio Share" label replaced with actual studio name from Step 2.

### Revenue Simulation — Crowdfunding
Backer breakdown table replacing the copies-sold rows:

| Tier | Price | Backers needed |
|------|-------|----------------|
| Tier 1 | $15 | auto-calculated |
| Tier 2 | $25 | auto-calculated |
| Tier 3 | $30 | auto-calculated |
| Tier 4 | $50 | auto-calculated |
| **Total Backers** | | sum |
| **Total Crowdfunding** | | sum |

Backers per tier auto-calculated to reach Total Budget Revised (equal-weight distribution across tiers).

### Caspian Shift panel
3 recommendation cards pulled from the relevant Notion DB, filtered by `Funding Type` + genre (publisher/crowdfunding) or studio country (grant). Each card: title, description, 1–2 tags, "Get in Touch" CTA. No AI-generated text.

### Removed sections
- "Want this in your inbox?" — deleted entirely
- "What's Next" — deleted entirely

---

## 4. Calculation Rules

- **Total Budget** = Dev & QA + Art + Music & Sound + Localization + Marketing
- **Pre-Release Budget** = Total Budget (stored on Step 3 submit to Notion)
- **Crowdfunding backers per tier** = `ceil(Total Budget Revised / 4 / tier_price)` — equal-weight default
- **Step 1→2 fix:** Step 1 must create the Notion row and return non-null `notionPageId`; Steps 2–3 PATCH that row

---

## 5. Acceptance Criteria

1. Step 1 creates a Notion row and returns non-null `notionPageId`; Steps 2–3 update that same row (verifiable in Game Case Studies DB)
2. Step 1 fields display in order: Game Name → Status → Genre → Release Date → Similar Game; step title reads "Game"
3. Step 2 fields display in order: Studio Name → Studio Size → Studio Country → Funding Type; step title reads "Studio"
4. Step 3 has budget fields (moved from old Step 2); Total Budget saves as `Pre-Release Budget` in Notion
5. Budget Revised panel shows one-liner per line; no Confidence score; no "3 Flaws" section
6. Revenue simulation uses fixed 500 / 5,000 / 50,000 copies; "Studio Share" label shows actual studio name
7. Crowdfunding panel shows 4-tier backer table with auto-calculated backers reaching Total Budget Revised
8. Grant scenario uses $25k / $50k / $100k fixed amounts
9. Caspian Shift shows 3 DB-backed recommendation cards matching Funding Type + genre/country filter; no AI-generated text
10. "Want this in your inbox?" and "What's Next" sections fully removed from DOM and logic
11. All "Budget Tool" strings replaced with "Funding Analysis" site-wide
12. Anthropic API key audited — removed if dead code, documented in Decisions Log if live

---

---

# 📋 Product Context

## What this is

Funding Analysis is a free, self-serve web tool for indie game developers. A 3-step form collects game details, studio profile, and budget figures; the tool returns a revised budget benchmark, four funding-path simulations, and three curated recommendations (publisher, grant, or crowdfunding comparables) drawn from live Notion databases.

v2 restructures the step layout (Game → Studio → Budget), fixes a Step 1→2 data-persistence bug that silently dropped all submissions from Steps 1 and 2, and replaces AI-generated Caspian Shift output with DB-backed recommendation cards.

## Why it exists

1. **Developers lack funding fluency.** Most first-time indie studios don't know what a realistic budget looks like or which funding paths fit their profile.
2. **Manual advisory doesn't scale.** A spreadsheet-and-DM approach caps at ~10 studios/month; a self-serve tool removes that ceiling entirely.
3. **Every submission enriches the DB.** Game Case Studies data compounds over time, improving budget benchmarks and recommendation quality.

## Target users

- **Indie developers (primary)** — solo devs or small studios (1–10 people) at Prototype or In Development stage, exploring funding for the first time. They arrive with a game concept and partial budget; they leave with a clearer sense of realistic figures and who to contact.
- **Internal / Caspian Shift team (secondary)** — reviews submissions and follows up via the "Get in Touch" CTA on the Caspian Shift panel.

## What it explicitly is not

- Not a financial advisor. Outputs are estimates from market data, not regulated advice.
- Not a matchmaking service. Recommendation cards are a starting point, not an endorsement or warm intro.
- Not a post-launch or full business-plan tool. Scope is pre-release budget and funding path only.

## Success metrics (v1)

- Bug resolved: 100% of submissions populate all 3 steps in Notion (currently 0% for Steps 1–2)
- Form completion rate ≥ 60% (Step 1 start → Step 3 submit)
- Caspian Shift cards displayed on ≥ 80% of completed submissions
- Zero AI-generated text in Caspian Shift panel

---

---

# 🎨 Design Brief

> Design-focused deliverable for Claude Design. Read the main Build Spec first.

## What you're designing

1. Step 1 — "Game" form (updated title, subtitle, field order)
2. Step 2 — "Studio" form (new content: moved fields from old Step 1, updated title/subtitle)
3. Step 3 — "Budget" form (moved fields from old Step 2)
4. Budget Revised panel (Confidence score removed, "3 Flaws" section removed)
5. Revenue Simulation panels — Self-Funded, Publisher, Grant (Studio Share → dynamic studio name, fixed values updated)
6. Revenue Simulation — Crowdfunding panel (replace copies-sold table with 4-tier backer table)
7. Caspian Shift panel (replace AI text with 3 recommendation cards + "Get in Touch" CTA)
8. Remove: "Want this in your inbox?" section and "What's Next" section

## Visual system to inherit

Inherit entirely from the existing budget.html. No new visual language. Use existing form components, typography, color tokens, and button styles throughout.

## Page-by-page specifics

### Steps 1–3
Update title text and subtitle text only. Field order resequencing is DOM reordering — no new layout components. Step navigation labels update to match new names: Game / Studio / Budget.

### Budget Revised panel
Remove the Confidence badge/score (entire element). Remove the "3 Flaws we caught" section (entire section). Keep the per-line one-liner layout unchanged.

### Revenue Simulation panels
"Studio Share" row label becomes a dynamic string showing the studio name submitted in Step 2. No layout change — text substitution only.

Crowdfunding panel: replace the copies-sold rows with a 4-tier backer breakdown table (Tier 1 $15 / Tier 2 $25 / Tier 3 $30 / Tier 4 $50 + Total Backers + Total Crowdfunding). Reuse the existing table component.

### Caspian Shift panel
Replace the current AI text output area with 3 recommendation cards. Each card: title, 1-line description, 1–2 matching tags (genre or country), and a "Get in Touch" CTA. If an existing card component is present on the page, reuse it. If not, design one consistent with the site's visual language.

## Components to design
1. **Recommendation card** (if no existing card component) — title, description, tag chips, CTA button.

## Don'ts
- Don't redesign the overall form flow or introduce new visual patterns — this is a restructure and bug fix release, not a redesign.
- Don't add new loading states or animations beyond what already exists.
- Don't design an intro or onboarding screen — the existing entry point is unchanged.
- Don't include "Want this in your inbox?" or "What's Next" in any mockup.

## Deliverables
1. Annotated mockups: Step 2 (new field composition), Caspian Shift panel (3 recommendation cards), Budget Revised panel (Confidence and Flaws removed).
2. Redline notes on field reordering where spacing adjusts.

---

---

# ⚙️ Code Brief

> Implementation-focused deliverable for Claude Code. Read the main Build Spec first, then Design Brief mockups before implementing UI changes.

## Priority 1 — Bug fix: Step 1→2 data loss

**Symptom:** Step 1 returns `{"submissionId":"...","notionPageId":null}`. Step 2 returns `{"ok":true}` but creates no Notion record. Step 3 creates a new row only when a Similar Game is added.

**Root cause:** Step 1 API does not create a Notion row on submit — it returns `notionPageId: null`. Steps 2–3 have nothing to update.

**Fix:**
- `POST /api/submit` (Step 1): create the Notion row immediately, return `{ submissionId, notionPageId }` with non-null `notionPageId`
- Client persists `notionPageId` in session state across steps
- `PATCH /api/submit` (Steps 2 & 3): update the existing row using `notionPageId`

## Repository layout

Existing structure — audit and remove dead code as part of this build:

```
project-root/
├── budget.html          (MODIFY — field reorder, titles, remove sections)
├── api/
│   ├── submit.js        (MODIFY — fix row creation on Step 1; PATCH for Steps 2–3)
│   ├── results.js       (MODIFY — update revenue calc constants; remove email logic)
│   └── caspian.js       (MODIFY — replace AI call with Notion DB query)
├── .env                 (AUDIT — confirm or remove ANTHROPIC_API_KEY)
└── package.json         (AUDIT — remove unused deps after dead code cleanup)
```

## API contracts

### POST /api/submit — Step 1
```json
{
  "step": 1,
  "gameName": "string",
  "status": "string",
  "genre": ["string"],
  "releaseDate": "YYYY-MM-DD",
  "similarGame": "string | null"
}
```
Response: `{ "ok": true, "submissionId": "uuid", "notionPageId": "notion-row-id" }`

Side effects: creates a row in Game Case Studies DB; if `similarGame` provided, creates a comparables row with `Steam Page URL` populated.

### PATCH /api/submit — Step 2
```json
{
  "notionPageId": "string",
  "step": 2,
  "studioName": "string",
  "studioSize": "number",
  "studioCountry": "string",
  "fundingType": "string"
}
```

### PATCH /api/submit — Step 3
```json
{
  "notionPageId": "string",
  "step": 3,
  "devTime": "number",
  "devQaBudget": "number | null",
  "artBudget": "number | null",
  "musicBudget": "number | null",
  "localizationBudget": "number | null",
  "marketingBudget": "number | null"
}
```

Both PATCH calls return: `{ "ok": true }`

### GET /api/caspian
Query params: `fundingType` (publisher | crowdfunding | grant), `genre` (string), `country` (string)

DB routing: publisher → Publisher DB filtered by genre; crowdfunding → Crowdfunding DB filtered by genre; grant → Grant DB filtered by country.

Response: `{ "ok": true, "cards": [{ "title": "", "description": "", "tags": [], "url": "" }] }` — 3 records max.

## Revenue calculation constants
- Copies Sold: hardcoded `[500, 5000, 50000]` for Conservative / Realistic / Optimistic
- Grant amounts: hardcoded `[25000, 50000, 100000]`
- Studio Share label: dynamic from `studioName` session value
- Crowdfunding backers per tier: `ceil(totalBudgetRevised / 4 / tier_price)` — equal-weight distribution

## Anthropic API audit
`ANTHROPIC_API_KEY` has never been called per Anthropic Console. During this build: confirm it is dead code and remove it (key, import, and all call sites). If a live use case is found, document it in the Decisions Log before proceeding.

## External services
- Notion API — row create (Step 1), row update (Steps 2–3), DB query (Caspian); env var: `NOTION_API_KEY`
- Anthropic API — audit and remove unless a live use case is documented

## Environment variables
- `NOTION_API_KEY` — Notion integration token
- `NOTION_DB_ID` — Game Case Studies DB
- `NOTION_PUBLISHER_DB_ID` — Publisher DB
- `NOTION_CROWDFUNDING_DB_ID` — Crowdfunding DB
- `NOTION_GRANT_DB_ID` — Grant DB
- `ANTHROPIC_API_KEY` — remove after audit (unless live use case found)

## Engineering standards (assumed)
zod validation on all request bodies, structured JSON logs with `submissionId` on every Notion API call (success/failure visible in Vercel function logs). GitHub → Vercel auto-deploy. Keep the existing stack — no new frameworks or persistence layers.

## Don'ts
- Don't change the tech stack or introduce a new framework.
- Don't add persistence beyond Notion.
- Don't leave dead code after the audit — clean repo is an acceptance criterion.
- Don't call Anthropic API for Caspian Shift cards.

---

---

# 🧠 Decisions Log

> Overrideable decisions taken during the spec phase. Append-only — add new entries as decisions land during build. If any entry is wrong, update it here and notify the build team.

1. **Step restructure — 3 steps, same count:** Step 1 = Game, Step 2 = Studio, Step 3 = Budget. Field sets redistributed across steps; no new step added.
2. **Step 1 creates the Notion row:** The API must create the row on Step 1 submit and return a non-null `notionPageId`. This is the fix for the silent-fail bug.
3. **`notionPageId` held in client session state:** Stored in browser session between steps (not localStorage). If a user closes the tab mid-form, the partial submission is orphaned in Notion. Acceptable for v1; recovery flow deferred to Backlog.
4. **Similar Game stored as a comparables row:** The `Similar Game` field creates a new row in the comparables DB with `Steam Page URL` populated — not a property on the main submission row. Consistent with existing v1 behaviour.
5. **Total Budget stored as Pre-Release Budget:** Calculated sum of all budget lines stored in a new `Pre-Release Budget` Notion column. Column must be added to the DB schema before deploy.
6. **Copies sold are hardcoded:** 500 / 5,000 / 50,000 for Conservative / Realistic / Optimistic. Not derived from comparables data. Can be made dynamic when DB has ≥ 50 validated entries.
7. **Grant amounts are hardcoded:** $25,000 / $50,000 / $100,000. Same rationale as #6.
8. **Caspian Shift is fully DB-backed:** No Anthropic API for Caspian Shift in v2. Cards pulled from Publisher / Crowdfunding / Grant Notion DBs. AI-generated text removed entirely.
9. **Anthropic API key treated as dead code:** Key has never been called per Anthropic Console. Remove during audit unless a live use case is found and documented here.
10. **Email capture deleted:** "Want this in your inbox?" removed without replacement. Can be restored in v2 if user research supports it.
11. **"What's Next" section deleted:** Removed without replacement.
12. **Crowdfunding backer distribution — equal-weight:** Each tier gets `ceil(totalBudgetRevised / 4 / tier_price)` backers. Simple and transparent for v1. Weighted distribution deferred to Backlog.
13. **Global rename: "Budget Tool" → "Funding Analysis":** Applied across all user-facing strings in budget.html and API response copy.
14. **Dead code cleanup is an acceptance criterion:** All code paths not reachable by the v2 form are removed during this build. No preservation of v1 dead branches.
15. **Observability — lightweight:** Structured log line on every Notion API call (success/failure + submissionId), visible in Vercel function logs. No external observability service in v1.

---

---

# 🔭 Backlog & Future Scope

> Items intentionally out of v1 scope. Prioritize from this list when planning v1.x or v2 builds.

1. **Dynamic copies-sold from comparables.** Replace hardcoded 500 / 5k / 50k with median sales derived from the Game Case Studies DB. Triggers when DB has ≥ 50 validated entries with sales data.
2. **Partial submission recovery.** If a user closes the tab after Step 1, restore their session via `submissionId` cookie + a `GET /api/submit/:submissionId` endpoint. Triggers if analytics show > 20% abandonment between Step 1 and Step 2.
3. **Weighted crowdfunding tier distribution.** Replace equal-weight distribution with historical backer split ratios. Triggers when Crowdfunding DB has ≥ 20 campaigns with full backer breakdown data.
4. **Email delivery of results.** Opt-in capture to send the completed analysis to the user. Triggers if user research shows ≥ 30% of completers want a copy. Use Resend or Postmark.
5. **Caspian Shift "Get in Touch" CRM integration.** Route CTA submissions to a CRM instead of a mailto. Triggers when follow-up volume exceeds manual capacity.
6. **Budget benchmark refresh.** One-liners in Budget Revised are currently static copy. Connect to a formula or data source so benchmarks update as the DB grows. Triggers at ≥ 100 Game Case Studies entries.
7. **Anthropic API re-integration for smart benchmarks.** If #6 doesn't scale, use Claude structured output to generate per-submission budget commentary. Requires reactivating the API key with a defined prompt schema. Scope separately.
8. **Publisher / Grant DB enrichment UI.** Internal tool to add and tag records to recommendation DBs without going into Notion directly. Triggers when ops team is adding ≥ 5 records/week.
9. **Multi-language support.** French + English toggle for form and results. Triggers if ≥ 20% of submissions come from French-speaking regions.
10. **WCAG AA+ accessibility pass.** Full keyboard navigation, screen reader labels, contrast audit. Schedule before any paid promotion or public launch campaign.
