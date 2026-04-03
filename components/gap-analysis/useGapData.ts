"use client"

import { useMemo } from "react"

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConfidenceLevel = "P10" | "P50" | "P90"
export type WeatherModel   = "ECMWF" | "GFS"

export interface GapDataPoint {
  time:     string   // "HH:00"
  load:     number   // MW demand
  supply:   number   // MW renewable supply
  gap:      number   // load - supply (positive = short/buy, negative = surplus)
  shortage: number   // Math.max(gap, 0)
  surplus:  number   // Math.max(-gap, 0)
}

// ─── DB Rail Load Profile (The "M-Curve") ─────────────────────────────────────

/** * Realistic Industrial Rail Profile:
 * - Morning Commuter Peak (06:00 - 09:00)
 * - Midday freight/inter-city baseline
 * - Evening Commuter Peak (16:00 - 19:00)
 * - Night-time maintenance/low-traffic baseload
 */
const RAIL_LOAD_PROFILE: readonly number[] = [
  210, 195, 185, 190, 220, 310, 480, 560, // 00:00 - 07:00 (Ramping to Morning Peak)
  520, 410, 380, 375, 380, 385, 395, 420, // 08:00 - 15:00 (Midday Baseline)
  490, 580, 610, 540, 420, 330, 260, 220, // 16:00 - 23:00 (Evening Peak to Night)
]

/** * Renewable supply baseline (Solar + Wind)
 * Note: Solar ramps up AFTER the morning rail peak starts.
 */
const BASE_SUPPLY: readonly number[] = [
   86,  79,  72,  68,  70,  90, 110, 160, // Low solar during morning peak
  280, 390, 460, 490, 510, 500, 460, 380, // Midday solar peak
  290, 180, 110,  92,  88,  82,  80,  79, // Sun sets during evening peak
]

// ─── Configuration ───────────────────────────────────────────────────────────

const CONFIDENCE_FACTOR: Record<ConfidenceLevel, number> = {
  P10: 0.80,   // Pessimistic: 20% less renewable supply
  P50: 1.00,   // Baseline
  P90: 1.15,   // Optimistic: 15% more supply
}

/** Deterministic jitter for GFS model to prevent UI flickering on re-renders */
function gfsJitter(i: number): number {
  return Math.sin(i * 2.7 + 1.4) * 12 + Math.cos(i * 1.3 + 0.8) * 8
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Hook to generate 24h gap analysis data.
 * @param userLoad - Array of 24 numbers from Stage 1. If empty, defaults to DB Rail Profile.
 */
export function useGapData(
  userLoad:     number[],
  confidence:   ConfidenceLevel,
  weatherModel: WeatherModel,
): GapDataPoint[] {
  return useMemo(() => {
    const hasUserLoad = userLoad.some((v) => v > 0)
    const supplyMult  = CONFIDENCE_FACTOR[confidence]

    return Array.from({ length: 24 }, (_, i): GapDataPoint => {
      // 1. Determine Load (User Input vs. DB Rail Model)
      const load = hasUserLoad ? (userLoad[i] ?? 0) : RAIL_LOAD_PROFILE[i]

      // 2. Determine Supply with Confidence & Weather scaling
      let supply = BASE_SUPPLY[i] * supplyMult
      if (weatherModel === "GFS") {
        supply = Math.max(0, supply + gfsJitter(i))
      }

      // 3. Final Calculations (Round to 1 decimal for clean trading UI)
      const rawGap = load - supply
      const gap    = Math.round(rawGap * 10) / 10
      
      return {
        time:     `${String(i).padStart(2, "0")}:00`,
        load:     Math.round(load * 10) / 10,
        supply:   Math.round(supply * 10) / 10,
        gap,
        shortage: Math.round(Math.max(gap, 0) * 10) / 10,
        surplus:  Math.round(Math.max(-gap, 0) * 10) / 10,
      }
    })
  }, [userLoad, confidence, weatherModel])
}