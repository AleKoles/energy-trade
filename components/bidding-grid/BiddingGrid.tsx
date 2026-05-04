"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
} from "react"
import { AnimatePresence, motion } from "framer-motion"
import { AlertCircle, ChevronLeft, ChevronRight, Copy, TrendingUp, X } from "lucide-react"
import { List as VirtualList } from "react-window"
import { cn } from "@/lib/utils"
import type { GapDataPoint } from "@/components/gap-analysis/useGapData"
import { getPortfolioPositions } from "@/lib/portfolio"
import { HeaderControls } from "./HeaderControls"
import { BulkActionBar } from "./BulkActionBar"
import { BiddingRow, type BidField } from "./BiddingRow"

// ─── Local types (mirrors parent's HourlyBidRow) ──────────────────────────────

interface BidRow {
  hour:   string
  volume: number
  price:  number | null
}

const MOBILE_ROW_H = 172

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BiddingGridProps {
  // Data
  gapData:          GapDataPoint[]
  hourlyBids:       BidRow[]
  refPrices:        number[]
  // Market config
  isIntraday:       boolean
  mwhMultiplier:    number
  slotCount:        number
  // Viewport
  isMobile:         boolean
  listHeight:       number
  listWrapRef:      RefObject<HTMLDivElement | null>
  // Header info
  gateCountdown:    string
  nearClosure:      boolean
  // Footer stats
  draftSaved:       boolean
  totalVolume:      number
  estimatedMaxSpend: number
  filledSlots:      number
  canContinue:      boolean
  draftCount:       number
  // Data mutation callbacks (parent owns state)
  onVolumeChange:   (index: number, raw: string) => void
  onPriceChange:    (index: number, raw: string) => void
  onBidKeyDown:     (e: KeyboardEvent<HTMLInputElement>, index: number, field: BidField) => void
  onSyncToGap:      (indices?: ReadonlySet<number>) => void
  onSyncPrices:     (indices?: ReadonlySet<number>) => void
  onInitPrices:     () => void
  onCopyDown:       (fromIndex: number) => void
  onApplyFirstToAll: () => void
  onClearAll:       () => void
  // Navigation
  onBack:  () => void
  onNext:  () => void
  onClose: () => void
}

// ─── Position side panel ─────────────────────────────────────────────────────

interface HourPos {
  hour: number
  forecastLoad: number
  ppaCovered: number
  alreadyHedged: number
  activeBidMW: number
  netOpen: number
}

function PositionSidePanel({
  positions,
  netOpenTotal,
  coverageRatio,
  worstCaseSpend,
  onHoverHour,
  onClose,
}: {
  positions: HourPos[]
  netOpenTotal: number
  coverageRatio: number
  worstCaseSpend: number
  onHoverHour: (hour: number) => void
  onClose: () => void
}) {
  const maxAbs = Math.max(...positions.map((p) => Math.abs(p.netOpen)), 1)
  const isLong = netOpenTotal <= 0
  return (
    <div className="w-64 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5 text-primary" />
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Position</p>
        </div>
        <button type="button" onClick={onClose} className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-gray-100">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-4 p-4">
        <div>
          <p className="text-[10px] text-muted-foreground">Net Open Position</p>
          <p className={cn("mt-0.5 text-xl font-bold tabular-nums", isLong ? "text-emerald-600" : "text-red-500")}>
            {netOpenTotal > 0 ? "+" : ""}{netOpenTotal.toFixed(1)}{" "}
            <span className="text-xs font-normal text-muted-foreground">MWh</span>
          </p>
          <p className={cn("text-[10px]", isLong ? "text-emerald-500" : "text-red-400")}>
            {isLong ? "Long — over-hedged" : "Unhedged — buy required"}
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">Coverage Ratio</p>
            <p className="text-xs font-semibold tabular-nums text-foreground">{coverageRatio.toFixed(1)}%</p>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                coverageRatio >= 80 ? "bg-emerald-400" : coverageRatio >= 50 ? "bg-amber-400" : "bg-red-400"
              )}
              style={{ width: `${Math.min(coverageRatio, 100)}%` }}
            />
          </div>
        </div>

        <div>
          <p className="text-[10px] text-muted-foreground">Worst-case Spend</p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
            €{worstCaseSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </div>
      </div>

      <div className="border-t border-gray-100 px-4 pb-4 pt-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Hourly Net Open
        </p>
        <div className="flex h-10 items-end gap-px">
          {positions.map((p, i) => {
            const h = (Math.abs(p.netOpen) / maxAbs) * 38
            const color = p.netOpen > 5 ? "bg-red-400/70" : p.netOpen < -5 ? "bg-emerald-400/70" : "bg-gray-300"
            return (
              <div
                key={i}
                className="flex-1 cursor-pointer"
                onMouseEnter={() => onHoverHour(i)}
                title={`${String(i).padStart(2, "0")}:00 · ${p.netOpen > 0 ? "+" : ""}${p.netOpen.toFixed(1)} MW`}
              >
                <div className={cn("w-full rounded-sm", color)} style={{ height: `${Math.max(h, 2)}px` }} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BiddingGrid({
  gapData, hourlyBids, refPrices,
  isIntraday, mwhMultiplier, slotCount,
  isMobile, listHeight, listWrapRef,
  gateCountdown, nearClosure,
  draftSaved, totalVolume, estimatedMaxSpend, filledSlots, canContinue, draftCount,
  onVolumeChange, onPriceChange, onBidKeyDown,
  onSyncToGap, onSyncPrices, onInitPrices,
  onCopyDown, onApplyFirstToAll, onClearAll,
  onBack, onNext, onClose,
}: BiddingGridProps) {

  // ── Local UI state ──────────────────────────────────────────────────────────

  const [selectedRows, setSelectedRows]       = useState<ReadonlySet<number>>(new Set())
  const [flashedRows,  setFlashedRows]        = useState<ReadonlySet<number>>(new Set())
  const [mobileFocusIndex, setMobileFocusIndex] = useState<number | null>(null)
  const [showPositionPanel, setShowPositionPanel] = useState(true)
  const mobileFieldRef = useRef<BidField>("volume")
  const blurClearRef   = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Portfolio / position data ───────────────────────────────────────────────

  const portfolio = useMemo(() => getPortfolioPositions(), [])

  const hourlyPositions = useMemo((): HourPos[] =>
    portfolio.map((pos, h) => {
      let activeBidMW = 0
      if (isIntraday) {
        for (let q = 0; q < 4; q++) {
          const slot = hourlyBids[h * 4 + q]
          if (slot && slot.volume > 0 && slot.price !== null) activeBidMW += slot.volume
        }
        activeBidMW /= 4
      } else {
        const slot = hourlyBids[h]
        if (slot && slot.volume > 0 && slot.price !== null) activeBidMW = slot.volume
      }
      const netOpen = pos.forecastLoad - pos.ppaCovered - pos.alreadyHedged - activeBidMW
      return { ...pos, activeBidMW, netOpen: Math.round(netOpen * 10) / 10 }
    }),
    [portfolio, hourlyBids, isIntraday]
  )

  const positionTotals = useMemo(() => {
    const totalLoad    = hourlyPositions.reduce((s, p) => s + p.forecastLoad, 0)
    const totalCovered = hourlyPositions.reduce((s, p) => s + p.ppaCovered + p.alreadyHedged + p.activeBidMW, 0)
    const netOpenTotal = hourlyPositions.reduce((s, p) => s + p.netOpen, 0)
    const coverageRatio = totalLoad > 0 ? (totalCovered / totalLoad) * 100 : 0
    const worstCaseSpend = hourlyBids.reduce((s, b) => {
      return b.volume > 0 && b.price !== null ? s + b.volume * mwhMultiplier * b.price : s
    }, 0)
    return {
      netOpenTotal: Math.round(netOpenTotal * 10) / 10,
      coverageRatio: Math.round(coverageRatio * 10) / 10,
      worstCaseSpend,
    }
  }, [hourlyPositions, hourlyBids, mwhMultiplier])

  // ── Smart price init on first mount ────────────────────────────────────────
  useEffect(() => {
    if (hourlyBids.some((b) => b.price === null)) onInitPrices()
  }, []) // intentionally once

  // ── Flash helper ─────────────────────────────────────────────────────────────
  const flashRows = useCallback((indices: ReadonlySet<number>) => {
    setFlashedRows(indices)
    const id = setTimeout(() => setFlashedRows(new Set()), 550)
    return () => clearTimeout(id)
  }, [])

  // ── Per-slot gap (divides hourly gap for intraday) ──────────────────────────
  const slotGaps = useMemo((): number[] =>
    Array.from({ length: slotCount }, (_, i) => {
      const hourlyGap = gapData[isIntraday ? Math.floor(i / 4) : i]?.gap ?? 0
      return isIntraday ? Math.round((hourlyGap / 4) * 10) / 10 : hourlyGap
    }),
    [gapData, isIntraday, slotCount]
  )

  // ── Selection ────────────────────────────────────────────────────────────────
  const toggleRowSelection = useCallback((index: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev)
      next.has(index) ? next.delete(index) : next.add(index)
      return next
    })
  }, [])

  // ── Sync MW to gap (primary header action) ───────────────────────────────────
  const handleSyncToGap = useCallback(() => {
    const target = selectedRows.size > 0 ? selectedRows : undefined
    onSyncToGap(target)
    const toFlash = target ?? new Set(Array.from({ length: slotCount }, (_, i) => i))
    flashRows(toFlash)
  }, [selectedRows, slotCount, onSyncToGap, flashRows])

  // ── Sync prices ───────────────────────────────────────────────────────────────
  const handleSyncPrices = useCallback(() => {
    const target = selectedRows.size > 0 ? selectedRows : undefined
    onSyncPrices(target)
    const toFlash = target ?? new Set(Array.from({ length: slotCount }, (_, i) => i))
    flashRows(toFlash)
  }, [selectedRows, slotCount, onSyncPrices, flashRows])

  // ── Bulk: Apply Match for selected rows ──────────────────────────────────────
  const handleBulkApplyMatch = useCallback(() => {
    onSyncToGap(selectedRows.size > 0 ? selectedRows : undefined)
    flashRows(selectedRows.size > 0
      ? selectedRows
      : new Set(Array.from({ length: slotCount }, (_, i) => i))
    )
  }, [selectedRows, slotCount, onSyncToGap, flashRows])

  // ── Bulk: Price adjustment (±1%) ─────────────────────────────────────────────
  const handleBulkPriceAdjust = useCallback((factor: number) => {
    const targets = selectedRows.size > 0 ? [...selectedRows] : Array.from({ length: slotCount }, (_, i) => i)
    targets.forEach((i) => {
      const current = hourlyBids[i]?.price
      if (current !== null && current !== undefined) {
        onPriceChange(i, (current * factor).toFixed(2))
      }
    })
    flashRows(new Set(targets))
  }, [selectedRows, slotCount, hourlyBids, onPriceChange, flashRows])

  // ── Bulk: Clear selected rows ─────────────────────────────────────────────────
  const handleClearSelected = useCallback(() => {
    selectedRows.forEach((i) => {
      onVolumeChange(i, "")
      onPriceChange(i, "")
    })
    setSelectedRows(new Set())
  }, [selectedRows, onVolumeChange, onPriceChange])

  // ── Copy down (with flash) ────────────────────────────────────────────────────
  const handleCopyDown = useCallback((fromIndex: number) => {
    onCopyDown(fromIndex)
    flashRows(new Set(Array.from(
      { length: slotCount - fromIndex - 1 },
      (_, k) => fromIndex + 1 + k
    )))
  }, [onCopyDown, slotCount, flashRows])

  // ── Apply first to all (with flash) ──────────────────────────────────────────
  const handleApplyFirstToAll = useCallback(() => {
    onApplyFirstToAll()
    flashRows(new Set(Array.from({ length: slotCount - 1 }, (_, k) => k + 1)))
  }, [onApplyFirstToAll, slotCount, flashRows])

  const handlePositionHover = useCallback((hour: number) => {
    const idx = isIntraday ? hour * 4 : hour
    document.querySelector<HTMLElement>(`[data-bid-input="volume-${idx}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [isIntraday])

  // ── Mobile focus handlers ─────────────────────────────────────────────────────
  const focusHourAtField = useCallback((index: number, field: BidField) => {
    if (index < 0 || index >= slotCount) return
    mobileFieldRef.current = field
    document.querySelector<HTMLInputElement>(`[data-bid-input="${field}-${index}"]`)?.focus()
  }, [slotCount])

  const handleMobileInputFocus = useCallback((index: number, field: BidField) => {
    if (blurClearRef.current) { clearTimeout(blurClearRef.current); blurClearRef.current = null }
    mobileFieldRef.current = field
    setMobileFocusIndex(index)
  }, [])

  const handleMobileInputBlur = useCallback(() => {
    blurClearRef.current = setTimeout(() => setMobileFocusIndex(null), 200)
  }, [])

  // ── Desktop table ─────────────────────────────────────────────────────────────

  const GRID = "grid-cols-[24px_115px_140px_1fr_1fr_28px_24px]"

  const renderDesktopTable = () => (
    <div className="divide-y divide-gray-200 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className={cn(
        `grid items-center gap-2 px-2 py-2.5 sm:px-3 ${GRID}`,
        "sticky top-0 z-10 border-b border-white/20 bg-white/80 shadow-[0_1px_8px_rgba(0,33,71,0.06)]",
        "backdrop-blur-md text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
      )}>
        <span className="text-center">Sel</span>
        <span>Time</span>
        <span>Forecast Gap</span>
        <span className="text-right">Bid MW</span>
        <span className="text-right">Limit Price</span>
        <span className="text-center">Status</span>
        <span />
      </div>

      {/* Rows */}
      {hourlyBids.map((bid, i) => (
        <BiddingRow
          key={bid.hour}
          index={i}
          slot={bid.hour}
          slotGap={slotGaps[i] ?? 0}
          volume={bid.volume}
          price={bid.price}
          refPrice={refPrices[i] ?? 0}
          mwhMultiplier={mwhMultiplier}
          isSelected={selectedRows.has(i)}
          isFlashed={flashedRows.has(i)}
          isFocused={false}
          isCompact={false}
          isLastRow={i >= slotCount - 1}
          onVolumeChange={(raw) => onVolumeChange(i, raw)}
          onPriceChange={(raw) => onPriceChange(i, raw)}
          onKeyDown={(e, field) => onBidKeyDown(e, i, field)}
          onMobileFocus={(field) => handleMobileInputFocus(i, field)}
          onMobileBlur={handleMobileInputBlur}
          onToggleSelect={() => toggleRowSelection(i)}
          onCopyDown={() => handleCopyDown(i)}
        />
      ))}
    </div>
  )

  // ── Mobile virtual row ────────────────────────────────────────────────────────

  const MobileVirtualRow = useCallback(
    ({ index, style, ariaAttributes }: {
      index: number
      style: CSSProperties
      ariaAttributes: { "aria-posinset": number; "aria-setsize": number; role: "listitem" }
    }) => {
      const bid = hourlyBids[index]
      if (!bid) return null
      return (
        <div style={style} {...ariaAttributes}>
          <BiddingRow
            index={index}
            slot={bid.hour}
            slotGap={slotGaps[index] ?? 0}
            volume={bid.volume}
            price={bid.price}
            refPrice={refPrices[index] ?? 0}
            mwhMultiplier={mwhMultiplier}
            isSelected={selectedRows.has(index)}
            isFlashed={flashedRows.has(index)}
            isFocused={mobileFocusIndex === index}
            isCompact={true}
            isLastRow={index >= slotCount - 1}
            onVolumeChange={(raw) => onVolumeChange(index, raw)}
            onPriceChange={(raw) => onPriceChange(index, raw)}
            onKeyDown={(e, field) => onBidKeyDown(e, index, field)}
            onMobileFocus={(field) => handleMobileInputFocus(index, field)}
            onMobileBlur={handleMobileInputBlur}
            onToggleSelect={() => toggleRowSelection(index)}
            onCopyDown={() => handleCopyDown(index)}
          />
        </div>
      )
    },
    [
      hourlyBids, slotGaps, refPrices, mwhMultiplier, slotCount,
      selectedRows, flashedRows, mobileFocusIndex,
      onVolumeChange, onPriceChange, onBidKeyDown,
      handleMobileInputFocus, handleMobileInputBlur,
      toggleRowSelection, handleCopyDown,
    ]
  )

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">

      {/* Desktop header */}
      <HeaderControls
        isIntraday={isIntraday}
        gateCountdown={gateCountdown}
        nearClosure={nearClosure}
        selectedCount={selectedRows.size}
        onSyncToGap={handleSyncToGap}
        onSyncPrices={handleSyncPrices}
        onClose={onClose}
      />

      {/* Secondary toolbar */}
      <div className="hidden shrink-0 items-center gap-3 border-b border-gray-200 bg-gray-50/60 px-6 py-2.5 sm:px-8 md:flex">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/50">
          Rows
        </span>
        <button
          type="button"
          onClick={handleApplyFirstToAll}
          className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Apply First to All
        </button>
        <button
          type="button"
          onClick={onClearAll}
          className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Clear All
        </button>
        <div className="ml-auto">
          <button
            type="button"
            onClick={() => setShowPositionPanel((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              showPositionPanel
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            Position
          </button>
        </div>
      </div>

      {/* Bulk action bar (when rows are selected) */}
      <BulkActionBar
        selectedCount={selectedRows.size}
        onApplyMatch={handleBulkApplyMatch}
        onAdjustPrice={handleBulkPriceAdjust}
        onClearSelected={handleClearSelected}
        onDeselect={() => setSelectedRows(new Set())}
      />

      {/* Mobile hour stepper */}
      <AnimatePresence>
        {isMobile && mobileFocusIndex !== null && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="sticky top-0 z-30 flex shrink-0 items-center justify-between gap-2 overflow-hidden border-b border-primary/20 bg-primary/5 px-3 py-2 md:hidden"
          >
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-primary shadow-sm ring-1 ring-gray-200"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => focusHourAtField(mobileFocusIndex - 1, mobileFieldRef.current)}
              disabled={mobileFocusIndex <= 0}
              aria-label="Previous hour"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="text-center text-xs font-semibold text-foreground">
              {hourlyBids[mobileFocusIndex]?.hour ?? ""}
              <span className="block text-[10px] font-normal text-muted-foreground">
                {mobileFocusIndex + 1} / {slotCount}
              </span>
            </span>
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-primary shadow-sm ring-1 ring-gray-200"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => focusHourAtField(mobileFocusIndex + 1, mobileFieldRef.current)}
              disabled={mobileFocusIndex >= slotCount - 1}
              aria-label="Next hour"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bid list */}
      <div
        ref={listWrapRef}
        className="min-h-0 flex-1 overflow-hidden px-0 pb-28 pt-0 md:overflow-auto md:p-6 md:px-8 md:pb-4"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={`${isIntraday}-${slotCount}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="flex h-full min-h-0 flex-col md:h-auto"
          >
            {isMobile ? (
              <VirtualList
                key={`${isIntraday}-${slotCount}`}
                rowCount={slotCount}
                rowHeight={MOBILE_ROW_H}
                rowComponent={MobileVirtualRow}
                rowProps={{}}
                overscanCount={6}
                defaultHeight={listHeight}
                style={{ height: listHeight, width: "100%" }}
              />
            ) : (
              <div className="flex items-start gap-4">
                <div className="min-w-0 flex-1">{renderDesktopTable()}</div>
                {showPositionPanel && (
                  <PositionSidePanel
                    positions={hourlyPositions}
                    netOpenTotal={positionTotals.netOpenTotal}
                    coverageRatio={positionTotals.coverageRatio}
                    worstCaseSpend={positionTotals.worstCaseSpend}
                    onHoverHour={handlePositionHover}
                    onClose={() => setShowPositionPanel(false)}
                  />
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Desktop footer */}
      <div className="hidden shrink-0 flex-col gap-2.5 border-t border-gray-200 bg-white px-6 py-3.5 sm:px-8 md:flex lg:flex-row lg:items-center lg:justify-between lg:gap-3 lg:py-4">

        {/* Stats */}
        <div className="flex items-center gap-4">
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="w-24 text-[10px] text-muted-foreground">Total Volume</span>
              <span className="text-xs font-bold text-foreground">{totalVolume.toFixed(2)} MWh</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-24 text-[10px] text-muted-foreground">Est. max spend</span>
              <span className="text-xs font-bold text-foreground">
                €{estimatedMaxSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-24 text-[10px] text-muted-foreground">Active slots</span>
              <span className="text-xs font-bold text-foreground">{filledSlots} / {slotCount}</span>
            </div>
          </div>
          <span
            className={cn(
              "text-[10px] font-medium transition-opacity duration-500",
              draftSaved ? "text-emerald-600 opacity-100" : "opacity-0"
            )}
            aria-live="polite"
          >
            ✓ Draft saved
          </span>
        </div>

        {/* Buttons + warning */}
        <div className="flex items-center justify-between gap-3 lg:justify-end">
          <div className="flex items-center gap-1">
            {!canContinue && (
              <>
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                <span className="text-xs text-muted-foreground">
                  Fill MW + Price on at least one slot
                </span>
              </>
            )}
            {canContinue && draftCount > 0 && (
              <span className="text-xs text-amber-600/80">
                {draftCount} incomplete {draftCount === 1 ? "row" : "rows"} will be skipped
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onBack}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-white lg:px-6"
            >
              Back
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!canContinue}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 lg:px-6"
            >
              Review Bid
            </button>
          </div>
        </div>
      </div>

      {/* Mobile FAB: Apply first row to all */}
      <button
        type="button"
        onClick={handleApplyFirstToAll}
        className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-2 ring-white/90 transition hover:opacity-95 md:hidden"
        aria-label="Apply first row to all slots"
      >
        <Copy className="h-5 w-5" />
      </button>

      {/* Mobile bottom bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_24px_rgba(0,0,0,0.08)] backdrop-blur-sm md:hidden">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Total volume
            </p>
            <p className="text-lg font-bold text-primary">
              {totalVolume.toFixed(1)}{" "}
              <span className="text-sm font-semibold text-foreground">MWh</span>
            </p>
            {!canContinue && (
              <p className="text-[10px] text-amber-600">Add MW + Price to continue</p>
            )}
          </div>
          <button
            type="button"
            onClick={onNext}
            disabled={!canContinue}
            className="min-w-[130px] rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            Review Bid
          </button>
        </div>
      </div>

    </div>
  )
}
