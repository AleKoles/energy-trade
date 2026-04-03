"use client"

import { Clock, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ConfidenceLevel, GapDataPoint, WeatherModel } from "./useGapData"
import { ForecastChart } from "./ForecastChart"
import { SidebarControls } from "./SidebarControls"

// ─── Props ────────────────────────────────────────────────────────────────────

interface GapAnalysisScreenProps {
  /** 24 hourly load values (MW). Falls back to duck curve when all zero. */
  loadMW:        number[]
  data:          GapDataPoint[]
  confidence:    ConfidenceLevel
  onConfidenceChange: (v: ConfidenceLevel) => void
  weatherModel:  WeatherModel
  onWeatherModelChange: (v: WeatherModel) => void
  gateCountdown: string
  nearClosure:   boolean
  onBack:        () => void
  onNext:        () => void
  onClose:       () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GapAnalysisScreen({
  data,
  confidence,
  onConfidenceChange,
  weatherModel,
  onWeatherModelChange,
  gateCountdown,
  nearClosure,
  onBack,
  onNext,
  onClose,
}: GapAnalysisScreenProps) {

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">

      {/* ── Desktop header ─────────────────────────────────────────────────── */}
      <div className="hidden items-center justify-between border-b border-gray-200 bg-white px-6 py-4 sm:px-8 sm:py-5 md:flex">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-foreground sm:text-xl">Gap Analysis</h1>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Step 2 / 4
            </span>
          </div>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Renewable supply vs. load demand forecast
          </p>
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

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col gap-0 overflow-auto md:flex-row">

        {/* Chart area */}
        <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-auto p-5 sm:p-6 md:p-8">

          <ForecastChart data={data} />

          {/* Legend + microcopy */}
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 py-4 border-t border-slate-50">
          {[
            { label: 'Consumption', color: '#60a5fa', type: 'line' },
            { label: 'Wind PPA', color: '#38bdf8', type: 'area' },
            { label: 'Solar PPA', color: '#fbbf24', type: 'area' },
            { label: 'Residual Risk', color: '#f87171', type: 'area' },
            { label: 'Expected Day-Ahead Price', color: '#94a3b8', type: 'dashed' }
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              {item.type === 'line' && <div className="w-4 h-0.5" style={{ backgroundColor: item.color }} />}
              {item.type === 'area' && <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color, opacity: 0.7 }} />}
              {item.type === 'dashed' && <div className="w-4 h-0.5 border-t-2 border-dashed" style={{ borderColor: item.color }} />}
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">
                {item.label}
              </span>
            </div>
          ))}
        </div>

          {/* Hourly breakdown strip — compact heat-row */}
          <HourlyStrip data={data} />
        </div>

        {/* Sidebar controls */}
        <div className="shrink-0 border-t border-gray-200 p-5 sm:p-6 md:w-64 md:border-l md:border-t-0 md:p-6 lg:w-72">
          <SidebarControls
            confidence={confidence}
            onConfidenceChange={onConfidenceChange}
            weatherModel={weatherModel}
            onWeatherModelChange={onWeatherModelChange}
            data={data}
          />
        </div>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div className="hidden shrink-0 items-center justify-between border-t border-gray-200 bg-white px-6 py-4 sm:px-8 md:flex">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg px-5 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={onNext}
          className="rounded-xl bg-primary px-7 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90"
        >
          Next: Construct Bids →
        </button>
      </div>

      {/* ── Mobile footer ──────────────────────────────────────────────────── */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-gray-200 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_24px_rgba(0,0,0,0.08)] backdrop-blur-sm md:hidden">
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl px-5 py-3 text-sm font-semibold text-muted-foreground hover:bg-accent"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex-1 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-sm"
        >
          Next: Construct Bids →
        </button>
      </div>

    </div>
  )
}

// ─── Hourly gap heat-strip ────────────────────────────────────────────────────

function HourlyStrip({ data }: { data: { time: string; shortage: number; surplus: number }[] }) {
  const maxVal = Math.max(...data.map((d) => Math.max(d.shortage, d.surplus)), 1)

  return (
    <div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Hourly Gap
      </p>
      <div className="flex gap-px overflow-hidden rounded-lg">
        {data.map((d) => {
          const isShort   = d.shortage > 0
          const intensity = isShort
            ? d.shortage / maxVal
            : d.surplus  / maxVal
          const opacity   = 0.15 + intensity * 0.75

          return (
            <div
              key={d.time}
              title={`${d.time}: ${isShort ? `+${d.shortage.toFixed(0)} MW short` : `-${d.surplus.toFixed(0)} MW long`}`}
              className="flex-1 cursor-default"
              style={{
                height:     36,
                background: isShort
                  ? `rgba(248,113,113,${opacity.toFixed(2)})`
                  : `rgba(52,211,153,${opacity.toFixed(2)})`,
              }}
            />
          )
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>00:00</span>
        <span>12:00</span>
        <span>24:00</span>
      </div>
    </div>
  )
}
