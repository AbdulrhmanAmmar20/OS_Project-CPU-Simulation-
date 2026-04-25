import { useState, useEffect, useRef, useCallback } from 'react'
import { loadAndChunkPDF, embedTexts, findRelevant, askGPT, generalChat } from '../engine/rag.js'

// Detect casual / general messages that don't need RAG
function isGeneralChat(q) {
  const s = q.toLowerCase().trim()
  if (s.length < 25) {
    const casual = /^(hi|hello|hey|sup|yo|good\s*(morning|evening|night|day)|how are you|what's up|thanks|thank you|ok|okay|cool|nice|great|bye|goodbye|who are you|what can you do|help me|what is your name)/.test(s)
    if (casual) return true
  }
  // No scheduling / OS keywords → treat as general
  const techPattern = /algorithm|scheduling|fcfs|sjf|srtf|round robin|priority|process|burst|queue|preempt|cpu|context switch|throughput|turnaround|wait|os|kernel/i
  return !techPattern.test(q)
}

const API_KEY = import.meta.env.VITE_OPENAI_KEY
const PDF_URL  = '/algorithms.pdf'
function Line({ line }) {
  const mono = { fontFamily: "'JetBrains Mono', 'Share Tech Mono', monospace" }
  if (line.type === 'sep') {
    return (
      <div style={{ ...mono, fontSize: 11, color: '#0f766e', letterSpacing: 1, userSelect: 'none' }}>
        {line.text}
      </div>
    )
  }
  if (line.type === 'boot') {
    return (
      <div style={{ ...mono, fontSize: 11, color: '#2dd4bf99', letterSpacing: 1 }}>
        {line.text}
      </div>
    )
  }
  if (line.type === 'sys') {
    return (
      <div style={{ ...mono, fontSize: 11, color: '#5eead4cc', letterSpacing: 0.5 }}>
        <span style={{ color: '#0f766e' }}>[SYS] </span>{line.text}
      </div>
    )
  }
  if (line.type === 'user') {
    return (
      <div style={{ ...mono, fontSize: 12, color: '#a5f3fc', marginTop: 6 }}>
        <span style={{ color: '#2dd4bf', fontWeight: 700 }}>root@cpu-sim:~$ </span>
        <span style={{ color: '#e2fffe' }}>{line.text}</span>
      </div>
    )
  }
  if (line.type === 'bot') {
    return (
      <div style={{ ...mono, fontSize: 11.5, color: '#94e4d4', lineHeight: 1.8, marginTop: 2, marginLeft: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        <span style={{ color: '#0d9488', marginRight: 6 }}>◈</span>
        {line.text}
        {line.streaming && (
          <span style={{ display: 'inline-block', width: 8, height: 13, background: '#2dd4bf', marginLeft: 2, verticalAlign: 'middle', animation: 'termBlink 0.8s step-end infinite' }} />
        )}
      </div>
    )
  }
  if (line.type === 'err') {
    return (
      <div style={{ ...mono, fontSize: 11, color: '#f87171', marginTop: 2 }}>
        <span style={{ color: '#ef4444' }}>[ERR] </span>{line.text}
      </div>
    )
  }
  return null
}

// ════════════════════════════════════════════════════════════════════
export default function TerminalChat() {
  const [lines, setLines]   = useState([])
  const [input, setInput]   = useState('')
  const [busy, setBusy]     = useState(false)
  const [ready, setReady]   = useState(false)
  const [history, setHistory] = useState([])
  const [histIdx, setHistIdx] = useState(-1)

  const chunksRef  = useRef([])
  const embsRef    = useRef([])
  const bottomRef  = useRef(null)
  const inputRef   = useRef(null)

  const push = useCallback((type, text) =>
    setLines(l => [...l, { type, text }]), [])

  // ── Boot sequence + index build ───────────────────────────────
  useEffect(() => {
    const boot = [
      { type: 'boot', text: '╔══════════════════════════════════════════════════════╗' },
      { type: 'boot', text: '║   KFUPM CPU-SIM  ·  RAG Assistant  ·  Terminal v1.0 ║' },
      { type: 'boot', text: '╚══════════════════════════════════════════════════════╝' },
      { type: 'sep',  text: '──────────────────────────────────────────────────────' },
    ]
    setLines(boot)

    async function init() {
      if (!API_KEY) {
        setLines(l => [...l,
          { type: 'err', text: 'VITE_OPENAI_KEY not found in .env.local' },
          { type: 'err', text: 'Add it and restart the dev server.' },
        ])
        return
      }
      try {
        setLines(l => [...l, { type: 'sys', text: `Loading ${PDF_URL} ...` }])
        const chunks = await loadAndChunkPDF(PDF_URL, (msg) => {
          setLines(l => {
            const copy = [...l]
            if (copy[copy.length - 1]?.type === 'sys') copy[copy.length - 1] = { type: 'sys', text: msg }
            return copy
          })
        })
        chunksRef.current = chunks
        setLines(l => [...l, { type: 'sys', text: `PDF parsed → ${chunks.length} chunks extracted.` }])
        setLines(l => [...l, { type: 'sys', text: `Building embedding index via OpenAI...` }])

        const embs = await embedTexts(chunks, API_KEY)
        embsRef.current = embs

        setLines(l => [...l,
          { type: 'sys', text: `Index ready. ${embs.length} vectors stored.` },
          { type: 'sep', text: '──────────────────────────────────────────────────────' },
          { type: 'sys', text: 'Ask anything about the scheduling algorithms.' },
          { type: 'sys', text: 'Examples:' },
          { type: 'sys', text: '  · What is the convoy effect in FCFS?' },
          { type: 'sys', text: '  · How does SRTF differ from SJF?' },
          { type: 'sys', text: '  · What is aging in Priority scheduling?' },
          { type: 'sep', text: '──────────────────────────────────────────────────────' },
        ])
        setReady(true)
        inputRef.current?.focus()
      } catch (e) {
        setLines(l => [...l,
          { type: 'err', text: `Initialization failed: ${e.message}` },
          { type: 'err', text: 'Ensure algorithms.pdf is placed in react_dashboard/public/' },
        ])
      }
    }
    init()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  // ── Send a question ────────────────────────────────────────────
  async function handleSend() {
    const q = input.trim()
    if (!q || busy || !ready) return
    setInput('')
    setHistIdx(-1)
    setHistory(h => [q, ...h].slice(0, 50))
    setBusy(true)

    setLines(l => [...l,
      { type: 'sep', text: '──────────────────────────────────────────────────────' },
      { type: 'user', text: q },
    ])

    try {
      // ── General / casual message → skip RAG ──────────────────
      if (isGeneralChat(q) || !chunksRef.current.length) {
        setLines(l => [...l, { type: 'bot', text: '', streaming: true }])
        await generalChat(q, API_KEY, (full) => {
          setLines(l => { const c = [...l]; c[c.length-1] = { type: 'bot', text: full, streaming: true }; return c })
        })
        setLines(l => { const c = [...l]; c[c.length-1] = { ...c[c.length-1], streaming: false }; return c })
      } else {
        // ── RAG path ──────────────────────────────────────────
        setLines(l => [...l, { type: 'sys', text: 'Searching context...' }])
        const [queryEmb] = await embedTexts([q], API_KEY)
        const relevant = findRelevant(queryEmb, embsRef.current, chunksRef.current, 5)
        setLines(l => {
          const copy = [...l]
          const last = copy[copy.length - 1]
          if (last?.type === 'sys') copy[copy.length - 1] = { type: 'sys', text: `Retrieved ${relevant.length} chunks. Generating...` }
          return copy
        })
        setLines(l => [...l, { type: 'bot', text: '', streaming: true }])
        await askGPT(q, relevant, API_KEY, (full) => {
          setLines(l => { const c = [...l]; c[c.length-1] = { type: 'bot', text: full, streaming: true }; return c })
        })
        setLines(l => { const c = [...l]; c[c.length-1] = { ...c[c.length-1], streaming: false }; return c })
      }
    } catch (e) {
      setLines(l => [...l, { type: 'err', text: e.message }])
    }

    setBusy(false)
    inputRef.current?.focus()
  }

  // ── Keyboard handling ────────────────────────────────────────
  function handleKey(e) {
    if (e.key === 'Enter') { handleSend(); return }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHistIdx(i => {
        const next = Math.min(i + 1, history.length - 1)
        setInput(history[next] ?? '')
        return next
      })
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHistIdx(i => {
        const next = Math.max(i - 1, -1)
        setInput(next === -1 ? '' : history[next])
        return next
      })
    }
  }

  const mono = { fontFamily: "'JetBrains Mono', 'Share Tech Mono', monospace" }

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      style={{
        width: '100%', height: '100%',
        background: '#020c0c',
        borderRadius: 8,
        border: '1px solid #2dd4bf1a',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        cursor: 'text',
      }}
    >
      {/* Terminal title bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 14px',
        background: 'linear-gradient(90deg, #041414, #071c1c)',
        borderBottom: '1px solid #2dd4bf18',
        flexShrink: 0,
      }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e' }} />
        <div style={{ flex: 1, textAlign: 'center', ...mono, fontSize: 10, color: '#2dd4bf66', letterSpacing: 3 }}>
          RAG TERMINAL  —  algorithms.pdf
        </div>
        <div style={{ ...mono, fontSize: 9, color: '#2dd4bf44', letterSpacing: 2 }}>
          {ready ? '● READY' : '○ LOADING'}
        </div>
      </div>

      {/* Output area */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '14px 16px',
        display: 'flex', flexDirection: 'column', gap: 3,
        scrollbarWidth: 'thin', scrollbarColor: '#2dd4bf22 transparent',
      }}>
        {lines.map((line, i) => <Line key={i} line={line} />)}
        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <div style={{
        flexShrink: 0,
        borderTop: '1px solid #2dd4bf18',
        padding: '10px 16px',
        display: 'flex', alignItems: 'center', gap: 8,
        background: '#020c0c',
      }}>
        <span style={{ ...mono, fontSize: 12, color: '#2dd4bf', fontWeight: 700, whiteSpace: 'nowrap', userSelect: 'none' }}>
          root@cpu-sim:~$
        </span>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          disabled={busy || !ready}
          placeholder={
            !ready ? 'Initializing...' :
            busy   ? 'Processing...' :
            'Type your question and press Enter'
          }
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            ...mono,
            fontSize: 12,
            color: '#e2fffe',
            caretColor: '#2dd4bf',
          }}
          spellCheck={false}
          autoComplete="off"
        />
        {busy && (
          <span style={{ ...mono, fontSize: 11, color: '#0d9488', animation: 'termSpin 1s linear infinite' }}>
            ⠋
          </span>
        )}
      </div>

      {/* Keyframe animations */}
      <style>{`
        @keyframes termBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes termSpin {
          0%   { content: '⠋'; }
          12%  { opacity: 0.8; }
          50%  { opacity: 0.4; }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
