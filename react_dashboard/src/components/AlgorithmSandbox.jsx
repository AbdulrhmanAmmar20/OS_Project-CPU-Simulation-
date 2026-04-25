import { useState, useRef, useCallback, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import { motion, AnimatePresence } from 'framer-motion'

// ── Process colors ────────────────────────────────────────────────
const COLORS = [
  '#2dd4bf', '#34d399', '#60a5fa', '#f472b6', '#fbbf24',
  '#a78bfa', '#fb923c', '#22d3ee', '#86efac', '#f9a8d4',
  '#c084fc', '#67e8f9',
]

// ── Default editor template ───────────────────────────────────────
const DEFAULT_CODE = `function customScheduler(readyQueue, currentTime) {
  // readyQueue: Array of process objects:
  //   { pid, name, arrivalTime, burstTime, remainingTime, priority }
  // currentTime: number — current simulation clock (ms)
  // Return: PID (number) to run next, or null for idle CPU

  if (readyQueue.length === 0) return null;

  // ── Example: Shortest Remaining Time First (SRTF) ──
  let best = readyQueue[0];
  for (const p of readyQueue) {
    if (p.remainingTime < best.remainingTime) best = p;
  }
  return best.pid;

  // ── Try other strategies: ──
  // FCFS:     return readyQueue.sort((a,b) => a.arrivalTime - b.arrivalTime)[0].pid;
  // Priority: return readyQueue.sort((a,b) => a.priority - b.priority)[0].pid;
  // Random:   return readyQueue[Math.floor(Math.random()*readyQueue.length)].pid;
}`

// ════════════════════════════════════════════════════════════════════
// Sandbox simulation engine
// ════════════════════════════════════════════════════════════════════
function buildProcesses({ arrivalRate, burstMin, burstMax, processCount }) {
  const procs = []
  for (let i = 0; i < processCount; i++) {
    const burst = burstMin + Math.floor(Math.random() * (burstMax - burstMin + 1))
    const arrival = Math.floor(i * (1 / Math.max(arrivalRate, 0.1)) + Math.random() * 2)
    procs.push({
      pid: i + 1,
      name: `P${i + 1}`,
      color: COLORS[i % COLORS.length],
      arrivalTime: arrival,
      burstTime: burst,
      remainingTime: burst,
      priority: Math.floor(Math.random() * 5) + 1,
      waitTime: 0,
      turnaroundTime: 0,
      completionTime: null,
    })
  }
  return procs
}

function deepCopy(procs) { return procs.map(p => ({ ...p })) }

function simWithFn(procs, schedulerFn, ioFreq) {
  const pCopy = deepCopy(procs)
  const gantt = []
  const logs = []
  const completed = new Set()
  const ioBlocked = new Map() // pid -> unblock time
  let time = 0
  const maxTime = pCopy.reduce((s, p) => s + p.burstTime, 0) * 4 + 30

  while (completed.size < pCopy.length && time < maxTime) {
    // Unblock I/O processes
    for (const [pid, unblockTime] of ioBlocked) {
      if (time >= unblockTime) ioBlocked.delete(pid)
    }

    const readyQueue = pCopy
      .filter(p =>
        p.arrivalTime <= time &&
        !completed.has(p.pid) &&
        !ioBlocked.has(p.pid) &&
        p.remainingTime > 0
      )
      .map(p => ({
        pid: p.pid, name: p.name, arrivalTime: p.arrivalTime,
        burstTime: p.burstTime, remainingTime: p.remainingTime,
        priority: p.priority,
      }))

    let selectedPid = null
    try {
      selectedPid = schedulerFn(readyQueue, time)
    } catch (e) {
      throw { type: 'runtime', message: e.message, time }
    }

    if (selectedPid !== null && !readyQueue.find(p => p.pid === selectedPid)) {
      throw {
        type: 'invalid_pid',
        message: `Returned PID ${selectedPid} is not in the ready queue at time ${time}ms.\nReady queue: [${readyQueue.map(p => `P${p.pid}`).join(', ') || 'empty'}]`,
        time,
      }
    }

    gantt.push({ time, pid: selectedPid })

    if (selectedPid !== null) {
      const proc = pCopy.find(p => p.pid === selectedPid)
      proc.remainingTime--

      // Random I/O interrupt
      if (ioFreq > 0 && proc.remainingTime > 0 && Math.random() < ioFreq / 100) {
        const ioTime = 1 + Math.floor(Math.random() * 3)
        ioBlocked.set(proc.pid, time + 1 + ioTime)
        logs.push({ time, type: 'io', message: `P${proc.pid} → I/O wait (${ioTime}ms). Blocked until T${time + 1 + ioTime}` })
      } else if (proc.remainingTime === 0) {
        proc.completionTime = time + 1
        proc.turnaroundTime = proc.completionTime - proc.arrivalTime
        proc.waitTime = proc.turnaroundTime - proc.burstTime
        if (proc.waitTime < 0) proc.waitTime = 0
        completed.add(proc.pid)
        logs.push({ time, type: 'done', message: `P${proc.pid} finished — TAT=${proc.turnaroundTime}ms  WT=${proc.waitTime}ms` })
      } else {
        logs.push({
          time, type: 'run',
          message: `Custom algorithm selected P${proc.pid} (rem:${proc.remainingTime}ms, queue:[${readyQueue.map(p => `P${p.pid}(${p.remainingTime})`).join(',')}])`,
        })
      }
    } else {
      const lastLog = logs[logs.length - 1]
      if (!lastLog || lastLog.type !== 'idle' || lastLog.time < time - 1) {
        logs.push({ time, type: 'idle', message: 'CPU idle — no ready processes' })
      }
    }

    // Accumulate wait for non-running ready processes
    pCopy.forEach(p => {
      if (
        p.arrivalTime <= time && !completed.has(p.pid) &&
        !ioBlocked.has(p.pid) && p.pid !== selectedPid && p.remainingTime > 0
      ) {
        p.waitTime = (p.waitTime || 0) + 1
      }
    })

    time++
  }

  const doneProcs = pCopy.filter(p => completed.has(p.pid))
  const avgWait = doneProcs.length ? doneProcs.reduce((s, p) => s + p.waitTime, 0) / doneProcs.length : 0
  const avgTAT  = doneProcs.length ? doneProcs.reduce((s, p) => s + p.turnaroundTime, 0) / doneProcs.length : 0
  const busyTicks = gantt.filter(g => g.pid !== null).length
  const cpuUtil = time > 0 ? (busyTicks / time) * 100 : 0

  return {
    gantt, logs,
    metrics: { avgWait, avgTAT, cpuUtil, completedCount: doneProcs.length },
    totalTime: time,
    processes: pCopy,
  }
}

function runCustomSim(code, procs, ioFreq) {
  let fn
  try {
    // eslint-disable-next-line no-new-func
    fn = new Function(`return (${code})`)()
  } catch (e) {
    throw { type: 'compile', message: e.message }
  }
  if (typeof fn !== 'function') {
    throw { type: 'compile', message: 'Code must define a function (e.g. function customScheduler(...) {...})' }
  }
  return simWithFn(procs, fn, ioFreq)
}

function runFCFSBaseline(procs) {
  const fcfs = (rq) => rq.length
    ? [...rq].sort((a, b) => a.arrivalTime - b.arrivalTime)[0].pid
    : null
  return simWithFn(procs, fcfs, 0)
}

// ════════════════════════════════════════════════════════════════════
// Sub-components
// ════════════════════════════════════════════════════════════════════
function GanttBar({ gantt, processes, label, totalTime, accentColor }) {
  const colorMap = {}
  processes.forEach(p => { colorMap[p.pid] = p.color })
  const maxShow = Math.min(totalTime, 70)
  const slices = gantt.slice(0, maxShow)
  const showLabels = maxShow <= 35

  return (
    <div>
      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: accentColor, letterSpacing: 3, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ display: 'flex', height: 34, borderRadius: 5, overflow: 'hidden', border: '1px solid rgba(45,212,191,0.12)' }}>
        {slices.map((s, i) => (
          <motion.div
            key={i}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: i * 0.006, duration: 0.12 }}
            style={{
              flex: 1,
              background: s.pid ? (colorMap[s.pid] + 'bb') : 'rgba(255,255,255,0.03)',
              borderRight: '1px solid rgba(0,0,0,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 8, color: '#fffc', fontFamily: 'monospace',
              minWidth: 0, transformOrigin: 'bottom',
              cursor: 'default',
            }}
            title={s.pid ? `T${s.time}ms: P${s.pid}` : `T${s.time}ms: idle`}
          >
            {showLabels ? (s.pid ? `P${s.pid}` : '·') : ''}
          </motion.div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        {[0, Math.floor(maxShow * 0.25), Math.floor(maxShow * 0.5), Math.floor(maxShow * 0.75), maxShow].map(t => (
          <span key={t} style={{ fontFamily: 'monospace', fontSize: 9, color: '#2dd4bf33' }}>{t}ms</span>
        ))}
      </div>
    </div>
  )
}

function MetricCard({ label, value, unit, color, icon, baseline, lowerIsBetter }) {
  const hasDiff = baseline !== undefined && baseline !== null
  const diff = hasDiff ? (parseFloat(value) - parseFloat(baseline)) : null
  const better = hasDiff && diff !== null ? (lowerIsBetter ? diff < 0 : diff > 0) : null
  const pct = hasDiff && parseFloat(baseline) > 0 ? ((diff / parseFloat(baseline)) * 100).toFixed(1) : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: 'rgba(7,22,22,0.85)',
        border: `1px solid ${color}33`,
        borderRadius: 10,
        padding: '14px 16px',
        boxShadow: `0 0 18px ${color}1a`,
      }}
    >
      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: color + '88', letterSpacing: 3, marginBottom: 8 }}>
        {icon} {label}
      </div>
      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 26, fontWeight: 900, color, lineHeight: 1, letterSpacing: 1 }}>
        {value}
      </div>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#5eead4', opacity: 0.6, marginTop: 4 }}>
        {unit}
      </div>
      {pct !== null && (
        <div style={{
          marginTop: 8, padding: '3px 8px', borderRadius: 4, display: 'inline-block',
          background: better ? 'rgba(52,211,153,0.15)' : diff === 0 ? 'rgba(45,212,191,0.1)' : 'rgba(248,113,113,0.15)',
          fontFamily: "'Share Tech Mono',monospace", fontSize: 9, letterSpacing: 1,
          color: better ? '#34d399' : diff === 0 ? '#2dd4bf' : '#f87171',
        }}>
          {better ? '▲ ' : diff < 0 && !lowerIsBetter ? '▼ ' : diff > 0 && lowerIsBetter ? '▲ ' : '▼ '}
          {diff > 0 ? '+' : ''}{pct}% vs FCFS
        </div>
      )}
    </motion.div>
  )
}

function ParamSlider({ label, paramKey, min, max, step, fmt, params, setParams }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: '#5eead4bb', letterSpacing: 1 }}>{label}</span>
        <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: '#2dd4bf', letterSpacing: 1 }}>{fmt(params[paramKey])}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step}
        value={params[paramKey]}
        onChange={e => setParams(p => ({ ...p, [paramKey]: parseFloat(e.target.value) }))}
        style={{ width: '100%', accentColor: '#2dd4bf', cursor: 'pointer', height: 4 }}
      />
    </div>
  )
}

function ErrorModal({ error, onClose }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 60,
      background: 'rgba(2,8,8,0.88)', backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <motion.div
        initial={{ scale: 0.82, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        style={{
          background: 'rgba(10,18,18,0.98)',
          border: '1px solid rgba(239,68,68,0.45)',
          borderRadius: 14,
          padding: 28, maxWidth: 500, width: '90%',
          boxShadow: '0 0 50px rgba(239,68,68,0.15), inset 0 1px 0 rgba(239,68,68,0.1)',
        }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 8px #ef4444' }} />
          <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 12, color: '#ef4444', letterSpacing: 3 }}>
            EXECUTION ERROR — {error.type?.toUpperCase().replace('_', ' ')}
          </span>
        </div>
        <div style={{ height: 1, background: 'rgba(239,68,68,0.18)', marginBottom: 16 }} />
        <div style={{
          fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5, color: '#fca5a5',
          lineHeight: 1.85, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          background: 'rgba(239,68,68,0.06)', borderRadius: 8, padding: '12px 14px',
        }}>
          {error.message}
        </div>
        {error.time !== undefined && (
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: '#ef444466', marginTop: 10, letterSpacing: 2 }}>
            OCCURRED AT SIMULATION TIME: {error.time}ms
          </div>
        )}
        <div style={{
          marginTop: 14, padding: '10px 14px', borderRadius: 8,
          background: 'rgba(45,212,191,0.05)', border: '1px solid rgba(45,212,191,0.1)',
          fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#5eead4', opacity: 0.8, lineHeight: 1.75,
        }}>
          {error.type === 'compile' && '→ Check your function syntax. The code must be valid JavaScript and define customScheduler.'}
          {error.type === 'runtime' && '→ Your scheduler threw an exception during execution. Check for null/undefined access or division by zero.'}
          {error.type === 'invalid_pid' && '→ Your scheduler returned a PID that is not in the ready queue at that moment. Only return PIDs from the readyQueue array.'}
        </div>
        <button
          onClick={onClose}
          style={{
            marginTop: 18, width: '100%', padding: '10px',
            fontFamily: "'Share Tech Mono',monospace", fontSize: 11, letterSpacing: 3,
            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)',
            color: '#fca5a5', borderRadius: 8, cursor: 'pointer', transition: 'all 0.2s',
          }}
          onMouseOver={e => e.target.style.background = 'rgba(239,68,68,0.2)'}
          onMouseOut={e => e.target.style.background = 'rgba(239,68,68,0.12)'}
        >
          DISMISS
        </button>
      </motion.div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// Main AlgorithmSandbox component
// ════════════════════════════════════════════════════════════════════
export default function AlgorithmSandbox({ onClose }) {
  const [code, setCode]       = useState(DEFAULT_CODE)
  const [params, setParams]   = useState({
    arrivalRate: 0.5,
    burstMin: 3,
    burstMax: 10,
    ioFreq: 10,
    processCount: 7,
  })
  const [result,   setResult]   = useState(null)
  const [baseline, setBaseline] = useState(null)
  const [running,  setRunning]  = useState(false)
  const [error,    setError]    = useState(null)
  const [logs,     setLogs]     = useState([])
  const [processes, setProcesses] = useState(null)

  const consoleEndRef = useRef(null)
  const editorRef     = useRef(null)

  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const handleRun = useCallback(() => {
    setRunning(true)
    setError(null)
    setResult(null)
    setBaseline(null)
    setLogs([
      { type: 'sys', text: '> Compiling custom scheduler...' },
    ])

    // defer to next tick so UI updates before compute
    setTimeout(() => {
      try {
        const procs = buildProcesses(params)
        setProcesses(procs)
        setLogs(l => [...l, { type: 'sys', text: `> Generated ${procs.length} processes. Running simulation...` }])

        const customResult = runCustomSim(code, procs, params.ioFreq)
        const baselineResult = runFCFSBaseline(procs)

        setLogs(l => [
          ...l,
          { type: 'sys', text: `> Simulation complete. Total time: ${customResult.totalTime}ms` },
          { type: 'sep' },
          ...customResult.logs.slice(0, 100).map(log => ({ type: log.type, text: `[T${String(log.time).padStart(3, '0')}ms] ${log.message}` })),
        ])
        setResult(customResult)
        setBaseline(baselineResult)
      } catch (err) {
        setError(err)
        setLogs(l => [...l,
          { type: 'sep' },
          { type: 'err', text: `> ${err.type?.toUpperCase()}: ${err.message}` },
        ])
      }
      setRunning(false)
    }, 30)
  }, [code, params])

  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleRun() }
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [handleRun, onClose])

  const mono = { fontFamily: "'JetBrains Mono','Share Tech Mono',monospace" }

  const logColor = (type) => ({
    sys: '#5eead4', err: '#f87171', done: '#34d399',
    idle: '#2dd4bf2a', io: '#fbbf24', run: '#a5f3fc',
  }[type] ?? '#a5f3fc')

  const logIcon = (type) => ({
    sys: '»', err: '✗', done: '✓', idle: '—', io: '⇄', run: '›',
  }[type] ?? '›')

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: '#020d0d',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* ══ Header ══════════════════════════════════════════════════ */}
      <div style={{
        flexShrink: 0, height: 54,
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '0 20px',
        background: 'linear-gradient(90deg, #041010 0%, #071a1a 100%)',
        borderBottom: '1px solid rgba(45,212,191,0.12)',
      }}>
        <button
          onClick={onClose}
          style={{ ...mono, fontSize: 11, color: '#2dd4bf77', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: 2, padding: '4px 8px', borderRadius: 4 }}
          onMouseOver={e => e.target.style.color = '#2dd4bf'}
          onMouseOut={e => e.target.style.color = '#2dd4bf77'}
        >
          ← BACK
        </button>
        <div style={{ width: 1, height: 22, background: '#2dd4bf1a' }} />
        <div style={{ ...mono, fontSize: 14, fontWeight: 900, color: '#2dd4bf', letterSpacing: 4 }}>
          ALGORITHM SANDBOX
        </div>
        <div style={{ ...mono, fontSize: 9, color: '#5eead444', letterSpacing: 3 }}>
          KFUPM CPU SIMULATOR
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ ...mono, fontSize: 9, color: '#2dd4bf33', letterSpacing: 2 }}>CTRL+ENTER TO RUN</span>
        <motion.button
          onClick={handleRun}
          disabled={running}
          whileHover={running ? {} : { scale: 1.04, boxShadow: '0 0 30px rgba(13,148,136,0.7)' }}
          whileTap={running ? {} : { scale: 0.96 }}
          style={{
            ...mono, fontSize: 12, fontWeight: 700, letterSpacing: 3,
            padding: '8px 26px', borderRadius: 8, border: 'none',
            background: running
              ? 'rgba(13,148,136,0.15)'
              : 'linear-gradient(90deg, #0f766e, #0d9488, #14b8a6)',
            color: running ? '#2dd4bf44' : '#fff',
            cursor: running ? 'not-allowed' : 'pointer',
            boxShadow: running ? 'none' : '0 0 20px rgba(13,148,136,0.45)',
            transition: 'all 0.2s',
          }}
        >
          {running ? '⟳ RUNNING...' : '▶  RUN / DEBUG'}
        </motion.button>
      </div>

      {/* ══ Main body ════════════════════════════════════════════════ */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: 12, gap: 12 }}>

        {/* ── Left: Parameters + process legend ── */}
        <div style={{ flexShrink: 0, width: 215, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
          {/* Parameters panel */}
          <div style={{
            background: 'rgba(7,22,22,0.85)',
            border: '1px solid rgba(45,212,191,0.12)',
            borderRadius: 10, padding: '14px 16px',
          }}>
            <div style={{ ...mono, fontSize: 9, color: '#2dd4bf', letterSpacing: 3, marginBottom: 16 }}>▸ PARAMETERS</div>
            <ParamSlider label="Arrival Rate" paramKey="arrivalRate" min={0.1} max={2} step={0.1} fmt={v => `${v.toFixed(1)}/tick`} params={params} setParams={setParams} />
            <ParamSlider label="Burst Min"    paramKey="burstMin"    min={1}   max={10} step={1} fmt={v => `${v}ms`}         params={params} setParams={setParams} />
            <ParamSlider label="Burst Max"    paramKey="burstMax"    min={2}   max={20} step={1} fmt={v => `${v}ms`}         params={params} setParams={setParams} />
            <ParamSlider label="I/O Frequency" paramKey="ioFreq"     min={0}   max={50} step={5} fmt={v => `${v}%`}         params={params} setParams={setParams} />
            <ParamSlider label="Process Count" paramKey="processCount" min={3} max={12} step={1} fmt={v => `${v}`}          params={params} setParams={setParams} />
          </div>

          {/* Process legend */}
          <AnimatePresence>
            {processes && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  background: 'rgba(7,22,22,0.85)',
                  border: '1px solid rgba(45,212,191,0.12)',
                  borderRadius: 10, padding: '14px 16px',
                }}
              >
                <div style={{ ...mono, fontSize: 9, color: '#2dd4bf', letterSpacing: 3, marginBottom: 12 }}>▸ PROCESSES</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {processes.map((p, idx) => {
                    const done = result?.processes?.find(rp => rp.pid === p.pid)
                    return (
                      <motion.div
                        key={p.pid}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.04 }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                      >
                        <div style={{ width: 9, height: 9, borderRadius: 2, background: p.color, flexShrink: 0, boxShadow: `0 0 6px ${p.color}66` }} />
                        <span style={{ ...mono, fontSize: 10, color: '#a5f3fc' }}>{p.name}</span>
                        <span style={{ ...mono, fontSize: 9, color: '#5eead444', marginLeft: 'auto' }}>B:{p.burstTime}</span>
                        {done?.completionTime && (
                          <span style={{ ...mono, fontSize: 9, color: '#34d39977' }}>W:{done.waitTime}</span>
                        )}
                      </motion.div>
                    )
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Hint box */}
          <div style={{
            background: 'rgba(45,212,191,0.04)',
            border: '1px solid rgba(45,212,191,0.08)',
            borderRadius: 8, padding: '10px 12px',
          }}>
            <div style={{ ...mono, fontSize: 9, color: '#2dd4bf55', letterSpacing: 2, lineHeight: 1.8 }}>
              Write your scheduler in the editor. It receives the ready queue and current time, and must return a PID to run.
            </div>
          </div>
        </div>

        {/* ── Center: Monaco editor + console ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          {/* Monaco editor */}
          <div style={{
            flex: '0 0 58%',
            background: '#0d1a1a',
            border: '1px solid rgba(45,212,191,0.15)',
            borderRadius: 10, overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }}>
            {/* Editor titlebar */}
            <div style={{
              flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 14px',
              background: 'linear-gradient(90deg, #071414, #0a1c1c)',
              borderBottom: '1px solid rgba(45,212,191,0.1)',
            }}>
              <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#ef4444' }} />
              <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#f59e0b' }} />
              <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#22c55e' }} />
              <div style={{ width: 1, height: 14, background: '#2dd4bf1a', margin: '0 4px' }} />
              <span style={{ ...mono, fontSize: 10, color: '#2dd4bf55', letterSpacing: 2 }}>scheduler.js</span>
              <span style={{ ...mono, fontSize: 9, color: '#2dd4bf33', marginLeft: 6, letterSpacing: 1 }}>— custom algorithm editor</span>
            </div>
            <div style={{ flex: 1 }}>
              <Editor
                height="100%"
                defaultLanguage="javascript"
                value={code}
                onChange={v => setCode(v ?? '')}
                onMount={editor => { editorRef.current = editor }}
                theme="vs-dark"
                options={{
                  fontSize: 13,
                  fontFamily: "'JetBrains Mono','Fira Code',monospace",
                  fontLigatures: true,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  lineNumbers: 'on',
                  renderLineHighlight: 'gutter',
                  padding: { top: 14, bottom: 14 },
                  cursorBlinking: 'phase',
                  smoothScrolling: true,
                  tabSize: 2,
                  wordWrap: 'on',
                  overviewRulerLanes: 0,
                  scrollbar: { vertical: 'auto', horizontal: 'hidden' },
                  bracketPairColorization: { enabled: true },
                  suggest: { showKeywords: true },
                }}
              />
            </div>
          </div>

          {/* Investigator console */}
          <div style={{
            flex: 1, background: '#020c0c',
            border: '1px solid rgba(45,212,191,0.12)',
            borderRadius: 10, overflow: 'hidden',
            display: 'flex', flexDirection: 'column', minHeight: 0,
          }}>
            <div style={{
              flexShrink: 0, padding: '7px 14px',
              background: 'linear-gradient(90deg, #041010, #071616)',
              borderBottom: '1px solid rgba(45,212,191,0.08)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ ...mono, fontSize: 9, color: '#2dd4bf', letterSpacing: 3 }}>▸ INVESTIGATOR CONSOLE</span>
              <div style={{ width: 1, height: 12, background: '#2dd4bf22' }} />
              <span style={{ ...mono, fontSize: 9, color: '#2dd4bf33' }}>{logs.filter(l => l.type !== 'sep').length} entries</span>
              {running && (
                <motion.span
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ repeat: Infinity, duration: 0.8 }}
                  style={{ ...mono, fontSize: 9, color: '#2dd4bf', marginLeft: 'auto' }}
                >
                  ● LIVE
                </motion.span>
              )}
            </div>
            <div style={{
              flex: 1, overflowY: 'auto', padding: '10px 14px',
              display: 'flex', flexDirection: 'column', gap: 1,
              scrollbarWidth: 'thin', scrollbarColor: '#2dd4bf18 transparent',
            }}>
              <AnimatePresence initial={false}>
                {logs.map((log, i) =>
                  log.type === 'sep' ? (
                    <div key={i} style={{ height: 1, background: 'rgba(45,212,191,0.06)', margin: '5px 0' }} />
                  ) : (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.12 }}
                      style={{ ...mono, fontSize: 11, lineHeight: 1.75, color: logColor(log.type) }}
                    >
                      <span style={{ opacity: 0.5, marginRight: 6 }}>{logIcon(log.type)}</span>
                      {log.text}
                    </motion.div>
                  )
                )}
              </AnimatePresence>
              <div ref={consoleEndRef} />
            </div>
          </div>
        </div>

        {/* ── Right: Metric scorecards ── */}
        <div style={{ flexShrink: 0, width: 195, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
          <div style={{ ...mono, fontSize: 9, color: '#2dd4bf55', letterSpacing: 3 }}>▸ SCORECARD</div>

          {result ? (
            <>
              <MetricCard
                label="AVG WAIT TIME"
                value={result.metrics.avgWait.toFixed(1)}
                unit="milliseconds"
                color="#2dd4bf" icon="⏱"
                baseline={baseline?.metrics.avgWait.toFixed(1)}
                lowerIsBetter
              />
              <MetricCard
                label="AVG TURNAROUND"
                value={result.metrics.avgTAT.toFixed(1)}
                unit="milliseconds"
                color="#34d399" icon="↺"
                baseline={baseline?.metrics.avgTAT.toFixed(1)}
                lowerIsBetter
              />
              <MetricCard
                label="CPU UTILIZATION"
                value={result.metrics.cpuUtil.toFixed(1) + '%'}
                unit="of total time"
                color="#60a5fa" icon="◈"
                baseline={baseline?.metrics.cpuUtil.toFixed(1) + '%'}
                lowerIsBetter={false}
              />
              <MetricCard
                label="COMPLETED"
                value={`${result.metrics.completedCount}/${params.processCount}`}
                unit="processes"
                color="#f472b6" icon="✓"
              />
            </>
          ) : (
            <div style={{
              background: 'rgba(7,22,22,0.5)',
              border: '1px dashed rgba(45,212,191,0.1)',
              borderRadius: 10, padding: 20,
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 10, minHeight: 220,
            }}>
              <div style={{ fontSize: 30, opacity: 0.2 }}>◈</div>
              <div style={{ ...mono, fontSize: 9, color: '#2dd4bf33', letterSpacing: 2, textAlign: 'center', lineHeight: 2 }}>
                RUN SIMULATION<br/>TO SEE METRICS
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══ Bottom: Gantt comparison ═════════════════════════════════ */}
      <div style={{
        flexShrink: 0,
        background: 'rgba(4,14,14,0.95)',
        borderTop: '1px solid rgba(45,212,191,0.1)',
        padding: '14px 20px 16px',
      }}>
        <div style={{ ...mono, fontSize: 9, color: '#2dd4bf55', letterSpacing: 4, marginBottom: 14 }}>
          ▸ GANTT CHART — CUSTOM ALGORITHM vs FCFS BASELINE
        </div>

        {result && baseline && processes ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <GanttBar gantt={result.gantt}   processes={processes} label="YOUR ALGORITHM" totalTime={result.totalTime}   accentColor="#2dd4bf" />
            <GanttBar gantt={baseline.gantt} processes={processes} label="FCFS BASELINE"  totalTime={baseline.totalTime} accentColor="#5eead455" />
            {/* Color legend */}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 2 }}>
              {processes.map(p => (
                <div key={p.pid} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: p.color + 'bb' }} />
                  <span style={{ ...mono, fontSize: 9, color: '#5eead488' }}>{p.name}</span>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }} />
                <span style={{ ...mono, fontSize: 9, color: '#5eead433' }}>IDLE</span>
              </div>
            </div>
          </div>
        ) : (
          <div style={{
            height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px dashed rgba(45,212,191,0.08)', borderRadius: 8,
          }}>
            <span style={{ ...mono, fontSize: 10, color: '#2dd4bf1a', letterSpacing: 4 }}>
              RUN SIMULATION TO SEE GANTT CHART
            </span>
          </div>
        )}
      </div>

      {/* ══ Error modal ══════════════════════════════════════════════ */}
      {error && <ErrorModal error={error} onClose={() => setError(null)} />}
    </div>
  )
}
