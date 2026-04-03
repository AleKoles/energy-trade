"use client"

import { Clock, RefreshCw, X } from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

interface HeaderControlsProps {
  isIntraday:    boolean
  gateCountdown: string
  nearClosure:   boolean
  selectedCount: number
  onSyncToGap:   () => void
  onSyncPrices:  () => void
  onClose:       () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function HeaderControls({
  isIntraday,
  gateCountdown,
  nearClosure,
  selectedCount,
  onSyncToGap,
  onSyncPrices,
  onClose,
}: HeaderControlsProps) {
  const syncLabel = selectedCount > 0
    ? `Sync ${selectedCount} Row${selectedCount > 1 ? "s" : ""} to Gap`
    : "Sync MW to Gap"

  return (
    <div className="hidden items-center justify-between gap-4 border-b border-gray-200 bg-white px-6 py-3.5 sm:px-8 md:flex">

      {/* Left: title */}
      <div className="flex items-center gap-2.5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-foreground sm:text-lg">Bid Entry</h1>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Step 3 / 4
            </span>
          </div>
        </div>
        <span className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-muted-foreground">
          {isIntraday ? "Intraday · 96 × 15m" : "Day-Ahead · 24h"}
        </span>
      </div>

      {/* Right: actions + gate timer */}
      <div className="flex items-center gap-2">

        {/* Primary: Sync MW to Gap (pulse when gate near) */}
        <button
          type="button"
          onClick={onSyncToGap}
          className={cn(
            "flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90",
            nearClosure && "animate-pulse"
          )}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {syncLabel}
        </button>

        {/* Secondary: Sync Prices */}
        <button
          type="button"
          onClick={onSyncPrices}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:bg-gray-50 hover:text-foreground"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Sync Prices
        </button>

        {/* Gate countdown */}
        <div className={cn(
          "flex items-center gap-2 rounded-lg border px-3 py-2",
          nearClosure ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-gray-50"
        )}>
          <Clock className={cn("h-3.5 w-3.5 shrink-0", nearClosure ? "text-amber-600" : "text-muted-foreground")} />
          <div>
            <p className={cn(
              "text-[10px] font-medium uppercase tracking-wide leading-none",
              nearClosure ? "text-amber-600" : "text-muted-foreground"
            )}>
              Gate
            </p>
            <p className={cn(
              "mt-0.5 font-mono text-sm font-bold tabular-nums leading-none",
              nearClosure ? "text-amber-700" : "text-foreground"
            )}>
              {gateCountdown}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-gray-100"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}
