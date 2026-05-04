export interface LadderLevel {
  side: 'bid' | 'ask'
  price: number
  volumeMW: number
  isUser: boolean
}

export function generateOrderBook(
  refPrice: number,
  userPrice: number | null,
  userVolume: number
): { levels: LadderLevel[]; likelyFillMW: number } {
  // Asks: 3 levels above ref (sorted best=lowest first)
  const asks: LadderLevel[] = [
    { side: 'ask', price: +(refPrice + 0.5).toFixed(2), volumeMW: 25,  isUser: false },
    { side: 'ask', price: +(refPrice + 1.5).toFixed(2), volumeMW: 60,  isUser: false },
    { side: 'ask', price: +(refPrice + 3.0).toFixed(2), volumeMW: 110, isUser: false },
  ]
  // Bids: 3 levels below ref (sorted best=highest first)
  const bids: LadderLevel[] = [
    { side: 'bid', price: +(refPrice - 0.3).toFixed(2), volumeMW: 40,  isUser: false },
    { side: 'bid', price: +(refPrice - 1.2).toFixed(2), volumeMW: 75,  isUser: false },
    { side: 'bid', price: +(refPrice - 2.8).toFixed(2), volumeMW: 95,  isUser: false },
  ]

  if (userPrice !== null) {
    const all = [...asks, ...bids]
    let closest: LadderLevel | null = null
    let minDist = Infinity
    for (const l of all) {
      const d = Math.abs(l.price - userPrice)
      if (d < minDist) { minDist = d; closest = l }
    }
    if (closest && minDist < 0.6) {
      closest.isUser = true
    }
  }

  let likelyFillMW = 0
  if (userPrice !== null && userVolume > 0) {
    for (const ask of asks) {
      if (ask.price <= userPrice) likelyFillMW += ask.volumeMW
    }
    likelyFillMW = Math.min(likelyFillMW, userVolume)
  }

  return { levels: [...asks, ...bids], likelyFillMW }
}
