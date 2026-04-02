/**
 * Market reference price simulation for Green SPOT Auction.
 * Models a realistic solar/wind generation curve (€/MWh).
 *
 * All variation is deterministic (sine-based) — prices are stable across renders.
 * This module can be swapped with an API call without changing the UI layer.
 */

export type MarketType = 'dayAhead' | 'intraday'

/**
 * Stable pseudo-random wind offset based on hour.
 * Uses a sine composite — no Math.random, identical on every render.
 * Returns a value in the range [0, 10].
 */
function stableWindOffset(hour: number): number {
  return 5 + 5 * Math.sin(hour * 1.3 + 0.7)
}

/**
 * Returns the reference price for a given hour and market type.
 *
 * Pricing follows a solar/wind generation curve:
 *  - Night   (00–06): stable mid-high baseload         ~80–95 €/MWh
 *  - Morning (06–11): gradual decrease (solar rising)   ~40–95 €/MWh
 *  - Midday  (11–15): solar peak → cheapest             ~40–60 €/MWh
 *  - Afternoon(15–18): post-solar recovery              ~60–100 €/MWh
 *  - Evening (18–21): demand peak → most expensive      ~100–120 €/MWh
 *  - Late eve(21–24): slight taper                      ~85–120 €/MWh
 */
export function getReferencePrice(hour: number, marketType: MarketType = 'dayAhead'): number {
  let base: number

  if (hour < 6) {
    // Night: stable mid-high — linear 80 → 95
    base = 80 + (hour / 6) * 15
  } else if (hour < 11) {
    // Morning ramp-down as solar generation rises: 95 → 40
    base = 95 - ((hour - 6) / 5) * 55
  } else if (hour < 15) {
    // Solar peak — cheapest window: 40 → 60
    base = 40 + ((hour - 11) / 4) * 20
  } else if (hour < 18) {
    // Post-solar recovery: 60 → 100
    base = 60 + ((hour - 15) / 3) * 40
  } else if (hour < 21) {
    // Evening demand peak — highest prices: 100 → 120
    base = 100 + ((hour - 18) / 3) * 20
  } else {
    // Late evening taper: 120 → 85
    base = 120 - ((hour - 21) / 3) * 35
  }

  const wind = stableWindOffset(hour)
  const price = base + wind

  if (marketType === 'intraday') {
    // Intraday: slightly higher volatility (+10–15%) vs day-ahead
    const volatilityFactor = 1.10 + 0.05 * Math.sin(hour * 2.1 + 1.4)
    return price * volatilityFactor
  }

  return price
}

/**
 * Returns stable day-ahead reference prices for all 24 hours.
 * Suitable for pre-populating price columns or rendering a sparkline.
 */
export function generateMockPrices(): number[] {
  return Array.from({ length: 24 }, (_, hour) => getReferencePrice(hour, 'dayAhead'))
}

/**
 * Pre-generate a stable array of reference prices for all slots (24h or 96 × 15min).
 * Call once per market-type switch — wind factor is baked in deterministically.
 */
export function generateReferencePrices(isIntraday: boolean): number[] {
  const marketType: MarketType = isIntraday ? 'intraday' : 'dayAhead'
  const slotCount = isIntraday ? 96 : 24
  return Array.from({ length: slotCount }, (_, i) => {
    const hour = isIntraday ? Math.floor(i / 4) : i
    return getReferencePrice(hour, marketType)
  })
}
