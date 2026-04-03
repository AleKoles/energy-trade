"use client"

import { RefreshCw, X } from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

interface BulkActionBarProps {
  selectedCount:    number
  onApplyMatch:     () => void
  onAdjustPrice:    (factor: number) => void  // 1.01 → +1%, 0.99 → −1%
  onClearSelected:  () => void
  onDeselect:       () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BulkActionBar({
  selectedCount,
  onApplyMatch,
  onAdjustPrice,
  onClearSelected,
  onDeselect,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null

  return (
    <div className="hidden shrink-0 items-center gap-3 border-b border-primary/10 bg-primary/[0.04] px-6 py-2 sm:px-8 md:flex">

      <span className="text-xs font-medium text-primary/70">
        {selectedCount} row{selectedCount > 1 ? "s" : ""} selected
      </span>

      <div className="h-3.5 w-px bg-primary/20" />

      {/* Apply Match */}
      <button
        type="button"
        onClick={onApplyMatch}
        className="flex items-center gap-1.5 rounded-md bg-primary/8 px-2.5 py-1 text-xs font-semibold text-primary ring-1 ring-primary/20 transition-colors hover:bg-primary/12"
      >
        <RefreshCw className="h-3 w-3" />
        Apply Match
      </button>

      {/* Price adjustments */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">
          Price
        </span>
        <button
          type="button"
          onClick={() => onAdjustPrice(1.01)}
          className="rounded px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 transition-colors hover:bg-emerald-50"
        >
          +1%
        </button>
        <button
          type="button"
          onClick={() => onAdjustPrice(0.99)}
          className="rounded px-2 py-0.5 text-xs font-semibold text-red-600 ring-1 ring-red-200 transition-colors hover:bg-red-50"
        >
          −1%
        </button>
      </div>

      <button
        type="button"
        onClick={onClearSelected}
        className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground ring-1 ring-gray-200 transition-colors hover:bg-gray-100"
      >
        Clear Selected
      </button>

      <button
        type="button"
        onClick={onDeselect}
        className="ml-auto flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground"
      >
        <X className="h-3 w-3" />
        Deselect
      </button>
    </div>
  )
}
