# Day-Ahead Auction Portal ⚡

A product design thought experiment — a structured, regulation-aware trading terminal for Day-Ahead renewable energy auctions under EPEX SPOT / SDAC rules. Built to explore how complex market workflows can be simplified without losing domain credibility.

---

## Workflow

Four linear steps enforce the right order of operations and prevent common errors:

| Step | Name | What happens |
|------|------|-------------|
| 1 | **Data Setup** | Select load source (session, scratch, template, CSV), set market type (Day-Ahead 1h or Intraday 15m) |
| 2 | **Gap Analysis** | Renewable supply vs. load forecast — wind PPA + solar PPA vs. consumption curve, with P10/P50/P90 confidence levels and ECMWF/GFS model switching |
| 3 | **Bid Entry** | Hourly bid grid with gap-aware validation, order book preview, position panel, and strategy presets |
| 4 | **Review & Submit** | REMIT compliance attestation, bid hash, exposure summary, then post-trade clearing results |

The stepper is clickable for completed and current steps.

---

## Features

### Gap Analysis (Step 2)
- Renewable supply vs. load demand chart (wind PPA, solar PPA, residual risk, spot price)
- P10 / P50 / P90 confidence levels adjust supply scaling
- ECMWF (stable) / GFS (volatile) weather model switching
- Hourly gap heat-strip and imbalance exposure bar chart
- Sidebar KPIs: est. spot exposure, peak hourly gap, risk windows, imbalance cost with P90 stress delta
- Load profile is frozen on step entry — syncing MW in step 3 does not feed back into the gap calculation

### Bid Entry (Step 3)
- 24-hour grid (or 96 × 15min intraday) with gap-aware row states: unmatched / matched / deviated / idle
- **Order book overlay** on price focus — live bid/ask ladder with "YOU" marker and likely-fill estimate
- **SDAC price cap enforcement**: hard block on prices > €4,000/MWh or < −€500/MWh (EUPHEMIA bounds), inline error with tooltip, submission disabled until resolved
- **0.1 MW lot rounding** on volume entry (EPEX SPOT minimum granularity)
- Strategy presets: Base Load (all 24h at ref price), Peak Hours (08–18h)
- Sync MW to gap / Sync prices to ref+5% — idempotent, stable results on repeated clicks
- Copy-down, bulk apply, section collapse (Night / Morning / Day / Evening)
- Position side panel: net open position sparkline, PPA coverage ratio, worst-case spend per hour
- Draft auto-save to localStorage with "Draft saved" indicator

### REMIT Compliance Gate (Step 4)
- Three attestation checkboxes (Art. 3 inside information, Art. 5 price manipulation, wash trading)
- Submit button hard-disabled until all three are checked and no price violations exist
- Bid hash (SHA-256, first 12 hex chars) computed from active rows, copyable
- Live submission timestamp (local + UTC)
- Attestation log written to localStorage for audit trail

### Post-Trade View (after submit)
- Simulates DAM uniform-price clearing: bid price vs. Market Clearing Price (MCP) per hour
- Filled if bid ≥ MCP — you pay MCP, not your bid price
- Spread column (bid − MCP) shows safety margin or missed-clear reason
- Imbalance exposure banner for uncovered hours with estimated penalty at 1.8× MCP
- Summary: cleared MWh, total cost at MCP, avg MCP, gap coverage %

### UX Details
- Gate closure countdown to 11:00 CET with amber warning within 30 min
- ⌘K command palette: navigate steps, apply presets, jump to specific hours
- Space Grotesk headlines + Inter body — deliberate typographic hierarchy
- Responsive: desktop sidebar stepper + mobile bottom-nav with horizontal step indicator
- Dark mode tokens defined (not fully applied to all surfaces)

---

## Tech Stack

- **Next.js 15** — App Router, React Server Components where applicable
- **Tailwind CSS 4** — CSS custom properties via `@theme inline`, no config file
- **shadcn/ui** — Command, Tooltip, Dropdown primitives
- **Framer Motion** — step transitions and row flash animations
- **Recharts** — gap analysis area/line chart
- **next/font** — Space Grotesk (display) + Inter (body), zero layout shift

### Simulation modules
- `lib/pricing.ts` — deterministic DA price curve (solar dip, evening peak, sine-based wind offset)
- `lib/clearing.ts` — DAM uniform-price clearing simulation, SDAC price bounds
- `lib/orderBook.ts` — order book ladder mock for price-input overlay
- `lib/portfolio.ts` — hourly portfolio position mock (PPA coverage, open exposure)

---

## Running locally

```bash
npm install
npm run dev
```

---

## What's missing (intentionally out of scope)

- Real exchange connectivity (EPEX SPOT API, ENTSO-E)
- Intraday continuous trading path (UI exists, flow is stub)
- CSV import parsing
- Multi-user / shared portfolio state
- Block bid submission (types defined, UI not wired)
