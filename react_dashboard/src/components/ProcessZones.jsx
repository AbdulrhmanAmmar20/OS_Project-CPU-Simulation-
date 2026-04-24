import { motion, AnimatePresence } from 'framer-motion'

const ZONE_VARIANTS = {
  enter: { opacity: 0, scale: 0.85, y: 8 },
  center: { opacity: 1, scale: 1, y: 0 },
  exit:  { opacity: 0, scale: 0.85, y: -8 },
}

export default function ProcessZones({ statesAtTime, processes, colorOf, result, playhead }) {
  const running = statesAtTime.filter(p => p.currentState === 'RUNNING')
  const ready   = statesAtTime.filter(p => p.currentState === 'READY')
  const waiting = statesAtTime.filter(p => p.currentState === 'WAITING')
  const done    = statesAtTime.filter(p => p.currentState === 'DONE')

  return (
    <div className="grid grid-cols-3 gap-2.5" style={{ height: '170px' }}>

      {/* ── Zone 1: I/O Waiting Room ──────────────────────────────── */}
      <div className="glass rounded-xl p-3 flex flex-col overflow-hidden border border-amber-900/30">
        <ZoneHeader
          label="I/O Waiting Room"
          count={waiting.length}
          color="text-amber-400"
          dotColor="bg-amber-400"
          glowClass="shadow-neon-amber"
        />
        <div className="flex-1 overflow-hidden flex flex-wrap gap-1.5 items-start content-start">
          <AnimatePresence>
            {waiting.length === 0 && (
              <p className="text-[10px] text-cyber-300 font-mono w-full text-center mt-3">Idle</p>
            )}
            {waiting.map(p => (
              <ProcessChip key={p.pid} p={p} colorOf={colorOf} pulse />
            ))}
          </AnimatePresence>
        </div>
        {/* I/O activity indicator */}
        {waiting.length > 0 && (
          <div className="flex items-center gap-1 mt-1">
            <div className="flex gap-0.5">
              {[0,1,2].map(i => (
                <div
                  key={i}
                  className="w-1 rounded-full bg-amber-400/70"
                  style={{
                    height: '6px',
                    animation: `pulse ${0.6 + i * 0.2}s ease-in-out infinite alternate`,
                    boxShadow: '0 0 4px rgba(251,191,36,0.6)'
                  }}
                />
              ))}
            </div>
            <span className="text-[9px] font-mono text-amber-500">I/O Active</span>
          </div>
        )}
      </div>

      {/* ── Zone 2: Ready Queue ────────────────────────────────────── */}
      <div className="glass rounded-xl p-3 flex flex-col overflow-hidden border border-cyan-900/30">
        <ZoneHeader
          label="Ready Queue"
          count={ready.length}
          color="text-cyan-400"
          dotColor="bg-cyan-400"
          glowClass="shadow-neon-cyan"
        />
        {/* Conveyor belt */}
        <div className="flex-1 flex items-center overflow-x-auto gap-1.5 py-1">
          <AnimatePresence mode="popLayout">
            {ready.length === 0 && (
              <motion.p
                key="empty"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="text-[10px] text-cyber-300 font-mono w-full text-center"
              >
                Empty
              </motion.p>
            )}
            {ready.map((p, idx) => (
              <motion.div
                key={p.pid}
                layoutId={`proc-${p.pid}`}
                variants={ZONE_VARIANTS}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: 'spring', stiffness: 400, damping: 28, delay: idx * 0.04 }}
              >
                <ProcessChip p={p} colorOf={colorOf} index={idx} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        {/* Conveyor rail */}
        <div className="h-px bg-gradient-to-r from-transparent via-cyan-700/50 to-transparent mt-1" />
        <div className="flex justify-between mt-0.5">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="w-1 h-0.5 bg-cyan-900/50 rounded-full" />
          ))}
        </div>
      </div>

      {/* ── Zone 3: CPU Core ──────────────────────────────────────── */}
      <div className={`glass rounded-xl p-3 flex flex-col items-center justify-center relative overflow-hidden border ${
        running.length > 0 ? 'border-violet-500/50 animate-pulse-neon' : 'border-cyber-500/30'
      }`}>
        <ZoneHeader label="CPU Core" count={running.length > 0 ? 1 : 0} color="text-violet-400" dotColor="bg-violet-400" glowClass="shadow-neon-violet" />

        {/* Rotating ring */}
        {running.length > 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div
              className="absolute w-24 h-24 rounded-full border border-violet-500/20 animate-spin-slow"
              style={{ borderTopColor: 'rgba(139,92,246,0.5)' }}
            />
            <div
              className="absolute w-32 h-32 rounded-full border border-violet-800/10 animate-spin-slow"
              style={{ animationDirection: 'reverse', borderTopColor: 'rgba(167,139,250,0.2)' }}
            />
          </div>
        )}

        <div className="flex-1 flex items-center justify-center w-full">
          <AnimatePresence mode="wait">
            {running.length === 0 ? (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="text-center"
              >
                <div className="text-2xl font-black text-cyber-500 font-mono">IDLE</div>
                <div className="text-[9px] text-cyber-400 uppercase tracking-widest mt-0.5">
                  {result ? 'All done' : 'Awaiting'}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={running[0].pid}
                layoutId={`proc-${running[0].pid}`}
                variants={ZONE_VARIANTS}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                className="text-center relative z-10"
              >
                <CPUCoreCard p={running[0]} colorOf={colorOf} result={result} playhead={playhead} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Done count */}
        {done.length > 0 && (
          <div className="flex items-center gap-1 mt-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-neon-green" />
            <span className="text-[9px] font-mono text-emerald-400">{done.length} completed</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── CPU Core Card ──────────────────────────────────────────────────
function CPUCoreCard({ p, colorOf, result, playhead }) {
  const c = colorOf(p.pid)

  // Compute remaining CPU at this time by looking at gantt slices
  let elapsed = 0
  if (result) {
    const slice = result.gantt.find(s => s.pid === p.pid && s.start <= playhead && playhead < s.end)
    if (slice) elapsed = playhead - slice.start
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="w-14 h-14 rounded-xl flex items-center justify-center text-lg font-black font-mono shadow-lg"
        style={{
          background: `linear-gradient(135deg, ${c.from}, ${c.to})`,
          boxShadow: `0 0 20px ${c.hex}66, 0 0 40px ${c.hex}33`,
        }}
      >
        P{p.pid}
      </div>
      <div className="text-[10px] font-mono" style={{ color: c.hex }}>
        +{elapsed}ms running
      </div>
      <div className="text-[9px] text-cyber-300 font-mono">
        burst: {p.bursts[p.burstIdx ?? 0]?.cpu ?? '?'}ms · pri:{p.priority}
      </div>
    </div>
  )
}

// ── Process Chip ───────────────────────────────────────────────────
function ProcessChip({ p, colorOf, pulse, index }) {
  const c = colorOf(p.pid)
  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${
        pulse ? 'animate-pulse' : ''
      }`}
      style={{
        background: `${c.from}22`,
        borderColor: `${c.hex}55`,
        color: c.hex,
        boxShadow: `0 0 8px ${c.hex}33`,
      }}
    >
      {index !== undefined && (
        <span className="text-[9px] opacity-60">{index + 1}.</span>
      )}
      P{p.pid}
    </div>
  )
}

// ── Zone Header ────────────────────────────────────────────────────
function ZoneHeader({ label, count, color, dotColor, glowClass }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-1.5">
        <div className={`w-1.5 h-1.5 rounded-full ${dotColor} ${count > 0 ? 'animate-pulse' : 'opacity-40'}`} />
        <span className={`text-[10px] font-mono uppercase tracking-wider ${color}`}>{label}</span>
      </div>
      <span className={`text-xs font-mono font-bold ${color}`}>{count}</span>
    </div>
  )
}
