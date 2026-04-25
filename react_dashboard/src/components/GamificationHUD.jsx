import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { ALGO, ALGO_NAMES } from '../engine/scheduler.js'

export default function GamificationHUD({ result, aiResult, readyCount, algo, duelResult, colorOf }) {
  const algoStats = useMemo(() => {
    if (!result || !aiResult) return null

    const summarize = (r) => {
      const avgWait = r.processes.reduce((a, p) => a + (p.waitingTime ?? 0), 0) / r.processes.length
      const avgTAT  = r.processes.reduce((a, p) => a + (p.turnaroundTime ?? 0), 0) / r.processes.length
      const busyTime = r.gantt.filter(s => s.pid !== -1).reduce((a, s) => a + s.end - s.start, 0)
      const cpuUtil  = r.totalTime ? (busyTime / r.totalTime) * 100 : 0
      return { avgWait, avgTAT, cpuUtil }
    }

    return {
      current: summarize(result),
      ai: summarize(aiResult),
    }
  }, [result, aiResult])

  const healthPct = Math.min(100, (readyCount / 8) * 100)
  const healthColor = healthPct < 50
    ? 'from-emerald-500 to-green-400'
    : healthPct < 80
    ? 'from-amber-500 to-yellow-400'
    : 'from-red-600 to-rose-500'

  return (
    <div className="glass rounded-xl h-full border border-emerald-900/25 flex flex-col p-3 gap-2 overflow-hidden">
      <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400">
        {duelResult ? 'Duel Result' : 'AI Comparison'}
      </span>

      <div className="flex gap-2 flex-1 overflow-hidden">
        {/* Left: System health + leaderboard */}
        <div className="flex flex-col gap-2 flex-none w-[200px]">
          {/* System Health Bar */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-mono text-cyber-300 uppercase tracking-wider">System Health</span>
              <span className={`text-[9px] font-mono font-bold ${healthPct > 80 ? 'text-red-400 animate-pulse' : 'text-cyber-200'}`}>
                {readyCount} queued
              </span>
            </div>
            <div className="h-2.5 bg-cyber-700 rounded-full overflow-hidden border border-cyber-500/20">
              <motion.div
                className={`h-full rounded-full bg-gradient-to-r ${healthColor}`}
                initial={{ width: 0 }}
                animate={{ width: `${healthPct}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                style={{ boxShadow: healthPct > 80 ? '0 0 8px rgba(239,68,68,0.6)' : '0 0 6px rgba(52,211,153,0.4)' }}
              />
            </div>
          </div>

          {/* Duel result or algo comparison */}
          {duelResult ? (
            <DuelCard duelResult={duelResult} />
          ) : algoStats ? (
            <AICompareTable current={algoStats.current} ai={algoStats.ai} algo={algo} />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-[10px] text-cyber-300 font-mono">Run to compare</p>
            </div>
          )}
        </div>

        {/* Right: Leaderboard (only when result exists) */}
        {result && (
          <div className="flex-1 min-w-0 overflow-hidden">
            <Leaderboard processes={result.processes} colorOf={colorOf} />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Duel result card ───────────────────────────────────────────────
function DuelCard({ duelResult }) {
  const { human, ai } = duelResult
  const hWait = human.processes.reduce((a, p) => a + (p.waitingTime ?? 0), 0) / human.processes.length
  const aWait = ai.processes.reduce((a, p) => a + (p.waitingTime ?? 0), 0) / ai.processes.length
  const userWins = hWait <= aWait

  return (
    <div className={`rounded-lg border p-2 text-center ${
      userWins ? 'border-emerald-500/40 bg-emerald-900/20' : 'border-red-500/40 bg-red-900/20'
    }`}>
      <div className={`text-sm font-black font-mono ${userWins ? 'text-emerald-400' : 'text-red-400'}`}>
        {userWins ? 'YOU WIN!' : 'AI WINS!'}
      </div>
      <div className="flex justify-around mt-1">
        <div className="text-center">
          <div className="text-[9px] font-mono text-cyber-300">Your Wait</div>
          <div className={`text-xs font-bold font-mono ${userWins ? 'text-emerald-400' : 'text-cyber-200'}`}>
            {hWait.toFixed(1)}ms
          </div>
        </div>
        <div className="w-px bg-cyber-600/40" />
        <div className="text-center">
          <div className="text-[9px] font-mono text-cyber-300">AI Wait</div>
          <div className={`text-xs font-bold font-mono ${!userWins ? 'text-emerald-400' : 'text-cyber-200'}`}>
            {aWait.toFixed(1)}ms
          </div>
        </div>
      </div>
    </div>
  )
}

// ── AI compare mini table ──────────────────────────────────────────
function AICompareTable({ current, ai, algo }) {
  const betterWait = ai.avgWait < current.avgWait
  const betterTAT  = ai.avgTAT  < current.avgTAT

  return (
    <div className="rounded-lg border border-cyber-600/20 overflow-hidden">
      <div className="grid grid-cols-3 bg-cyber-800/60 text-[8px] font-mono text-cyber-300 uppercase">
        <div className="px-1.5 py-1">Metric</div>
        <div className="px-1.5 py-1 text-teal-400">{ALGO_NAMES[algo] || 'Yours'}</div>
        <div className="px-1.5 py-1 text-cyan-400">AI-SJF</div>
      </div>
      <CompRow label="Wait" a={`${current.avgWait.toFixed(1)}`} b={`${ai.avgWait.toFixed(1)}`} aWins={!betterWait} bWins={betterWait} />
      <CompRow label="TAT"  a={`${current.avgTAT.toFixed(1)}`}  b={`${ai.avgTAT.toFixed(1)}`}  aWins={!betterTAT}  bWins={betterTAT}  />
      <CompRow label="CPU%" a={`${current.cpuUtil.toFixed(0)}%`} b={`${ai.cpuUtil.toFixed(0)}%`} aWins={current.cpuUtil >= ai.cpuUtil} bWins={ai.cpuUtil > current.cpuUtil} />
    </div>
  )
}

function CompRow({ label, a, b, aWins, bWins }) {
  return (
    <div className="grid grid-cols-3 border-t border-cyber-600/15 text-[9px] font-mono">
      <div className="px-1.5 py-1 text-cyber-300">{label}</div>
      <div className={`px-1.5 py-1 ${aWins ? 'text-emerald-400 font-bold' : 'text-cyber-200'}`}>{a}</div>
      <div className={`px-1.5 py-1 ${bWins ? 'text-emerald-400 font-bold' : 'text-cyber-200'}`}>{b}</div>
    </div>
  )
}

// ── Per-process leaderboard ────────────────────────────────────────
function Leaderboard({ processes, colorOf }) {
  const sorted = [...processes].sort((a, b) => (a.waitingTime ?? 0) - (b.waitingTime ?? 0))

  return (
    <div className="h-full flex flex-col">
      <div className="text-[9px] font-mono text-cyber-300 uppercase tracking-wider mb-1">
        Process Leaderboard (by wait)
      </div>
      <div className="flex-1 overflow-y-auto space-y-0.5">
        {sorted.map((p, rank) => {
          const c = colorOf(p.pid)
          const maxWait = Math.max(1, ...processes.map(p2 => p2.waitingTime ?? 0))
          const pct = ((p.waitingTime ?? 0) / maxWait) * 100
          return (
            <div key={p.pid} className="flex items-center gap-1.5 group">
              <span className="text-[9px] font-mono text-cyber-400 w-3 text-right">{rank + 1}</span>
              <div
                className="w-1.5 h-1.5 rounded-full flex-none"
                style={{ background: c.hex, boxShadow: `0 0 4px ${c.hex}88` }}
              />
              <span className="text-[10px] font-mono font-bold w-6 flex-none" style={{ color: c.hex }}>
                P{p.pid}
              </span>
              <div className="flex-1 h-1.5 bg-cyber-700/60 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(to right, ${c.from}, ${c.to})`,
                  }}
                />
              </div>
              <span className="text-[9px] font-mono text-cyber-300 w-10 text-right flex-none">
                {(p.waitingTime ?? 0)}ms
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
