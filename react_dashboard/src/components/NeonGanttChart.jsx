import { useRef, useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'

const ROW_H = 24        // px per process row
const HEADER_H = 28     // time ruler
const LABEL_W = 42      // left label column

export default function NeonGanttChart({ result, playhead, colorOf }) {
  const containerRef = useRef(null)
  const [zoom, setZoom] = useState(1)  // px per ms

  // Auto-scale zoom to fit
  const containerWidth = containerRef.current?.clientWidth ?? 600
  const basePxPerMs = useMemo(() => {
    if (!result) return 1
    return Math.max(0.5, Math.min(5, (containerWidth - LABEL_W - 24) / (result.totalTime || 1)))
  }, [result, containerWidth])

  const pxPerMs = basePxPerMs * zoom

  const pids = useMemo(() => {
    if (!result) return []
    const seen = new Set()
    result.gantt.forEach(s => seen.add(s.pid))
    return [...seen].sort((a, b) => a - b)
  }, [result])

  const svgW = result ? Math.max(containerWidth - 4, result.totalTime * pxPerMs + LABEL_W + 24) : containerWidth
  const svgH = HEADER_H + pids.length * ROW_H + 16

  // Auto-scroll playhead into view
  const svgRef = useRef(null)
  useEffect(() => {
    if (!result || !svgRef.current) return
    const x = LABEL_W + playhead * pxPerMs
    const parent = svgRef.current.parentElement
    if (parent) {
      const targetScroll = x - parent.clientWidth / 2
      parent.scrollLeft = Math.max(0, targetScroll)
    }
  }, [playhead, pxPerMs, result])

  if (!result) {
    return (
      <div className="glass rounded-xl h-full flex items-center justify-center border border-cyber-500/20">
        <p className="text-cyber-300 text-xs font-mono">Run a simulation to see the Gantt chart</p>
      </div>
    )
  }

  // Build tick marks
  const tickInterval = Math.ceil(result.totalTime / 20)
  const ticks = []
  for (let t = 0; t <= result.totalTime; t += tickInterval) ticks.push(t)
  if (ticks[ticks.length - 1] !== result.totalTime) ticks.push(result.totalTime)

  return (
    <div className="glass rounded-xl h-full flex flex-col border border-cyan-900/30">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-cyan-900/20">
        <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400">
          Gantt Timeline
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono text-cyber-300">
            {result.totalTime}ms total
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setZoom(z => Math.max(0.3, z - 0.3))}
              className="btn-cyber btn-ghost w-5 h-5 text-xs flex items-center justify-center p-0"
            >−</button>
            <span className="text-[10px] font-mono text-cyber-300 w-7 text-center">
              {(zoom * 100).toFixed(0)}%
            </span>
            <button
              onClick={() => setZoom(z => Math.min(8, z + 0.3))}
              className="btn-cyber btn-ghost w-5 h-5 text-xs flex items-center justify-center p-0"
            >+</button>
          </div>
          {/* Legend */}
          <div className="flex items-center gap-2 border-l border-cyber-600/30 pl-2">
            {pids.map(pid => {
              const c = colorOf(pid)
              return (
                <div key={pid} className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-sm" style={{ background: c.hex }} />
                  <span className="text-[9px] font-mono" style={{ color: c.hex }}>P{pid}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* SVG area */}
      <div ref={containerRef} className="flex-1 overflow-x-auto overflow-y-hidden">
        <svg
          ref={svgRef}
          width={svgW}
          height={svgH}
          className="block"
        >
          <defs>
            {pids.map(pid => {
              const c = colorOf(pid)
              return (
                <linearGradient key={pid} id={`grad-${pid}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%"   stopColor={c.from} stopOpacity="0.95" />
                  <stop offset="100%" stopColor={c.to}   stopOpacity="0.95" />
                </linearGradient>
              )
            })}
          </defs>

          {/* Background grid lines */}
          {ticks.map(t => (
            <line
              key={t}
              x1={LABEL_W + t * pxPerMs} y1={0}
              x2={LABEL_W + t * pxPerMs} y2={svgH}
              stroke="rgba(58,79,122,0.25)" strokeWidth="1"
            />
          ))}

          {/* Row backgrounds */}
          {pids.map((pid, rowIdx) => (
            <rect
              key={pid}
              x={0} y={HEADER_H + rowIdx * ROW_H}
              width={svgW} height={ROW_H}
              fill={rowIdx % 2 === 0 ? 'rgba(13,18,38,0.3)' : 'rgba(8,13,26,0.3)'}
            />
          ))}

          {/* Time ruler */}
          <rect x={0} y={0} width={svgW} height={HEADER_H} fill="rgba(5,8,15,0.6)" />
          {ticks.map(t => {
            const x = LABEL_W + t * pxPerMs
            return (
              <g key={t}>
                <line x1={x} y1={HEADER_H - 5} x2={x} y2={HEADER_H} stroke="rgba(34,211,238,0.5)" strokeWidth="1" />
                <text
                  x={x} y={HEADER_H - 8}
                  textAnchor="middle"
                  fill="rgba(100,165,185,0.9)"
                  fontSize="9"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {t}
                </text>
              </g>
            )
          })}

          {/* Process row labels */}
          {pids.map((pid, rowIdx) => {
            const c = colorOf(pid)
            const y = HEADER_H + rowIdx * ROW_H + ROW_H / 2
            return (
              <text
                key={pid}
                x={LABEL_W - 6} y={y + 4}
                textAnchor="end"
                fill={c.hex}
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
                fontWeight="700"
              >
                P{pid}
              </text>
            )
          })}

          {/* Gantt bars */}
          {result.gantt.map((slice, idx) => {
            const rowIdx = pids.indexOf(slice.pid)
            if (rowIdx === -1) return null
            const x = LABEL_W + slice.start * pxPerMs
            const w = Math.max(1, (slice.end - slice.start) * pxPerMs - 1)
            const y = HEADER_H + rowIdx * ROW_H + 3
            const h = ROW_H - 6
            const c = colorOf(slice.pid)
            const isActive = playhead >= slice.start && playhead < slice.end

            return (
              <g key={idx}>
                {/* Glow effect for active slice */}
                {isActive && (
                  <rect
                    x={x - 2} y={y - 2} width={w + 4} height={h + 4}
                    rx="5" fill="none"
                    stroke={c.hex} strokeWidth="2"
                    opacity="0.6"
                  />
                )}
                <motion.rect
                  x={x} y={y} rx="4" height={h}
                  fill={`url(#grad-${slice.pid})`}
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: w, opacity: 1 }}
                  transition={{ duration: 0.4, delay: idx * 0.015, ease: 'easeOut' }}
                  style={{
                    filter: isActive
                      ? `drop-shadow(0 0 4px ${c.hex}) drop-shadow(0 0 8px ${c.hex}88)`
                      : `drop-shadow(0 0 2px ${c.hex}44)`,
                  }}
                />
                {/* Label inside bar if wide enough */}
                {w > 22 && (
                  <text
                    x={x + w / 2} y={y + h / 2 + 3}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.9)"
                    fontSize="9"
                    fontFamily="JetBrains Mono, monospace"
                    fontWeight="700"
                    style={{ pointerEvents: 'none' }}
                  >
                    P{slice.pid}
                  </text>
                )}
                {/* Duration label */}
                {w > 30 && (
                  <text
                    x={x + w / 2} y={y + h / 2 + 12}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.5)"
                    fontSize="7"
                    fontFamily="JetBrains Mono, monospace"
                    style={{ pointerEvents: 'none' }}
                  >
                    {slice.end - slice.start}ms
                  </text>
                )}
              </g>
            )
          })}

          {/* Playhead line */}
          {result && (
            <g>
              <line
                x1={LABEL_W + playhead * pxPerMs} y1={0}
                x2={LABEL_W + playhead * pxPerMs} y2={svgH}
                stroke="#ef4444" strokeWidth="1.5"
                strokeDasharray="3 2"
                opacity="0.9"
              />
              {/* Playhead triangle indicator */}
              <polygon
                points={`
                  ${LABEL_W + playhead * pxPerMs - 5},0
                  ${LABEL_W + playhead * pxPerMs + 5},0
                  ${LABEL_W + playhead * pxPerMs},8
                `}
                fill="#ef4444"
                opacity="0.9"
              />
              <text
                x={LABEL_W + playhead * pxPerMs + 3}
                y={svgH - 4}
                fill="rgba(239,68,68,0.8)"
                fontSize="8"
                fontFamily="JetBrains Mono, monospace"
              >
                {playhead}ms
              </text>
            </g>
          )}
        </svg>
      </div>
    </div>
  )
}
