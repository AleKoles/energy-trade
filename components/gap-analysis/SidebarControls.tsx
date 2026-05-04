"use client"

import { cn } from "@/lib/utils"
import type { ConfidenceLevel, GapDataPoint, WeatherModel } from "./useGapData"

// ─── Types ────────────────────────────────────────────────────────────────────

interface SidebarControlsProps {
  confidence:            ConfidenceLevel
  onConfidenceChange:    (v: ConfidenceLevel) => void
  weatherModel:          WeatherModel
  onWeatherModelChange:  (v: WeatherModel) => void
  data:                  GapDataPoint[]
}

// ─── Sub-pieces ───────────────────────────────────────────────────────────────

const CONFIDENCE_OPTS: { value: ConfidenceLevel; label: string; desc: string }[] = [
  { value: "P10", label: "P10", desc: "−20% supply" },
  { value: "P50", label: "P50", desc: "Baseline"   },
  { value: "P90", label: "P90", desc: "+10% supply" },
]

const WEATHER_OPTS: { value: WeatherModel; label: string; sub: string }[] = [
  { value: "ECMWF", label: "ECMWF", sub: "Stable"    },
  { value: "GFS",   label: "GFS",   sub: "Volatile"  },
]

// ─── Component ────────────────────────────────────────────────────────────────

export function SidebarControls({
  confidence,
  onConfidenceChange,
  weatherModel,
  onWeatherModelChange,
  data,
}: SidebarControlsProps) {
  
  // ── Derived Trader Metrics ────────────────────────────────────────────────
  const totalShortfall  = data.reduce((s, d) => s + d.shortage, 0)
  const totalRiskEuro   = data.reduce((s, d) => s + (d.estCost || 0), 0)
  const peakShortage    = Math.max(...data.map((d) => d.shortage))
  const hoursAtRisk     = data.filter((d) => d.shortage > 0).length
  const avgSpotPrice    = data.reduce((s, d) => s + d.hourlyPrice, 0) / 24

  const penaltyMult   = confidence === "P90" ? 2.2 : 1.8
  const imbalanceTotal = data.reduce((s, d) => {
    if (d.shortage > 0.1) return s + d.shortage * d.hourlyPrice * penaltyMult
    return s
  }, 0)
  const imbalanceTotalP50 = data.reduce((s, d) => {
    if (d.shortage > 0.1) return s + d.shortage * d.hourlyPrice * 1.8
    return s
  }, 0)
  const p90Delta = imbalanceTotal - imbalanceTotalP50

  return (
    <div className="flex flex-col gap-6">

      {/* ── Confidence Level ─────────────────────────────────────────────── */}
      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Portfolio Confidence
        </p>
        <div className="inline-flex w-full rounded-xl border border-slate-200 bg-slate-50 p-1 shadow-sm">
          {CONFIDENCE_OPTS.map((opt) => {
            const active = confidence === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onConfidenceChange(opt.value)}
                className={cn(
                  "flex flex-1 flex-col items-center rounded-lg py-2 text-center transition-all",
                  active
                    ? "bg-white shadow-md ring-1 ring-slate-200"
                    : "text-slate-400 hover:text-slate-600"
                )}
              >
                <span className={cn("text-sm font-bold", active ? "text-slate-900" : "")}>
                  {opt.label}
                </span>
                <span className="text-[9px] font-medium opacity-70">{opt.desc}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Weather Model ────────────────────────────────────────────────── */}
      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Forecasting Model
        </p>
        <div className="inline-flex w-full rounded-xl border border-slate-200 bg-slate-50 p-1 shadow-sm">
          {WEATHER_OPTS.map((opt) => {
            const active = weatherModel === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onWeatherModelChange(opt.value)}
                className={cn(
                  "flex flex-1 flex-col items-center rounded-lg py-2 text-center transition-all",
                  active
                    ? "bg-white shadow-md ring-1 ring-slate-200"
                    : "text-slate-400 hover:text-slate-600"
                )}
              >
                <span className={cn("text-sm font-bold", active ? "text-slate-900" : "")}>
                  {opt.label}
                </span>
                <span className="text-[9px] font-medium opacity-70">{opt.sub}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Position Summary (The Trader View) ───────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Financial Position Summary
        </p>

        <div className="space-y-5">
          {/* Headline Financial Exposure */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-slate-500">Est. Spot Exposure</span>
              <span className="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded uppercase">High Risk</span>
            </div>
            <div className="text-3xl font-bold tracking-tighter text-slate-900">
              €{totalRiskEuro.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>

          <div className="h-px bg-slate-100 w-full" />

          {/* Grid Stats */}
          <div className="grid grid-cols-2 gap-y-5 gap-x-4">
            <div>
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1">Total Shortfall</span>
              <span className="text-sm font-bold text-slate-700">{totalShortfall.toLocaleString()} MWh</span>
            </div>
            <div>
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1">Avg. Spot Price</span>
              <span className="text-sm font-bold text-slate-700">€{avgSpotPrice.toFixed(2)}</span>
            </div>
            <div>
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1">Peak Hourly Gap</span>
              <span className="text-sm font-bold text-red-600">{peakShortage.toFixed(0)} MW</span>
            </div>
            <div>
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1">Risk Windows</span>
              <span className="text-sm font-bold text-slate-700">{hoursAtRisk} / 24h</span>
            </div>
          </div>

          {/* Prompt for next step */}
          <div className="mt-2 rounded-lg bg-slate-50 p-3">
            <p className="text-[11px] leading-snug text-slate-500 italic">
              "Action required: Step 3 will optimize auction bids to mitigate the 
              <span className="font-bold text-slate-700 not-italic"> €{totalRiskEuro.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span> exposure."
            </p>
          </div>
        </div>
      </div>

      {/* ── Imbalance Cost KPI ──────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Imbalance Cost
          </p>
          <span
            className="cursor-help text-[10px] text-slate-400 underline decoration-dotted"
            title={`Shortage exposure at ${penaltyMult}× DA spot — typical imbalance penalty rate`}
          >
            {confidence === "P90" ? "P90 · 2.2×" : "P50 · 1.8×"}
          </span>
        </div>
        <div className="text-2xl font-bold tracking-tighter text-slate-900">
          €{imbalanceTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </div>
        <p className="mt-1 text-[10px] text-slate-500">
          Penalty exposure (shortage × {penaltyMult}× DA price)
        </p>
        {confidence === "P90" && p90Delta > 0 && (
          <div className="mt-3 rounded-lg bg-amber-50 p-2.5">
            <p className="text-[10px] text-amber-700">
              P90 stress delta:{" "}
              <span className="font-semibold">+€{p90Delta.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              {" "}vs P50
            </p>
          </div>
        )}
      </div>

    </div>
  )
}