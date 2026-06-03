import './ReplayPanel.css'

const SPEEDS = [0.25, 0.5, 1, 2, 5]

function fmt(ms) {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}.${String(Math.floor((ms % 1000) / 10)).padStart(2, '0')}`
}

export default function ReplayPanel({ replay }) {
  const { rows, playing, cursor, speed, filename, duration, currentTime,
          loadFile, play, pause, seek, changeSpeed } = replay
  const hasData = rows.length > 0

  return (
    <div className="replay-panel">
      <div className="replay-header">
        <span className="replay-title">Replay</span>
        <button className="replay-load-btn" onClick={loadFile}>
          {filename ? '↺ Load new' : '↑ Load CSV'}
        </button>
      </div>

      {filename && <div className="replay-filename" title={filename}>{filename}</div>}

      <div className="replay-scrubber-row">
        <span className="replay-time">{fmt(currentTime)}</span>
        <input
          type="range"
          className="replay-scrubber"
          min={0}
          max={Math.max(0, rows.length - 1)}
          value={cursor}
          onChange={e => seek(Number(e.target.value))}
          disabled={!hasData}
        />
        <span className="replay-time">{fmt(duration)}</span>
      </div>

      <div className="replay-controls">
        <button className="replay-playpause" onClick={playing ? pause : play} disabled={!hasData}>
          {playing ? '❙❙' : '▶'}
        </button>
        <div className="replay-speeds">
          {SPEEDS.map(s => (
            <button key={s} className={`speed-btn ${speed === s ? 'active' : ''}`} onClick={() => changeSpeed(s)}>
              {s}×
            </button>
          ))}
        </div>
      </div>

      {!hasData && <p className="replay-hint">Load a CSV recorded from this app</p>}
    </div>
  )
}
