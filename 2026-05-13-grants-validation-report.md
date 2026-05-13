# Grants Inventory — Validation Report

**Date:** 2026-05-13
**Total rows:** 39 (CSV1: 26, CSV2: 5, CSV3: 8)
**Source files:** `outputs/2026-05-13-grants-csv-{1,2,3}-raw.csv`
**Merged output:** `2026-05-13-grants-inventory-merged.csv`

---

## 1. Normalization decisions applied

### Country name normalizations

| Original | Normalized | Rows affected |
|---|---|---|
| `United Kingdom` | `UK` | VGTR, UK Games Fund |
| `Czechia` | `Czech Republic` | Czech Audiovisual Fund |
| `European Union` | 29 countries (EU-27 + Iceland + Norway) | Creative Europe MEDIA |

### Eligible Game Stage normalizations

| Original | Mapped to | Reason |
|---|---|---|
| `Pre-production` (lowercase p) | `Pre-Production` | Notion option uses capital P after hyphen |
| `Post-production` (lowercase p) | `Post-Production` | Same |
| `Concept` | `Pre-Production` | Not in Notion vocab; conceptually upstream of Pre-Production |
| `Development` | `Pre-Production` | Not in Notion vocab; closest match for early-stage support |
| `Marketing/Release` | `Marketing & Release` | Notion uses ampersand format |

**Rows where Concept → Pre-Production:** NRW, FFF Bayern, DFI Games Scheme
**Rows where Development → Pre-Production:** Czech Audiovisual Fund
**Rows where Marketing/Release → Marketing & Release:** BC Video Games Business Development Program

### Residency Requirement mappings

| Original | Mapped to | Rows affected |
|---|---|---|
| `Cultural test required` | `Studio HQ in country` + Cultural Test Requirement set to true | CIJV, VGTR |
| `Other (specify): ≥50% of eligible production spend in Île-de-France` | `Game developed in country` (specific rule preserved in Notes) | Île-de-France |
| `Game developed in country (≥X%)` | `Game developed in country` (parenthetical dropped) | PA VGPTC, Bundesförderung, OIDMTC, BC IDMTC |

### Type-driven auto-corrections

- **Repayable Advance** → Repayable checkbox forced to `true` (applies to CMF, Games BW, NRW, FFF Bayern, Wallimage)
- **Tax Credit** → Repayable checkbox forced to `false` (applies to CIJV, VGTR, PMT, OIDMTC, BC IDMTC, PA VGPTC, Louisiana, Empire State, Screen Queensland Digital Games Incentive, Screen NSW, Ireland S481A)

### Scope correction

- **PMT Quebec:** changed from `National` → `Regional`. Investissement Québec is a provincial body; the scheme applies in Quebec only.

### Percentages

Written as integer percent values in the CSV (e.g. `50` for 50%). **Reminder:** if you import via Notion's CSV upload, this works as-is. If pushed via the Notion API, the values need to be divided by 100 (so 50 → 0.5) — I'll handle that conversion at API push time.

### Other transformations

- All `TBC` strings in numeric fields → empty (Notion number columns can't store text).
- All `Last Verified Date` set to `2026-05-13`.
- Dropped columns from raw CSVs (don't exist in Notion): `Issuing Body`, `Eligible Studio Stage`, `Eligible Cost Types`, `Platforms Eligible`, `Maximum Grant Amount (EUR)` (CSV1 only — replaced by `Maximum Amount` in original currency).
- Useful dropped-column info folded into Notes: issuing body, studio stage eligibility, eligible cost types, platforms (when not "All").

---

## 2. Issues that need your attention

### Critical — fix before push

**Currency `CAD` is not in your Notion vocabulary.** 5 Canadian rows have an empty Currency cell as a result:

- CMF Innovation & Experimentation
- Quebec PMT
- Ontario OIDMTC
- BC IDMTC
- BC Video Games Business Development

**Fix:** add `CAD` to the Notion `Currency` select. 30-second click. I'll re-populate those 5 rows at push time.

### Worth knowing — defensible but flagged

**`Czech Audiovisual Fund` currency = EUR (not CZK).** Perplexity tagged it EUR. Possibly because the new Audiovisual Act references EUR-denominated budgets, or Perplexity defaulted. Worth confirming against the CAF site whether the actual call uses CZK.

**`PMT Quebec` Funding Rate = 37.5** (decimal). That's the top-tier rate (French-language original works). Base rate is 26.25%. The 37.5 is the maximum the studio could see, which fits the column semantics — but if you ever filter by Funding Rate, remember it's the ceiling.

**`Creative Europe MEDIA` Status = Upcoming with a 2026-02-11 deadline in the past.** Correct per our convention — the program is annual, the current call closed, the next one is expected. Status reflects "next call upcoming." Notes explain.

**`UK Games Fund` Max Amount = 150,000 GBP** is a directional figure from past rounds, not a confirmed 2026 cap. Data Confidence = Medium reflects this. Verify before relying on it.

**`Screen Australia Games Production Fund` Status = Upcoming** with Opening Date 2026-06-25. The 2026 round hasn't opened yet at time of research (today is 2026-05-13).

### Stage data sparseness — verify before audience use

These rows have only one or two stages assigned. Worth double-checking they're not undersold:

- **AVEK Digidemo (Finland):** only `Prototype, Pre-Production`. Real Digidemo also supports later development; depends on what counts as "product development."
- **FAJV Aide à la production (France):** only `Production`. Correct — that's literally the scope of this sub-aid.
- **CIJV (France):** only `Production, Post-Production`. Correct — tax credit covers creation and production costs.
- **VGTR (UK):** only `Production, Post-Production`. Correct — tax relief on core production expenditure.

### Rows with no monetary cap data (Max + Min both empty)

These rows lack any confirmed amount — eligible for outreach to confirm:

- AVEK Digidemo (Finland) — both empty
- FAJV Écriture / Pré-production / Production (France) — caps are %-based, no absolute amount confirmed
- FFF Bayern (Germany) — both empty
- Quebec PMT — uncapped per project
- Ontario OIDMTC — uncapped per project for labour
- BC IDMTC — uncapped
- PA VGPTC — TBC
- DFI Games Scheme (Denmark) — both empty
- Stimuleringsfonds (Netherlands) — both empty
- Czech Audiovisual Fund — both empty
- Paraná Brazil — both empty
- Pro Helvetia — both empty
- NFI Development & Market-oriented (Norway) — both empty
- Louisiana Digital Interactive — uncapped per stated rule
- Texas Moving Image — TBC
- Screen NSW — TBC

This is expected for uncapped tax credits (Quebec PMT, Ontario, BC IDMTC, Louisiana, NSW). Worth a follow-up pass for the grants that *should* have a confirmed cap.

---

## 3. Per-row summary

| # | Grant Name | Country | Type | Currency | Status | Confidence |
|---|---|---|---|---|---|---|
| 1 | CMF Innovation & Experimentation | Canada | Repayable Advance | _(CAD missing)_ | Active | Medium |
| 2 | Île-de-France Fonds | France | Grant | EUR | Active | High |
| 3 | FAJV Écriture | France | Grant | EUR | Active | Medium |
| 4 | FAJV Pré-production | France | Grant | EUR | Active | Medium |
| 5 | FAJV Production | France | Grant | EUR | Active | Medium |
| 6 | CIJV | France | Tax Credit | EUR | Active | High |
| 7 | VGTR | UK | Tax Credit | GBP | Active | High |
| 8 | UK Games Fund | UK | Grant | GBP | Active | Medium |
| 9 | PA VGPTC | United States | Tax Credit | USD | Active | Medium |
| 10 | Bundesförderung | Germany | Grant | EUR | Active | Medium |
| 11 | Games BW | Germany | Repayable Advance | EUR | Active | High |
| 12 | NRW Film- und Medienstiftung | Germany | Repayable Advance | EUR | Active | High |
| 13 | FFF Bayern | Germany | Repayable Advance | EUR | Active | Medium |
| 14 | Quebec PMT | Canada | Tax Credit | _(CAD missing)_ | Active | High |
| 15 | Ontario OIDMTC | Canada | Tax Credit | _(CAD missing)_ | Active | High |
| 16 | BC IDMTC | Canada | Tax Credit | _(CAD missing)_ | Active | Medium |
| 17 | BC Video Games Business Dev | Canada | Grant | _(CAD missing)_ | Active | Medium |
| 18 | Creative Europe MEDIA | 29 EU+EEA countries | Grant | EUR | Upcoming | High |
| 19 | NFI Development | Norway | Grant | NOK | Active | Medium |
| 20 | NFI Market-oriented | Norway | Grant | NOK | Active | Medium |
| 21 | DFI Games Scheme | Denmark | Grant | DKK | Active | Medium |
| 22 | Stimuleringsfonds (NL) | Netherlands | Grant | EUR | Upcoming | Medium |
| 23 | Czech Audiovisual Fund | Czech Republic | Grant | EUR | Active | Medium |
| 24 | Spain Cultura videojuegos | Spain | Grant | EUR | Upcoming | Medium |
| 25 | Paraná Jogos Eletrônicos | Brazil | Grant | BRL | Active | Low |
| 26 | KOCCA General Track | South Korea | Grant | KRW | Active | Medium |
| 27 | VAF/Gamefonds | Belgium | Grant | EUR | Upcoming | Medium |
| 28 | AVEK Digidemo | Finland | Grant | EUR | Upcoming | Medium |
| 29 | Louisiana DIMS Tax Credit | United States | Tax Credit | USD | Active | High |
| 30 | Texas Moving Image | United States | Grant | USD | Active | Medium |
| 31 | Empire State Digital Gaming | United States | Tax Credit | USD | Active | High |
| 32 | Screen Australia Games Production Fund | Australia | Grant | AUD | Upcoming | High |
| 33 | Screen Queensland Digital Games Incentive | Australia | Tax Credit | AUD | Active | High |
| 34 | Screen Queensland Games Grants | Australia | Grant | AUD | Upcoming | Medium |
| 35 | Screen NSW Digital Games Rebate | Australia | Tax Credit | AUD | Active | Medium |
| 36 | VicScreen Victorian Production Fund | Australia | Grant | AUD | Active | High |
| 37 | Wallimage Gaming | Belgium | Repayable Advance | EUR | Active | High |
| 38 | Ireland S481A Digital Games Tax Credit | Ireland | Tax Credit | EUR | Active | Medium |
| 39 | Pro Helvetia Game Design | Switzerland | Grant | CHF | Active | Medium |

---

## 4. Coverage by country

| Country | Rows | Notes |
|---|---|---|
| Canada | 5 | All have CAD currency gap |
| France | 5 | FAJV (3 sub-aids) + CIJV + Île-de-France |
| Germany | 4 | Federal + 3 regional (BW, NRW, Bayern) |
| Australia | 5 | Federal + Qld (×2) + NSW + Vic |
| United States | 4 | Pennsylvania, Louisiana, Texas, New York |
| UK | 2 | VGTR + UK Games Fund |
| Belgium | 2 | VAF (Flanders) + Wallimage (Wallonia) |
| Norway | 2 | NFI Development + Market-oriented |
| Plus 1 each in: | | Ireland, Switzerland, Denmark, Netherlands, Czech Republic, Spain, Brazil, South Korea, Finland |
| Plus EU-wide: | 1 | Creative Europe MEDIA (touches 29 country rows in multi-select) |

---

## 5. Known coverage gaps (excluded by Perplexity, not yet researched)

These remain for a future research pass:

- **Sweden** — Swedish Film Institute games support (likely doesn't exist as dedicated line)
- **Italy** — Ministero della Cultura interactive aid (historically sparse)
- **Poland** — PISF games line, CRPK (last call 2023, expired)
- **Japan** — METI Cool Japan / IP360 (primary source not yet located)
- **Brazil federal** — ANCINE FSA interactive lines (no current 2026 call located)
- **US states** — Georgia, New Mexico (film credits don't explicitly include games)
- **Austria, Portugal, Hungary, Romania** — flagged as needing dedicated mapping

Defensible — most are likely "no current dedicated program" rather than missed research.

---

## 6. Recommended actions before Notion push

1. **Add `CAD` to your Notion `Currency` select.** 30 seconds. Fixes 5 rows.
2. **Spot-check 3–5 rows** by clicking the Primary Link and verifying Max Amount + Funding Rate against the source. Suggested rows: Ireland S481A, Wallimage, Creative Europe MEDIA, Quebec PMT, Bundesförderung.
3. **Decide** if you want me to push all 39 rows in one batch, or hold the 4 BC/Quebec rows until CAD is added.

Once you confirm, I'll push via the Notion API and report back with row IDs + any failures.
