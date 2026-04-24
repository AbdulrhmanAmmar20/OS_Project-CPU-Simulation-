import { useState } from 'react'
import { ALGO, ALGO_NAMES } from '../engine/scheduler.js'

const ALGO_LIST = [
  { value: ALGO.FCFS,     label: 'FCFS',          desc: 'First Come First Served' },
  { value: ALGO.SJF,      label: 'SJF (AI)',       desc: 'Shortest Job First — AI predicted' },
  { value: ALGO.SRTF,     label: 'SRTF (AI)',      desc: 'Preemptive SJF — AI predicted' },
  { value: ALGO.RR,       label: 'Round Robin',    desc: 'Time-sliced scheduling' },
  { value: ALGO.PRIORITY, label: 'Priority',       desc: 'Lower number = higher priority' },
]

export default function ControlPanel({
  processes, algo, setAlgo, quantum, setQuantum,
  mode, manualOrder, setManualOrder,
  onAdd, onRemove, onClear, onLoadDemo, onRandom, colorOf
}) {
  const [form, setForm] = useState({
    arrival:   '0',
    cpuBursts: '6, 3',
    ioBursts:  '4',
    priority:  '1',
  })
  const [formError, setFormError] = useState('')

  const handleAdd = () => {
    const cpuArr = form.cpuBursts.split(',').map(s => parseInt(s.trim())).filter(n => n > 0)
    if (!cpuArr.length) { setFormError('At least one CPU burst required'); return }
    const ioArr = form.ioBursts.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n))
    const bursts = cpuArr.map((cpu, i) => ({
      cpu,
      io: i < cpuArr.length - 1 ? (ioArr[i] ?? 2) : 0
    }))
    onAdd({
      priority:    parseInt(form.priority) || 1,
      arrivalTime: parseInt(form.arrival)  || 0,
      bursts,
      alpha: 0.5,
    })
    setFormError('')
  }

  // Drag-and-drop reordering for manual mode
  const dragPid = { current: null }
  const handleDragStart = (pid) => { dragPid.current = pid }
  const handleDrop = (targetPid) => {
    if (dragPid.current === null || dragPid.current === targetPid) return
    setManualOrder(order => {
      const newOrder = [...order]
      const fromIdx  = newOrder.indexOf(dragPid.current)
      const toIdx    = newOrder.indexOf(targetPid)
      newOrder.splice(fromIdx, 1)
      newOrder.splice(toIdx, 0, dragPid.current)
      return newOrder
    })
    dragPid.current = null
  }

  const displayOrder = mode === 'manual' && manualOrder.length
    ? manualOrder.map(pid => processes.find(p => p.pid === pid)).filter(Boolean)
    : processes

  return (
    <div className="p-3 flex flex-col gap-3 h-full">

      {/* ── Section: Algorithm ─────────────────────────────────── */}
      <section>
        <SectionLabel>Algorithm</SectionLabel>
        <div className="space-y-1">
          {ALGO_LIST.map(a => (
            <button
              key={a.value}
              onClick={() => setAlgo(a.value)}
              className={`w-full text-left px-3 py-2 rounded-lg border transition-all text-xs ${
                algo === a.value
                  ? 'bg-violet-900/50 border-violet-500/60 text-violet-200 shadow-neon-violet'
                  : 'border-cyber-500/30 text-cyber-200 hover:border-violet-700/50 hover:bg-cyber-700/40'
              }`}
            >
              <div className="font-mono font-semibold">{a.label}</div>
              <div className="text-[10px] text-cyber-300 mt-0.5">{a.desc}</div>
            </button>
          ))}
        </div>
        {algo === ALGO.RR && (
          <div className="mt-2">
            <label className="text-[10px] text-cyber-200 uppercase tracking-wider font-mono">
              Time Quantum (ms)
            </label>
            <input
              type="number" min={1} max={50}
              value={quantum}
              onChange={e => setQuantum(Math.max(1, parseInt(e.target.value) || 1))}
              className="input-cyber mt-1"
            />
          </div>
        )}
      </section>

      <Divider />

      {/* ── Section: Add Process ──────────────────────────────── */}
      <section>
        <SectionLabel>Add Process</SectionLabel>
        <div className="grid grid-cols-2 gap-1.5">
          <Field label="Arrival (ms)">
            <input type="number" min={0} value={form.arrival}
              onChange={e => setForm(f => ({ ...f, arrival: e.target.value }))}
              className="input-cyber" />
          </Field>
          <Field label="Priority">
            <input type="number" min={1} max={10} value={form.priority}
              onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
              className="input-cyber" />
          </Field>
          <Field label="CPU Bursts (ms, csv)" full>
            <input type="text" value={form.cpuBursts} placeholder="6, 3"
              onChange={e => setForm(f => ({ ...f, cpuBursts: e.target.value }))}
              className="input-cyber" />
          </Field>
          <Field label="I/O Bursts (ms, csv)" full>
            <input type="text" value={form.ioBursts} placeholder="4"
              onChange={e => setForm(f => ({ ...f, ioBursts: e.target.value }))}
              className="input-cyber" />
          </Field>
        </div>
        {formError && (
          <p className="text-red-400 text-[10px] mt-1 font-mono">{formError}</p>
        )}
        <div className="flex gap-1.5 mt-2">
          <button className="btn-cyber btn-primary flex-1 text-xs py-1.5" onClick={handleAdd}>
            + Add
          </button>
          <button className="btn-cyber btn-cyan flex-1 text-xs py-1.5" onClick={onRandom}>
            Random
          </button>
        </div>
        <div className="flex gap-1.5 mt-1">
          <button className="btn-cyber btn-ghost flex-1 text-xs py-1.5" onClick={onLoadDemo}>
            Demo
          </button>
          <button className="btn-cyber btn-danger flex-1 text-xs py-1.5" onClick={onClear}>
            Clear
          </button>
        </div>
      </section>

      <Divider />

      {/* ── Section: Process List ─────────────────────────────── */}
      <section className="flex-1 overflow-hidden flex flex-col">
        <SectionLabel>
          {mode === 'manual' ? 'Queue Order (drag to reorder)' : `Processes (${processes.length})`}
        </SectionLabel>
        <div className="flex-1 overflow-y-auto space-y-1 pr-0.5">
          {displayOrder.length === 0 && (
            <p className="text-cyber-300 text-[11px] font-mono text-center py-4">
              No processes. Load demo or add manually.
            </p>
          )}
          {displayOrder.map((p, idx) => {
            const c = colorOf(p.pid)
            const burstStr = p.bursts.map(b => b.cpu + (b.io ? `+I${b.io}` : '')).join('→')
            return (
              <div
                key={p.pid}
                draggable={mode === 'manual'}
                onDragStart={() => handleDragStart(p.pid)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => handleDrop(p.pid)}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-all ${
                  mode === 'manual' ? 'cursor-grab active:cursor-grabbing' : ''
                } bg-cyber-800/50 border-cyber-600/30 hover:border-violet-700/40 group`}
              >
                {mode === 'manual' && (
                  <span className="text-[10px] font-mono text-cyber-300 w-3">{idx + 1}</span>
                )}
                {/* Color dot */}
                <div
                  className="w-2 h-2 rounded-full flex-none"
                  style={{ background: c.hex, boxShadow: `0 0 6px ${c.hex}88` }}
                />
                <span className="font-mono font-bold text-xs" style={{ color: c.hex }}>
                  P{p.pid}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-mono text-slate-400 truncate">{burstStr}</div>
                  <div className="text-[9px] text-cyber-300">@{p.arrivalTime}ms · pri:{p.priority}</div>
                </div>
                <button
                  onClick={() => onRemove(p.pid)}
                  className="opacity-0 group-hover:opacity-100 text-red-500/70 hover:text-red-400 text-xs transition-opacity"
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

// ── Small helpers ──────────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <p className="text-[10px] uppercase tracking-[0.15em] text-cyber-200 font-mono mb-1.5">
      {children}
    </p>
  )
}
function Divider() {
  return <div className="h-px bg-gradient-to-r from-transparent via-violet-900/40 to-transparent" />
}
function Field({ label, children, full }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <label className="text-[10px] text-cyber-200 uppercase tracking-wider font-mono block mb-0.5">
        {label}
      </label>
      {children}
    </div>
  )
}
