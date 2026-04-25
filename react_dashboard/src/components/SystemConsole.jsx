import { useEffect, useRef, useMemo } from 'react'

const TYPE_COLORS = {
  arrival: 'text-cyan-400',
  cpu:     'text-teal-400',
  io:      'text-amber-400',
  ai:      'text-emerald-400',
  preempt: 'text-pink-400',
  done:    'text-slate-300',
}

const TYPE_BADGE_BG = {
  arrival: 'bg-cyan-900/40 border-cyan-700/40',
  cpu:     'bg-teal-900/40 border-teal-700/40',
  io:      'bg-amber-900/40 border-amber-700/40',
  ai:      'bg-emerald-900/40 border-emerald-700/40',
  preempt: 'bg-pink-900/40 border-pink-700/40',
  done:    'bg-slate-700/30 border-slate-600/30',
}

export default function SystemConsole({ logs, playhead }) {
  const endRef = useRef(null)

  const visibleLogs = useMemo(
    () => logs.filter(l => l.time <= playhead),
    [logs, playhead]
  )

  // Auto-scroll to bottom when new logs appear
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [visibleLogs.length])

  return (
    <div className="glass rounded-xl h-full border border-emerald-900/25 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-emerald-900/20 flex-none">
        <div className="flex gap-1">
          <div className="w-2 h-2 rounded-full bg-red-500/70" />
          <div className="w-2 h-2 rounded-full bg-amber-500/70" />
          <div className="w-2 h-2 rounded-full bg-emerald-500/70" />
        </div>
        <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider flex-1">
          System Console
        </span>
        <span className="text-[9px] font-mono text-cyber-300">
          {visibleLogs.length}/{logs.length} events
        </span>
      </div>

      {/* Log area */}
      <div className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[10px] space-y-0.5 bg-cyber-900/40">
        {visibleLogs.length === 0 && (
          <span className="text-emerald-600">
            {logs.length === 0
              ? '> Awaiting simulation...'
              : '> Playhead at 0ms. Advance to see events.'}
          </span>
        )}
        {visibleLogs.map((log, idx) => (
          <div key={`${log.id ?? idx}`} className="flex items-start gap-1.5 leading-relaxed">
            {/* Timestamp */}
            <span className="text-cyber-400 flex-none w-14 text-right">
              [{log.time}ms]
            </span>
            {/* Type badge */}
            <span className={`flex-none text-[8px] px-1 py-0.5 rounded border uppercase tracking-wider ${TYPE_BADGE_BG[log.type] ?? TYPE_BADGE_BG.done}`}>
              {log.type ?? 'sys'}
            </span>
            {/* Message */}
            <span className={TYPE_COLORS[log.type] ?? 'text-slate-300'}>
              {log.message}
            </span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  )
}
