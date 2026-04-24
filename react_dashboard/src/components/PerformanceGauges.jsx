import { useMemo } from 'react'
import { motion } from 'framer-motion'

const R = 38
const CIRC = 2 * Math.PI * R
const CX = 52
const CY = 52
const SIZE = 104

export default function PerformanceGauges({ result, playhead }) {
  const metrics = useMemo(() => {
    if (!result) return null

    const { gantt, totalTime, processes } = result
    if (!totalTime) return null

    // CPU utilization: fraction of time CPU was busy (non-idle slices)
    const busyTime = gantt.filter(s => s.pid !== -1).reduce((acc, s) => acc + s.end - s.start, 0)
    const cpuUtil  = (busyTime / totalTime) * 100

    // Throughput: processes completed per 100ms (normalized)
    const throughput = (processes.length / totalTime) * 100

    // Avg waiting time
    const avgWait = processes.reduce((acc, p) => acc + (p.waitingTime ?? 0), 0) / processes.length

    // Avg turnaround
    const avgTAT  = processes.reduce((acc, p) => acc + (p.turnaroundTime ?? 0), 0) / processes.length

    return { cpuUtil, throughput, avgWait, avgTAT }
  }, [result])

  return (
    <div className="glass rounded-xl h-full border border-violet-900/30 flex flex-col p-3 gap-2">
      <span className="text-[10px] font-mono uppercase tracking-wider text-violet-400">Performance</span>

      {!metrics ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[10px] font-mono text-cyber-300">N/A</span>
        </div>
      ) : (
        <>
          {/* Circular gauges row */}
          <div className="flex items-center justify-around">
            <CircularGauge
              value={metrics.cpuUtil}
              max={100}
              label="CPU Util"
              unit="%"
              color={{ stroke: '#8b5cf6', glow: '#7c3aed' }}
              gradId="gauge-cpu"
              gradFrom="#8b5cf6"
              gradTo="#c026d3"
            />
            <CircularGauge
              value={metrics.throughput}
              max={100}
              label="Throughput"
              unit="/100ms"
              color={{ stroke: '#06b6d4', glow: '#0891b2' }}
              gradId="gauge-thru"
              gradFrom="#06b6d4"
              gradTo="#3b82f6"
            />
          </div>

          {/* Mini stats row */}
          <div className="grid grid-cols-2 gap-1">
            <MiniStat label="Avg Wait" value={`${metrics.avgWait.toFixed(1)}ms`} color="text-amber-400" />
            <MiniStat label="Avg TAT"  value={`${metrics.avgTAT.toFixed(1)}ms`}  color="text-emerald-400" />
          </div>
        </>
      )}
    </div>
  )
}

// ── Circular SVG Gauge ─────────────────────────────────────────────
function CircularGauge({ value, max, label, unit, color, gradId, gradFrom, gradTo }) {
  const pct    = Math.min(1, Math.max(0, value / max))
  const offset = CIRC * (1 - pct)
  const displayVal = value.toFixed(1)

  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="block">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={gradFrom} />
            <stop offset="100%" stopColor={gradTo}  />
          </linearGradient>
        </defs>

        {/* Track */}
        <circle
          cx={CX} cy={CY} r={R}
          fill="none"
          stroke="rgba(58,79,122,0.3)"
          strokeWidth="7"
          strokeLinecap="round"
        />

        {/* Progress arc */}
        <motion.circle
          cx={CX} cy={CY} r={R}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          initial={{ strokeDashoffset: CIRC }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          style={{
            transform: 'rotate(-90deg)',
            transformOrigin: `${CX}px ${CY}px`,
            filter: `drop-shadow(0 0 4px ${color.glow})`,
          }}
        />

        {/* Center value */}
        <text
          x={CX} y={CY - 4}
          textAnchor="middle"
          fill={color.stroke}
          fontSize="14"
          fontFamily="JetBrains Mono, monospace"
          fontWeight="700"
        >
          {displayVal}
        </text>
        <text
          x={CX} y={CY + 10}
          textAnchor="middle"
          fill="rgba(160,176,208,0.7)"
          fontSize="8"
          fontFamily="JetBrains Mono, monospace"
        >
          {unit}
        </text>

        {/* Percentage arc fill indicator */}
        <text
          x={CX} y={CY + 22}
          textAnchor="middle"
          fill="rgba(100,130,180,0.5)"
          fontSize="7"
          fontFamily="JetBrains Mono, monospace"
        >
          {(pct * 100).toFixed(0)}%
        </text>
      </svg>
      <span className="text-[9px] font-mono text-cyber-200 uppercase tracking-wider">{label}</span>
    </div>
  )
}

// ── Mini stat cell ─────────────────────────────────────────────────
function MiniStat({ label, value, color }) {
  return (
    <div className="bg-cyber-800/60 rounded-lg px-2 py-1.5 text-center border border-cyber-600/20">
      <div className={`text-xs font-mono font-bold ${color}`}>{value}</div>
      <div className="text-[9px] font-mono text-cyber-300">{label}</div>
    </div>
  )
}
