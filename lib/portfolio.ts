import { getReferencePrice } from "./pricing"

export interface PortfolioPosition {
  hour: number
  forecastLoad: number  // MW
  ppaCovered: number    // MW from Wind/Solar PPA
  alreadyHedged: number // MW from forward contracts
}

export function getPortfolioPositions(): PortfolioPosition[] {
  return Array.from({ length: 24 }, (_, h) => {
    // Sine-curve load: peaks at 18:00 (~120 MW), trough at 04:00 (~60 MW)
    const forecastLoad = 60 + 60 * (0.5 + 0.5 * Math.sin((h - 4) * (Math.PI / 12)))

    // PPA shape: solar peak midday (11-15h), wind stable with slight overnight peak
    const solarFactor  = Math.max(0, Math.sin(((h - 6) / 12) * Math.PI))
    const windFactor   = 0.4 + 0.2 * Math.sin(h * 0.8 + 1.2)
    const ppaCovered   = forecastLoad * (0.2 * solarFactor + 0.25 * windFactor)

    // Forward contracts: ~15% of load, slightly higher in peak hours
    const peakBoost = h >= 8 && h < 20 ? 0.05 : 0
    const alreadyHedged = forecastLoad * (0.15 + peakBoost)

    return {
      hour: h,
      forecastLoad: Math.round(forecastLoad * 10) / 10,
      ppaCovered:   Math.round(ppaCovered   * 10) / 10,
      alreadyHedged:Math.round(alreadyHedged* 10) / 10,
    }
  })
}

export function getExpectedDayAheadPrices(): number[] {
  return Array.from({ length: 24 }, (_, h) => getReferencePrice(h, 'dayAhead'))
}
