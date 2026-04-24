const SPEEDS = [1, 2, 3]

export default function TimeSlider({
  totalTime, playhead, setPlayhead,
  isPlaying, setIsPlaying,
  playSpeed, setPlaySpeed,
  hasResult
}) {
  const pct = totalTime > 0 ? (playhead / totalTime) * 100 : 0

  const handleSlider = (e) => {
    setPlayhead(Number(e.target.value))
    if (isPlaying) setIsPlaying(false)
  }

  const handlePlayPause = () => {
    if (playhead >= totalTime) {
      setPlayhead(0)
    }
    setIsPlaying(p => !p)
  }

  const handleReset = () => {
    setIsPlaying(false)
    setPlayhead(0)
  }

  return (
    <div className="glass rounded-xl h-full border border-violet-900/30 flex flex-col px-4 py-3 gap-2.5 justify-center">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-wider text-violet-400">
          Time Travel
        </span>
        <span className="text-[10px] font-mono text-cyber-200 tabular-nums">
          {playhead}ms / {totalTime}ms
        </span>
      </div>

      {/* Slider */}
      <div className="relative">
        <input
          type="range"
          min={0}
          max={Math.max(1, totalTime)}
          value={playhead}
          onChange={handleSlider}
          disabled={!hasResult}
          className="cyber-range w-full"
          style={{ '--pct': `${pct}%` }}
        />
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-2">
        {/* Reset */}
        <button
          onClick={handleReset}
          disabled={!hasResult}
          className="btn-cyber btn-ghost w-8 h-8 flex items-center justify-center text-sm disabled:opacity-30 p-0 flex-none"
          title="Reset"
        >
          ↩
        </button>

        {/* Play / Pause */}
        <button
          onClick={handlePlayPause}
          disabled={!hasResult}
          className={`btn-cyber flex-1 h-8 flex items-center justify-center text-xs font-bold transition-all disabled:opacity-30 ${
            isPlaying ? 'btn-danger' : 'btn-primary'
          }`}
        >
          {isPlaying ? 'Pause' : playhead >= totalTime && hasResult ? 'Replay' : 'Play'}
        </button>

        {/* Speed selector */}
        <div className="flex bg-cyber-800/60 rounded-lg border border-cyber-600/30 overflow-hidden flex-none">
          {SPEEDS.map(s => (
            <button
              key={s}
              onClick={() => setPlaySpeed(s)}
              disabled={!hasResult}
              className={`text-[10px] font-mono px-2 h-8 transition-all disabled:opacity-30 ${
                playSpeed === s
                  ? 'bg-violet-800/70 text-violet-200'
                  : 'text-cyber-300 hover:bg-cyber-700/50 hover:text-white'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-cyber-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 transition-all duration-100"
          style={{ width: `${pct}%`, boxShadow: '0 0 6px rgba(139,92,246,0.5)' }}
        />
      </div>
    </div>
  )
}
