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
  // ── Derived summary stats ─────────────────────────────────────────────────

  const totalShortfall = data.reduce((s, d) => s + d.shortage, 0)
  const totalSurplus   = data.reduce((s, d) => s + d.surplus,  0)
  const peakShortage   = Math.max(...data.map((d) => d.shortage))
  const hoursAtRisk    = data.filter((d) => d.shortage > 0).length

  return (
    <div className="flex flex-col gap-5">

      {/* ── Confidence Level ─────────────────────────────────────────────── */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Confidence
        </p>
        <div className="inline-flex w-full rounded-xl border border-gray-200 bg-gray-50 p-1 shadow-sm">
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
                    ? "bg-white shadow-sm ring-1 ring-gray-200"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className={cn("text-sm font-bold", active ? "text-foreground" : "")}>
                  {opt.label}
                </span>
                <span className="mt-0.5 text-[10px] text-muted-foreground">{opt.desc}</span>
              </button>
            )
          })}
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          {confidence === "P10" && "Pessimistic: reduced renewable output scenario."}
          {confidence === "P50" && "Median forecast: expected renewable output."}
          {confidence === "P90" && "Optimistic: increased renewable output scenario."}
        </p>
      </div>

      {/* ── Weather Model ────────────────────────────────────────────────── */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Weather Model
        </p>
        <div className="inline-flex w-full rounded-xl border border-gray-200 bg-gray-50 p-1 shadow-sm">
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
                    ? "bg-white shadow-sm ring-1 ring-gray-200"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className={cn("text-sm font-bold", active ? "text-foreground" : "")}>
                  {opt.label}
                </span>
                <span className="mt-0.5 text-[10px] text-muted-foreground">{opt.sub}</span>
              </button>
            )
          })}
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          {weatherModel === "ECMWF"
            ? "European model — lower forecast volatility."
            : "US global model — higher spread in supply curve."}
        </p>
      </div>

      {/* ── Position Summary ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Position Summary
        </p>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Total Shortfall</span>
            <span className={cn(
              "font-mono text-sm font-bold",
              totalShortfall > 0 ? "text-red-500" : "text-emerald-600"
            )}>
              {totalShortfall > 0 ? `${totalShortfall.toFixed(0)} MWh` : "—"}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Total Surplus</span>
            <span className={cn(
              "font-mono text-sm font-bold",
              totalSurplus > 0 ? "text-emerald-600" : "text-muted-foreground/40"
            )}>
              {totalSurplus > 0 ? `${totalSurplus.toFixed(0)} MWh` : "—"}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Peak Gap</span>
            <span className={cn(
              "font-mono text-sm font-bold",
              peakShortage > 100 ? "text-red-500" : peakShortage > 0 ? "text-amber-500" : "text-muted-foreground/40"
            )}>
              {peakShortage > 0 ? `${peakShortage.toFixed(0)} MW` : "—"}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Hours at Risk</span>
            <span className={cn(
              "font-mono text-sm font-bold",
              hoursAtRisk > 12 ? "text-red-500" : hoursAtRisk > 0 ? "text-amber-500" : "text-emerald-600"
            )}>
              {hoursAtRisk} / 24
            </span>
          </div>
        </div>
      </div>

    </div>
  )
}
