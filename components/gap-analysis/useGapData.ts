"use client"
import { useMemo } from "react"

export type ConfidenceLevel = "P10" | "P50" | "P90"
export type WeatherModel   = "ECMWF" | "GFS"

export interface GapDataPoint {
  time: string
  load: number
  wind: number    
  solar: number   
  supply: number  
  gap: number
  shortage: number
  surplus: number
  // Financial metrics for the "Trader Audit"
  hourlyPrice: number // Simulated Spot Price in €
  estCost: number     // Estimated cost for that hour
}

// ─── DB Rail Load Profile (M-Curve) ──────────────────────────────────────────
const RAIL_LOAD_PROFILE: readonly number[] = [
  210, 195, 185, 190, 220, 310, 480, 560, // Morning Peak
  520, 410, 380, 375, 380, 385, 395, 420, // Midday
  490, 580, 610, 540, 420, 330, 260, 220, // Evening Peak
]

// ─── Wind Baseline (Flat-ish but wavy) ───────────────────────────────────────
const WIND_BASE: readonly number[] = [
  110, 105, 100, 95, 90, 105, 115, 120,
  125, 110, 105, 100, 95, 90, 100, 110,
  120, 130, 125, 115, 110, 105, 110, 115,
]

// ─── Solar Curve (Bell shape) ────────────────────────────────────────────────
const SOLAR_BASE: readonly number[] = [
  0, 0, 0, 0, 0, 10, 40, 120,
  240, 350, 420, 450, 460, 440, 380, 280,
  160, 60, 10, 0, 0, 0, 0, 0,
]

const CONFIDENCE_FACTOR: Record<ConfidenceLevel, number> = { 
  P10: 0.8, 
  P50: 1.0, 
  P90: 1.15 
}

export function useGapData(
  userLoad: number[], 
  confidence: ConfidenceLevel, 
  weatherModel: WeatherModel
): GapDataPoint[] {
  return useMemo(() => {
    const hasUserLoad = userLoad.some(v => v > 0)
    const mult = CONFIDENCE_FACTOR[confidence]

    return Array.from({ length: 24 }, (_, i) => {
      const load = hasUserLoad ? (userLoad[i] ?? 0) : RAIL_LOAD_PROFILE[i]
      
      // 1. Supply Logic
      let wind = WIND_BASE[i] * mult
      let solar = SOLAR_BASE[i] * mult
      
      if (weatherModel === "GFS") {
        const jitter = Math.sin(i * 2) * 10 
        wind = Math.max(0, wind + jitter)
      }

      const supply = wind + solar
      const gap = Math.round((load - supply) * 10) / 10

      // 2. Price Simulation (Spot Market)
      // Prices usually spike during the 07:00-09:00 and 17:00-20:00 windows
      const isPeak = (i >= 7 && i <= 9) || (i >= 17 && i <= 20);
      const basePrice = isPeak ? 145 : 75;
      const hourlyPrice = basePrice + (Math.sin(i * 0.5) * 12); // Subtle market variance

      // 3. Final Calculations
      const shortage = Math.max(gap, 0);
      const surplus = Math.max(-gap, 0);
      const estCost = shortage * hourlyPrice;

      return {
        time: `${String(i).padStart(2, "0")}:00`,
        load: Math.round(load * 10) / 10,
        wind: Math.round(wind * 10) / 10,
        solar: Math.round(solar * 10) / 10,
        supply: Math.round(supply * 10) / 10,
        gap,
        shortage: Math.round(shortage * 10) / 10,
        surplus: Math.round(surplus * 10) / 10,
        hourlyPrice: Math.round(hourlyPrice * 100) / 100,
        estCost: Math.round(estCost * 10) / 10
      }
    })
  }, [userLoad, confidence, weatherModel])
}