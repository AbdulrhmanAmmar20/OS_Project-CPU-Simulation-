/**
 * CPUArena.jsx — Manual Mode + Coder Mode with shared Metrics Dashboard
 * - Manual Mode: drag-and-drop process cards snap into glowing CPU socket
 * - Coder Mode: Monaco editor for JS scheduling functions
 * - Shared: live Metrics Dashboard, scrolling Gantt, penalty timer
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence, Reorder } from 'framer-motion'
import Editor from '@monaco-editor/react'

// ─── Constants ────────────────────────────────────────────────────────────────
const COLORS = [
  '#2dd4bf', '#f472b6', '#60a5fa', '#fbbf24', '#34d399',
  '#a78bfa', '#fb923c', '#22d3ee', '#86efac', '#f9a8d4',
]

const CODER_DEFAULT = `function scheduler(readyQueue, currentTime, history) {
  // readyQueue: [{ pid, name, burstTime, remainingTime, arrivalTime, priority, color }]
  // currentTime: number (ms)
  // history: [pid, ...] – what you've run so far
  // Return a PID to run, or null for idle CPU

  if (readyQueue.length === 0) return null;

  // ── Shortest Remaining Time First (SRTF) ──
  return readyQueue.reduce((best, p) =>
    p.remainingTime < best.remainingTime ? p : best
  ).pid;

  // ── Other strategies ──
  // FCFS:       return readyQueue.sort((a,b) => a.arrivalTime - b.arrivalTime)[0].pid
  // Priority:   return readyQueue.sort((a,b) => a.priority - b.priority)[0].pid
  // Round-Robin (basic): return readyQueue[(history.length) % readyQueue.length].pid
}`

const PENALTY_PER_IDLE_TICK = 5   // points lost per idle CPU ms
const BONUS_PER_FAST_COMPLETE = 50

// ─── Process generators ────────────────────────────────────────────────────
function makeProcesses(count = 6) {
  return Array.from({ length: count }, (_, i) => ({
    pid: i + 1,
    name: `P${i + 1}`,
    color: COLORS[i % COLORS.length],
    arrivalTime: Math.floor(i * 1.4 + Math.random() * 2),
    burstTime: 3 + Math.floor(Math.random() * 9),
    remainingTime: 0, // filled at sim start
    priority: Math.floor(Math.random() * 5) + 1,
    completionTime: null,
    waitTime: 0,
    turnaroundTime: 0,
  })).map(p => ({ ...p, remainingTime: p.burstTime }))
}

// ─── Core simulation engine ────────────────────────────────────────────────
function simulate(processes, schedulerFn, ioFreqPct = 0) {
  const procs = processes.map(p => ({ ...p, remainingTime: p.burstTime, waitTime: 0, completionTime: null, turnaroundTime: 0 }))
  const gantt = []   // { time, pid|null }
  const log   = []
  const completed = new Set()
  const ioBlocked = new Map() // pid -> unblock time
  const history   = []
  let time = 0
  const MAX = procs.reduce((s, p) => s + p.burstTime, 0) * 5 + 40
  let idleTicks = 0

  while (completed.size < procs.length && time < MAX) {
    // Unblock I/O
    for (const [pid, unblockAt] of ioBlocked) {
      if (time >= unblockAt) ioBlocked.delete(pid)
    }

    const readyQueue = procs.filter(p =>
      p.arrivalTime <= time && !completed.has(p.pid) &&
      !ioBlocked.has(p.pid) && p.remainingTime > 0
    ).map(p => ({
      pid: p.pid, name: p.name, burstTime: p.burstTime,
      remainingTime: p.remainingTime, arrivalTime: p.arrivalTime,
      priority: p.priority, color: p.color,
    }))

    let chosen = null
    try {
      chosen = schedulerFn(readyQueue, time, [...history])
    } catch (e) {
      throw { type: 'runtime', message: e.message, time }
    }

    if (chosen !== null && !readyQueue.find(p => p.pid === chosen)) {
      throw { type: 'invalid_pid', message: `PID ${chosen} not in ready queue at T${time}`, time }
    }

    gantt.push({ time, pid: chosen })
    history.push(chosen)

    if (chosen !== null) {
      const proc = procs.find(p => p.pid === chosen)
      proc.remainingTime--

      // I/O interrupt
      if (ioFreqPct > 0 && proc.remainingTime > 0 && Math.random() * 100 < ioFreqPct) {
        const ioWait = 1 + Math.floor(Math.random() * 3)
        ioBlocked.set(proc.pid, time + 1 + ioWait)
        log.push({ time, type: 'io',   msg: `${proc.name} → I/O (${ioWait}ms)` })
      }

      if (proc.remainingTime === 0) {
        proc.completionTime = time + 1
        proc.turnaroundTime = proc.completionTime - proc.arrivalTime
        proc.waitTime = Math.max(0, proc.turnaroundTime - proc.burstTime)
        completed.add(proc.pid)
        log.push({ time, type: 'done', msg: `${proc.name} done — TAT:${proc.turnaroundTime} WT:${proc.waitTime}` })
      }
    } else {
      idleTicks++
      if (!log.length || log[log.length - 1].type !== 'idle' || log[log.length - 1].time < time - 1) {
        log.push({ time, type: 'idle', msg: 'CPU idle' })
      }
    }

    // accumulate wait for non-running ready procs
    procs.forEach(p => {
      if (p.arrivalTime <= time && !completed.has(p.pid) && !ioBlocked.has(p.pid) &&
          p.remainingTime > 0 && p.pid !== chosen) {
        p.waitTime = (p.waitTime || 0) + 1
      }
    })

    time++
  }

  const done = procs.filter(p => completed.has(p.pid))
  const avgWait = done.length ? done.reduce((s, p) => s + p.waitTime, 0) / done.length : 0
  const avgTAT  = done.length ? done.reduce((s, p) => s + p.turnaroundTime, 0) / done.length : 0
  const cpuUtil = time > 0 ? ((time - idleTicks) / time) * 100 : 0
  const throughput = done.length > 0 ? (done.length / time).toFixed(3) : 0

  return {
    gantt, log,
    metrics: { avgWait, avgTAT, cpuUtil, throughput: parseFloat(throughput), completedCount: done.length, idleTicks },
    totalTime: time,
    processes: procs,
    penaltyScore: Math.max(0, done.length * BONUS_PER_FAST_COMPLETE - idleTicks * PENALTY_PER_IDLE_TICK),
  }
}

// Manual-mode FCFS builder from a drag order
function manualSchedulerFn(orderedPids) {
  let idx = 0
  let lastPid = null
  return (readyQueue) => {
    if (readyQueue.length === 0) return null
    // Try to continue running last pid (non-preemptive)
    if (lastPid !== null && readyQueue.find(p => p.pid === lastPid)) {
      return lastPid
    }
    // Next from ordered list that's in ready queue
    while (idx < orderedPids.length) {
      const pid = orderedPids[idx]
      if (readyQueue.find(p => p.pid === pid)) { lastPid = pid; return pid }
      idx++
    }
    // fallback: FCFS
    const fallback = [...readyQueue].sort((a, b) => a.arrivalTime - b.arrivalTime)[0].pid
    lastPid = fallback
    return fallback
  }
}

// ─── Sub-components ────────────────────────────────────────────────────────

// Glowing process card (draggable)
function ProcessCard({ proc, isDragging = false, isRunning = false, inSocket = false }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.7, y: 20 }}
      animate={{
        opacity: 1, scale: isDragging ? 1.08 : 1, y: 0,
        boxShadow: isRunning
          ? `0 0 28px ${proc.color}cc, 0 0 60px ${proc.color}44`
          : inSocket
          ? `0 0 18px ${proc.color}88`
          : `0 0 10px ${proc.color}33`,
      }}
      exit={{ opacity: 0, scale: 0.5, y: -20 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      style={{
        background: `linear-gradient(135deg, rgba(2,12,12,0.95), ${proc.color}18)`,
        border: `1.5px solid ${proc.color}${isRunning ? 'ee' : inSocket ? '88' : '44'}`,
        borderRadius: 10,
        padding: inSocket ? '8px 14px' : '10px 14px',
        cursor: 'grab',
        userSelect: 'none',
        position: 'relative',
        overflow: 'hidden',
        minWidth: inSocket ? 80 : 100,
      }}
    >
      {/* Scanline shimmer */}
      {isRunning && (
        <motion.div
          animate={{ y: ['-100%', '200%'] }}
          transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
          style={{
            position: 'absolute', inset: 0,
            background: `linear-gradient(180deg, transparent 40%, ${proc.color}22 50%, transparent 60%)`,
            pointerEvents: 'none',
          }}
        />
      )}
      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 13, fontWeight: 900, color: proc.color, letterSpacing: 2 }}>
        {proc.name}
      </div>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#5eead488', marginTop: 3, lineHeight: 1.7 }}>
        Burst: {proc.burstTime}ms<br />
        Pri: {proc.priority}
      </div>
      {isRunning && (
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: '100%' }}
          transition={{ duration: proc.remainingTime || 1, ease: 'linear' }}
          style={{
            position: 'absolute', bottom: 0, left: 0, height: 2,
            background: `linear-gradient(90deg, ${proc.color}, ${proc.color}44)`,
          }}
        />
      )}
    </motion.div>
  )
}

// CPU Socket
function CPUSocket({ runningProc, idleTicks, socketGlow }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <motion.div
        animate={{
          boxShadow: runningProc
            ? [`0 0 30px ${runningProc.color}88, 0 0 80px ${runningProc.color}22`, `0 0 50px ${runningProc.color}cc, 0 0 100px ${runningProc.color}44`]
            : socketGlow
            ? ['0 0 20px #2dd4bf44', '0 0 40px #2dd4bf22']
            : ['0 0 10px #2dd4bf11', '0 0 20px #2dd4bf08'],
        }}
        transition={{ repeat: Infinity, duration: 1.2, repeatType: 'reverse' }}
        style={{
          width: 160, height: 160,
          border: `2px solid ${runningProc ? runningProc.color : '#2dd4bf'}${runningProc ? 'cc' : '33'}`,
          borderRadius: 18,
          background: runningProc
            ? `radial-gradient(circle at 50% 50%, ${runningProc.color}18, rgba(2,12,12,0.97))`
            : 'radial-gradient(circle at 50% 50%, rgba(45,212,191,0.06), rgba(2,12,12,0.97))',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          position: 'relative', overflow: 'hidden',
        }}
      >
        {/* Corner brackets */}
        {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(pos => (
          <div key={pos} style={{
            position: 'absolute',
            top: pos.includes('top') ? 8 : 'auto',
            bottom: pos.includes('bottom') ? 8 : 'auto',
            left: pos.includes('left') ? 8 : 'auto',
            right: pos.includes('right') ? 8 : 'auto',
            width: 14, height: 14,
            borderTop: pos.includes('top') ? `2px solid ${runningProc?.color ?? '#2dd4bf'}66` : 'none',
            borderBottom: pos.includes('bottom') ? `2px solid ${runningProc?.color ?? '#2dd4bf'}66` : 'none',
            borderLeft: pos.includes('left') ? `2px solid ${runningProc?.color ?? '#2dd4bf'}66` : 'none',
            borderRight: pos.includes('right') ? `2px solid ${runningProc?.color ?? '#2dd4bf'}66` : 'none',
          }} />
        ))}

        <div style={{
          fontFamily: "'Share Tech Mono',monospace",
          fontSize: 9, letterSpacing: 3, color: runningProc?.color ?? '#2dd4bf55',
          marginBottom: 8,
        }}>
          CPU SOCKET
        </div>

        <AnimatePresence mode="wait">
          {runningProc ? (
            <motion.div
              key={runningProc.pid}
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 20, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 25 }}
            >
              <ProcessCard proc={runningProc} isRunning inSocket />
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: '#2dd4bf22', letterSpacing: 2 }}
            >
              DROP HERE
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Idle warning */}
      <AnimatePresence>
        {idleTicks > 3 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{
              fontFamily: "'Share Tech Mono',monospace", fontSize: 9, letterSpacing: 2,
              color: '#f87171', padding: '4px 12px',
              border: '1px solid rgba(248,113,113,0.3)',
              borderRadius: 6, background: 'rgba(248,113,113,0.08)',
            }}
          >
            ⚠ IDLE PENALTY: −{idleTicks * PENALTY_PER_IDLE_TICK}pts
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Live-scrolling Gantt bar
function LiveGantt({ gantt, processes, maxShow = 60 }) {
  const colorMap = useMemo(() => {
    const m = {}
    processes.forEach(p => { m[p.pid] = p.color })
    return m
  }, [processes])

  const slices = gantt.slice(-maxShow)

  return (
    <div>
      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: '#2dd4bf55', letterSpacing: 3, marginBottom: 6 }}>
        ▸ GANTT CHART — LIVE
      </div>
      <div style={{
        display: 'flex', height: 28, borderRadius: 6,
        overflow: 'hidden', border: '1px solid rgba(45,212,191,0.1)',
        background: 'rgba(2,8,8,0.6)',
      }}>
        <AnimatePresence initial={false}>
          {slices.map((s, i) => (
            <motion.div
              key={`${s.time}`}
              initial={{ scaleY: 0, opacity: 0 }}
              animate={{ scaleY: 1, opacity: 1 }}
              transition={{ duration: 0.15 }}
              style={{
                flex: 1,
                background: s.pid ? (colorMap[s.pid] + 'bb') : 'rgba(255,255,255,0.03)',
                borderRight: '1px solid rgba(0,0,0,0.3)',
                minWidth: 0, transformOrigin: 'bottom',
              }}
              title={s.pid ? `T${s.time}: P${s.pid}` : `T${s.time}: idle`}
            />
          ))}
        </AnimatePresence>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        {slices.length > 0 && (
          <>
            <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#2dd4bf22' }}>
              T{slices[0].time}ms
            </span>
            <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#2dd4bf22' }}>
              T{slices[slices.length - 1].time + 1}ms
            </span>
          </>
        )}
      </div>
    </div>
  )
}

// Metric card
function MetricCard({ icon, label, value, unit, color = '#2dd4bf', trend = null }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{
        background: 'rgba(7,22,22,0.9)',
        border: `1px solid ${color}33`,
        borderRadius: 10, padding: '12px 14px',
        boxShadow: `0 0 20px ${color}0f`,
        flex: 1, minWidth: 0,
      }}
    >
      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 8, color: color + '77', letterSpacing: 3, marginBottom: 8 }}>
        {icon} {label}
      </div>
      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 24, fontWeight: 900, color, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#5eead455', marginTop: 4 }}>
        {unit}
      </div>
      {trend !== null && (
        <div style={{
          marginTop: 6, fontFamily: "'Share Tech Mono',monospace", fontSize: 8,
          color: trend < 0 ? '#34d399' : trend > 0 ? '#f87171' : '#5eead4',
        }}>
          {trend < 0 ? '▼' : trend > 0 ? '▲' : '—'} {Math.abs(trend).toFixed(1)}%
        </div>
      )}
    </motion.div>
  )
}

// Penalty Timer display
function PenaltyTimer({ idleTicks, penaltyScore, isRunning }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      background: 'rgba(7,22,22,0.85)',
      border: `1px solid ${idleTicks > 5 ? 'rgba(248,113,113,0.3)' : 'rgba(45,212,191,0.12)'}`,
      borderRadius: 10, padding: '10px 18px',
      transition: 'border-color 0.3s',
    }}>
      <div>
        <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 8, color: '#f8717177', letterSpacing: 3, marginBottom: 4 }}>
          ⏱ PENALTY TIMER
        </div>
        <motion.div
          animate={{ color: idleTicks > 5 ? '#f87171' : '#2dd4bf' }}
          style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 20, fontWeight: 900, lineHeight: 1 }}
        >
          -{idleTicks * PENALTY_PER_IDLE_TICK}
        </motion.div>
        <div style={{ fontFamily: 'monospace', fontSize: 8, color: '#5eead433', marginTop: 2 }}>{idleTicks} idle ticks</div>
      </div>
      <div style={{ width: 1, height: 36, background: 'rgba(45,212,191,0.1)' }} />
      <div>
        <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 8, color: '#34d39977', letterSpacing: 3, marginBottom: 4 }}>
          ◈ SCORE
        </div>
        <motion.div
          key={penaltyScore}
          initial={{ scale: 1.3 }}
          animate={{ scale: 1 }}
          style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 20, fontWeight: 900, color: '#34d399', lineHeight: 1 }}
        >
          {penaltyScore}
        </motion.div>
        <div style={{ fontFamily: 'monospace', fontSize: 8, color: '#5eead433', marginTop: 2 }}>points</div>
      </div>
      {isRunning && (
        <motion.div
          animate={{ opacity: [1, 0.2, 1] }}
          transition={{ repeat: Infinity, duration: 0.9 }}
          style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 10px #34d399' }}
        />
      )}
    </div>
  )
}

// Error overlay
function ErrorOverlay({ error, onDismiss }) {
  if (!error) return null
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'absolute', inset: 0, zIndex: 80,
        background: 'rgba(2,8,8,0.9)', backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <motion.div
        initial={{ scale: 0.85 }}
        animate={{ scale: 1 }}
        style={{
          background: 'rgba(10,18,18,0.98)',
          border: '1px solid rgba(248,113,113,0.4)',
          borderRadius: 14, padding: 28, maxWidth: 460, width: '90%',
          boxShadow: '0 0 60px rgba(248,113,113,0.12)',
        }}
      >
        <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: '#ef4444', letterSpacing: 3, marginBottom: 14 }}>
          ✗ {error.type?.toUpperCase().replace('_', ' ')} ERROR
        </div>
        <div style={{
          fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: '#fca5a5',
          lineHeight: 1.8, background: 'rgba(239,68,68,0.06)', borderRadius: 8,
          padding: '12px 14px', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {error.message}
        </div>
        {error.time !== undefined && (
          <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#ef444455', marginTop: 8 }}>
            at simulation time {error.time}ms
          </div>
        )}
        <button
          onClick={onDismiss}
          style={{
            marginTop: 18, width: '100%', padding: '9px',
            fontFamily: "'Share Tech Mono',monospace", fontSize: 10, letterSpacing: 3,
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            color: '#fca5a5', borderRadius: 8, cursor: 'pointer',
          }}
        >
          DISMISS
        </button>
      </motion.div>
    </motion.div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// CPUArena — main component
// ════════════════════════════════════════════════════════════════════════════
export default function CPUArena({ onClose }) {
  const mono = { fontFamily: "'JetBrains Mono','Share Tech Mono',monospace" }

  // ── Mode ──────────────────────────────────────────────────────────
  const [arenaMode, setArenaMode] = useState('manual') // 'manual' | 'coder'

  // ── Processes ────────────────────────────────────────────────────
  const [processes, setProcesses] = useState(() => makeProcesses(6))

  // ── Manual mode state ────────────────────────────────────────────
  const [queue, setQueue]     = useState([])  // Reorder list — waiting processes
  const [socketProc, setSocketProc] = useState(null)

  // ── Coder mode ───────────────────────────────────────────────────
  const [code, setCode] = useState(CODER_DEFAULT)

  // ── Simulation / playback ─────────────────────────────────────────
  const [simResult, setSimResult] = useState(null)
  const [playhead, setPlayhead]   = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playSpeed, setPlaySpeed] = useState(1)
  const playRef = useRef(null)

  // ── Params ───────────────────────────────────────────────────────
  const [processCount, setProcessCount] = useState(6)
  const [ioFreq, setIoFreq]             = useState(0)

  // ── Error ────────────────────────────────────────────────────────
  const [error, setError] = useState(null)

  // ── Live metrics ─────────────────────────────────────────────────
  const liveMetrics = useMemo(() => {
    if (!simResult) return null
    const ganttSoFar = simResult.gantt.slice(0, playhead + 1)
    const busyTicks = ganttSoFar.filter(g => g.pid !== null).length
    const idleTicks = ganttSoFar.filter(g => g.pid === null).length
    const doneProcs = simResult.processes.filter(p => p.completionTime !== null && p.completionTime <= playhead + 1)
    const avgWait = doneProcs.length ? doneProcs.reduce((s, p) => s + p.waitTime, 0) / doneProcs.length : 0
    const avgTAT  = doneProcs.length ? doneProcs.reduce((s, p) => s + p.turnaroundTime, 0) / doneProcs.length : 0
    const cpuUtil = (playhead + 1) > 0 ? (busyTicks / (playhead + 1)) * 100 : 0
    const throughput = (playhead + 1) > 0 ? (doneProcs.length / (playhead + 1)).toFixed(3) : 0
    const penaltyScore = Math.max(0, doneProcs.length * BONUS_PER_FAST_COMPLETE - idleTicks * PENALTY_PER_IDLE_TICK)
    return { avgWait, avgTAT, cpuUtil, throughput, idleTicks, penaltyScore, completedCount: doneProcs.length }
  }, [simResult, playhead])

  const currentGanttSlice = useMemo(() => {
    if (!simResult) return []
    return simResult.gantt.slice(0, playhead + 1)
  }, [simResult, playhead])

  const currentRunningPid = currentGanttSlice.length > 0
    ? currentGanttSlice[currentGanttSlice.length - 1].pid
    : null
  const currentRunningProc = currentRunningPid != null
    ? processes.find(p => p.pid === currentRunningPid)
    : null

  // ── Playback ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying || !simResult) return
    const interval = setInterval(() => {
      setPlayhead(ph => {
        if (ph >= simResult.totalTime - 1) { setIsPlaying(false); return ph }
        return ph + 1
      })
    }, 120 / playSpeed)
    playRef.current = interval
    return () => clearInterval(interval)
  }, [isPlaying, simResult, playSpeed])

  // ── Init queue when processes change (manual mode) ────────────────
  useEffect(() => {
    setQueue([...processes])
    setSocketProc(null)
  }, [processes])

  // ── Regenerate processes ─────────────────────────────────────────
  const regenerate = useCallback(() => {
    const procs = makeProcesses(processCount)
    setProcesses(procs)
    setSimResult(null)
    setPlayhead(0)
    setIsPlaying(false)
    setError(null)
  }, [processCount])

  // ── Run simulation ────────────────────────────────────────────────
  const runSim = useCallback(() => {
    setError(null)
    setSimResult(null)
    setPlayhead(0)
    setIsPlaying(false)

    setTimeout(() => {
      try {
        let schedulerFn
        if (arenaMode === 'coder') {
          // eslint-disable-next-line no-new-func
          const fn = new Function(`return (${code})`)()
          if (typeof fn !== 'function') throw { type: 'compile', message: 'Code must define a function.' }
          schedulerFn = fn
        } else {
          // Manual: use queue order as non-preemptive FCFS
          const orderedPids = queue.map(p => p.pid)
          schedulerFn = manualSchedulerFn(orderedPids)
        }
        const result = simulate(processes, schedulerFn, ioFreq)
        setSimResult(result)
        setIsPlaying(true)
      } catch (err) {
        setError(err?.type ? err : { type: 'runtime', message: String(err?.message ?? err) })
      }
    }, 20)
  }, [arenaMode, code, queue, processes, ioFreq])

  // ── Keyboard ─────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape' && !error) onClose()
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') runSim()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, runSim, error])

  // ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 350,
      background: '#020d0d',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>

      {/* ══ Header ════════════════════════════════════════════════ */}
      <div style={{
        flexShrink: 0, height: 52,
        display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px',
        background: 'linear-gradient(90deg,#041010,#071a1a)',
        borderBottom: '1px solid rgba(45,212,191,0.12)',
      }}>
        <button
          onClick={onClose}
          style={{ ...mono, fontSize: 10, color: '#2dd4bf55', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: 2, padding: '4px 8px', borderRadius: 4 }}
          onMouseOver={e => e.target.style.color = '#2dd4bf'}
          onMouseOut={e => e.target.style.color = '#2dd4bf55'}
        >← BACK</button>
        <div style={{ width: 1, height: 20, background: '#2dd4bf1a' }} />
        <div style={{ ...mono, fontSize: 14, fontWeight: 900, color: '#2dd4bf', letterSpacing: 4 }}>CPU ARENA</div>

        {/* Mode toggle */}
        <div style={{
          display: 'flex', borderRadius: 8, overflow: 'hidden',
          border: '1px solid rgba(45,212,191,0.2)', marginLeft: 16,
        }}>
          {[['manual', '◈ MANUAL'], ['coder', '⚡ CODER']].map(([m, label]) => (
            <button key={m} onClick={() => setArenaMode(m)} style={{
              ...mono, fontSize: 10, letterSpacing: 2, padding: '6px 18px',
              border: 'none', cursor: 'pointer', transition: 'all 0.2s',
              background: arenaMode === m ? 'rgba(45,212,191,0.18)' : 'transparent',
              color: arenaMode === m ? '#2dd4bf' : '#2dd4bf44',
            }}>{label}</button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Process count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...mono, fontSize: 9, color: '#2dd4bf44', letterSpacing: 2 }}>PROCS</span>
          <input
            type="range" min={3} max={10} step={1} value={processCount}
            onChange={e => setProcessCount(+e.target.value)}
            style={{ width: 70, accentColor: '#2dd4bf', cursor: 'pointer' }}
          />
          <span style={{ ...mono, fontSize: 10, color: '#2dd4bf' }}>{processCount}</span>
        </div>

        <button
          onClick={regenerate}
          style={{
            ...mono, fontSize: 10, letterSpacing: 2, padding: '6px 16px', borderRadius: 8,
            background: 'rgba(45,212,191,0.08)', border: '1px solid rgba(45,212,191,0.2)',
            color: '#2dd4bf88', cursor: 'pointer', transition: 'all 0.2s',
          }}
          onMouseOver={e => e.target.style.color = '#2dd4bf'}
          onMouseOut={e => e.target.style.color = '#2dd4bf88'}
        >↻ REGENERATE</button>

        <motion.button
          onClick={runSim}
          whileHover={{ scale: 1.04, boxShadow: '0 0 30px rgba(45,212,191,0.5)' }}
          whileTap={{ scale: 0.96 }}
          style={{
            ...mono, fontSize: 11, fontWeight: 700, letterSpacing: 3,
            padding: '8px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(90deg, #0f766e, #0d9488, #14b8a6)',
            color: '#fff', boxShadow: '0 0 20px rgba(13,148,136,0.4)',
          }}
        >▶ RUN</motion.button>
      </div>

      {/* ══ Body ═════════════════════════════════════════════════ */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', gap: 0 }}>

        {/* ── Left column: Arena ───────────────────────────────── */}
        <div style={{
          flexShrink: 0, width: 340,
          display: 'flex', flexDirection: 'column', gap: 10,
          padding: '14px 14px 14px 16px',
          borderRight: '1px solid rgba(45,212,191,0.08)',
          overflowY: 'auto',
        }}>

          <AnimatePresence mode="wait">
            {arenaMode === 'manual' ? (
              <motion.div key="manual"
                initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                {/* CPU Socket centered */}
                <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}>
                  <CPUSocket
                    runningProc={currentRunningProc}
                    idleTicks={liveMetrics?.idleTicks ?? 0}
                    socketGlow={!!simResult}
                  />
                </div>

                {/* Queue label */}
                <div style={{ ...mono, fontSize: 9, color: '#2dd4bf55', letterSpacing: 3 }}>
                  ▸ READY QUEUE — drag to reorder execution priority
                </div>

                {/* Draggable queue */}
                <Reorder.Group
                  axis="y"
                  values={queue}
                  onReorder={setQueue}
                  style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}
                >
                  <AnimatePresence>
                    {queue.map((proc, idx) => {
                      const isDone = simResult?.processes.find(p => p.pid === proc.pid)?.completionTime != null &&
                        (simResult?.processes.find(p => p.pid === proc.pid)?.completionTime ?? Infinity) <= (playhead + 1)
                      return (
                        <Reorder.Item key={proc.pid} value={proc}
                          style={{ listStyle: 'none', opacity: isDone ? 0.35 : 1, transition: 'opacity 0.3s' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ ...mono, fontSize: 10, color: '#2dd4bf33', width: 16, textAlign: 'right' }}>
                              {idx + 1}
                            </div>
                            <div style={{ flex: 1 }}>
                              <ProcessCard
                                proc={proc}
                                isRunning={currentRunningPid === proc.pid}
                              />
                            </div>
                            {isDone && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                style={{ ...mono, fontSize: 10, color: '#34d399' }}
                              >✓</motion.div>
                            )}
                          </div>
                        </Reorder.Item>
                      )
                    })}
                  </AnimatePresence>
                </Reorder.Group>

                <div style={{
                  ...mono, fontSize: 9, color: '#2dd4bf22', letterSpacing: 1,
                  padding: '8px 12px', borderRadius: 8,
                  border: '1px dashed rgba(45,212,191,0.08)',
                  lineHeight: 1.9,
                }}>
                  ↕ Drag to set your preferred execution order.<br/>
                  CPU will run each process non-preemptively.
                </div>
              </motion.div>
            ) : (
              <motion.div key="coder"
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}
              >
                <div style={{ ...mono, fontSize: 9, color: '#2dd4bf55', letterSpacing: 3 }}>
                  ▸ CODER MODE — CTRL+ENTER to run
                </div>
                <div style={{
                  flex: 1, minHeight: 360, borderRadius: 10, overflow: 'hidden',
                  border: '1px solid rgba(45,212,191,0.15)',
                  background: '#0d1a1a',
                }}>
                  <Editor
                    height="100%"
                    defaultLanguage="javascript"
                    value={code}
                    onChange={v => setCode(v ?? '')}
                    theme="vs-dark"
                    options={{
                      fontSize: 12,
                      fontFamily: "'JetBrains Mono','Fira Code',monospace",
                      fontLigatures: true,
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      padding: { top: 12 },
                      lineNumbers: 'on',
                      cursorBlinking: 'phase',
                      wordWrap: 'on',
                      tabSize: 2,
                      bracketPairColorization: { enabled: true },
                    }}
                  />
                </div>

                {/* Process reference */}
                <div style={{
                  background: 'rgba(7,22,22,0.8)',
                  border: '1px solid rgba(45,212,191,0.1)',
                  borderRadius: 8, padding: '10px 12px',
                }}>
                  <div style={{ ...mono, fontSize: 8, color: '#2dd4bf44', letterSpacing: 2, marginBottom: 8 }}>▸ PROCESSES</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {processes.map(p => (
                      <div key={p.pid} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color, boxShadow: `0 0 5px ${p.color}66` }} />
                        <span style={{ ...mono, fontSize: 9, color: '#a5f3fc' }}>{p.name}</span>
                        <span style={{ ...mono, fontSize: 8, color: '#5eead444' }}>B:{p.burstTime}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Right column: Dashboard ───────────────────────────── */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', gap: 12,
          padding: '14px 16px', overflowY: 'auto', minWidth: 0,
        }}>

          {/* Penalty Timer + Score */}
          <PenaltyTimer
            idleTicks={liveMetrics?.idleTicks ?? 0}
            penaltyScore={liveMetrics?.penaltyScore ?? 0}
            isRunning={isPlaying}
          />

          {/* Metrics row */}
          <div style={{ display: 'flex', gap: 10 }}>
            <MetricCard
              icon="⏱" label="AVG WAIT TIME"
              value={liveMetrics ? liveMetrics.avgWait.toFixed(1) : '—'}
              unit="milliseconds" color="#2dd4bf"
            />
            <MetricCard
              icon="↺" label="AVG TURNAROUND"
              value={liveMetrics ? liveMetrics.avgTAT.toFixed(1) : '—'}
              unit="milliseconds" color="#34d399"
            />
            <MetricCard
              icon="◈" label="CPU UTIL"
              value={liveMetrics ? liveMetrics.cpuUtil.toFixed(1) + '%' : '—'}
              unit="of elapsed time" color="#60a5fa"
            />
            <MetricCard
              icon="⚡" label="THROUGHPUT"
              value={liveMetrics ? liveMetrics.throughput : '—'}
              unit="proc/ms" color="#fbbf24"
            />
          </div>

          {/* Live Gantt */}
          <div style={{
            background: 'rgba(7,22,22,0.85)',
            border: '1px solid rgba(45,212,191,0.1)',
            borderRadius: 10, padding: '14px 16px',
          }}>
            <LiveGantt gantt={currentGanttSlice} processes={processes} />
          </div>

          {/* Playback controls */}
          {simResult && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: 'rgba(7,22,22,0.7)',
              border: '1px solid rgba(45,212,191,0.1)',
              borderRadius: 10, padding: '10px 16px',
            }}>
              <button
                onClick={() => setIsPlaying(p => !p)}
                style={{
                  ...mono, fontSize: 10, letterSpacing: 2, padding: '6px 18px', borderRadius: 8,
                  background: isPlaying ? 'rgba(45,212,191,0.15)' : 'rgba(45,212,191,0.08)',
                  border: '1px solid rgba(45,212,191,0.25)',
                  color: '#2dd4bf', cursor: 'pointer', transition: 'all 0.2s',
                }}
              >{isPlaying ? '⏸ PAUSE' : '▶ PLAY'}</button>

              <button
                onClick={() => { setPlayhead(0); setIsPlaying(false) }}
                style={{
                  ...mono, fontSize: 10, letterSpacing: 2, padding: '6px 14px', borderRadius: 8,
                  background: 'rgba(45,212,191,0.05)', border: '1px solid rgba(45,212,191,0.15)',
                  color: '#2dd4bf55', cursor: 'pointer',
                }}
              >⏮</button>

              <input
                type="range" min={0} max={simResult.totalTime - 1} step={1}
                value={playhead}
                onChange={e => { setPlayhead(+e.target.value); setIsPlaying(false) }}
                style={{ flex: 1, accentColor: '#2dd4bf', cursor: 'pointer' }}
              />
              <span style={{ ...mono, fontSize: 10, color: '#2dd4bf55', minWidth: 50 }}>
                T{playhead}ms
              </span>

              {/* Speed */}
              <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(45,212,191,0.15)' }}>
                {[1, 2, 5].map(s => (
                  <button key={s} onClick={() => setPlaySpeed(s)} style={{
                    ...mono, fontSize: 9, padding: '4px 10px', border: 'none', cursor: 'pointer',
                    background: playSpeed === s ? 'rgba(45,212,191,0.2)' : 'transparent',
                    color: playSpeed === s ? '#2dd4bf' : '#2dd4bf33', letterSpacing: 1,
                  }}>{s}x</button>
                ))}
              </div>
            </div>
          )}

          {/* Process timeline grid */}
          {simResult && (
            <div style={{
              background: 'rgba(7,22,22,0.85)',
              border: '1px solid rgba(45,212,191,0.08)',
              borderRadius: 10, padding: '14px 16px',
            }}>
              <div style={{ ...mono, fontSize: 9, color: '#2dd4bf55', letterSpacing: 3, marginBottom: 12 }}>
                ▸ PROCESS RESULTS
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {simResult.processes.map((p, idx) => {
                  const isDone = p.completionTime != null && p.completionTime <= playhead + 1
                  const origProc = processes.find(op => op.pid === p.pid)
                  return (
                    <motion.div
                      key={p.pid}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: isDone ? 1 : 0.5, x: 0 }}
                      transition={{ delay: idx * 0.04 }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '7px 12px', borderRadius: 8,
                        background: isDone ? `${origProc?.color ?? '#2dd4bf'}0a` : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${isDone ? (origProc?.color ?? '#2dd4bf') + '33' : 'rgba(45,212,191,0.06)'}`,
                        transition: 'all 0.3s',
                      }}
                    >
                      <div style={{ width: 9, height: 9, borderRadius: 2, background: origProc?.color ?? '#2dd4bf', flexShrink: 0 }} />
                      <span style={{ ...mono, fontSize: 11, color: '#a5f3fc', minWidth: 28 }}>{p.name}</span>
                      <span style={{ ...mono, fontSize: 9, color: '#5eead466' }}>Burst:{p.burstTime}</span>
                      <span style={{ ...mono, fontSize: 9, color: '#5eead466' }}>Arr:{p.arrivalTime}</span>
                      <div style={{ flex: 1 }} />
                      {isDone && (
                        <>
                          <span style={{ ...mono, fontSize: 9, color: '#34d399' }}>WT:{p.waitTime}ms</span>
                          <span style={{ ...mono, fontSize: 9, color: '#2dd4bf' }}>TAT:{p.turnaroundTime}ms</span>
                          <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            style={{ ...mono, fontSize: 10, color: '#34d399' }}
                          >✓</motion.span>
                        </>
                      )}
                    </motion.div>
                  )
                })}
              </div>
            </div>
          )}

          {/* I/O freq slider */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: 'rgba(7,22,22,0.5)',
            border: '1px solid rgba(45,212,191,0.07)',
            borderRadius: 8, padding: '8px 14px',
          }}>
            <span style={{ ...mono, fontSize: 8, color: '#2dd4bf44', letterSpacing: 2, whiteSpace: 'nowrap' }}>I/O FREQ</span>
            <input
              type="range" min={0} max={50} step={5} value={ioFreq}
              onChange={e => setIoFreq(+e.target.value)}
              style={{ flex: 1, accentColor: '#fbbf24', cursor: 'pointer' }}
            />
            <span style={{ ...mono, fontSize: 10, color: '#fbbf24', minWidth: 30 }}>{ioFreq}%</span>
          </div>

          {/* Simulation log */}
          {simResult && simResult.log.length > 0 && (
            <div style={{
              background: 'rgba(4,12,12,0.9)',
              border: '1px solid rgba(45,212,191,0.07)',
              borderRadius: 10, padding: '12px 14px',
              maxHeight: 180, overflowY: 'auto',
              scrollbarWidth: 'thin', scrollbarColor: '#2dd4bf18 transparent',
            }}>
              <div style={{ ...mono, fontSize: 8, color: '#2dd4bf44', letterSpacing: 3, marginBottom: 8 }}>
                ▸ SIMULATION LOG ({simResult.log.length} events)
              </div>
              {simResult.log.slice(0, 80).map((entry, i) => (
                <div key={i} style={{
                  ...mono, fontSize: 10, lineHeight: 1.8,
                  color: entry.type === 'done' ? '#34d399'
                    : entry.type === 'idle' ? '#2dd4bf22'
                    : entry.type === 'io'   ? '#fbbf24'
                    : '#a5f3fc88',
                }}>
                  <span style={{ opacity: 0.4, marginRight: 6 }}>
                    {entry.type === 'done' ? '✓' : entry.type === 'idle' ? '—' : entry.type === 'io' ? '⇄' : '›'}
                  </span>
                  [T{String(entry.time).padStart(3, '0')}] {entry.msg}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Error overlay */}
      <AnimatePresence>
        {error && <ErrorOverlay error={error} onDismiss={() => setError(null)} />}
      </AnimatePresence>
    </div>
  )
}
