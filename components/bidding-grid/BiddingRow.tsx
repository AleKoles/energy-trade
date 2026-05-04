"use client"

import React, { useRef, useState, type CSSProperties, type KeyboardEvent } from "react"
import { ChevronDown, X } from "lucide-react"
import { generateOrderBook } from "@/lib/orderBook"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

export type BidField = "volume" | "price"

type GapStatus = "unmatched" | "matched" | "deviated" | "idle"

export interface BlockBidDisplay {
  id: string
  label: string
  volume: number
  price: number
  minFill: 'AON' | 'partial'
}

export interface BiddingRowProps {
  index:        number
  slot:         string        // "08:00 - 09:00"
  slotGap:      number        // MW gap for this slot (already divided for intraday)
  volume:       number
  price:        number | null
  refPrice:     number
  mwhMultiplier: number
  isSelected:   boolean
  isFlashed:    boolean
  isFocused:    boolean       // mobile focus highlight
  isCompact:    boolean       // true = mobile layout
  isLastRow:    boolean
  style?:       CSSProperties
  blockBid?:    BlockBidDisplay  // when set, row is read-only block display
  onVolumeChange: (raw: string) => void
  onPriceChange:  (raw: string) => void
  onKeyDown:      (e: KeyboardEvent<HTMLInputElement>, field: BidField) => void
  onMobileFocus:  (field: BidField) => void
  onMobileBlur:   () => void
  onToggleSelect: () => void
  onCopyDown:     () => void
  onDetachBlock?: () => void
}

// ─── Gap status logic ─────────────────────────────────────────────────────────

function getGapStatus(volume: number, slotGap: number): GapStatus {
  const required = Math.max(slotGap, 0)
  if (slotGap > 0.5 && volume === 0) return "unmatched"   // red: buy needed, nothing placed
  if (required < 0.5) {
    return volume > 0 ? "deviated" : "idle"                // surplus hour
  }
  const deviation = Math.abs(volume - required) / required
  return deviation > 0.20 ? "deviated" : "matched"
}

const STATUS_META: Record<GapStatus, { dot: string; label: string }> = {
  unmatched: {
    dot:   "bg-red-400",
    label: "Buy Required — no bid placed for this shortage hour",
  },
  matched: {
    dot:   "bg-emerald-400",
    label: "Bid aligned with forecasted shortage",
  },
  deviated: {
    dot:   "bg-amber-400",
    label: "Bid volume deviates from forecasted shortage by more than 20%",
  },
  idle: {
    dot:   "bg-gray-300",
    label: "Surplus hour — no mandatory procurement",
  },
}

// ─── Gap badge ────────────────────────────────────────────────────────────────

function GapBadge({ slotGap }: { slotGap: number }) {
  const abs = Math.abs(slotGap)
  if (abs < 0.5) {
    return (
      <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
        Balanced
      </span>
    )
  }
  if (slotGap > 0) {
    return (
      <div>
        <span className="inline-flex items-center rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 ring-1 ring-red-100">
          +{slotGap.toFixed(1)} MW
        </span>
        <p className="mt-0.5 text-[10px] leading-none text-red-400/80">Buy Required</p>
      </div>
    )
  }
  return (
    <div>
      <span className="inline-flex items-center rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
        {abs.toFixed(1)} MW
      </span>
      <p className="mt-0.5 text-[10px] leading-none text-emerald-500/80">Surplus</p>
    </div>
  )
}

// ─── Inline checkbox (avoids importing EnergyCheckbox from parent) ─────────────

function Checkbox({ checked, onChange, label }: {
  checked: boolean
  onChange: () => void
  label: string
}) {
  return (
    <label className="relative inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded border border-gray-300 bg-white transition-colors focus-within:ring-2 focus-within:ring-primary/30 has-[:checked]:border-primary has-[:checked]:bg-primary">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="peer sr-only"
        aria-label={label}
      />
      <svg
        className="pointer-events-none h-2.5 w-2.5 text-white opacity-0 peer-checked:opacity-100"
        viewBox="0 0 10 10"
        fill="none"
      >
        <path
          d="M2 5l2.5 2.5L8 3"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </label>
  )
}

// ─── Desktop column template ──────────────────────────────────────────────────

const GRID = "grid-cols-[24px_115px_140px_1fr_1fr_28px_24px]"

// ─── Component (inner, un-memoized) ──────────────────────────────────────────

function BiddingRowInner({
  index, slot, slotGap,
  volume, price, refPrice, mwhMultiplier,
  isSelected, isFlashed, isFocused,
  isCompact, isLastRow,
  style,
  onVolumeChange, onPriceChange, onKeyDown,
  onMobileFocus, onMobileBlur,
  onToggleSelect, onCopyDown,
}: BiddingRowProps) {
  const status    = getGapStatus(volume, slotGap)
  const required  = Math.max(slotGap, 0)
  const suggested = refPrice > 0 ? refPrice * 1.05 : null

  const [priceFocused, setPriceFocused] = useState(false)
  const priceBlurRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handlePriceFocus = () => {
    if (priceBlurRef.current) clearTimeout(priceBlurRef.current)
    setPriceFocused(true)
  }
  const handlePriceBlur = () => {
    priceBlurRef.current = setTimeout(() => setPriceFocused(false), 200)
  }

  const { levels: orderBook, likelyFillMW } = generateOrderBook(refPrice, price, volume)

  // ── Compact (mobile) ────────────────────────────────────────────────────────

  if (isCompact) {
    return (
      <div style={style} className="w-full">
        <div className={cn(
          "flex w-full min-w-0 border-b border-gray-200 transition-colors",
          isFocused  && "bg-primary/[0.06] ring-2 ring-primary/30 ring-inset",
          !isFocused && status === "unmatched" && "bg-red-50/30",
          !isFocused && status === "matched"   && "bg-emerald-50/20",
        )}>
          {/* Sticky left: sel + time + status */}
          <div className="sticky left-0 z-[2] flex w-[80px] shrink-0 flex-col justify-center gap-1.5 border-r border-gray-200 bg-white px-2 py-2 pl-3 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.08)]">
            <Checkbox checked={isSelected} onChange={onToggleSelect} label={`Select ${slot}`} />
            <span className="text-[11px] font-semibold leading-tight text-foreground">
              {slot.split(" ")[0]}
            </span>
            <div className={cn("h-2 w-2 rounded-full", STATUS_META[status].dot)} />
          </div>

          {/* Scrollable content */}
          <div className="min-w-0 flex-1 overflow-x-auto px-3 py-2">
            <GapBadge slotGap={slotGap} />
            <div className="mt-2 grid min-w-[200px] grid-cols-2 gap-2">
              {/* MW */}
              <div>
                <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Bid MW
                </span>
                <input
                  type="number"
                  data-bid-input={`volume-${index}`}
                  placeholder={required > 0.5 ? required.toFixed(1) : "0.0"}
                  value={volume === 0 ? "" : volume}
                  onChange={(e) => onVolumeChange(e.target.value)}
                  onKeyDown={(e) => onKeyDown(e, "volume")}
                  onFocus={() => onMobileFocus("volume")}
                  onBlur={onMobileBlur}
                  className={cn(
                    "w-full rounded-lg border bg-white px-2 py-2 text-right text-sm font-medium shadow-sm focus:outline-none focus:ring-2",
                    status === "unmatched"
                      ? "border-red-300 focus:border-red-400 focus:ring-red-300/40"
                      : "border-gray-200 focus:border-primary focus:ring-primary/20"
                  )}
                  min={0}
                  step={0.1}
                />
              </div>
              {/* Price */}
              <div>
                <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  €/MWh
                </span>
                <input
                  type="number"
                  data-bid-input={`price-${index}`}
                  placeholder={suggested !== null ? suggested.toFixed(2) : "0.00"}
                  value={price === null ? "" : price}
                  onChange={(e) => onPriceChange(e.target.value)}
                  onKeyDown={(e) => onKeyDown(e, "price")}
                  onFocus={() => onMobileFocus("price")}
                  onBlur={onMobileBlur}
                  className="w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-right text-sm font-medium shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  step={0.01}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Desktop ─────────────────────────────────────────────────────────────────

  const isDeviating = status === "deviated" && required > 0.5

  return (
    <div
      style={style}
      className={cn(
        `grid items-center gap-2 px-2 py-2 transition-colors duration-300 sm:px-3 ${GRID}`,
        isFlashed   && "bg-primary/[0.08]",
        isSelected  && !isFlashed && "bg-sky-50 ring-1 ring-inset ring-sky-200",
        !isSelected && !isFlashed && status === "unmatched" && "bg-red-50/20",
        !isSelected && !isFlashed && status === "matched"   && "bg-emerald-50/10",
        !isSelected && !isFlashed && (status === "idle" || status === "deviated") && "hover:bg-gray-50/50",
      )}
    >
      {/* Checkbox */}
      <div className="flex justify-center">
        <Checkbox checked={isSelected} onChange={onToggleSelect} label={`Select ${slot}`} />
      </div>

      {/* Time */}
      <div className="flex min-w-0 items-center gap-2">
        <div className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_META[status].dot)} />
        <span className="truncate text-xs font-medium text-foreground">
          {slot.split(" ")[0]}
        </span>
      </div>

      {/* Forecast Gap */}
      <div className="min-w-0">
        <GapBadge slotGap={slotGap} />
      </div>

      {/* Bid Volume (MW) */}
      <div className={cn(
        "flex min-w-0 items-center rounded-lg border bg-white shadow-sm transition-colors focus-within:ring-2",
        status === "unmatched"
          ? "border-red-300 focus-within:border-red-400 focus-within:ring-red-300/40"
          : "border-gray-200 focus-within:border-primary focus-within:ring-primary/20"
      )}>
        <input
          type="number"
          data-bid-input={`volume-${index}`}
          placeholder={required > 0.5 ? required.toFixed(1) : "0.0"}
          value={volume === 0 ? "" : volume}
          onChange={(e) => onVolumeChange(e.target.value)}
          onKeyDown={(e) => onKeyDown(e, "volume")}
          className="min-w-0 flex-1 bg-transparent py-1.5 pl-2 pr-0.5 text-right text-sm font-medium text-foreground focus:outline-none sm:py-2"
          min={0}
          step={0.1}
        />
        <span className="shrink-0 select-none pr-2 text-[10px] text-muted-foreground">MW</span>
      </div>

      {/* Limit Price (€/MWh) + order book panel */}
      <div className="relative min-w-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn(
              "flex min-w-0 items-center rounded-lg border bg-white shadow-sm transition-colors focus-within:ring-2",
              isDeviating
                ? "border-amber-300 focus-within:ring-amber-300/40"
                : "border-gray-200 focus-within:border-primary focus-within:ring-primary/20"
            )}>
              <input
                type="number"
                data-bid-input={`price-${index}`}
                placeholder={suggested !== null ? suggested.toFixed(2) : "0.00"}
                value={price === null ? "" : price}
                onChange={(e) => onPriceChange(e.target.value)}
                onKeyDown={(e) => onKeyDown(e, "price")}
                onFocus={handlePriceFocus}
                onBlur={handlePriceBlur}
                className="min-w-0 flex-1 bg-transparent py-1.5 pl-2 pr-0.5 text-right text-sm font-medium text-foreground focus:outline-none sm:py-2"
                step={0.01}
              />
              <span className="shrink-0 select-none pr-2 text-[10px] text-muted-foreground">€/MWh</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">
            {isDeviating
              ? "Bid volume deviates from forecasted shortage"
              : suggested !== null
                ? `Ref €${refPrice.toFixed(2)} · Suggested €${suggested.toFixed(2)}`
                : "Enter limit price"}
          </TooltipContent>
        </Tooltip>

        {priceFocused && (
          <div className="absolute left-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
            <div className="border-b border-gray-100 bg-gray-50 px-2.5 py-1.5 text-[10px] text-muted-foreground">
              Likely fill:{" "}
              <span className="font-semibold text-foreground">
                {likelyFillMW.toFixed(1)} / {volume > 0 ? volume.toFixed(1) : "—"} MW
              </span>
            </div>
            <div className="flex divide-x divide-gray-100">
              <div className="flex-1 bg-sky-50/40 p-1.5">
                <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-sky-600">Bids</p>
                {orderBook.filter((l) => l.side === "bid").map((l, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex items-center justify-between rounded px-1 py-0.5 text-[10px]",
                      l.isUser && "bg-primary/[0.08]"
                    )}
                  >
                    <span className={cn("tabular-nums", l.isUser && "font-semibold text-primary")}>
                      {l.price.toFixed(2)}
                    </span>
                    {l.isUser ? (
                      <span className="rounded bg-primary/20 px-1 py-px text-[9px] font-semibold text-primary">YOU</span>
                    ) : (
                      <span className="tabular-nums text-muted-foreground">{l.volumeMW} MW</span>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex-1 bg-red-50/30 p-1.5">
                <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-red-500">Asks</p>
                {orderBook.filter((l) => l.side === "ask").map((l, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex items-center justify-between rounded px-1 py-0.5 text-[10px]",
                      l.isUser && "bg-primary/[0.08]"
                    )}
                  >
                    <span className={cn("tabular-nums", l.isUser && "font-semibold text-primary")}>
                      {l.price.toFixed(2)}
                    </span>
                    {l.isUser ? (
                      <span className="rounded bg-primary/20 px-1 py-px text-[9px] font-semibold text-primary">YOU</span>
                    ) : (
                      <span className="tabular-nums text-muted-foreground">{l.volumeMW} MW</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Status dot */}
      <div className="flex justify-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                "h-2.5 w-2.5 cursor-default rounded-full",
                STATUS_META[status].dot
              )}
            />
          </TooltipTrigger>
          <TooltipContent side="left">{STATUS_META[status].label}</TooltipContent>
        </Tooltip>
      </div>

      {/* Copy down */}
      <div className="flex justify-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onCopyDown}
              disabled={isLastRow}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground/40 transition-colors hover:bg-gray-100 hover:text-muted-foreground disabled:pointer-events-none disabled:opacity-20"
              aria-label="Copy values down"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">Copy values down</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

// ─── Memoized export ─────────────────────────────────────────────────────────
// Custom equality excludes callbacks — they're bound per-row in BiddingGrid
// and assumed functionally stable. Only data props trigger re-renders.

export const BiddingRow = React.memo(BiddingRowInner, (prev, next) =>
  prev.volume      === next.volume      &&
  prev.price       === next.price       &&
  prev.slotGap     === next.slotGap     &&
  prev.refPrice    === next.refPrice    &&
  prev.isSelected  === next.isSelected  &&
  prev.isFlashed   === next.isFlashed   &&
  prev.isFocused   === next.isFocused   &&
  prev.isLastRow   === next.isLastRow
)
