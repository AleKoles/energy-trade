"use client"

import {
  Area,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  type TooltipProps,
} from "recharts"
import type { GapDataPoint } from "./useGapData"

// ─── Palette (trading-terminal dark) ─────────────────────────────────────────

const C = {
  bg:           "#0f172a",   // slate-900
  grid:         "rgba(255,255,255,0.06)",
  axis:         "rgba(255,255,255,0.35)",
  supply:       "#34d399",   // emerald-400
  supplyFill:   "rgba(52,211,153,0.55)",
  load:         "#60a5fa",   // blue-400
  shortage:     "#f87171",   // red-400
  shortageFill: "rgba(248,113,113,0.38)",
  tooltipBg:    "#1e293b",   // slate-800
  tooltipBorder:"rgba(255,255,255,0.10)",
} as const

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function GapTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null

  // payload[0].payload is the raw GapDataPoint — avoids stacked-value confusion
  const d = payload[0].payload as GapDataPoint
  const isShort = d.shortage > 0

  return (
    <div
      style={{
        background:   C.tooltipBg,
        border:       `1px solid ${C.tooltipBorder}`,
        borderRadius: 10,
        padding:      "10px 14px",
        fontSize:     12,
        lineHeight:   1.7,
        minWidth:     170,
        boxShadow:    "0 8px 24px rgba(0,0,0,0.4)",
      }}
    >
      <p style={{ color: C.axis, fontWeight: 600, marginBottom: 6, letterSpacing: "0.06em", fontSize: 10, textTransform: "uppercase" }}>
        {d.time}
      </p>
      <p style={{ color: C.load }}>
        <span style={{ color: "rgba(255,255,255,0.45)", display: "inline-block", width: 110 }}>Load</span>
        <strong>{d.load.toFixed(0)} MW</strong>
      </p>
      <p style={{ color: C.supply }}>
        <span style={{ color: "rgba(255,255,255,0.45)", display: "inline-block", width: 110 }}>Forecast Supply</span>
        <strong>{d.supply.toFixed(0)} MW</strong>
      </p>
      <hr style={{ border: "none", borderTop: `1px solid ${C.tooltipBorder}`, margin: "7px 0" }} />
      <p style={{ color: isShort ? C.shortage : C.supply, fontWeight: 700 }}>
        <span style={{ color: "rgba(255,255,255,0.45)", fontWeight: 400, display: "inline-block", width: 110 }}>Net Position</span>
        {isShort
          ? `+${d.shortage.toFixed(0)} MW Short`
          : `-${d.surplus.toFixed(0)} MW Long`}
      </p>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ForecastChartProps {
  data: GapDataPoint[]
}

export function ForecastChart({ data }: ForecastChartProps) {
  return (
    <div
      style={{ background: C.bg, borderRadius: 12 }}
      className="w-full overflow-hidden"
    >
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart
          data={data}
          margin={{ top: 16, right: 16, bottom: 0, left: 4 }}
        >
          <defs>
            {/* Subtle gradient for supply area */}
            <linearGradient id="supplyGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={C.supply}  stopOpacity={0.65} />
              <stop offset="100%" stopColor={C.supply}  stopOpacity={0.20} />
            </linearGradient>
            {/* Gradient for shortage area */}
            <linearGradient id="shortageGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={C.shortage} stopOpacity={0.50} />
              <stop offset="100%" stopColor={C.shortage} stopOpacity={0.15} />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke={C.grid}
            vertical={false}
          />

          <XAxis
            dataKey="time"
            tick={{ fill: C.axis, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "rgba(255,255,255,0.10)" }}
            interval={3}
          />

          <YAxis
            tick={{ fill: C.axis, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${v}`}
            unit=" MW"
            width={64}
          />

          <Tooltip
            content={<GapTooltip />}
            cursor={{ stroke: "rgba(255,255,255,0.12)", strokeWidth: 1 }}
          />

          {/*
            Stack: supply (green) + shortage (red) stacked on top.
            When shortage > 0: green shows 0→supply, red shows supply→load.
            When surplus:     shortage=0, only green shows — extends above load line.
          */}
          <Area
            stackId="gap"
            type="monotone"
            dataKey="supply"
            stroke={C.supply}
            strokeWidth={1.5}
            fill="url(#supplyGrad)"
            isAnimationActive={false}
            dot={false}
            activeDot={false}
          />
          <Area
            stackId="gap"
            type="monotone"
            dataKey="shortage"
            stroke="none"
            fill="url(#shortageGrad)"
            isAnimationActive={false}
            dot={false}
            activeDot={false}
          />

          {/* Load line — sits on top of the areas */}
          <Line
            type="monotone"
            dataKey="load"
            stroke={C.load}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, fill: C.load, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
