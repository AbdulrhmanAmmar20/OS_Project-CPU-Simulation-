import { useState, useEffect, useCallback, useRef } from 'react'
import {
  runSimulation, getStatesAtTime,
  ALGO, DEMO_PROCESSES, generateRandomProcess, PROCESS_COLORS, ALGO_NAMES
} from './engine/scheduler.js'
import ControlPanel from './components/ControlPanel.jsx'
import ProcessZones  from './components/ProcessZones.jsx'
import NeonGanttChart from './components/NeonGanttChart.jsx'
import PerformanceGauges from './components/PerformanceGauges.jsx'
import GamificationHUD  from './components/GamificationHUD.jsx'
import SystemConsole    from './components/SystemConsole.jsx'
import TimeSlider       from './components/TimeSlider.jsx'
import AlgorithmBook    from './components/AlgorithmBook.jsx'
import AlgorithmSandbox from './components/AlgorithmSandbox.jsx'
import CPUArena         from './components/CPUArena.jsx'
import VirtualDesktop   from './components/VirtualDesktop.jsx'

// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  // ── Dismiss the HTML shell loader on first mount ──────────────────
  useEffect(() => { window.__dismissLoader?.() }, [])

  // ── Process definitions ──────────────────────────────────────────
  const [processes, setProcesses] = useState(DEMO_PROCESSES)
  const [nextPid, setNextPid]     = useState(DEMO_PROCESSES.length)

  // ── Algorithm config ─────────────────────────────────────────────
  const [algo, setAlgo]       = useState(ALGO.FCFS)
  const [quantum, setQuantum] = useState(2)

  // ── Simulation results ───────────────────────────────────────────
  const [result,   setResult]   = useState(null)
  const [aiResult, setAiResult] = useState(null)

  // ── Time travel ──────────────────────────────────────────────────
  const [playhead,   setPlayhead]   = useState(0)
  const [isPlaying,  setIsPlaying]  = useState(false)
  const [playSpeed,  setPlaySpeed]  = useState(1)   // 1x, 2x, 5x
  const playTimerRef = useRef(null)

  // ── Algorithm book overlay ─────────────────────────────────────
  const [showBook,    setShowBook]    = useState(false)
  const [showSandbox, setShowSandbox] = useState(false)
  const [showArena,   setShowArena]   = useState(false)
  const [showDesktop, setShowDesktop] = useState(false)

  // ── Mode ─────────────────────────────────────────────────────────
  const [mode, setMode]         = useState('auto')   // 'auto' | 'manual'
  const [manualOrder, setManualOrder] = useState([]) // pids in user order

  // ── Manual duel state ────────────────────────────────────────────
  const [duelResult, setDuelResult] = useState(null) // {human, ai}

  // ── Derived: states at playhead ─────────────────────────────────
  const statesAtTime = result
    ? getStatesAtTime(result.processes, result.stateChanges, playhead)
    : []

  // ─── Run simulation ──────────────────────────────────────────────
  const run = useCallback(() => {
    if (!processes.length) return
    const src = mode === 'manual' && manualOrder.length === processes.length
      ? manualOrder.map((pid, i) => ({ ...processes.find(p => p.pid === pid), priority: i }))
      : processes

    const res   = runSimulation(src, algo, quantum)
    const aiRes = runSimulation(src, ALGO.SJF, quantum)
    setResult(res)
    setAiResult(aiRes)
    setPlayhead(0)
    setIsPlaying(false)
    if (mode === 'manual') setDuelResult({ human: res, ai: aiRes })
  }, [processes, algo, quantum, mode, manualOrder])

  // ─── Playback engine ─────────────────────────────────────────────
  useEffect(() => {
    if (playTimerRef.current) clearInterval(playTimerRef.current)
    if (!isPlaying || !result) return

    playTimerRef.current = setInterval(() => {
      setPlayhead(t => {
        const next = t + playSpeed
        if (next >= result.totalTime) { setIsPlaying(false); return result.totalTime }
        return next
      })
    }, 300)
    return () => clearInterval(playTimerRef.current)
  }, [isPlaying, result, playSpeed])

  // ─── Process management helpers ──────────────────────────────────
  const addProcess = useCallback((proc) => {
    const p = { ...proc, pid: nextPid }
    setProcesses(ps => [...ps, p])
    setNextPid(n => n + 1)
    setManualOrder(mo => [...mo, nextPid])
  }, [nextPid])

  const removeProcess = useCallback((pid) => {
    setProcesses(ps => ps.filter(p => p.pid !== pid))
    setManualOrder(mo => mo.filter(id => id !== pid))
  }, [])

  const clearAll = useCallback(() => {
    setProcesses([]); setNextPid(0); setManualOrder([])
    setResult(null);  setAiResult(null); setDuelResult(null)
  }, [])

  const loadDemo = useCallback(() => {
    setProcesses(DEMO_PROCESSES)
    setNextPid(DEMO_PROCESSES.length)
    setManualOrder(DEMO_PROCESSES.map(p => p.pid))
    setResult(null); setAiResult(null); setDuelResult(null)
  }, [])

  const addRandom = useCallback(() => {
    const p = generateRandomProcess(nextPid)
    setProcesses(ps => [...ps, p])
    setNextPid(n => n + 1)
    setManualOrder(mo => [...mo, nextPid])
  }, [nextPid])

  const colorOf = (pid) => PROCESS_COLORS[pid % PROCESS_COLORS.length]

  // ─── Ready queue length at playhead (for system health) ──────────
  const readyCount = statesAtTime.filter(p => p.currentState === 'READY').length

  // ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-cyber-900 grid-bg font-['Inter']">

      {/* ── Scanline overlay ───────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden opacity-[0.03]">
        <div className="w-full h-1 bg-white animate-scanline absolute" />
      </div>

      {/* ═══════════════════  HEADER  ══════════════════════════════ */}
      <header className="flex-none h-14 glass border-0 border-b border-violet-900/40 flex items-center px-5 gap-6 z-10">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center text-xs font-black shadow-neon-violet">
            OS
          </div>
          <div>
            <div className="text-sm font-black tracking-wide neon-text-violet">OS-QUEST</div>
            <div className="text-[9px] text-cyber-200 tracking-[0.2em] uppercase">AI Scheduling Arena</div>
          </div>
        </div>

        <div className="h-6 w-px bg-violet-900/60" />

        {/* Status indicators */}
        <div className="flex items-center gap-4">
          <StatusDot label="Engine" active color="green" />
          <StatusDot label={`${ALGO_NAMES[algo]}`} active color="violet" />
          {algo === ALGO.RR && <StatusDot label={`Q=${quantum}ms`} active color="cyan" />}
        </div>

        <div className="flex-1" />

        {/* Mode toggle */}
        <div className="flex bg-cyber-800/80 rounded-lg p-0.5 gap-0.5 border border-cyber-600/40">
          {['auto', 'manual'].map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`btn-cyber py-1 px-3 text-xs transition-all ${
                mode === m
                  ? 'bg-violet-700 text-white shadow-neon-violet'
                  : 'text-cyber-200 hover:text-white'
              }`}
            >
              {m === 'auto' ? 'Auto' : 'Duel'}
            </button>
          ))}
        </div>

        {/* Algorithm book button */}
        <button
          onClick={() => setShowBook(true)}
          className="btn-cyber py-2 px-4 text-sm border border-teal-700/50 text-teal-300 hover:text-teal-100 hover:border-teal-500/80 hover:bg-teal-900/30 transition-all"
          title="Algorithm Reference Guide"
        >
          📖 Guide
        </button>

        {/* Sandbox button */}
        <button
          onClick={() => setShowSandbox(true)}
          className="btn-cyber py-2 px-4 text-sm border border-teal-700/50 text-teal-300 hover:text-teal-100 hover:border-teal-500/80 hover:bg-teal-900/30 transition-all"
          title="Algorithm Sandbox"
        >
          ⚡ Sandbox
        </button>

        {/* Arena button */}
        <button
          onClick={() => setShowArena(true)}
          className="btn-cyber py-2 px-4 text-sm border border-teal-700/50 text-teal-300 hover:text-teal-100 hover:border-teal-500/80 hover:bg-teal-900/30 transition-all"
          title="CPU Arena — Manual &amp; Coder Mode"
        >
          ⚔ Arena
        </button>

        {/* Virtual Desktop button */}
        <button
          onClick={() => setShowDesktop(true)}
          className="btn-cyber py-2 px-4 text-sm border border-teal-700/50 text-teal-300 hover:text-teal-100 hover:border-teal-500/80 hover:bg-teal-900/30 transition-all"
          title="Virtual Desktop Environment"
        >
          🖥 Desktop
        </button>

        {/* Run button */}
        <button
          onClick={run}
          disabled={!processes.length}
          className="btn-cyber btn-primary px-5 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {mode === 'manual' ? 'Fight AI' : 'Run'}
        </button>
      </header>

      {/* ═══════════════════  MAIN BODY  ════════════════════════════ */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Left Sidebar: Control Panel ─────────────────────────── */}
        <aside className="flex-none w-72 overflow-y-auto border-r border-violet-900/30 glass">
          <ControlPanel
            processes={processes}
            algo={algo} setAlgo={setAlgo}
            quantum={quantum} setQuantum={setQuantum}
            mode={mode}
            manualOrder={manualOrder} setManualOrder={setManualOrder}
            onAdd={addProcess}
            onRemove={removeProcess}
            onClear={clearAll}
            onLoadDemo={loadDemo}
            onRandom={addRandom}
            colorOf={colorOf}
          />
        </aside>

        {/* ── Main Dashboard ─────────────────────────────────────── */}
        <main className="flex-1 flex flex-col overflow-hidden p-3 gap-3">

          {/* Row 1: Process State Zones */}
          <div className="flex-none">
            <ProcessZones
              statesAtTime={statesAtTime}
              processes={processes}
              colorOf={colorOf}
              result={result}
              playhead={playhead}
            />
          </div>

          {/* Row 2: Gantt Chart */}
          <div className="flex-none h-44">
            <NeonGanttChart
              result={result}
              playhead={playhead}
              colorOf={colorOf}
            />
          </div>

          {/* Row 3: Gauges + HUD */}
          <div className="flex gap-3 min-h-0" style={{ height: '140px' }}>
            <div className="flex-none w-64">
              <PerformanceGauges result={result} playhead={playhead} />
            </div>
            <div className="flex-1 min-w-0">
              <GamificationHUD
                result={result}
                aiResult={aiResult}
                readyCount={readyCount}
                algo={algo}
                duelResult={mode === 'manual' ? duelResult : null}
                colorOf={colorOf}
              />
            </div>
          </div>

          {/* Row 4: Console + Time Slider */}
          <div className="flex gap-3" style={{ height: '130px' }}>
            <div className="flex-1 min-w-0">
              <SystemConsole logs={result?.logs ?? []} playhead={playhead} />
            </div>
            <div className="flex-none w-64">
              <TimeSlider
                totalTime={result?.totalTime ?? 0}
                playhead={playhead}
                setPlayhead={setPlayhead}
                isPlaying={isPlaying}
                setIsPlaying={setIsPlaying}
                playSpeed={playSpeed}
                setPlaySpeed={setPlaySpeed}
                hasResult={!!result}
              />
            </div>
          </div>

        </main>
      </div>

      {/* ── Algorithm Book Overlay ─────────────────────────────────── */}
      {showBook && <AlgorithmBook onClose={() => setShowBook(false)} />}
      {/* ── Algorithm Sandbox Overlay ─────────────────────────── */}
      {showSandbox && <AlgorithmSandbox onClose={() => setShowSandbox(false)} />}
      {showArena   && <CPUArena         onClose={() => setShowArena(false)}   />}
      {showDesktop && <VirtualDesktop   onClose={() => setShowDesktop(false)} />}
    </div>
  )
}

// ── Small helper component ─────────────────────────────────────────
function StatusDot({ label, active, color }) {
  const colors = {
    green:  'bg-emerald-400 shadow-neon-green',
    violet: 'bg-violet-400 shadow-neon-violet',
    cyan:   'bg-cyan-400 shadow-neon-cyan',
    amber:  'bg-amber-400 shadow-neon-amber',
  }
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-1.5 h-1.5 rounded-full ${active ? colors[color] : 'bg-cyber-400'} ${active ? 'animate-pulse' : ''}`} />
      <span className="text-[10px] font-mono text-cyber-200 uppercase tracking-wider">{label}</span>
    </div>
  )
}
