/**
 * VirtualDesktop.jsx
 * Full-screen virtual OS environment with:
 *  - Desktop icons → draggable/resizable windows
 *  - Taskbar dock at bottom
 *  - Persistent CPU Hardware HUD on the right
 *  - Live pulse monitor, active processes, resource gauges
 *  - Event-driven C-Engine notifications on every action
 *  - Background kernel Gantt even with no windows open
 */

import {
  useState, useEffect, useRef, useCallback, useMemo, useReducer
} from 'react'
import { motion, AnimatePresence, useAnimation } from 'framer-motion'

// ─── App registry ──────────────────────────────────────────────────────────
const APPS = [
  {
    id: 'simulator',
    label: 'OS-Quest\nSimulator',
    icon: '🖥',
    color: '#2dd4bf',
    desc: 'CPU scheduling simulation',
  },
  {
    id: 'sandbox',
    label: 'Algorithm\nSandbox',
    icon: '⚡',
    color: '#60a5fa',
    desc: 'Write & test scheduler code',
  },
  {
    id: 'tutor',
    label: 'RAG Tutor',
    icon: '🤖',
    color: '#f472b6',
    desc: 'AI-powered algorithm guide',
  },
  {
    id: 'investigation',
    label: 'Process\nInvestigation',
    icon: '🔬',
    color: '#fbbf24',
    desc: 'Deep-dive process analysis',
  },
  {
    id: 'terminal',
    label: 'Terminal',
    icon: '⌨',
    color: '#34d399',
    desc: 'System terminal emulator',
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: '⚙',
    color: '#a78bfa',
    desc: 'System configuration',
  },
]

// ─── Kernel background processes ──────────────────────────────────────────
const KERNEL_PROCS = [
  { pid: 0, name: 'kernel',   color: '#2dd4bf', burst: 3 },
  { pid: 1, name: 'sched',    color: '#60a5fa', burst: 2 },
  { pid: 2, name: 'net',      color: '#34d399', burst: 2 },
  { pid: 3, name: 'display',  color: '#f472b6', burst: 4 },
  { pid: 4, name: 'idle',     color: '#5eead433', burst: 6 },
]

// ─── Event types for the C-Engine sidebar ─────────────────────────────────
let _evtId = 0
function makeEvent(type, detail, color = '#2dd4bf') {
  return { id: ++_evtId, time: Date.now(), type, detail, color }
}

// ─── Window state reducer ─────────────────────────────────────────────────
function windowsReducer(state, action) {
  switch (action.type) {
    case 'OPEN': {
      if (state.find(w => w.id === action.app.id)) {
        // Un-minimize and bring to front
        return state.map(w => w.id === action.app.id
          ? { ...w, minimized: false, z: Date.now() }
          : w
        )
      }
      const idx = state.length
      return [...state, {
        id: action.app.id,
        app: action.app,
        x: 80 + idx * 36,
        y: 60 + idx * 28,
        w: 640,
        h: 420,
        minimized: false,
        z: Date.now(),
      }]
    }
    case 'CLOSE':
      return state.filter(w => w.id !== action.id)
    case 'MINIMIZE':
      return state.map(w => w.id === action.id ? { ...w, minimized: true } : w)
    case 'FOCUS':
      return state.map(w => w.id === action.id ? { ...w, z: Date.now() } : w)
    case 'MOVE':
      return state.map(w => w.id === action.id ? { ...w, x: action.x, y: action.y } : w)
    case 'RESIZE':
      return state.map(w => w.id === action.id
        ? { ...w, w: Math.max(340, action.w), h: Math.max(260, action.h) }
        : w
      )
    default:
      return state
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────
function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi) }

// ════════════════════════════════════════════════════════════════════
// Sub-components
// ════════════════════════════════════════════════════════════════════

// ── Desktop icon ──────────────────────────────────────────────────
function DesktopIcon({ app, onOpen }) {
  const [hovered, setHovered] = useState(false)
  return (
    <motion.div
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onDoubleClick={() => onOpen(app)}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.92 }}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 8, cursor: 'pointer', padding: '12px 10px', borderRadius: 14,
        background: hovered ? `${app.color}14` : 'transparent',
        border: `1px solid ${hovered ? app.color + '44' : 'transparent'}`,
        boxShadow: hovered ? `0 0 28px ${app.color}33` : 'none',
        transition: 'all 0.2s',
        userSelect: 'none',
        width: 96,
      }}
    >
      <motion.div
        animate={{ filter: hovered ? `drop-shadow(0 0 12px ${app.color})` : 'none' }}
        transition={{ duration: 0.2 }}
        style={{ fontSize: 40, lineHeight: 1 }}
      >
        {app.icon}
      </motion.div>
      <div style={{
        fontFamily: "'Share Tech Mono',monospace",
        fontSize: 10, letterSpacing: 1, color: hovered ? app.color : '#a5f3fc',
        textAlign: 'center', lineHeight: 1.5,
        whiteSpace: 'pre-line',
        textShadow: hovered ? `0 0 10px ${app.color}88` : 'none',
        transition: 'all 0.2s',
      }}>
        {app.label}
      </div>
    </motion.div>
  )
}

// ── Window frame ──────────────────────────────────────────────────
function WindowFrame({ win, dispatch, onEvent, children }) {
  const dragRef   = useRef(null)
  const resizeRef = useRef(null)

  // Drag title bar
  const onMouseDownDrag = useCallback((e) => {
    if (e.button !== 0) return
    dispatch({ type: 'FOCUS', id: win.id })
    const startX = e.clientX - win.x
    const startY = e.clientY - win.y

    const onMove = (mv) => {
      dispatch({ type: 'MOVE', id: win.id,
        x: clamp(mv.clientX - startX, 0, window.innerWidth - win.w),
        y: clamp(mv.clientY - startY, 0, window.innerHeight - 80 - win.h),
      })
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      onEvent(makeEvent('DRAG', `Moved ${win.app.label.replace('\n', ' ')}`, win.app.color))
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [win, dispatch, onEvent])

  // Resize handle (bottom-right corner)
  const onMouseDownResize = useCallback((e) => {
    e.stopPropagation()
    if (e.button !== 0) return
    const startX = e.clientX, startY = e.clientY
    const startW = win.w, startH = win.h

    const onMove = (mv) => {
      dispatch({ type: 'RESIZE', id: win.id,
        w: startW + (mv.clientX - startX),
        h: startH + (mv.clientY - startY),
      })
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      onEvent(makeEvent('RESIZE', `Resized ${win.app.label.replace('\n', ' ')}`, '#a78bfa'))
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [win, dispatch, onEvent])

  return (
    <motion.div
      key={win.id}
      initial={{ scale: 0.82, opacity: 0, y: 30 }}
      animate={win.minimized
        ? { scale: 0.3, opacity: 0, y: 60, transition: { duration: 0.25 } }
        : { scale: 1, opacity: 1, y: 0, transition: { type: 'spring', stiffness: 380, damping: 30 } }
      }
      exit={{ scale: 0.7, opacity: 0, y: 20, transition: { duration: 0.2 } }}
      onMouseDown={() => dispatch({ type: 'FOCUS', id: win.id })}
      style={{
        position: 'absolute',
        left: win.x, top: win.y,
        width: win.w, height: win.h,
        zIndex: win.minimized ? -1 : win.z,
        display: win.minimized ? 'none' : 'flex',
        flexDirection: 'column',
        borderRadius: 14,
        overflow: 'hidden',
        border: `1px solid ${win.app.color}44`,
        boxShadow: `0 8px 60px rgba(0,0,0,0.7), 0 0 0 1px ${win.app.color}22, inset 0 1px 0 ${win.app.color}22`,
        background: 'rgba(4,14,14,0.82)',
        backdropFilter: 'blur(24px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
        pointerEvents: win.minimized ? 'none' : 'all',
      }}
    >
      {/* Title bar */}
      <div
        ref={dragRef}
        onMouseDown={onMouseDownDrag}
        style={{
          flexShrink: 0, height: 38,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '0 12px',
          background: `linear-gradient(90deg, ${win.app.color}18, rgba(4,14,14,0.6))`,
          borderBottom: `1px solid ${win.app.color}22`,
          cursor: 'move',
          userSelect: 'none',
        }}
      >
        {/* Traffic lights */}
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={() => {
            dispatch({ type: 'CLOSE', id: win.id })
            onEvent(makeEvent('CLOSE', `Closed ${win.app.label.replace('\n', ' ')}`, '#ef4444'))
          }}
          style={{
            width: 13, height: 13, borderRadius: '50%',
            background: '#ef4444', border: 'none', cursor: 'pointer',
            boxShadow: '0 0 6px #ef444488', flexShrink: 0,
          }}
          title="Close"
        />
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={() => {
            dispatch({ type: 'MINIMIZE', id: win.id })
            onEvent(makeEvent('MINIMIZE', `Minimized ${win.app.label.replace('\n', ' ')}`, '#f59e0b'))
          }}
          style={{
            width: 13, height: 13, borderRadius: '50%',
            background: '#f59e0b', border: 'none', cursor: 'pointer',
            boxShadow: '0 0 6px #f59e0b88', flexShrink: 0,
          }}
          title="Minimize"
        />
        <div style={{ width: 13, height: 13, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e88', flexShrink: 0 }} />

        <div style={{ width: 1, height: 16, background: `${win.app.color}22`, margin: '0 4px' }} />
        <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: win.app.color, letterSpacing: 2 }}>
          {win.app.icon} {win.app.label.replace('\n', ' ')}
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 9, color: `${win.app.color}55`, marginLeft: 6 }}>
          {win.app.desc}
        </span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {children}
      </div>

      {/* Resize handle */}
      <div
        ref={resizeRef}
        onMouseDown={onMouseDownResize}
        style={{
          position: 'absolute', bottom: 0, right: 0,
          width: 18, height: 18, cursor: 'se-resize',
          background: `linear-gradient(135deg, transparent 50%, ${win.app.color}44 50%)`,
          borderBottomRightRadius: 14,
        }}
      />
    </motion.div>
  )
}

// ── Window content ────────────────────────────────────────────────
function WindowContent({ app, onEvent }) {
  const mono = { fontFamily: "'JetBrains Mono','Share Tech Mono',monospace" }

  const contentMap = {
    simulator: <SimulatorContent color={app.color} mono={mono} onEvent={onEvent} />,
    sandbox:   <SandboxContent   color={app.color} mono={mono} onEvent={onEvent} />,
    tutor:     <TutorContent     color={app.color} mono={mono} onEvent={onEvent} />,
    investigation: <InvestigationContent color={app.color} mono={mono} onEvent={onEvent} />,
    terminal:  <TerminalContent  color={app.color} mono={mono} onEvent={onEvent} />,
    settings:  <SettingsContent  color={app.color} mono={mono} />,
  }
  return contentMap[app.id] ?? (
    <div style={{ ...mono, padding: 24, color: app.color, fontSize: 14 }}>
      {app.icon} {app.label.replace('\n', ' ')} — coming soon
    </div>
  )
}

function SimulatorContent({ color, mono, onEvent }) {
  const [running, setRunning] = useState(false)
  const [step, setStep] = useState(0)
  const steps = ['FCFS', 'SJF', 'SRTF', 'Round Robin', 'Priority']
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => {
      setStep(s => (s + 1) % steps.length)
      onEvent(makeEvent('SCHED', `Running ${steps[step]} scheduler`, color))
    }, 800)
    return () => clearInterval(t)
  }, [running, step])
  return (
    <div style={{ padding: 24, height: '100%', display: 'flex', flexDirection: 'column', gap: 16, overflow: 'auto' }}>
      <div style={{ ...mono, fontSize: 12, color, letterSpacing: 3 }}>▸ OS-QUEST SIMULATOR</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {steps.map((s, i) => (
          <div key={s} style={{
            padding: '6px 14px', borderRadius: 8, ...mono, fontSize: 10,
            background: running && i === step ? `${color}22` : 'rgba(255,255,255,0.04)',
            border: `1px solid ${running && i === step ? color + '88' : 'rgba(255,255,255,0.08)'}`,
            color: running && i === step ? color : '#5eead466',
            boxShadow: running && i === step ? `0 0 14px ${color}44` : 'none',
            transition: 'all 0.3s',
          }}>{s}</div>
        ))}
      </div>
      <button
        onClick={() => { setRunning(r => !r); onEvent(makeEvent('SIM', `Simulation ${running ? 'stopped' : 'started'}`, color)) }}
        style={{
          alignSelf: 'flex-start', ...mono, fontSize: 11, letterSpacing: 2,
          padding: '8px 24px', borderRadius: 8, border: `1px solid ${color}66`,
          background: running ? `${color}22` : 'rgba(255,255,255,0.04)',
          color, cursor: 'pointer', transition: 'all 0.2s',
        }}
      >{running ? '⏸ STOP' : '▶ START SIMULATION'}</button>
      <div style={{ flex: 1, ...mono, fontSize: 10, color: `${color}66`, lineHeight: 2 }}>
        Click Start to run the CPU scheduling simulator.<br/>
        Open the full app from the main OS-Quest dashboard.
      </div>
    </div>
  )
}

function SandboxContent({ color, mono, onEvent }) {
  const [code, setCode] = useState('function scheduler(queue) {\n  // Return a PID\n  return queue[0]?.pid ?? null\n}')
  return (
    <div style={{ padding: 16, height: '100%', display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto' }}>
      <div style={{ ...mono, fontSize: 12, color, letterSpacing: 3 }}>▸ ALGORITHM SANDBOX</div>
      <textarea
        value={code}
        onChange={e => { setCode(e.target.value); onEvent(makeEvent('CODE', 'Code edited in sandbox', color)) }}
        style={{
          flex: 1, background: 'rgba(2,10,10,0.8)', border: `1px solid ${color}33`,
          borderRadius: 8, color: '#a5f3fc', ...mono, fontSize: 11,
          padding: 12, resize: 'none', outline: 'none', lineHeight: 1.8,
          fontFamily: "'JetBrains Mono',monospace",
        }}
      />
      <button
        onClick={() => onEvent(makeEvent('RUN', 'Custom scheduler compiled & run', color))}
        style={{
          alignSelf: 'flex-start', ...mono, fontSize: 10, letterSpacing: 3,
          padding: '7px 20px', borderRadius: 8, border: `1px solid ${color}55`,
          background: `${color}18`, color, cursor: 'pointer',
        }}
      >▶ RUN</button>
    </div>
  )
}

function TutorContent({ color, mono, onEvent }) {
  const [q, setQ] = useState('')
  const [msgs, setMsgs] = useState([
    { role: 'bot', text: 'Hello! I\'m your RAG Algorithm Tutor. Ask me about CPU scheduling algorithms.' }
  ])
  const send = () => {
    if (!q.trim()) return
    const userMsg = { role: 'user', text: q }
    const botMsg  = { role: 'bot',  text: `Processing query about: "${q}". In the full app, this uses OpenAI + PDF embeddings to answer from the algorithm textbook.` }
    setMsgs(m => [...m, userMsg, botMsg])
    setQ('')
    onEvent(makeEvent('RAG', `Query: ${q.slice(0, 30)}`, color))
  }
  return (
    <div style={{ padding: 14, height: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ ...mono, fontSize: 12, color, letterSpacing: 3 }}>▸ RAG TUTOR</div>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '80%',
            padding: '8px 12px', borderRadius: 10,
            background: m.role === 'user' ? `${color}22` : 'rgba(255,255,255,0.04)',
            border: `1px solid ${m.role === 'user' ? color + '55' : 'rgba(255,255,255,0.08)'}`,
            ...mono, fontSize: 11, color: m.role === 'user' ? color : '#a5f3fc',
            lineHeight: 1.7,
          }}>{m.text}</div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Ask about FCFS, SJF, Round Robin..."
          style={{
            flex: 1, background: 'rgba(2,10,10,0.8)', border: `1px solid ${color}33`,
            borderRadius: 8, padding: '8px 12px', ...mono, fontSize: 11,
            color: '#a5f3fc', outline: 'none',
          }}
        />
        <button onClick={send} style={{
          ...mono, fontSize: 10, padding: '8px 16px', borderRadius: 8,
          background: `${color}22`, border: `1px solid ${color}44`, color, cursor: 'pointer',
        }}>SEND</button>
      </div>
    </div>
  )
}

function InvestigationContent({ color, mono, onEvent }) {
  const procs = [
    { pid: 1, name: 'chrome',   cpu: 34, mem: 210, state: 'running' },
    { pid: 2, name: 'kernel',   cpu: 8,  mem: 48,  state: 'running' },
    { pid: 3, name: 'sched',    cpu: 2,  mem: 12,  state: 'waiting' },
    { pid: 4, name: 'net-io',   cpu: 5,  mem: 30,  state: 'blocked' },
    { pid: 5, name: 'user-app', cpu: 18, mem: 95,  state: 'running' },
  ]
  const stateColor = s => s === 'running' ? '#34d399' : s === 'waiting' ? '#fbbf24' : '#f87171'
  return (
    <div style={{ padding: 16, height: '100%', display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto' }}>
      <div style={{ ...mono, fontSize: 12, color, letterSpacing: 3 }}>▸ PROCESS INVESTIGATION</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {procs.map(p => (
          <motion.div
            key={p.pid}
            whileHover={{ scale: 1.01, boxShadow: `0 0 14px ${color}22` }}
            onClick={() => onEvent(makeEvent('INSPECT', `Inspecting PID ${p.pid} (${p.name})`, color))}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              transition: 'all 0.2s',
            }}
          >
            <span style={{ ...mono, fontSize: 9, color: `${color}77`, minWidth: 28 }}>PID {p.pid}</span>
            <span style={{ ...mono, fontSize: 11, color: '#a5f3fc', flex: 1 }}>{p.name}</span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <div style={{ width: 60, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${p.cpu}%`, background: color, borderRadius: 2 }} />
              </div>
              <span style={{ ...mono, fontSize: 9, color: `${color}88`, minWidth: 32 }}>{p.cpu}%</span>
            </div>
            <span style={{ ...mono, fontSize: 9, color: stateColor(p.state), minWidth: 48, textAlign: 'right' }}>{p.state}</span>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function TerminalContent({ color, mono, onEvent }) {
  const [lines, setLines] = useState([
    '$ OS-Quest Terminal v1.0',
    '$ Type "help" for available commands',
  ])
  const [input, setInput] = useState('')
  const bottomRef = useRef(null)
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [lines])
  const run = () => {
    if (!input.trim()) return
    const cmd = input.trim()
    const responses = {
      help: 'Commands: ps, top, sched, clear, exit',
      ps: 'PID  NAME       STATE\n 1   kernel     running\n 2   sched      running\n 3   user-app   waiting',
      top: 'CPU: 42%  RAM: 58%  PROCS: 12\nkern 8% | user 34% | idle 58%',
      sched: 'Scheduler: SRTF | Quantum: 2ms | Procs: 6',
      clear: '__CLEAR__',
    }
    const out = responses[cmd] ?? `bash: command not found: ${cmd}`
    if (out === '__CLEAR__') { setLines(['$ OS-Quest Terminal']); setInput(''); return }
    setLines(l => [...l, `$ ${cmd}`, ...out.split('\n')])
    setInput('')
    onEvent(makeEvent('CMD', `Terminal: ${cmd}`, color))
  }
  return (
    <div style={{ padding: 14, height: '100%', display: 'flex', flexDirection: 'column', background: 'rgba(2,8,8,0.9)' }}>
      <div style={{ flex: 1, overflowY: 'auto', ...mono, fontSize: 11, color: '#a5f3fc', lineHeight: 2 }}>
        {lines.map((l, i) => (
          <div key={i} style={{ color: l.startsWith('$') ? color : '#a5f3fc88' }}>{l}</div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderTop: `1px solid ${color}22`, paddingTop: 8 }}>
        <span style={{ ...mono, fontSize: 11, color }}> $</span>
        <input
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && run()}
          autoFocus
          style={{
            flex: 1, background: 'none', border: 'none', outline: 'none',
            ...mono, fontSize: 11, color: '#a5f3fc', caretColor: color,
          }}
        />
      </div>
    </div>
  )
}

function SettingsContent({ color, mono }) {
  const [theme, setTheme] = useState('teal')
  const [fps, setFps]     = useState(60)
  const [glow, setGlow]   = useState(true)
  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18, overflow: 'auto', height: '100%' }}>
      <div style={{ ...mono, fontSize: 12, color, letterSpacing: 3 }}>▸ SYSTEM SETTINGS</div>
      {[
        { label: 'Theme', value: theme, options: ['teal', 'blue', 'pink'], set: setTheme },
      ].map(({ label, value, options, set }) => (
        <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ ...mono, fontSize: 9, color: `${color}88`, letterSpacing: 2 }}>{label.toUpperCase()}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {options.map(o => (
              <button key={o} onClick={() => set(o)} style={{
                ...mono, fontSize: 10, padding: '5px 14px', borderRadius: 6, cursor: 'pointer',
                background: value === o ? `${color}22` : 'rgba(255,255,255,0.04)',
                border: `1px solid ${value === o ? color + '66' : 'rgba(255,255,255,0.1)'}`,
                color: value === o ? color : '#5eead466',
              }}>{o}</button>
            ))}
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ ...mono, fontSize: 9, color: `${color}88`, letterSpacing: 2 }}>TARGET FPS</span>
          <span style={{ ...mono, fontSize: 10, color }}>{fps}</span>
        </div>
        <input type="range" min={30} max={120} step={10} value={fps} onChange={e => setFps(+e.target.value)} style={{ accentColor: color }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ ...mono, fontSize: 9, color: `${color}88`, letterSpacing: 2, flex: 1 }}>NEON GLOW EFFECTS</span>
        <button onClick={() => setGlow(g => !g)} style={{
          width: 44, height: 24, borderRadius: 12, cursor: 'pointer', border: 'none',
          background: glow ? `${color}66` : 'rgba(255,255,255,0.1)',
          position: 'relative', transition: 'background 0.2s',
        }}>
          <motion.div animate={{ x: glow ? 20 : 2 }} transition={{ type: 'spring', stiffness: 500 }} style={{
            position: 'absolute', top: 3, width: 18, height: 18, borderRadius: '50%',
            background: glow ? color : '#5eead444',
          }} />
        </button>
      </div>
    </div>
  )
}

// ── CPU Pulse Monitor ─────────────────────────────────────────────
function PulseMonitor({ cpuHistory }) {
  const W = 180, H = 56
  const pts = cpuHistory.slice(-40)
  if (pts.length < 2) return null
  const xs = pts.map((_, i) => (i / (pts.length - 1)) * W)
  const ys = pts.map(v => H - (v / 100) * H * 0.9 - 4)
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ')
  const fill = `${d} L ${W} ${H} L 0 ${H} Z`

  return (
    <svg width={W} height={H} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="pulseGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.02" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <path d={fill} fill="url(#pulseGrad)" />
      <path d={d} stroke="#2dd4bf" strokeWidth="2" fill="none" filter="url(#glow)" />
      <circle
        cx={xs[xs.length - 1].toFixed(1)}
        cy={ys[ys.length - 1].toFixed(1)}
        r={3} fill="#2dd4bf"
        filter="url(#glow)"
      />
    </svg>
  )
}

// ── Circular gauge ────────────────────────────────────────────────
function CircleGauge({ value, label, color, size = 60 }) {
  const r = (size / 2) - 7
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - value / 100)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={5} />
        <motion.circle
          cx={size/2} cy={size/2} r={r} fill="none"
          stroke={color} strokeWidth={5}
          strokeDasharray={circ}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.6 }}
          strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`}
          filter={`drop-shadow(0 0 4px ${color})`}
        />
        <text x={size/2} y={size/2 + 1} textAnchor="middle" dominantBaseline="middle"
          style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 11, fill: color, fontWeight: 900 }}>
          {Math.round(value)}%
        </text>
      </svg>
      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 8, color: `${color}88`, letterSpacing: 2 }}>
        {label}
      </div>
    </div>
  )
}

// ── Mini Gantt in sidebar ─────────────────────────────────────────
function MiniGantt({ slots }) {
  const colorMap = {}
  KERNEL_PROCS.forEach(p => { colorMap[p.pid] = p.color })
  const show = slots.slice(-32)
  return (
    <div>
      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 8, color: '#2dd4bf44', letterSpacing: 2, marginBottom: 4 }}>
        KERNEL GANTT
      </div>
      <div style={{ display: 'flex', height: 14, borderRadius: 3, overflow: 'hidden', gap: '0.5px' }}>
        {show.map((s, i) => (
          <div key={i} style={{
            flex: 1, background: colorMap[s] ?? '#2dd4bf0a',
            minWidth: 0,
          }} title={KERNEL_PROCS.find(p => p.pid === s)?.name ?? 'idle'} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, gap: 6, flexWrap: 'wrap' }}>
        {KERNEL_PROCS.map(p => (
          <div key={p.pid} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 7, height: 7, background: p.color, borderRadius: 1 }} />
            <span style={{ fontFamily: 'monospace', fontSize: 8, color: '#5eead444' }}>{p.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Hardware HUD (right sidebar) ──────────────────────────────────
function HardwareHUD({ cpuHistory, ramHistory, events, kernelGantt, activeWindows }) {
  const mono = { fontFamily: "'Share Tech Mono',monospace" }
  const cpu = cpuHistory[cpuHistory.length - 1] ?? 0
  const ram = ramHistory[ramHistory.length - 1] ?? 0

  const sysProcs = [
    { name: 'Desktop Mgr',  state: 'running', cpu: 4 },
    { name: 'Window Mgr',   state: activeWindows > 0 ? 'running' : 'idle', cpu: activeWindows * 3 },
    { name: 'Compositor',   state: 'running', cpu: 7 },
    { name: 'GPU Driver',   state: 'running', cpu: 5 },
    { name: 'Input Handler',state: 'running', cpu: 2 },
    { name: 'Net Stack',    state: 'waiting', cpu: 1 },
  ]

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column', gap: 0,
      borderLeft: '1px solid rgba(45,212,191,0.1)',
      background: 'rgba(2,8,8,0.92)',
      backdropFilter: 'blur(12px)',
      overflow: 'hidden',
    }}>
      {/* HUD header */}
      <div style={{
        padding: '10px 14px 8px',
        borderBottom: '1px solid rgba(45,212,191,0.1)',
        background: 'linear-gradient(180deg, rgba(4,14,14,0.9), transparent)',
      }}>
        <div style={{ ...mono, fontSize: 9, color: '#2dd4bf', letterSpacing: 4, marginBottom: 2 }}>SYSTEM HARDWARE</div>
        <div style={{ ...mono, fontSize: 8, color: '#2dd4bf33', letterSpacing: 2 }}>C-ENGINE HUD v3.2</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 14, scrollbarWidth: 'none' }}>

        {/* Pulse Monitor */}
        <div style={{
          background: 'rgba(7,22,22,0.7)', borderRadius: 8,
          border: '1px solid rgba(45,212,191,0.1)', padding: '10px 10px 8px',
        }}>
          <div style={{ ...mono, fontSize: 8, color: '#2dd4bf55', letterSpacing: 3, marginBottom: 8 }}>
            ▸ CPU PULSE MONITOR
          </div>
          <PulseMonitor cpuHistory={cpuHistory} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ ...mono, fontSize: 8, color: '#2dd4bf55' }}>CPU {cpu.toFixed(0)}%</span>
            <motion.div
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ repeat: Infinity, duration: 1 }}
              style={{ width: 6, height: 6, borderRadius: '50%', background: '#2dd4bf', boxShadow: '0 0 6px #2dd4bf' }}
            />
          </div>
        </div>

        {/* Resource gauges */}
        <div style={{
          background: 'rgba(7,22,22,0.7)', borderRadius: 8,
          border: '1px solid rgba(45,212,191,0.1)', padding: '10px 10px',
        }}>
          <div style={{ ...mono, fontSize: 8, color: '#2dd4bf55', letterSpacing: 3, marginBottom: 10 }}>
            ▸ RESOURCE GAUGES
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-around' }}>
            <CircleGauge value={cpu} label="CPU" color="#2dd4bf" size={62} />
            <CircleGauge value={ram} label="RAM" color="#60a5fa" size={62} />
            <CircleGauge value={Math.min(activeWindows * 18, 95)} label="GPU" color="#a78bfa" size={62} />
          </div>
        </div>

        {/* Active process list */}
        <div style={{
          background: 'rgba(7,22,22,0.7)', borderRadius: 8,
          border: '1px solid rgba(45,212,191,0.1)', padding: '10px',
        }}>
          <div style={{ ...mono, fontSize: 8, color: '#2dd4bf55', letterSpacing: 3, marginBottom: 8 }}>
            ▸ ACTIVE PROCESSES
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {sysProcs.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <motion.div
                  animate={{ opacity: p.state === 'running' ? [1, 0.4, 1] : 0.25 }}
                  transition={{ repeat: p.state === 'running' ? Infinity : 0, duration: 1.5 + i * 0.3 }}
                  style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                    background: p.state === 'running' ? '#34d399' : '#fbbf24',
                    boxShadow: p.state === 'running' ? '0 0 5px #34d399' : 'none',
                  }}
                />
                <span style={{ ...mono, fontSize: 9, color: '#a5f3fc88', flex: 1 }}>{p.name}</span>
                <div style={{ width: 36, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                  <motion.div
                    animate={{ width: `${p.cpu + Math.random() * 5}%` }}
                    transition={{ repeat: Infinity, duration: 1.5, repeatType: 'mirror' }}
                    style={{ height: '100%', background: '#2dd4bf66', borderRadius: 2 }}
                  />
                </div>
                <span style={{ ...mono, fontSize: 8, color: '#2dd4bf44' }}>{p.cpu}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Kernel mini Gantt */}
        <div style={{
          background: 'rgba(7,22,22,0.7)', borderRadius: 8,
          border: '1px solid rgba(45,212,191,0.1)', padding: '10px',
        }}>
          <MiniGantt slots={kernelGantt} />
        </div>

        {/* Event log */}
        <div style={{
          background: 'rgba(7,22,22,0.7)', borderRadius: 8,
          border: '1px solid rgba(45,212,191,0.1)', padding: '10px',
          flex: 1, minHeight: 100,
        }}>
          <div style={{ ...mono, fontSize: 8, color: '#2dd4bf55', letterSpacing: 3, marginBottom: 8 }}>
            ▸ C-ENGINE EVENTS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto', scrollbarWidth: 'none' }}>
            <AnimatePresence initial={false}>
              {events.slice(0, 20).map(e => (
                <motion.div
                  key={e.id}
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{
                    display: 'flex', gap: 6, alignItems: 'baseline',
                    padding: '3px 6px', borderRadius: 4,
                    background: `${e.color}0a`,
                  }}
                >
                  <span style={{ ...mono, fontSize: 7, color: e.color + '88', flexShrink: 0 }}>
                    {e.type}
                  </span>
                  <span style={{ ...mono, fontSize: 8, color: '#a5f3fc66', lineHeight: 1.5 }}>
                    {e.detail}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Taskbar / dock ────────────────────────────────────────────────
function Taskbar({ windows, dispatch, onEvent, onOpenApp }) {
  const mono = { fontFamily: "'Share Tech Mono',monospace" }
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const openApps = APPS.filter(a => windows.find(w => w.id === a.id))
  const closedApps = APPS.filter(a => !windows.find(w => w.id === a.id))

  return (
    <div style={{
      position: 'absolute', bottom: 10, left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '6px 14px',
      background: 'rgba(4,14,14,0.82)',
      backdropFilter: 'blur(24px)',
      borderRadius: 18,
      border: '1px solid rgba(45,212,191,0.18)',
      boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(45,212,191,0.08)',
      zIndex: 10000,
    }}>
      {/* All apps in dock */}
      {APPS.map(app => {
        const win = windows.find(w => w.id === app.id)
        const isOpen = !!win
        const isMinimized = win?.minimized
        return (
          <motion.div
            key={app.id}
            whileHover={{ scale: 1.22, y: -6 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              if (!isOpen) {
                onOpenApp(app)
              } else if (isMinimized) {
                dispatch({ type: 'OPEN', app })
                onEvent(makeEvent('RESTORE', `Restored ${app.label.replace('\n', ' ')}`, app.color))
              } else {
                dispatch({ type: 'MINIMIZE', id: app.id })
                onEvent(makeEvent('MINIMIZE', `Minimized ${app.label.replace('\n', ' ')}`, app.color))
              }
            }}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              cursor: 'pointer', padding: '2px 4px',
            }}
            title={app.label.replace('\n', ' ')}
          >
            <div style={{
              fontSize: 26, lineHeight: 1,
              filter: isOpen ? `drop-shadow(0 0 8px ${app.color})` : 'none',
              opacity: isOpen ? 1 : 0.5,
              transition: 'all 0.2s',
            }}>
              {app.icon}
            </div>
            {/* Dot indicator */}
            <div style={{
              width: 4, height: 4, borderRadius: '50%',
              background: isOpen ? app.color : 'transparent',
              boxShadow: isOpen ? `0 0 6px ${app.color}` : 'none',
              transition: 'all 0.2s',
            }} />
          </motion.div>
        )
      })}

      <div style={{ width: 1, height: 32, background: 'rgba(45,212,191,0.15)', margin: '0 4px' }} />

      {/* Clock */}
      <div style={{ ...mono, fontSize: 9, color: '#2dd4bf88', textAlign: 'center', minWidth: 50 }}>
        <div>{time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        <div style={{ fontSize: 7, color: '#2dd4bf44' }}>{time.toLocaleDateString([], { month: 'short', day: 'numeric' })}</div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// VirtualDesktop — root component
// ════════════════════════════════════════════════════════════════════
export default function VirtualDesktop({ onClose }) {
  const [windows, dispatch] = useReducer(windowsReducer, [])
  const [events, setEvents] = useState([
    makeEvent('BOOT', 'Virtual Desktop initialized', '#2dd4bf'),
    makeEvent('KERN', 'Kernel processes loaded', '#34d399'),
  ])

  // ── CPU / RAM simulation ────────────────────────────────────────
  const [cpuHistory, setCpuHistory] = useState(() => Array.from({ length: 40 }, () => 15 + Math.random() * 20))
  const [ramHistory, setRamHistory] = useState(() => Array.from({ length: 40 }, () => 40 + Math.random() * 20))
  const [kernelGantt, setKernelGantt] = useState([])

  // Tick: update fake CPU/RAM and kernel Gantt
  useEffect(() => {
    const t = setInterval(() => {
      const openCount = windows.filter(w => !w.minimized).length
      const baseCpu = 12 + openCount * 8 + Math.sin(Date.now() / 2000) * 8
      const noise = (Math.random() - 0.5) * 12
      const newCpu = Math.max(5, Math.min(95, baseCpu + noise))
      setCpuHistory(h => [...h.slice(-59), newCpu])

      const newRam = Math.max(30, Math.min(90, 42 + openCount * 6 + (Math.random() - 0.5) * 5))
      setRamHistory(h => [...h.slice(-59), newRam])

      // Kernel Gantt — round-robin among kernel procs
      const proc = KERNEL_PROCS[Math.floor(Date.now() / 300) % KERNEL_PROCS.length]
      setKernelGantt(g => [...g.slice(-63), proc.pid])
    }, 300)
    return () => clearInterval(t)
  }, [windows])

  // ── Event helper ─────────────────────────────────────────────────
  const onEvent = useCallback((evt) => {
    setEvents(prev => [evt, ...prev].slice(0, 60))
  }, [])

  // ── Open an app window ───────────────────────────────────────────
  const openApp = useCallback((app) => {
    dispatch({ type: 'OPEN', app })
    onEvent(makeEvent('OPEN', `Launched ${app.label.replace('\n', ' ')}`, app.color))
  }, [onEvent])

  // ── Keyboard: Esc to close ───────────────────────────────────────
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const activeCount = windows.filter(w => !w.minimized).length

  // ── Wallpaper grid ───────────────────────────────────────────────
  const GridLines = () => (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.04 }}>
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#2dd4bf" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
    </svg>
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 400,
      background: 'radial-gradient(ellipse at 30% 20%, #071a1a 0%, #020d0d 60%, #04090c 100%)',
      overflow: 'hidden',
      display: 'flex',
    }}>
      <GridLines />

      {/* Ambient glow blobs */}
      <div style={{ position: 'absolute', top: '10%', left: '15%', width: 400, height: 300, background: 'radial-gradient(circle, rgba(45,212,191,0.04) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '20%', right: '25%', width: 300, height: 300, background: 'radial-gradient(circle, rgba(96,165,250,0.04) 0%, transparent 70%)', pointerEvents: 'none' }} />

      {/* ── Desktop area (left 80%) ── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

        {/* Top bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 36, zIndex: 9999,
          display: 'flex', alignItems: 'center', gap: 16, padding: '0 18px',
          background: 'rgba(2,8,8,0.75)', backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(45,212,191,0.08)',
        }}>
          <button
            onClick={onClose}
            style={{
              fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: '#2dd4bf55',
              background: 'none', border: 'none', cursor: 'pointer', letterSpacing: 2,
            }}
            onMouseOver={e => e.target.style.color = '#2dd4bf'}
            onMouseOut={e => e.target.style.color = '#2dd4bf55'}
          >← EXIT DESKTOP</button>
          <div style={{ width: 1, height: 16, background: 'rgba(45,212,191,0.12)' }} />
          <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: '#2dd4bf', letterSpacing: 4 }}>
            OS-QUEST VIRTUAL DESKTOP
          </span>
          <div style={{ flex: 1 }} />
          <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#2dd4bf44' }}>
            {activeCount} window{activeCount !== 1 ? 's' : ''} open
          </span>
          <motion.div
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 8px #34d399' }}
          />
        </div>

        {/* Desktop icons grid */}
        <div style={{
          position: 'absolute', top: 48, left: 16, bottom: 80,
          display: 'grid', gridTemplateColumns: 'repeat(2, 96px)',
          gridAutoRows: 120, gap: 8, alignContent: 'start',
          padding: 8, zIndex: 1,
        }}>
          {APPS.map(app => (
            <DesktopIcon key={app.id} app={app} onOpen={openApp} />
          ))}
        </div>

        {/* Windows */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <AnimatePresence>
            {windows.map(win => (
              <div key={win.id} style={{ position: 'absolute', inset: 0, pointerEvents: win.minimized ? 'none' : 'all' }}>
                <WindowFrame win={win} dispatch={dispatch} onEvent={onEvent}>
                  <WindowContent app={win.app} onEvent={onEvent} />
                </WindowFrame>
              </div>
            ))}
          </AnimatePresence>
        </div>

        {/* Taskbar */}
        <Taskbar
          windows={windows}
          dispatch={dispatch}
          onEvent={onEvent}
          onOpenApp={openApp}
        />
      </div>

      {/* ── Hardware HUD (right 20%) ── */}
      <div style={{ flexShrink: 0, width: '21%', minWidth: 200, maxWidth: 280 }}>
        <HardwareHUD
          cpuHistory={cpuHistory}
          ramHistory={ramHistory}
          events={events}
          kernelGantt={kernelGantt}
          activeWindows={activeCount}
        />
      </div>
    </div>
  )
}
