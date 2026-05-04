import { getReferencePrice } from "./pricing"

// ─── SDAC price bounds (EUPHEMIA) ─────────────────────────────────────────────
export const PRICE_CAP   =  4000  // €/MWh
export const PRICE_FLOOR =  -500  // €/MWh
export const MIN_VOLUME  =   0.1  // MW (EPEX SPOT minimum lot)

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClearingResult {
  hour:           string
  bidVolume:      number   // MW submitted
  bidPrice:       number   // €/MWh limit price
  mcp:            number   // Market Clearing Price €/MWh
  filled:         boolean  // true if bidPrice >= MCP (limit buy cleared)
  clearedVolume:  number   // MW (= bidVolume if filled, 0 otherwise)
  clearedCost:    number   // € (clearedVolume × MCP — uniform price auction)
  actualGap:      number   // MW (forecast gap with realistic delivery variance)
  uncoveredMW:    number   // MW of gap not covered (imbalance exposure)
}

export interface ClearingSummary {
  results:       ClearingResult[]
  totalCleared:  number   // MWh
  totalCost:     number   // €
  avgMCP:        number   // volume-weighted €/MWh
  missedHours:   number   // count of unfilled hours
  gapCoverage:   number   // % of actual gap covered (0–100)
  imbalanceMWh:  number   // MWh of uncovered gap facing imbalance penalty
  imbalanceCost: number   // estimated imbalance penalty (1.8× MCP on uncovered)
}

// ─── Clearing simulation ──────────────────────────────────────────────────────
// Deterministic — no Math.random. Uses sine composites as the "day's market."

export function simulateClearing(
  bids: { hour: string; volume: number; price: number }[],
  gapForecast: number[],
): ClearingSummary {
  const results: ClearingResult[] = bids.map((bid, i) => {
    // Deterministic MCP: reference price × intra-day market factor
    const base = getReferencePrice(i, "dayAhead")
    const factor = 1 + 0.14 * Math.sin(i * 1.7 + 2.3) + 0.07 * Math.cos(i * 0.9)
    const mcp = Math.round(base * factor * 100) / 100

    // DAM limit-buy: clears when bidPrice >= MCP (you pay MCP, not your bid)
    const filled = bid.price >= mcp
    const clearedVolume = filled ? bid.volume : 0
    const clearedCost   = clearedVolume * mcp

    // Actual delivery gap: forecast + realistic variance (85–115%)
    const variance  = 0.85 + 0.30 * Math.sin(i * 2.1 + 1.1)
    const actualGap = Math.max(0, Math.round((gapForecast[i] ?? 0) * variance * 10) / 10)
    const uncoveredMW = Math.max(0, actualGap - clearedVolume)

    return { hour: bid.hour, bidVolume: bid.volume, bidPrice: bid.price, mcp, filled, clearedVolume, clearedCost, actualGap, uncoveredMW }
  })

  const totalCleared  = results.reduce((s, r) => s + r.clearedVolume, 0)
  const totalCost     = results.reduce((s, r) => s + r.clearedCost, 0)
  const weightedMCP   = results.reduce((s, r) => s + r.mcp * r.clearedVolume, 0)
  const avgMCP        = totalCleared > 0 ? weightedMCP / totalCleared : 0
  const missedHours   = results.filter((r) => !r.filled).length
  const totalActualGap = results.reduce((s, r) => s + r.actualGap, 0)
  const gapCoverage   = totalActualGap > 0 ? Math.min((totalCleared / totalActualGap) * 100, 100) : 100
  const imbalanceMWh  = results.reduce((s, r) => s + r.uncoveredMW, 0)
  const imbalanceCost = results.reduce((s, r) => s + r.uncoveredMW * r.mcp * 1.8, 0)

  return { results, totalCleared, totalCost, avgMCP, missedHours, gapCoverage, imbalanceMWh, imbalanceCost }
}
