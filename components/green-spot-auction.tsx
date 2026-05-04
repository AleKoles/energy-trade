"use client"

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  FileText,
  Leaf,
  Moon,
  MoreHorizontal,
  RefreshCw,
  Shield,
  Sun,
  Upload,
  X,
  Zap,
} from "lucide-react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { List as VirtualList } from "react-window"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { generateReferencePrices } from "@/lib/pricing"
import { GapAnalysisScreen } from "@/components/gap-analysis/GapAnalysisScreen"
import { useGapData, type ConfidenceLevel, type WeatherModel } from "@/components/gap-analysis/useGapData"
import { BiddingGrid } from "@/components/bidding-grid/BiddingGrid"

// ─── Types ────────────────────────────────────────────────────────────────────

interface HourlyBidRow {
  hour: string
  volume: number    // MW (user input)
  price: number | null  // €/MWh — null = not yet entered
  // State is derived: empty (no values) | draft (one field) | active (both fields)
}

/** Derived from volume + price — never stored directly */
type RowState = 'empty' | 'draft' | 'active'

type MarketType = "day-ahead" | "intraday"
type BidField = "volume" | "price"
type SectionId = "night" | "morning" | "day" | "evening"

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "greenspot-bid-draft"
const MOBILE_ROW_H = 124

const SECTIONS: Array<{
  id: SectionId
  label: string
  timeRange: string
  hourStart: number
  hourEnd: number // exclusive
  icon: typeof Moon
}> = [
  { id: "night",   label: "Night",   timeRange: "00:00 – 06:00", hourStart: 0,  hourEnd: 6,  icon: Moon },
  { id: "morning", label: "Morning", timeRange: "06:00 – 12:00", hourStart: 6,  hourEnd: 12, icon: Sun  },
  { id: "day",     label: "Day",     timeRange: "12:00 – 18:00", hourStart: 12, hourEnd: 18, icon: Sun  },
  { id: "evening", label: "Evening", timeRange: "18:00 – 24:00", hourStart: 18, hourEnd: 24, icon: Moon },
]

const STEPS = [
  { id: 1, label: "Data Setup",    description: "Define load for next 24h" },
  { id: 2, label: "Gap Analysis",  description: "Forecast gap & shortages" },
  { id: 3, label: "Bid Entry",     description: "Enter hourly bids" },
  { id: 4, label: "Review",        description: "Confirm and submit" },
]

type DataSource = "session" | "scratch" | "csv" | "template"

const HOURS = Array.from({ length: 24 }, (_, i) => {
  const start = i.toString().padStart(2, "0")
  const end = ((i + 1) % 24).toString().padStart(2, "0")
  return `${start}:00 - ${end}:00`
})

function generateIntradayLabels(): string[] {
  const labels: string[] = []
  for (let i = 0; i < 96; i++) {
    const totalMin = i * 15
    const h = Math.floor(totalMin / 60) % 24
    const m = totalMin % 60
    labels.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`)
  }
  return labels
}

const INTRADAY_LABELS = generateIntradayLabels()

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slotLabelsFor(mt: MarketType): string[] {
  return mt === "intraday" ? INTRADAY_LABELS : HOURS
}

function createDefaultBids(mt: MarketType): HourlyBidRow[] {
  return slotLabelsFor(mt).map((hour) => ({ hour, volume: 0, price: null }))
}

function getRowState(row: HourlyBidRow): RowState {
  const hasVolume = row.volume > 0
  const hasPrice = row.price !== null
  if (hasVolume && hasPrice) return 'active'
  if (hasVolume || hasPrice) return 'draft'
  return 'empty'
}

function expand24To96(rows: HourlyBidRow[]): HourlyBidRow[] {
  const out: HourlyBidRow[] = []
  for (let h = 0; h < 24; h++) {
    const b = rows[h]
    const slotVolume = b.volume > 0 ? b.volume / 4 : 0
    for (let q = 0; q < 4; q++) {
      out.push({ hour: INTRADAY_LABELS[h * 4 + q], volume: slotVolume, price: b.price })
    }
  }
  return out
}

function collapse96To24(rows: HourlyBidRow[]): HourlyBidRow[] {
  const out: HourlyBidRow[] = []
  for (let h = 0; h < 24; h++) {
    let vol = 0, pricedVol = 0, weightedPrice = 0
    let firstPrice: number | null = null
    for (let q = 0; q < 4; q++) {
      const b = rows[h * 4 + q]
      vol += b.volume
      if (b.price !== null) {
        weightedPrice += b.volume * b.price
        pricedVol += b.volume
        if (firstPrice === null) firstPrice = b.price
      }
    }
    const price = pricedVol > 0 ? weightedPrice / pricedVol : firstPrice
    out.push({ hour: HOURS[h], volume: vol, price })
  }
  return out
}

function parseDraft(raw: string | null): {
  hourlyBids: HourlyBidRow[]
  marketType: MarketType
  currentStep: number
  deliveryDate?: string
} | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as {
      hourlyBids?: HourlyBidRow[]
      marketType?: MarketType
      currentStep?: number
      deliveryDate?: string
    }
    if (!Array.isArray(parsed.hourlyBids)) return null
    const len = parsed.hourlyBids.length
    if (len !== 24 && len !== 96) return null
    const mt0: MarketType =
      parsed.marketType === "intraday" || parsed.marketType === "day-ahead"
        ? parsed.marketType : "day-ahead"
    let hourlyBids: HourlyBidRow[] = parsed.hourlyBids.map((row, i) => ({
      hour: typeof row.hour === "string" ? row.hour : slotLabelsFor(mt0)[i] ?? HOURS[i % 24],
      volume: typeof row.volume === "number" && !Number.isNaN(row.volume) ? row.volume : 0,
      price: typeof row.price === "number" && !Number.isNaN(row.price) ? row.price : null,
      // active field is derived — ignore any stored value
    }))
    if (mt0 === "intraday" && hourlyBids.length === 24) hourlyBids = expand24To96(hourlyBids)
    else if (mt0 === "day-ahead" && hourlyBids.length === 96) hourlyBids = collapse96To24(hourlyBids)
    const currentStep =
      typeof parsed.currentStep === "number" && parsed.currentStep >= 1 && parsed.currentStep <= 4
        ? parsed.currentStep : 2
    const deliveryDate = typeof parsed.deliveryDate === "string" ? parsed.deliveryDate : undefined
    return { hourlyBids, marketType: mt0, currentStep, deliveryDate }
  } catch { return null }
}

function getSlotSection(index: number, isIntraday: boolean): SectionId {
  const hour = isIntraday ? Math.floor(index / 4) : index
  if (hour < 6) return "night"
  if (hour < 12) return "morning"
  if (hour < 18) return "day"
  return "evening"
}

function getSectionSlotRange(sec: (typeof SECTIONS)[number], isIntraday: boolean): [number, number] {
  const mult = isIntraday ? 4 : 1
  return [sec.hourStart * mult, sec.hourEnd * mult - 1]
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function EnergyStepIndicator({
  isCompleted,
  isCurrent,
}: {
  stepId: number
  isCompleted: boolean
  isCurrent: boolean
}) {
  if (isCompleted) {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
        <Check className="h-4 w-4" strokeWidth={2.5} />
      </div>
    )
  }
  if (isCurrent) {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary shadow-sm">
        <span className="h-2.5 w-2.5 rounded-full bg-white/90" />
      </div>
    )
  }
  return <div className="h-8 w-8 shrink-0 rounded-full border border-gray-200 bg-white" />
}

function EnergyCheckbox({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  ariaLabel: string
}) {
  return (
    <label className="relative inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded border border-gray-300 bg-white transition-colors focus-within:ring-2 focus-within:ring-primary/30 has-[:checked]:border-primary has-[:checked]:bg-primary">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
        aria-label={ariaLabel}
      />
      <Check className="pointer-events-none h-2.5 w-2.5 text-white opacity-0 peer-checked:opacity-100" strokeWidth={3} />
    </label>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export function GreenSpotAuction() {
  const [currentStep, setCurrentStep] = useState(1)
  const [marketType, setMarketType] = useState<MarketType>("day-ahead")
  const [hourlyBids, setHourlyBids] = useState<HourlyBidRow[]>(() => createDefaultBids("day-ahead"))
  const [isOpen, setIsOpen] = useState(true)
  const [draftHydrated, setDraftHydrated] = useState(false)
  const [draftSaved, setDraftSaved] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [listHeight, setListHeight] = useState(400)
  const [mobileFocusIndex, setMobileFocusIndex] = useState<number | null>(null)
  const [flashedRows, setFlashedRows] = useState<ReadonlySet<number>>(new Set())
  const [selectedRows, setSelectedRows] = useState<ReadonlySet<number>>(new Set())
  const [collapsedSections, setCollapsedSections] = useState<ReadonlySet<SectionId>>(new Set())
  const [dataSource, setDataSource] = useState<DataSource | null>(null)
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [gateCountdown, setGateCountdown] = useState("--:--:--")
  const [lastBidDate, setLastBidDate] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const deliveryDate = useMemo(() => {
    const t = new Date()
    t.setDate(t.getDate() + 1)
    return t.toISOString().split("T")[0]
  }, [])
  const [remitChecks, setRemitChecks] = useState<[boolean, boolean, boolean]>([false, false, false])
  const [submissionTimestamp, setSubmissionTimestamp] = useState("")
  const [bidHash, setBidHash] = useState<string | null>(null)
  const [isPaletteOpen, setIsPaletteOpen] = useState(false)
  const [confidence,   setConfidence]   = useState<ConfidenceLevel>("P50")
  const [weatherModel, setWeatherModel] = useState<WeatherModel>("ECMWF")

  const draftSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mobileFieldRef = useRef<BidField>("volume")
  const listWrapRef = useRef<HTMLDivElement>(null)
  const blurClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadMWRef = useRef<number[]>([])

  const isIntraday = marketType === "intraday"
  const mwhMultiplier = isIntraday ? 0.25 : 1
  const slotCount = hourlyBids.length

  // Reference prices — stable per market type (wind factor baked in once per switch)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const refPrices = useMemo(() => generateReferencePrices(isIntraday), [marketType])

  // Gate closure warning: true if current CET time is within 30 min of 11:00
  const nearClosure = useMemo(() => {
    try {
      const now = new Date()
      const parts = new Intl.DateTimeFormat("en", {
        timeZone: "Europe/Paris",
        hour: "numeric", minute: "numeric", hour12: false,
      }).formatToParts(now)
      const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0")
      const m = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0")
      const diff = 11 * 60 - (h * 60 + m)
      return diff > 0 && diff <= 30
    } catch { return false }
  }, [])

  // Count incomplete (draft) rows for Continue hint
  const draftCount = useMemo(
    () => hourlyBids.filter((b) => getRowState(b) === "draft").length,
    [hourlyBids]
  )

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)")
    const apply = () => setIsMobile(mq.matches)
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [])

  useLayoutEffect(() => {
    const el = listWrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setListHeight(Math.max(200, el.clientHeight)))
    ro.observe(el)
    setListHeight(Math.max(200, el.clientHeight))
    return () => ro.disconnect()
  }, [isMobile, hourlyBids.length])

  useEffect(() => {
    const tick = () => {
      try {
        const now = new Date()
        const cetStr = now.toLocaleString("en-US", {
          timeZone: "Europe/Paris", hour12: false,
          hour: "numeric", minute: "numeric", second: "numeric",
        })
        const parts = cetStr.split(":").map(Number)
        const cetSec = parts[0] * 3600 + parts[1] * 60 + parts[2]
        const gateSec = 11 * 3600
        const diff = gateSec > cetSec ? gateSec - cetSec : 24 * 3600 - cetSec + gateSec
        const hh = Math.floor(diff / 3600).toString().padStart(2, "0")
        const mm = Math.floor((diff % 3600) / 60).toString().padStart(2, "0")
        const ss = (diff % 60).toString().padStart(2, "0")
        setGateCountdown(`${hh}:${mm}:${ss}`)
      } catch { setGateCountdown("--:--:--") }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const raw = localStorage.getItem(STORAGE_KEY)
    const draft = parseDraft(raw)
    if (draft) {
      setHourlyBids(draft.hourlyBids)
      setMarketType(draft.marketType)
      setCurrentStep(draft.currentStep)
      try {
        const parsed = JSON.parse(raw!) as { savedAt?: string }
        if (parsed.savedAt) {
          setLastBidDate(new Date(parsed.savedAt).toLocaleDateString("en-GB", {
            day: "numeric", month: "short", year: "numeric",
          }))
        }
      } catch { /* ignore */ }
    }
    setDraftHydrated(true)
  }, [])

  useEffect(() => {
    if (!draftHydrated || typeof window === "undefined") return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ hourlyBids, marketType, currentStep, deliveryDate, savedAt: new Date().toISOString() }))
    if (draftSavedTimerRef.current) clearTimeout(draftSavedTimerRef.current)
    setDraftSaved(true)
    draftSavedTimerRef.current = setTimeout(() => setDraftSaved(false), 1800)
  }, [hourlyBids, marketType, currentStep, draftHydrated])

  // Live submission timestamp — only ticks when Step 4 is visible
  useEffect(() => {
    if (currentStep !== 4) return
    const update = () => {
      const now = new Date()
      const local = now.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      const utcH = now.getUTCHours().toString().padStart(2, "0")
      const utcM = now.getUTCMinutes().toString().padStart(2, "0")
      setSubmissionTimestamp(`${local} (${utcH}:${utcM} UTC)`)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [currentStep])

  // Bid hash — SHA-256 of active rows, recomputed when bids change on Step 4
  useEffect(() => {
    if (currentStep !== 4) return
    const active = hourlyBids.filter((b) => b.volume > 0 && b.price !== null)
    if (active.length === 0) { setBidHash(null); return }
    const encoded = new TextEncoder().encode(JSON.stringify(active))
    crypto.subtle.digest("SHA-256", encoded).then((buf) => {
      const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("")
      setBidHash(hex.slice(0, 12))
    })
  }, [hourlyBids, currentStep])

  // ⌘K global shortcut
  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setIsPaletteOpen((prev) => !prev)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  // ── Derived ────────────────────────────────────────────────────────────────

  const { totalVolume, estimatedMaxSpend, filledSlots } = useMemo(() => {
    let vol = 0, spend = 0, filled = 0
    for (let i = 0; i < hourlyBids.length; i++) {
      const bid = hourlyBids[i]
      // Active = both volume and price provided
      if (bid.volume > 0 && bid.price !== null) {
        const mwh = bid.volume * mwhMultiplier
        vol += mwh
        spend += mwh * bid.price
        filled++
      } else if (bid.volume > 0) {
        // Draft (volume only): include in spend estimate using reference price fallback
        spend += bid.volume * mwhMultiplier * (refPrices[i] ?? 0)
      }
    }
    return { totalVolume: vol, estimatedMaxSpend: spend, filledSlots: filled }
  }, [hourlyBids, mwhMultiplier, refPrices])

  // Step 1: ready to proceed when source is chosen (csv requires a file)
  const dataReady = dataSource !== null && (dataSource !== "csv" || csvFile !== null)

  // 24 hourly load values derived from current bid volumes
  const loadMW = useMemo((): number[] => {
    if (!isIntraday) return hourlyBids.map((b) => b.volume)
    return Array.from({ length: 24 }, (_, h) => {
      const slots = hourlyBids.slice(h * 4, h * 4 + 4)
      return slots.reduce((sum, b) => sum + b.volume, 0) / 4
    })
  }, [hourlyBids, isIntraday])

  // Always keep the ref in sync so effect callbacks can read the latest value
  loadMWRef.current = loadMW

  // Frozen load snapshot — captured when entering step 2, never updated by bid edits.
  // This breaks the circular dependency: syncing MW changes bids but not the gap.
  const [loadSnapshot, setLoadSnapshot] = useState<number[]>(() => Array(24).fill(0))

  useEffect(() => {
    if (currentStep === 2) setLoadSnapshot(loadMWRef.current)
  }, [currentStep])

  // Gap analysis data — uses stable load snapshot, not live bid volumes
  const gapData = useGapData(loadSnapshot, confidence, weatherModel)

  // At least one row with both fields filled
  const canContinue = useMemo(
    () => hourlyBids.some((b) => b.volume > 0 && b.price !== null),
    [hourlyBids]
  )

  // ── Handlers ──────────────────────────────────────────────────────────────

  const updateBidRow = useCallback((index: number, patch: Partial<HourlyBidRow>) => {
    setHourlyBids((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], ...patch }
      return next
    })
  }, [])

  const handleMarketTypeChange = useCallback((next: MarketType) => {
    if (next === marketType) return
    setHourlyBids((prev) => {
      if (next === "intraday" && prev.length === 24) return expand24To96(prev)
      if (next === "day-ahead" && prev.length === 96) return collapse96To24(prev)
      return createDefaultBids(next)
    })
    setMarketType(next)
    setSelectedRows(new Set())
  }, [marketType])

  const handleVolumeChange = (index: number, raw: string) => {
    if (raw === "" || raw === "-") { updateBidRow(index, { volume: 0 }); return }
    const n = parseFloat(raw)
    updateBidRow(index, { volume: Number.isNaN(n) ? 0 : n })
  }

  const handlePriceChange = (index: number, raw: string) => {
    if (raw === "") { updateBidRow(index, { price: null }); return }
    const n = parseFloat(raw)
    if (!Number.isNaN(n)) updateBidRow(index, { price: n })
  }

  const focusNextRowField = (index: number, field: BidField) => {
    if (index >= slotCount - 1) return
    document.querySelector<HTMLInputElement>(`[data-bid-input="${field}-${index + 1}"]`)?.focus()
  }

  const handleBidKeyDown = (e: KeyboardEvent<HTMLInputElement>, index: number, field: BidField) => {
    if (e.key === "ArrowDown" || e.key === "Enter") {
      e.preventDefault()
      focusNextRowField(index, field)
    }
    if (e.key === "Tab" && !e.shiftKey && field === "price" && index < slotCount - 1) {
      e.preventDefault()
      document.querySelector<HTMLInputElement>(`[data-bid-input="volume-${index + 1}"]`)?.focus()
    }
    if (e.key === "Tab" && e.shiftKey && field === "volume" && index > 0) {
      e.preventDefault()
      document.querySelector<HTMLInputElement>(`[data-bid-input="price-${index - 1}"]`)?.focus()
    }
  }

  const focusHourAtField = useCallback((index: number, field: BidField) => {
    if (index < 0 || index >= slotCount) return
    mobileFieldRef.current = field
    document.querySelector<HTMLInputElement>(`[data-bid-input="${field}-${index}"]`)?.focus()
  }, [slotCount])

  const handleMobileInputFocus = (index: number, field: BidField) => {
    if (blurClearRef.current) { clearTimeout(blurClearRef.current); blurClearRef.current = null }
    mobileFieldRef.current = field
    setMobileFocusIndex(index)
  }

  const handleMobileInputBlur = () => {
    blurClearRef.current = setTimeout(() => setMobileFocusIndex(null), 200)
  }


  const flashRows = (indices: Set<number>) => {
    setFlashedRows(indices)
    setTimeout(() => setFlashedRows(new Set()), 550)
  }

  const handleApplyFirstToAll = () => {
    const { volume, price } = hourlyBids[0]
    setHourlyBids((prev) => prev.map((row, i) => i === 0 ? row : { ...row, volume, price }))
  }

  const handleCopyDown = useCallback((fromIndex: number) => {
    const { volume, price } = hourlyBids[fromIndex]
    setHourlyBids((prev) => prev.map((r, i) => i > fromIndex ? { ...r, volume, price } : r))
  }, [hourlyBids])

  const handleApplyToSelected = useCallback(() => {
    if (selectedRows.size === 0) return
    const sortedSelected = [...selectedRows].sort((a, b) => a - b)
    const { volume, price } = hourlyBids[sortedSelected[0]]
    setHourlyBids((prev) => prev.map((r, i) => selectedRows.has(i) ? { ...r, volume, price } : r))
    setSelectedRows(new Set())
    flashRows(new Set(sortedSelected.slice(1)))
  }, [selectedRows, hourlyBids])

  const handleClearAll = () => {
    setHourlyBids(createDefaultBids(marketType))
    setSelectedRows(new Set())
  }

  const formatDeliveryDate = (iso: string) => {
    try {
      return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
        weekday: "short", day: "numeric", month: "short", year: "numeric",
      })
    } catch { return iso }
  }

  const handleSubmit = useCallback(() => {
    setSubmitted(true)
    try {
      const key = STORAGE_KEY + "-attestations"
      const existing = JSON.parse(localStorage.getItem(key) ?? "[]") as object[]
      existing.push({ hash: bidHash, timestamp: new Date().toISOString(), traderEmail: "kolesnikova@lux-medien.com", acerCode: "B0001234.DE" })
      localStorage.setItem(key, JSON.stringify(existing))
    } catch { /* ignore */ }
  }, [bidHash])

  // ── Strategy presets ──────────────────────────────────────────────────────

  /** Base Load: fill all slots with reference prices (volume unchanged) */
  const handlePresetBaseLoad = useCallback(() => {
    setHourlyBids((prev) =>
      prev.map((row, i) => ({ ...row, price: parseFloat(refPrices[i].toFixed(2)) }))
    )
    flashRows(new Set(Array.from({ length: slotCount }, (_, i) => i)))
  }, [refPrices, slotCount])

  /** Peak Hours (08–18): fill only peak-hour slots with reference prices */
  const handlePresetPeakHours = useCallback(() => {
    const peakSet = new Set(
      Array.from({ length: slotCount }, (_, i) => i).filter((i) => {
        const h = isIntraday ? Math.floor(i / 4) : i
        return h >= 8 && h < 18
      })
    )
    setHourlyBids((prev) =>
      prev.map((row, i) =>
        peakSet.has(i) ? { ...row, price: parseFloat(refPrices[i].toFixed(2)) } : row
      )
    )
    flashRows(peakSet)
  }, [refPrices, slotCount, isIntraday])

  const toggleSection = useCallback((id: SectionId) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const toggleRowSelection = useCallback((index: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index); else next.add(index)
      return next
    })
  }, [])

  // ── Workflow handlers ─────────────────────────────────────────────────────

  const handleStartBidding = useCallback(() => {
    if (dataSource === "scratch") {
      setHourlyBids(createDefaultBids(marketType))
    } else if (dataSource === "template") {
      setHourlyBids(createDefaultBids(marketType).map((row) => ({ ...row, volume: 50 })))
    }
    // "session" keeps existing bids (already loaded); "csv" placeholder: no-op
    setCurrentStep(2)
  }, [dataSource, marketType])

  /** Apply reference prices to selected rows (price only, MW unchanged) */
  const handleSyncSelectedToRef = useCallback(() => {
    if (selectedRows.size === 0) return
    setHourlyBids((prev) =>
      prev.map((row, i) =>
        selectedRows.has(i) ? { ...row, price: parseFloat(refPrices[i].toFixed(2)) } : row
      )
    )
    flashRows(new Set(selectedRows))
    setSelectedRows(new Set())
  }, [selectedRows, refPrices])

  /** Clear MW and price for selected rows */
  const handleClearSelected = useCallback(() => {
    if (selectedRows.size === 0) return
    setHourlyBids((prev) =>
      prev.map((row, i) =>
        selectedRows.has(i) ? { ...row, volume: 0, price: null } : row
      )
    )
    setSelectedRows(new Set())
  }, [selectedRows])

  // ── Stage 3 handlers (called by BiddingGrid) ─────────────────────────────

  const handleSyncVolumesToGap = useCallback((indices?: ReadonlySet<number>) => {
    setHourlyBids((prev) =>
      prev.map((row, i) => {
        if (indices && !indices.has(i)) return row
        const hourI = isIntraday ? Math.floor(i / 4) : i
        const gap = gapData[hourI]?.gap ?? 0
        const slotGap = isIntraday ? Math.round((gap / 4) * 10) / 10 : gap
        return { ...row, volume: Math.max(slotGap, 0) }
      })
    )
  }, [gapData, isIntraday])

  const handleInitPrices = useCallback(() => {
    setHourlyBids((prev) =>
      prev.map((row, i) =>
        row.price === null
          ? { ...row, price: parseFloat((refPrices[i] * 1.05).toFixed(2)) }
          : row
      )
    )
  }, [refPrices])

  const handleSyncPrices = useCallback((indices?: ReadonlySet<number>) => {
    setHourlyBids((prev) =>
      prev.map((row, i) => {
        if (indices && !indices.has(i)) return row
        return { ...row, price: parseFloat((refPrices[i] * 1.05).toFixed(2)) }
      })
    )
  }, [refPrices])

  // ── Sidebar stepper (desktop) ─────────────────────────────────────────────

  const StepperContentDesktop = (
    <>
      <div className="mb-6 shrink-0 md:mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">DAY-AHEAD</h2>
            <p className="text-xs text-muted-foreground">Auction Portal</p>
          </div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col" aria-label="Progress">
        {STEPS.map((step, index) => {
          const isCompleted = step.id < currentStep
          const isCurrent = step.id === currentStep
          const isClickable = isCompleted || isCurrent
          const isLast = index === STEPS.length - 1

          const inner = (
            <>
              <div className="flex w-8 shrink-0 flex-col items-center">
                <EnergyStepIndicator stepId={step.id} isCompleted={isCompleted} isCurrent={isCurrent} />
                {!isLast && <span className="mt-2 block min-h-[2rem] w-px shrink-0 bg-gray-100" aria-hidden />}
              </div>
              <div className={cn("min-w-0 flex-1 pt-0.5", !isLast && "pb-6")}>
                <p className={cn("text-sm font-semibold leading-tight", isCurrent || isCompleted ? "text-foreground" : "text-gray-400")}>
                  {step.label}
                </p>
                <p className="mt-1 text-xs leading-snug text-muted-foreground">{step.description}</p>
              </div>
            </>
          )

          return isClickable ? (
            <button
              key={step.id}
              type="button"
              onClick={() => setCurrentStep(step.id)}
              className={cn("flex w-full gap-4 text-left rounded-lg transition-colors hover:bg-gray-50/80", !isLast && "pb-2")}
              aria-current={isCurrent ? "step" : undefined}
            >
              {inner}
            </button>
          ) : (
            <div key={step.id} className={cn("flex w-full gap-4", !isLast && "pb-2")}>
              {inner}
            </div>
          )
        })}
      </nav>

      {/* Summary — only meaningful from step 2 onwards */}
      {currentStep >= 2 && (
        <div className="mt-4 shrink-0 rounded-lg border border-gray-200 bg-gray-50/80 p-4 md:mt-auto">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {marketType === "intraday" ? "Intraday 15m" : "Day-Ahead 1h"}
          </p>
          <p className="mt-2 text-xs font-medium text-muted-foreground">Total Volume</p>
          <p className="text-2xl font-bold text-primary">
            {totalVolume.toFixed(1)} <span className="text-sm font-normal text-foreground">MWh</span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{filledSlots}/{slotCount} active slots</p>
          <p className="mt-3 text-xs font-medium text-muted-foreground">Est. max spend</p>
          <p className="text-lg font-semibold text-foreground">
            €{estimatedMaxSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      )}
    </>
  )

  // ── Row render ────────────────────────────────────────────────────────────

  const renderBidRow = useCallback(
    (index: number, options: { compact: boolean; style?: CSSProperties }) => {
      const bid = hourlyBids[index]
      if (!bid) return null
      const rowState = getRowState(bid)
      const isActive = rowState === 'active'
      const isDraft = rowState === 'draft'
      const ref = refPrices[index] ?? 0
      // Est. MWh shown for active rows; raw MWh shown for draft rows with volume
      const estMWh = bid.volume > 0 ? bid.volume * mwhMultiplier : null
      // Est. Spend: active rows use user price; draft rows use reference price as fallback
      const estSpend = bid.volume > 0
        ? bid.volume * mwhMultiplier * (bid.price ?? ref)
        : null
      const priceMissing = isDraft && bid.price === null   // volume filled, price empty
      const volumeMissing = isDraft && bid.volume === 0    // price filled, volume empty
      const isDeviation = bid.price !== null &&
        ref > 0 && Math.abs((bid.price - ref) / ref) > 0.2
      const deviation = bid.price !== null && ref > 0
        ? ((bid.price - ref) / ref) * 100
        : null
      const isSelected = selectedRows.has(index)
      const { compact, style } = options

      if (compact) {
        const rowInner = (
          <div
            className={cn(
              "flex w-full min-w-0 border-b border-gray-200 transition-colors",
              mobileFocusIndex === index && "bg-primary/[0.06] ring-2 ring-primary/30 ring-inset",
              rowState === 'empty' && mobileFocusIndex !== index && "opacity-60",
              rowState === 'active' && mobileFocusIndex !== index && "bg-primary/[0.03]",
              rowState === 'draft' && mobileFocusIndex !== index && "bg-amber-50/40",
            )}
          >
            <div className="sticky left-0 z-[2] flex w-[76px] shrink-0 flex-col justify-center gap-1 border-r border-gray-200 bg-white px-2 py-2 pl-3 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.08)]">
              <EnergyCheckbox
                checked={isSelected}
                onChange={() => toggleRowSelection(index)}
                ariaLabel={`Select ${bid.hour}`}
              />
              <span className="text-[11px] font-semibold leading-tight text-foreground">{bid.hour}</span>
              {rowState === 'active' && (
                <span className="flex h-5 w-5 items-center justify-center rounded border border-emerald-200 bg-emerald-50">
                  <Leaf className="h-3 w-3 text-emerald-600" aria-hidden />
                </span>
              )}
              {rowState === 'draft' && (
                <span className="flex h-5 w-5 items-center justify-center rounded border border-amber-200 bg-amber-50">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1 overflow-x-auto px-2 py-2">
              <div className="grid min-w-[260px] grid-cols-2 gap-2">
                <div className="relative">
                  <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">MW</span>
                  <input
                    type="number"
                    data-bid-input={`volume-${index}`}
                    placeholder="—"
                    value={bid.volume === 0 ? "" : bid.volume}
                    onChange={(e) => handleVolumeChange(index, e.target.value)}
                    onKeyDown={(e) => handleBidKeyDown(e, index, "volume")}
                    onFocus={() => handleMobileInputFocus(index, "volume")}
                    onBlur={handleMobileInputBlur}
                    className={cn(
                      "w-full rounded-lg border bg-white px-2 py-2 text-right text-sm font-medium shadow-sm focus:outline-none focus:ring-2",
                      volumeMissing
                        ? "border-red-300 ring-1 ring-red-300/50 focus:border-red-400 focus:ring-red-300/40"
                        : "border-gray-200 focus:border-primary focus:ring-primary/20"
                    )}
                    min={0}
                    step={0.1}
                  />
                </div>
                <div className="relative">
                  <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">€/MWh</span>
                  <input
                    type="number"
                    data-bid-input={`price-${index}`}
                    placeholder="—"
                    value={bid.price === null ? "" : bid.price}
                    onChange={(e) => handlePriceChange(index, e.target.value)}
                    onKeyDown={(e) => handleBidKeyDown(e, index, "price")}
                    onFocus={() => handleMobileInputFocus(index, "price")}
                    onBlur={handleMobileInputBlur}
                    className={cn(
                      "w-full rounded-lg border bg-white px-2 py-2 text-right text-sm font-medium shadow-sm focus:outline-none focus:ring-2",
                      isDeviation
                        ? "border-amber-400 focus:border-amber-400 focus:ring-amber-400/25"
                        : priceMissing
                          ? "border-red-300 ring-1 ring-red-300/50 focus:border-red-400 focus:ring-red-300/40"
                          : "border-gray-200 focus:border-primary focus:ring-primary/20"
                    )}
                    step={0.01}
                  />
                </div>
              </div>
              {isDraft ? (
                <p className="mt-1 text-center text-[10px] text-amber-500/80">
                  Complete both fields to activate
                </p>
              ) : (
                <p className="mt-1 text-center text-[11px] text-muted-foreground">
                  {estMWh != null ? (
                    <>
                      Est.{" "}
                      <span className="font-semibold text-primary">
                        {estMWh.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MWh
                      </span>
                      {estSpend != null && (
                        <span className="ml-2">
                          · €{estSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
                  )}
                </p>
              )}
            </div>
          </div>
        )
        return (
          <div style={style} className="w-full">{rowInner}</div>
        )
      }

      // Desktop row — 7-column grid (On/Off removed; state is derived)
      // [sel 26px] [time 150px] [mw 1fr] [est 80px] [ref 72px] [price 1fr] [copy 26px]
      return (
        <div
          style={style}
          className={cn(
            "grid grid-cols-[26px_150px_1fr_80px_72px_1fr_26px] items-center gap-2 px-2 py-2 transition-colors duration-300 sm:grid-cols-[26px_170px_1fr_86px_76px_1fr_26px] sm:px-4",
            flashedRows.has(index)
              ? "bg-primary/[0.08]"
              : isSelected
                ? "bg-sky-50 ring-1 ring-inset ring-sky-200"
                : rowState === 'active'
                  ? "bg-primary/[0.03]"
                  : rowState === 'draft'
                    ? "bg-amber-50/30"
                    : "bg-white hover:bg-gray-50/50"
          )}
        >
          {/* Select */}
          <div className="flex justify-center">
            <EnergyCheckbox
              checked={isSelected}
              onChange={() => toggleRowSelection(index)}
              ariaLabel={`Select row ${bid.hour}`}
            />
          </div>

          {/* Time + state dot */}
          <div className="flex min-w-0 items-center gap-2">
            <div className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              rowState === 'active' ? "bg-emerald-400" :
              rowState === 'draft' ? "bg-amber-400/70" :
              "bg-muted-foreground/20"
            )} />
            <span className="truncate text-xs font-medium text-foreground sm:text-sm">{bid.hour}</span>
          </div>

          {/* MW */}
          <div className={cn(
            "flex min-w-0 items-center rounded-lg border bg-white shadow-sm transition-colors focus-within:ring-2",
            volumeMissing
              ? "border-red-300 ring-1 ring-red-300/50 focus-within:border-red-400 focus-within:ring-red-300/40"
              : "border-gray-200 focus-within:border-primary focus-within:ring-primary/20"
          )}>
            <input
              type="number"
              data-bid-input={`volume-${index}`}
              placeholder="0.0"
              value={bid.volume === 0 ? "" : bid.volume}
              onChange={(e) => handleVolumeChange(index, e.target.value)}
              onKeyDown={(e) => handleBidKeyDown(e, index, "volume")}
              className="min-w-0 flex-1 bg-transparent py-1.5 pl-2 pr-0.5 text-right text-sm font-medium text-foreground focus:outline-none sm:py-2"
              min={0}
              step={0.1}
            />
            <span className="shrink-0 select-none pr-2 text-[10px] text-muted-foreground">MW</span>
          </div>

          {/* Est. MWh + helper */}
          <div className="flex flex-col items-end gap-0.5 pr-1 text-right">
            {isActive ? (
              <>
                <span className="tabular-nums text-xs font-medium text-sky-600/80 sm:text-sm">
                  {(bid.volume * mwhMultiplier).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="tabular-nums text-[10px] text-muted-foreground">
                  €{estSpend!.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </>
            ) : isDraft ? (
              <>
                {bid.volume > 0 && (
                  <span className="tabular-nums text-xs text-muted-foreground/60 sm:text-sm">
                    {(bid.volume * mwhMultiplier).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                )}
                <span className="text-[10px] leading-tight text-amber-500/80">
                  {priceMissing ? "add price" : "add MW"}
                </span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground/25">—</span>
            )}
          </div>

          {/* Ref (€) + % deviation */}
          <div className="pr-1 text-right">
            <span className="tabular-nums text-xs text-muted-foreground sm:text-sm">
              {ref.toFixed(2)}
            </span>
            {deviation !== null && (
              <span className={cn(
                "block tabular-nums text-[10px] leading-none",
                Math.abs(deviation) > 20 ? "text-amber-500" :
                deviation < -5 ? "text-emerald-500/80" :
                deviation > 5 ? "text-orange-400/80" :
                "text-muted-foreground/50"
              )}>
                {deviation > 0 ? "+" : ""}{deviation.toFixed(0)}%
              </span>
            )}
          </div>

          {/* €/MWh with deviation tooltip */}
          <div className="relative min-w-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={cn(
                  "flex items-center rounded-lg border bg-white shadow-sm transition-colors focus-within:ring-2",
                  isDeviation
                    ? "border-amber-400 focus-within:border-amber-400 focus-within:ring-amber-400/25"
                    : priceMissing
                      ? "border-red-300 ring-1 ring-red-300/50 focus-within:border-red-400 focus-within:ring-red-300/40"
                      : "border-gray-200 focus-within:border-primary focus-within:ring-primary/20"
                )}>
                  <input
                    type="number"
                    data-bid-input={`price-${index}`}
                    placeholder="0.00"
                    value={bid.price === null ? "" : bid.price}
                    onChange={(e) => handlePriceChange(index, e.target.value)}
                    onKeyDown={(e) => handleBidKeyDown(e, index, "price")}
                    className="min-w-0 flex-1 bg-transparent py-1.5 pl-2 pr-0.5 text-right text-sm font-medium text-foreground focus:outline-none sm:py-2"
                    step={0.01}
                  />
                  <span className="shrink-0 select-none pr-2 text-[10px] text-muted-foreground">€/MWh</span>
                </div>
              </TooltipTrigger>
              {isDeviation && (
                <TooltipContent side="top">
                  Price deviates {Math.abs(deviation!).toFixed(0)}% from market reference
                </TooltipContent>
              )}
            </Tooltip>
          </div>

          {/* Copy Values Down */}
          <div className="flex justify-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => handleCopyDown(index)}
                  className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground/40 transition-colors hover:bg-gray-100 hover:text-muted-foreground"
                  aria-label={`Copy values from ${bid.hour} down`}
                  disabled={index >= slotCount - 1}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">Copy values down</TooltipContent>
            </Tooltip>
          </div>
        </div>
      )
    },
    [
      hourlyBids, refPrices, mwhMultiplier, mobileFocusIndex, flashedRows, selectedRows,
      updateBidRow, handleVolumeChange, handlePriceChange, handleBidKeyDown,
      handleMobileInputFocus, handleMobileInputBlur, toggleRowSelection, handleCopyDown, slotCount,
    ]
  )

  const MobileVirtualRow = useCallback(
    ({ index, style, ariaAttributes }: {
      index: number
      style: CSSProperties
      ariaAttributes: { "aria-posinset": number; "aria-setsize": number; role: "listitem" }
    }) => (
      <div style={style} {...ariaAttributes}>
        {renderBidRow(index, { compact: true })}
      </div>
    ),
    [renderBidRow]
  )

  // ── Desktop table section rendering ───────────────────────────────────────

  const TABLE_HEADER_COLS = "grid-cols-[26px_150px_1fr_80px_72px_1fr_26px] sm:grid-cols-[26px_170px_1fr_86px_76px_1fr_26px]"

  const renderDesktopTable = () => (
    <div className="divide-y divide-gray-200 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Glassmorphism sticky header */}
      <div className={cn(
        "sticky top-0 z-10 grid items-center gap-2 px-2 py-2.5 sm:px-4",
        TABLE_HEADER_COLS,
        "backdrop-blur-md bg-white/75 border-b border-white/20 shadow-[0_1px_8px_rgba(0,33,71,0.08)]",
        "text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-xs"
      )}>
        <span className="text-center">Sel</span>
        <span className="flex items-center gap-1.5">
          Time
          <span className="inline-flex items-center gap-1 rounded border border-gray-200 bg-white/80 px-1.5 py-0.5 text-[9px] font-medium normal-case tracking-normal text-foreground shadow-sm">
            <Leaf className="h-2.5 w-2.5 text-emerald-600" aria-hidden />
            HKN
          </span>
        </span>
        <span className="text-right">MW</span>
        <span className="text-right">
          Est. MWh
          <span className="block text-[8px] font-normal normal-case tracking-normal opacity-60">& Spend</span>
        </span>
        <span className="text-right">
          Ref (€)
          <span className="block text-[8px] font-normal normal-case tracking-normal opacity-60">% diff</span>
        </span>
        <span className="text-right">€/MWh</span>
        <span />
      </div>

      {/* Sections */}
      {SECTIONS.map((sec) => {
        const [start, end] = getSectionSlotRange(sec, isIntraday)
        const sectionBids = hourlyBids.slice(start, end + 1)
        const activeSectionCount = sectionBids.filter((b) => b.volume > 0 && b.price !== null).length
        const collapsed = collapsedSections.has(sec.id)
        // Warn on the tab only when collapsed so incomplete rows are hidden from view
        const hasHiddenDraft = collapsed && sectionBids.some((b) => getRowState(b) === "draft")
        const SectionIcon = sec.icon

        return (
          <div key={sec.id}>
            {/* Section header */}
            <button
              type="button"
              onClick={() => toggleSection(sec.id)}
              className={cn(
                "flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors sm:px-4",
                hasHiddenDraft
                  ? "bg-amber-50/70 hover:bg-amber-50"
                  : "bg-gray-50/80 hover:bg-gray-100/80"
              )}
            >
              <ChevronDown
                className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200", collapsed && "-rotate-90")}
              />
              <SectionIcon className={cn("h-3.5 w-3.5 shrink-0", hasHiddenDraft ? "text-amber-500/70" : "text-muted-foreground/70")} />
              <span className="text-xs font-semibold text-foreground">{sec.label}</span>
              <span className="text-[10px] text-muted-foreground">{sec.timeRange}</span>
              {hasHiddenDraft && (
                <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                  incomplete
                </span>
              )}
              <span className="ml-auto text-[10px] font-medium text-muted-foreground">
                {activeSectionCount}/{sectionBids.length} active
              </span>
            </button>

            {/* Section rows */}
            {!collapsed && (
              <div className="divide-y divide-gray-100">
                {sectionBids.map((_, relIdx) => {
                  const absIdx = start + relIdx
                  return (
                    <div key={hourlyBids[absIdx]?.hour ?? absIdx}>
                      {renderBidRow(absIdx, { compact: false })}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  // ── Step 1: Data Setup ────────────────────────────────────────────────────

  const renderStep1 = () => {
    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true) }
    const handleDragLeave = () => setIsDragOver(false)
    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) { setCsvFile(file); setDataSource("csv") }
    }
    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) { setCsvFile(file); setDataSource("csv") }
    }

    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Desktop header */}
        <div className="hidden items-center justify-between border-b border-gray-200 bg-white px-6 py-4 sm:px-8 sm:py-5 md:flex">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-foreground sm:text-xl">Data Setup</h1>
                <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Step 1 / 4
                </span>
              </div>
              <p className="text-xs text-muted-foreground sm:text-sm">Define the load profile for the next 24 hours</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Live gate countdown */}
            <div className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2",
              nearClosure ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-gray-50"
            )}>
              <Clock className={cn("h-3.5 w-3.5 shrink-0", nearClosure ? "text-amber-600" : "text-muted-foreground")} />
              <div>
                <p className={cn("text-[10px] font-medium uppercase tracking-wide leading-none", nearClosure ? "text-amber-600" : "text-muted-foreground")}>
                  Time to Gate
                </p>
                <p className={cn("mt-0.5 font-mono text-sm font-bold tabular-nums leading-none", nearClosure ? "text-amber-700" : "text-foreground")}>
                  {gateCountdown}
                </p>
              </div>
            </div>
            <button type="button" onClick={() => setIsOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-gray-100" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-5 py-6 sm:px-8 sm:py-8">
          <div className="mx-auto max-w-3xl">
            <div className="grid gap-6 md:grid-cols-2">

              {/* Left panel: CSV upload */}
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Typical Load Profile</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Upload 24h load data.</p>
                </div>
                <label
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={cn(
                    "relative flex flex-1 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors",
                    dataSource === "csv" && csvFile
                      ? "border-primary/40 bg-primary/[0.03]"
                      : isDragOver
                      ? "border-primary/60 bg-primary/[0.04]"
                      : "border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100/50"
                  )}
                >
                  <input type="file" accept=".csv" className="sr-only" onChange={handleFileInput} />
                  {dataSource === "csv" && csvFile ? (
                    <>
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                        <FileText className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{csvFile.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">File ready · click to replace</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-full transition-colors",
                        isDragOver ? "bg-primary/10" : "bg-gray-100"
                      )}>
                        <Upload className={cn("h-6 w-6 transition-colors", isDragOver ? "text-primary" : "text-muted-foreground")} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {isDragOver ? "Drop to upload" : "Drag & drop CSV"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          or <span className="text-primary underline-offset-2 hover:underline">click to browse</span>
                        </p>
                      </div>
                    </>
                  )}
                </label>
              </div>

              {/* Right panel: Quick select */}
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Quick Select</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Or choose a starting point for this session.</p>
                </div>
                <div className="flex flex-col gap-2">

                  {/* Use Last Successful Bid */}
                  <button
                    type="button"
                    onClick={() => setDataSource("session")}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border p-4 text-left transition-colors",
                      dataSource === "session"
                        ? "border-primary/30 bg-primary/[0.04]"
                        : "border-gray-200 hover:bg-gray-50"
                    )}
                  >
                    <div className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      dataSource === "session" ? "bg-primary/10" : "bg-gray-100"
                    )}>
                      <RefreshCw className={cn("h-4 w-4", dataSource === "session" ? "text-primary" : "text-muted-foreground")} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">Use Last Successful Bid</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {lastBidDate ? `Last session · ${lastBidDate}` : "Restore bids from previous session"}
                      </p>
                    </div>
                    {dataSource === "session" && (
                      <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary">
                        <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                      </div>
                    )}
                  </button>

                  {/* Load Template */}
                  <button
                    type="button"
                    onClick={() => setDataSource("template")}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border p-4 text-left transition-colors",
                      dataSource === "template"
                        ? "border-primary/30 bg-primary/[0.04]"
                        : "border-gray-200 hover:bg-gray-50"
                    )}
                  >
                    <div className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      dataSource === "template" ? "bg-primary/10" : "bg-gray-100"
                    )}>
                      <CalendarDays className={cn("h-4 w-4", dataSource === "template" ? "text-primary" : "text-muted-foreground")} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">Load Template</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">Standard weekday / weekend profiles</p>
                    </div>
                    {dataSource === "template" && (
                      <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary">
                        <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                      </div>
                    )}
                  </button>

                  {/* Start Blank */}
                  <button
                    type="button"
                    onClick={() => setDataSource("scratch")}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border p-4 text-left transition-colors",
                      dataSource === "scratch"
                        ? "border-primary/30 bg-primary/[0.04]"
                        : "border-gray-200 hover:bg-gray-50"
                    )}
                  >
                    <div className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      dataSource === "scratch" ? "bg-primary/10" : "bg-gray-100"
                    )}>
                      <Zap className={cn("h-4 w-4", dataSource === "scratch" ? "text-primary" : "text-muted-foreground")} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">Start Blank</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">Manual entry — empty bid slots</p>
                    </div>
                    {dataSource === "scratch" && (
                      <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary">
                        <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                      </div>
                    )}
                  </button>

                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-gray-200 bg-white px-5 py-4 sm:flex sm:items-center sm:justify-end sm:px-8">
          <button
            type="button"
            onClick={handleStartBidding}
            disabled={!dataReady}
            className={cn(
              "w-full rounded-xl px-8 py-3 text-sm font-semibold shadow-sm transition-all sm:w-auto",
              dataReady
                ? "bg-primary text-primary-foreground hover:opacity-90"
                : "cursor-not-allowed bg-gray-100 text-muted-foreground"
            )}
          >
            Next: Analyze Forecast →
          </button>
        </div>
      </div>
    )
  }

  // ── Step 3: Review ────────────────────────────────────────────────────────

  const renderStep3 = () => {
    const activeRows = hourlyBids
      .map((bid, i) => ({ bid, i }))
      .filter(({ bid }) => bid.volume > 0 && bid.price !== null)

    if (submitted) {
      return (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <Check className="h-8 w-8 text-emerald-600" strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Bid Submitted</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Delivery: {formatDeliveryDate(deliveryDate)}
            </p>
          </div>
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-8 py-5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Total Volume</p>
            <p className="mt-1 text-2xl font-bold text-primary">{totalVolume.toFixed(2)} MWh</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Est. max spend · €{estimatedMaxSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            {bidHash && (
              <p className="mt-2 font-mono text-[10px] text-muted-foreground/60">
                Audit ID: {bidHash}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => { setSubmitted(false); setCurrentStep(1); setHourlyBids(createDefaultBids(marketType)) }}
            className="mt-1 text-sm font-medium text-primary hover:underline"
          >
            Start new session
          </button>
        </div>
      )
    }

    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Desktop header */}
        <div className="hidden items-center justify-between border-b border-gray-200 bg-white px-6 py-4 sm:px-8 sm:py-5 md:flex">
          <div>
            <h1 className="text-lg font-bold text-foreground sm:text-xl">Review Bid</h1>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Delivery: <span className="font-medium text-foreground">{formatDeliveryDate(deliveryDate)}</span>
              {" · "}{activeRows.length} active {activeRows.length === 1 ? "slot" : "slots"} · {totalVolume.toFixed(2)} MWh
            </p>
          </div>
          <button type="button" onClick={() => setIsOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-gray-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-5 sm:p-8">
          {activeRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <AlertCircle className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm font-medium text-foreground">No active bids</p>
              <p className="text-xs text-muted-foreground">Go back and fill MW + Price on at least one slot</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Compact bid table */}
              <div className="overflow-hidden rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Hour</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">MW</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">€/MWh</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Total (€)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {activeRows.map(({ bid }) => {
                      const mwh = bid.volume * mwhMultiplier
                      const total = mwh * bid.price!
                      return (
                        <tr key={bid.hour} className="bg-white hover:bg-gray-50/50">
                          <td className="px-4 py-2 font-mono text-xs text-foreground">{bid.hour}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-sm">{bid.volume.toFixed(1)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-sm">{bid.price!.toFixed(2)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-sm font-medium text-foreground">
                            {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* REMIT Compliance Check */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-amber-600" />
                  <p className="text-sm font-semibold text-foreground">REMIT Compliance Check</p>
                </div>
                <div className="space-y-3">
                  {([
                    "I confirm no inside information impacts these bids (REMIT Art. 3)",
                    "Bid prices reflect genuine commercial intent and are not designed to manipulate price formation (REMIT Art. 5)",
                    "Volumes match my forecasted load — no wash trading or fictitious orders",
                  ] as const).map((label, i) => (
                    <label key={i} className="flex cursor-pointer items-start gap-3">
                      <EnergyCheckbox
                        checked={remitChecks[i]}
                        onChange={(v) => {
                          const next: [boolean, boolean, boolean] = [remitChecks[0], remitChecks[1], remitChecks[2]]
                          next[i] = v
                          setRemitChecks(next)
                        }}
                        ariaLabel={label}
                      />
                      <span className="text-xs leading-relaxed text-foreground">{label}</span>
                    </label>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-amber-200/60 pt-3.5">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Trader</p>
                    <p className="mt-0.5 font-mono text-xs text-foreground">kolesnikova@lux-medien.com</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">ACER Code</p>
                    <p className="mt-0.5 font-mono text-xs text-foreground">B0001234.DE</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Submission Time</p>
                    <p className="mt-0.5 font-mono text-xs text-foreground">{submissionTimestamp || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Bid Hash</p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <p className="font-mono text-xs text-foreground">{bidHash ? `${bidHash}…` : "—"}</p>
                      {bidHash && (
                        <button
                          type="button"
                          onClick={() => navigator.clipboard.writeText(bidHash)}
                          className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                          aria-label="Copy bid hash"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Exposure summary card */}
              <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-primary/60">Exposure Summary</p>
                <div className="mt-4 grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Total Volume</p>
                    <p className="mt-0.5 text-2xl font-bold text-primary">
                      {totalVolume.toFixed(2)}{" "}
                      <span className="text-sm font-normal text-foreground">MWh</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Est. Max Spend</p>
                    <p className="mt-0.5 text-2xl font-bold text-primary">
                      €{estimatedMaxSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 border-t border-primary/10 pt-3 text-[10px] text-muted-foreground">
                  <span>{activeRows.length} active {activeRows.length === 1 ? "slot" : "slots"}</span>
                  <span>·</span>
                  <span>{marketType === "intraday" ? "Intraday 15m" : "Day-Ahead 1h"}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Desktop footer */}
        <div className="hidden shrink-0 items-center justify-between border-t border-gray-200 bg-white px-6 py-4 sm:px-8 sm:py-5 md:flex">
          <button
            type="button"
            onClick={() => setCurrentStep(3)}
            className="rounded-lg px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:px-6"
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={activeRows.length === 0 || !remitChecks.every(Boolean)}
            className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Submit Bid to Exchange
          </button>
        </div>
      </div>
    )
  }

  // ── Main render ───────────────────────────────────────────────────────────

  if (!isOpen) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="rounded-lg bg-primary px-8 py-4 text-lg font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90"
        >
          Open Day-Ahead Auction
        </button>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/35 p-0 backdrop-blur-[2px] sm:p-4">
      <div className="flex h-[100dvh] max-h-[900px] w-full max-w-6xl flex-col overflow-hidden rounded-none border-0 border-gray-200 bg-white shadow-2xl sm:rounded-2xl sm:border md:h-[90vh] md:flex-row md:rounded-2xl">

        {/* Desktop sidebar — always visible */}
        <div className="hidden min-h-0 w-[240px] shrink-0 flex-col border-r border-gray-100 bg-white p-6 md:flex">
          {StepperContentDesktop}
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white pb-[env(safe-area-inset-bottom)] md:pb-0">

          {/* Mobile horizontal stepper */}
          <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3 py-2.5 md:hidden">
            <button
              type="button"
              onClick={() => currentStep > 1 && setCurrentStep(currentStep - 1)}
              disabled={currentStep === 1}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-foreground disabled:opacity-30 hover:bg-gray-100"
              aria-label="Back"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            {/* Step pills */}
            <div className="flex flex-1 items-center justify-center gap-1" aria-label="Progress">
              {STEPS.map((step, idx) => (
                <div key={step.id} className="flex items-center gap-1">
                  <div className={cn(
                    "h-1.5 rounded-full transition-all duration-300",
                    currentStep === step.id ? "w-8 bg-primary" :
                    currentStep > step.id ? "w-5 bg-primary/40" :
                    "w-5 bg-gray-200"
                  )} />
                  {idx < STEPS.length - 1 && <div className="h-px w-1.5 bg-gray-200" />}
                </div>
              ))}
            </div>

            <div className="shrink-0 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {currentStep} / {STEPS.length}
              </p>
              <p className="text-xs font-bold text-foreground">{STEPS[currentStep - 1].label}</p>
            </div>

            {/* Step 3 quick actions */}
            {currentStep === 3 && (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-gray-100" aria-label="More actions">
                      <MoreHorizontal className="h-5 w-5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={handlePresetBaseLoad}>
                      Sync All Prices
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handlePresetPeakHours}>
                      Sync Peak Prices
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={handleClearAll}>
                      Clear All
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}

            <button type="button" onClick={() => setIsOpen(false)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-gray-100" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* ── Step 1 ──────────────────────────────────────────────────── */}
          {currentStep === 1 && renderStep1()}

          {/* ── Step 2: Gap Analysis ────────────────────────────────────── */}
          {currentStep === 2 && (
            <GapAnalysisScreen
              loadMW={loadMW}
              data={gapData}
              confidence={confidence}
              onConfidenceChange={setConfidence}
              weatherModel={weatherModel}
              onWeatherModelChange={setWeatherModel}
              gateCountdown={gateCountdown}
              nearClosure={nearClosure}
              onBack={() => setCurrentStep(1)}
              onNext={() => setCurrentStep(3)}
              onClose={() => setIsOpen(false)}
            />
          )}

          {/* ── Step 3: Bid Entry ───────────────────────────────────────── */}
          {currentStep === 3 && (
            <BiddingGrid
              gapData={gapData}
              hourlyBids={hourlyBids}
              refPrices={refPrices}
              isIntraday={isIntraday}
              mwhMultiplier={mwhMultiplier}
              slotCount={slotCount}
              isMobile={isMobile}
              listHeight={listHeight}
              listWrapRef={listWrapRef}
              gateCountdown={gateCountdown}
              nearClosure={nearClosure}
              draftSaved={draftSaved}
              totalVolume={totalVolume}
              estimatedMaxSpend={estimatedMaxSpend}
              filledSlots={filledSlots}
              canContinue={canContinue}
              draftCount={draftCount}
              onVolumeChange={handleVolumeChange}
              onPriceChange={handlePriceChange}
              onBidKeyDown={handleBidKeyDown}
              onSyncToGap={handleSyncVolumesToGap}
              onSyncPrices={handleSyncPrices}
              onInitPrices={handleInitPrices}
              onCopyDown={handleCopyDown}
              onApplyFirstToAll={handleApplyFirstToAll}
              onClearAll={handleClearAll}
              onBack={() => setCurrentStep(2)}
              onNext={() => setCurrentStep(4)}
              onClose={() => setIsOpen(false)}
            />
          )}

          {/* ── Step 4: Review ──────────────────────────────────────────── */}
          {currentStep === 4 && renderStep3()}

        </div>
      </div>

      {/* Mobile bottom bar — Step 1 */}
      {currentStep === 1 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_24px_rgba(0,0,0,0.08)] backdrop-blur-sm md:hidden">
          <button
            type="button"
            onClick={handleStartBidding}
            disabled={!dataReady}
            className={cn(
              "w-full rounded-xl py-3 text-sm font-semibold shadow-sm transition-all",
              dataReady
                ? "bg-primary text-primary-foreground"
                : "cursor-not-allowed bg-gray-100 text-muted-foreground"
            )}
          >
            Next: Analyze Forecast →
          </button>
        </div>
      )}

      {/* Mobile bottom bar — Step 4 (Review) */}
      {currentStep === 4 && !submitted && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-gray-200 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_24px_rgba(0,0,0,0.08)] backdrop-blur-sm md:hidden">
          <button type="button" onClick={() => setCurrentStep(3)} className="rounded-xl px-5 py-3 text-sm font-semibold text-muted-foreground hover:bg-accent">
            Back
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!remitChecks.every(Boolean)}
            className="flex-1 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            Submit to Exchange
          </button>
        </div>
      )}

      {/* ⌘K Command Palette */}
      <CommandDialog open={isPaletteOpen} onOpenChange={setIsPaletteOpen}>
        <CommandInput placeholder="Search commands…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          <CommandGroup heading="Navigate">
            <CommandItem onSelect={() => { setCurrentStep(1); setIsPaletteOpen(false) }}>
              Go to Data Setup <CommandShortcut>1</CommandShortcut>
            </CommandItem>
            <CommandItem
              disabled={!dataReady}
              onSelect={() => { if (dataReady) { setCurrentStep(2); setIsPaletteOpen(false) } }}
            >
              Go to Gap Analysis <CommandShortcut>2</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => { setCurrentStep(3); setIsPaletteOpen(false) }}>
              Go to Bid Entry <CommandShortcut>3</CommandShortcut>
            </CommandItem>
            <CommandItem
              disabled={!canContinue}
              onSelect={() => { if (canContinue) { setCurrentStep(4); setIsPaletteOpen(false) } }}
            >
              Go to Review <CommandShortcut>4</CommandShortcut>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Market">
            <CommandItem onSelect={() => { handleMarketTypeChange("day-ahead"); setIsPaletteOpen(false) }}>
              Switch to Day-Ahead
            </CommandItem>
            <CommandItem onSelect={() => { handleMarketTypeChange("intraday"); setIsPaletteOpen(false) }}>
              Switch to Intraday
            </CommandItem>
          </CommandGroup>

          {currentStep === 3 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Quick Fill">
                <CommandItem onSelect={() => { handlePresetBaseLoad(); setIsPaletteOpen(false) }}>
                  Apply Base Load preset
                </CommandItem>
                <CommandItem onSelect={() => { handlePresetPeakHours(); setIsPaletteOpen(false) }}>
                  Apply Peak Hours preset
                </CommandItem>
                <CommandItem onSelect={() => { handleSyncVolumesToGap(); setIsPaletteOpen(false) }}>
                  Sync volumes to gap
                </CommandItem>
                <CommandItem onSelect={() => { handleInitPrices(); setIsPaletteOpen(false) }}>
                  Init prices at ref +5%
                </CommandItem>
                <CommandItem
                  className="text-red-600 aria-selected:text-red-600"
                  onSelect={() => { handleClearAll(); setIsPaletteOpen(false) }}
                >
                  Clear all bids
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Jump to Hour">
                {Array.from({ length: 24 }, (_, h) => {
                  const hStr = h.toString().padStart(2, "0")
                  const eStr = ((h + 1) % 24).toString().padStart(2, "0")
                  const idx = isIntraday ? h * 4 : h
                  return (
                    <CommandItem
                      key={h}
                      value={`focus ${hStr}:00`}
                      onSelect={() => { focusHourAtField(idx, "volume"); setIsPaletteOpen(false) }}
                    >
                      Focus {hStr}:00 – {eStr}:00
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </>
          )}

          {currentStep === 4 && !submitted && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Actions">
                <CommandItem
                  disabled={!remitChecks.every(Boolean)}
                  onSelect={() => { if (remitChecks.every(Boolean)) { handleSubmit(); setIsPaletteOpen(false) } }}
                >
                  Submit bid to exchange
                </CommandItem>
              </CommandGroup>
            </>
          )}
        </CommandList>
        <div className="flex gap-4 border-t px-3 py-2 text-[11px] text-muted-foreground">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> run</span>
          <span><kbd className="font-mono">Esc</kbd> close</span>
        </div>
      </CommandDialog>
    </div>
  )
}
