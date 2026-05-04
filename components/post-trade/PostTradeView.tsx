"use client"

import { useMemo } from "react"
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { simulateClearing } from "@/lib/clearing"
import type { GapDataPoint } from "@/components/gap-analysis/useGapData"

// ─── Props ────────────────────────────────────────────────────────────────────

interface PostTradeViewProps {
  activeBids:         { hour: string; volume: number; price: number }[]
  gapData:            GapDataPoint[]
  bidHash:            string | null
  deliveryLabel:      string   // formatted date string
  onNewSession:       () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PostTradeView({ activeBids, gapData, bidHash, deliveryLabel, onNewSession }: PostTradeViewProps) {
  const summary = useMemo(() => {
    const gapForecast = gapData.map((d) => d.gap)
    return simulateClearing(activeBids, gapForecast)
  }, [activeBids, gapData])

  const { results, totalCleared, totalCost, avgMCP, missedHours, gapCoverage, imbalanceMWh, imbalanceCost } = summary

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">

      {/* Header */}
      <div className="shrink-0 border-b border-gray-200 bg-white px-6 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Post-Trade Results</h1>
            <p className="text-xs text-muted-foreground">Delivery: {deliveryLabel} · Auction cleared</p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-5 sm:p-8">
        <div className="space-y-6 max-w-3xl">

          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard label="Cleared Volume" value={`${totalCleared.toFixed(1)} MWh`} />
            <SummaryCard label="Total Cost" value={`€${totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} sub="at MCP (uniform price)" />
            <SummaryCard label="Avg MCP" value={`€${avgMCP.toFixed(2)}`} sub="vol-weighted" />
            <SummaryCard
              label="Gap Coverage"
              value={`${gapCoverage.toFixed(0)}%`}
              highlight={gapCoverage < 85 ? "red" : gapCoverage < 95 ? "amber" : "green"}
            />
          </div>

          {/* Imbalance warning */}
          {imbalanceMWh > 0.5 && (
            <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-semibold text-amber-900">
                  {imbalanceMWh.toFixed(1)} MWh uncovered — imbalance exposure
                </p>
                <p className="mt-0.5 text-xs text-amber-700">
                  {missedHours} {missedHours === 1 ? "hour" : "hours"} did not clear.
                  Estimated imbalance penalty at 1.8× MCP:{" "}
                  <span className="font-semibold">
                    €{imbalanceCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </p>
              </div>
            </div>
          )}

          {/* Hourly breakdown */}
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Hourly Clearing Results
            </p>
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Hour</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Your Bid</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">MCP</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Spread</th>
                    <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {results.map((r) => {
                    const spread = r.bidPrice - r.mcp
                    return (
                      <tr
                        key={r.hour}
                        className={cn(
                          "transition-colors",
                          r.filled ? "bg-white hover:bg-emerald-50/30" : "bg-red-50/20 hover:bg-red-50/40"
                        )}
                      >
                        <td className="px-3 py-2 font-mono text-xs text-foreground">{r.hour.split(" ")[0]}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-xs">€{r.bidPrice.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-xs font-medium">€{r.mcp.toFixed(2)}</td>
                        <td className={cn(
                          "px-3 py-2 text-right tabular-nums text-xs font-medium",
                          spread > 0 ? "text-slate-500" : "text-red-500"
                        )}>
                          {spread >= 0 ? "+" : ""}{spread.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {r.filled ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
                              <CheckCircle2 className="h-2.5 w-2.5" /> Filled
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600 ring-1 ring-red-100">
                              <XCircle className="h-2.5 w-2.5" /> Missed
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-xs">
                          {r.filled
                            ? `€${r.clearedCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                            : <span className="text-muted-foreground">—</span>
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              DAM uniform price: you pay MCP, not your bid price. Spread = bid − MCP (positive = safety margin you gave yourself).
            </p>
          </div>

          {/* Audit footer */}
          <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
            <p className="font-mono text-[10px] text-muted-foreground">
              Audit ID: {bidHash ? `${bidHash}…` : "—"}
            </p>
            <button
              type="button"
              onClick={onNewSession}
              className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90"
            >
              New Session
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}

// ─── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, sub, highlight,
}: {
  label: string
  value: string
  sub?: string
  highlight?: "red" | "amber" | "green"
}) {
  const colors = {
    red:   "border-red-200 bg-red-50",
    amber: "border-amber-200 bg-amber-50",
    green: "border-emerald-200 bg-emerald-50",
  }
  const valColors = {
    red: "text-red-600", amber: "text-amber-700", green: "text-emerald-700",
  }
  return (
    <div className={cn(
      "rounded-xl border p-3",
      highlight ? colors[highlight] : "border-gray-200 bg-gray-50"
    )}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-bold", highlight ? valColors[highlight] : "text-foreground")}>{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  )
}
