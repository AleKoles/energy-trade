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
  ReferenceLine,
  Label,
  type TooltipProps,
} from "recharts"
import type { GapDataPoint } from "./useGapData"
import { cn } from "@/lib/utils"

const COLORS = {
  wind: "#38bdf8",
  solar: "#fbbf24",
  load: "#60a5fa",
  shortage: "#f87171",
  grid: "#f1f5f9",
  axis: "#94a3b8",
  priceLine: "#94a3b8",
} as const

// 1. THE TOOLTIP (Tailwind optimized)
function GapTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as GapDataPoint
  const isShort = d.shortage > 0

  return (
    <div className="min-w-[220px] rounded-xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-200/50">
      <div className="flex justify-between items-center mb-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          {d.time} Profile
        </p>
        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
          €{d.hourlyPrice.toFixed(2)}/MWh
        </span>
      </div>
      
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-slate-600">Consumption</span>
        <span className="text-sm font-bold text-blue-400">{d.load.toFixed(0)} MW</span>
      </div>

      <div className="flex justify-between items-center text-[11px] text-slate-50">
        <span>Wind PPA</span>
        <span className="font-semibold text-sky-400">{d.wind.toFixed(0)} MW</span>
      </div>

      <div className="flex justify-between items-center text-[11px] text-slate-500 mb-2">
        <span>Solar PPA</span>
        <span className="font-semibold text-amber-400">{d.solar.toFixed(0)} MW</span>
      </div>

      <div className={cn(
        "mt-2 p-2.5 rounded-lg flex justify-between items-center",
        isShort ? "bg-red-50 text-red-600" : "bg-sky-50 text-sky-600"
      )}>
        <span className="text-[11px] font-bold uppercase">{isShort ? 'Spot Exposure' : 'Net Surplus'}</span>
        <span className="text-sm font-extrabold">{isShort ? `${d.shortage.toFixed(0)} MW` : `${d.surplus.toFixed(0)} MW`}</span>
      </div>
    </div>
  )
}

interface ForecastChartProps {
  data: GapDataPoint[]
}

// 2. THE MAIN CHART COMPONENT
export function ForecastChart({ data }: ForecastChartProps) {
  return (
    <div className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="p-4 pb-0">
        <ResponsiveContainer width="100%" height={380}>
          <ComposedChart data={data} margin={{ top: 24, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="windGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.wind} stopOpacity={0.4} />
                <stop offset="100%" stopColor={COLORS.wind} stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="solarGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.solar} stopOpacity={0.5} />
                <stop offset="100%" stopColor={COLORS.solar} stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="shortageGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.shortage} stopOpacity={0.3} />
                <stop offset="100%" stopColor={COLORS.shortage} stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />

            <XAxis 
              dataKey="time" 
              tick={{ fill: COLORS.axis, fontSize: 11, fontWeight: 600 }} 
              tickLine={false} 
              axisLine={false} 
              interval={2} 
            />

            {/* Clean Y-Axes */}
            <YAxis yAxisId="left" tick={{ fill: COLORS.axis, fontSize: 11 }} tickLine={false} axisLine={false} unit=" MW" width={60} />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: COLORS.axis, fontSize: 10, fontWeight: 700 }} tickLine={false} axisLine={false} unit=" €" width={50} />

            <Tooltip content={<GapTooltip />} cursor={{ stroke: '#f1f5f9', strokeWidth: 2 }} />

            {/* Rail Context Lines */}
            <ReferenceLine yAxisId="left" y={0} stroke="#e2e8f0" strokeWidth={2} />
            <ReferenceLine yAxisId="left" x="07:00" stroke="transparent">
              <Label value="Morning Peak" position="top" fill="#cbd5e1" fontSize={10} fontWeight={700} dy={-10} />
            </ReferenceLine>
            <ReferenceLine yAxisId="left" x="18:00" stroke="transparent">
              <Label value="Evening Peak" position="top" fill="#cbd5e1" fontSize={10} fontWeight={700} dy={-10} />
            </ReferenceLine>

            {/* Stacked Areas */}
            <Area yAxisId="left" stackId="supply" dataKey="wind" stroke={COLORS.wind} fill="url(#windGrad)" isAnimationActive={false} />
            <Area yAxisId="left" stackId="supply" dataKey="solar" stroke={COLORS.solar} fill="url(#solarGrad)" isAnimationActive={false} />
            <Area yAxisId="left" type="monotone" dataKey="shortage" stroke="none" fill="url(#shortageGrad)" isAnimationActive={false} />
            
            {/* The Market Price & Consumption Lines */}
            <Line yAxisId="right" type="stepAfter" dataKey="hourlyPrice" stroke={COLORS.priceLine} strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
            <Line yAxisId="left" type="monotone" dataKey="load" stroke={COLORS.load} strokeWidth={3} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 3. THE LEGEND (Standardized Row) */}
    
    </div>
  )
}