import { useState, useEffect } from 'react'
import TerminalChat from './TerminalChat.jsx'

// ── 5 pages of algorithm content ──────────────────────────────────
const PAGES = [
  {
    title: 'FCFS',
    subtitle: 'First-Come, First-Served',
    icon: '➊',
    color: '#2dd4bf',
    content: [
      { heading: 'Overview', body: 'FCFS is the simplest scheduling algorithm. Processes are dispatched in the exact order they arrive in the ready queue — no preemption, no reordering.' },
      { heading: 'How it works', body: '1. Maintain a FIFO queue.\n2. When CPU is free, dequeue the front process.\n3. Run it to completion before serving the next.' },
      { heading: 'Complexity', body: 'Time: O(n) per schedule cycle.\nSpace: O(n) queue.' },
      { heading: 'Pros', body: '✔ Simple to implement\n✔ Fair in arrival order\n✔ No starvation' },
      { heading: 'Cons', body: '✘ Convoy effect: short jobs wait behind long ones\n✘ Poor average waiting time\n✘ Not suitable for interactive systems' },
      { heading: 'Use cases', body: 'Batch systems, print spoolers, simple embedded tasks where predictability matters more than throughput.' },
    ]
  },
  {
    title: 'SJF',
    subtitle: 'Shortest Job First',
    icon: '➋',
    color: '#34d399',
    content: [
      { heading: 'Overview', body: 'SJF selects the process with the smallest burst time from the ready queue. It is non-preemptive — once a process starts, it runs to completion.' },
      { heading: 'How it works', body: '1. When CPU is free, scan all ready processes.\n2. Pick the one with the lowest burst time.\n3. Run it to completion.\n4. Repeat.' },
      { heading: 'Complexity', body: 'Time: O(n) per pick (linear scan) or O(log n) with a min-heap.\nSpace: O(n).' },
      { heading: 'Optimality', body: 'SJF gives the minimum average waiting time among all non-preemptive algorithms — provably optimal for that metric.' },
      { heading: 'Pros', body: '✔ Optimal average waiting time\n✔ Good throughput for short jobs\n✔ Simple to understand' },
      { heading: 'Cons', body: '✘ Requires knowing burst times in advance\n✘ Long jobs can starve\n✘ Not practical in pure form without prediction' },
    ]
  },
  {
    title: 'SRTF',
    subtitle: 'Shortest Remaining Time First',
    icon: '➌',
    color: '#60a5fa',
    content: [
      { heading: 'Overview', body: 'SRTF is the preemptive version of SJF. Whenever a new process arrives, if its burst time is less than the remaining time of the running process, a preemption occurs.' },
      { heading: 'How it works', body: '1. At every arrival event, compare new burst vs. current remaining.\n2. If new < remaining, preempt current process.\n3. Always run the process with the least remaining time.' },
      { heading: 'Complexity', body: 'Time: O(n log n) using a min-heap keyed on remaining time.\nContext switches: O(n) in the worst case.' },
      { heading: 'Optimality', body: 'SRTF achieves the globally minimum average waiting time across ALL scheduling algorithms — it is the preemptive optimal.' },
      { heading: 'Pros', body: '✔ Globally optimal average wait time\n✔ Responsive to short new arrivals\n✔ High CPU utilization' },
      { heading: 'Cons', body: '✘ High context-switch overhead\n✘ Long processes may starve indefinitely\n✘ Requires continuous knowledge of remaining burst' },
    ]
  },
  {
    title: 'Round Robin',
    subtitle: 'Time-Quantum Preemption',
    icon: '➍',
    color: '#f472b6',
    content: [
      { heading: 'Overview', body: 'Round Robin assigns each process a fixed time slice (quantum Q). After Q ms, if the process hasn\'t finished, it is preempted and moved to the back of the ready queue.' },
      { heading: 'How it works', body: '1. Maintain a circular FIFO queue.\n2. Run front process for Q ms.\n3. If not done, enqueue it at the back.\n4. If a new process arrives, add it at the back.' },
      { heading: 'Quantum Selection', body: 'Q too small → too many context switches (overhead).\nQ too large → degenerates to FCFS.\nTypical: 10–100 ms for interactive systems.' },
      { heading: 'Pros', body: '✔ Fair — every process gets equal CPU shares\n✔ Good response time for interactive apps\n✔ No starvation' },
      { heading: 'Cons', body: '✘ Higher average turnaround than SJF\n✘ Performance sensitive to quantum choice\n✘ Cache thrashing from frequent switches' },
      { heading: 'Use cases', body: 'General-purpose OS time-sharing (Linux CFS is inspired by RR), desktop and interactive workloads.' },
    ]
  },
  {
    title: 'Priority',
    subtitle: 'Priority-Based Scheduling',
    icon: '➎',
    color: '#fbbf24',
    content: [
      { heading: 'Overview', body: 'Each process is assigned a numeric priority. The CPU always runs the highest-priority ready process. Can be preemptive (new higher-priority preempts current) or non-preemptive.' },
      { heading: 'How it works', body: '1. Maintain a max-priority queue.\n2. When CPU is free (or on arrival in preemptive mode), pick max-priority process.\n3. Ties broken by FCFS order.' },
      { heading: 'Aging', body: 'To prevent starvation, gradually increase the priority of waiting processes over time. A process waiting W ms gets priority += W / T_age.' },
      { heading: 'Pros', body: '✔ Critical tasks get immediate service\n✔ Flexible — priority can encode deadlines\n✔ Matches real-world importance levels' },
      { heading: 'Cons', body: '✘ Starvation of low-priority processes\n✘ Priority inversion problems\n✘ Priority assignment can be subjective' },
      { heading: 'Use cases', body: 'Real-time systems (hard/soft RT), OS kernel threads, network QoS, medical/aerospace control systems.' },
    ]
  },
]

// ── Single page face component ──────────────────────────────────────
function PageContent({ page }) {
  return (
    <div className="w-full h-full flex flex-col overflow-hidden select-none" style={{ padding: '28px 32px' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 flex-none">
        <span style={{ fontSize: 32, lineHeight: 1 }}>{page.icon}</span>
        <div>
          <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 22, fontWeight: 900, color: page.color, letterSpacing: 2, textShadow: `0 0 14px ${page.color}88` }}>
            {page.title}
          </div>
          <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: '#5eead4', letterSpacing: 3, opacity: 0.8, marginTop: 2 }}>
            {page.subtitle}
          </div>
        </div>
      </div>
      {/* Divider */}
      <div style={{ height: 1, background: `linear-gradient(90deg, ${page.color}66, transparent)`, marginBottom: 14, flexShrink: 0 }} />
      {/* Content sections — scrollable */}
      <div className="flex-1 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: `${page.color}44 transparent` }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {page.content.map((sec, i) => (
            <div key={i}>
              <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: page.color, letterSpacing: 2, marginBottom: 4, opacity: 0.9 }}>
                ▸ {sec.heading.toUpperCase()}
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: '#a5f3fc', lineHeight: 1.75, whiteSpace: 'pre-line', opacity: 0.9 }}>
                {sec.body}
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Page number */}
      <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 9, color: page.color, opacity: 0.4, letterSpacing: 3, textAlign: 'center', marginTop: 12, flexShrink: 0 }}>
        PAGE {PAGES.indexOf(page) + 1} / 5
      </div>
    </div>
  )
}

// ── Cover face (inside of cover / last page back) ───────────────────
function CoverContent({ side }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center" style={{ padding: 32, background: 'linear-gradient(135deg, #041010 0%, #071616 100%)' }}>
      {side === 'front' ? (
        <>
          <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 13, color: '#2dd4bf66', letterSpacing: 6, marginBottom: 8 }}>KFUPM — CPU SIMULATION PROJECT</div>
          <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 30, fontWeight: 900, color: '#2dd4bf', letterSpacing: 3, textAlign: 'center', textShadow: '0 0 24px #2dd4bf88' }}>ALGORITHM<br/>GUIDE</div>
          <div style={{ height: 1, width: 120, background: 'linear-gradient(90deg,transparent,#2dd4bf,transparent)', margin: '18px 0' }} />
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#5eead4', opacity: 0.7, textAlign: 'center', lineHeight: 1.8 }}>
            5 Scheduling Algorithms<br/>Explained in Detail
          </div>
          <div style={{ marginTop: 24, fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: '#2dd4bf44', letterSpacing: 4 }}>OPEN THE BOOK →</div>
        </>
      ) : (
        <>
          <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 12, color: '#2dd4bf44', letterSpacing: 4, marginBottom: 16 }}>END OF GUIDE</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#5eead466', textAlign: 'center', lineHeight: 1.9 }}>
            FCFS · SJF · SRTF<br/>Round Robin · Priority
          </div>
        </>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// Main AlgorithmBook component
// ════════════════════════════════════════════════════════════════════
export default function AlgorithmBook({ onClose }) {
  const [view, setView] = useState('book') // 'book' | 'chat'

  // currentSpread: which two-page spread is open
  // spread 0 = cover (closed) / first open
  // spreads 1-4 = page pairs
  // We model it as: left page index, right page index
  // Pages: -1=cover-back, 0-4=content pages, 5=back-cover-front
  // Spread state: the index of the left page (0 = cover showing page[0] on right)
  const [spread, setSpread] = useState(0) // 0..4
  const [flipping, setFlipping] = useState(null) // 'left'|'right'|null
  const [animDir, setAnimDir] = useState(null)

  const MAX = 4 // spread 0..4

  function flipRight() {
    if (spread >= MAX || flipping) return
    setFlipping('right')
    setAnimDir('right')
    setTimeout(() => { setSpread(s => s + 1); setFlipping(null) }, 500)
  }
  function flipLeft() {
    if (spread <= 0 || flipping) return
    setFlipping('left')
    setAnimDir('left')
    setTimeout(() => { setSpread(s => s - 1); setFlipping(null) }, 500)
  }

  // Keyboard nav
  useEffect(() => {
    const h = (e) => {
      if (view !== 'book') return
      if (e.key === 'ArrowRight') flipRight()
      if (e.key === 'ArrowLeft') flipLeft()
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [spread, flipping, view])

  // What's on the left and right pages for each spread
  // spread 0: left=cover-front, right=page[0]
  // spread 1: left=page[0], right=page[1]
  // spread 2: left=page[1], right=page[2]
  // spread 3: left=page[2], right=page[3]
  // spread 4: left=page[3], right=page[4]  (last page pair — page 4 = last)
  // (no back cover visible in this model — we show a subtle "end" on the last right)

  function getLeftContent() {
    if (spread === 0) return <CoverContent side="front" />
    return <PageContent page={PAGES[spread - 1]} />
  }
  function getRightContent() {
    return <PageContent page={PAGES[spread]} />
  }

  const PAGE_W = 340
  const PAGE_H = 480
  const SPINE_W = 24

  const bookW = PAGE_W * 2 + SPINE_W

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(2,13,13,0.92)',
        backdropFilter: 'blur(8px)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 24, right: 32,
          background: 'rgba(13,148,136,0.15)', border: '1px solid #2dd4bf44',
          color: '#2dd4bf', borderRadius: 8, padding: '6px 18px',
          fontFamily: "'Share Tech Mono', monospace", fontSize: 12, letterSpacing: 2,
          cursor: 'pointer',
        }}
      >
        ✕ CLOSE
      </button>

      {/* Title + mode tabs */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: '#2dd4bf66', letterSpacing: 6 }}>
          ALGORITHM REFERENCE GUIDE
        </div>
        {/* BOOK / CHAT toggle */}
        <div style={{ display: 'flex', background: 'rgba(4,16,16,0.9)', border: '1px solid #2dd4bf22', borderRadius: 8, padding: 3, gap: 3 }}>
          {[{ key: 'book', label: '📖  BOOK' }, { key: 'chat', label: '⚡  CHAT AI' }].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              style={{
                fontFamily: "'Share Tech Mono', monospace", fontSize: 11, letterSpacing: 2,
                padding: '5px 20px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: view === key ? 'rgba(13,148,136,0.35)' : 'transparent',
                color: view === key ? '#2dd4bf' : '#2dd4bf55',
                boxShadow: view === key ? '0 0 10px rgba(45,212,191,0.2)' : 'none',
                transition: 'all 0.2s',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Book container */}
      {view === 'book' && (
      <div style={{ perspective: '1400px', width: bookW, height: PAGE_H }}>
        <div
          style={{
            position: 'relative',
            width: bookW,
            height: PAGE_H,
            transformStyle: 'preserve-3d',
            transform: 'rotateX(4deg)',
            filter: 'drop-shadow(0 30px 60px rgba(0,0,0,0.7))',
          }}
        >
          {/* ── Left page ── */}
          <div
            onClick={flipLeft}
            style={{
              position: 'absolute', top: 0, left: 0,
              width: PAGE_W, height: PAGE_H,
              background: 'linear-gradient(160deg, #041010 0%, #071a1a 100%)',
              border: '1px solid #2dd4bf1a',
              borderRight: 'none',
              borderRadius: '6px 0 0 6px',
              cursor: spread > 0 ? 'pointer' : 'default',
              overflow: 'hidden',
              boxShadow: '-4px 0 24px rgba(0,0,0,0.5)',
              transformOrigin: 'right center',
              animation: flipping === 'left'
                ? 'pageFlipBackLeft 0.5s ease-in-out forwards'
                : (animDir === 'left' ? 'pageRestoreLeft 0.01s' : 'none'),
              transition: 'filter 0.2s',
              filter: spread > 0 ? 'brightness(1)' : 'brightness(0.6)',
            }}
          >
            {getLeftContent()}
            {spread > 0 && (
              <div style={{
                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                background: 'linear-gradient(90deg, transparent 85%, rgba(0,0,0,0.25) 100%)',
                pointerEvents: 'none',
              }} />
            )}
            {/* Left flip hint */}
            {spread > 0 && (
              <div style={{
                position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                fontFamily: "'Share Tech Mono', monospace", fontSize: 9,
                color: '#2dd4bf55', letterSpacing: 2,
                writingMode: 'vertical-rl',
              }}>
                ◀ PREV
              </div>
            )}
          </div>

          {/* ── Spine ── */}
          <div style={{
            position: 'absolute', top: 0, left: PAGE_W,
            width: SPINE_W, height: PAGE_H,
            background: 'linear-gradient(90deg, #0a2020, #0f2e2e, #0a2020)',
            borderTop: '1px solid #2dd4bf22',
            borderBottom: '1px solid #2dd4bf22',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 3,
          }}>
            {[...Array(12)].map((_, i) => (
              <div key={i} style={{ width: 2, height: 20, background: '#2dd4bf18', borderRadius: 1 }} />
            ))}
          </div>

          {/* ── Right page ── */}
          <div
            onClick={flipRight}
            style={{
              position: 'absolute', top: 0, left: PAGE_W + SPINE_W,
              width: PAGE_W, height: PAGE_H,
              background: 'linear-gradient(160deg, #071616 0%, #041010 100%)',
              border: '1px solid #2dd4bf1a',
              borderLeft: 'none',
              borderRadius: '0 6px 6px 0',
              cursor: spread < MAX ? 'pointer' : 'default',
              overflow: 'hidden',
              boxShadow: '4px 0 24px rgba(0,0,0,0.5)',
              transformOrigin: 'left center',
              animation: flipping === 'right'
                ? 'pageFlipRight 0.5s ease-in-out forwards'
                : (animDir === 'right' ? 'pageRestoreRight 0.01s' : 'none'),
              filter: spread < MAX ? 'brightness(1)' : 'brightness(0.6)',
            }}
          >
            {getRightContent()}
            {/* Right flip hint */}
            {spread < MAX && (
              <div style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                fontFamily: "'Share Tech Mono', monospace", fontSize: 9,
                color: '#2dd4bf55', letterSpacing: 2,
                writingMode: 'vertical-rl',
              }}>
                NEXT ▶
              </div>
            )}
            {/* Right page shadow from spine */}
            <div style={{
              position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
              background: 'linear-gradient(90deg, rgba(0,0,0,0.2) 0%, transparent 15%)',
              pointerEvents: 'none',
            }} />
          </div>

          {/* ── Book top/bottom edges (3d depth) ── */}
          <div style={{
            position: 'absolute', top: -6, left: 0, width: bookW, height: 6,
            background: 'linear-gradient(90deg, #0d2a2a, #1a4040, #0d2a2a)',
            borderRadius: '3px 3px 0 0',
            transform: 'rotateX(90deg)', transformOrigin: 'bottom',
          }} />
          <div style={{
            position: 'absolute', bottom: -6, left: 0, width: bookW, height: 6,
            background: 'linear-gradient(90deg, #051414, #0c2a2a, #051414)',
            transform: 'rotateX(-90deg)', transformOrigin: 'top',
          }} />
        </div>
      </div>
      )} {/* end book container conditional */}

      {/* Navigation dots — shown in book mode */}
      {view === 'book' && (
        <>
        <div style={{ display: 'flex', gap: 10, marginTop: 28, alignItems: 'center' }}>
          {[...Array(MAX + 1)].map((_, i) => (
            <button
              key={i}
              onClick={() => {
                if (!flipping) {
                  setAnimDir(i > spread ? 'right' : 'left')
                  setSpread(i)
                }
              }}
              style={{
                width: i === spread ? 28 : 8,
                height: 8, borderRadius: 4,
                background: i === spread ? '#2dd4bf' : '#2dd4bf33',
                border: 'none', cursor: 'pointer',
                transition: 'all 0.3s',
                boxShadow: i === spread ? '0 0 10px #2dd4bf88' : 'none',
              }}
            />
          ))}
        </div>
        <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: '#2dd4bf44', letterSpacing: 4, marginTop: 10 }}>
          USE ← → ARROW KEYS OR CLICK PAGE SIDES
        </div>
        </>
      )}

      {/* ── Chat AI view ── */}
      {view === 'chat' && (
        <div style={{ width: bookW, height: PAGE_H + 60 }}>
          <TerminalChat />
        </div>
      )}

      {/* CSS animations */}
      <style>{`
        @keyframes pageFlipRight {
          0%   { transform: perspective(800px) rotateY(0deg); }
          50%  { transform: perspective(800px) rotateY(-50deg) scaleX(0.95); z-index:10; }
          100% { transform: perspective(800px) rotateY(-5deg); }
        }
        @keyframes pageFlipBackLeft {
          0%   { transform: perspective(800px) rotateY(0deg); }
          50%  { transform: perspective(800px) rotateY(50deg) scaleX(0.95); z-index:10; }
          100% { transform: perspective(800px) rotateY(5deg); }
        }
      `}</style>
    </div>
  )
}
