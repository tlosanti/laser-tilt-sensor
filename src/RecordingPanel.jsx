import './RecordingPanel.css'

const CSV_HEADER = 'timestamp_ms,ax,ay,az,qi,qj,qk,qw,pitch,roll,yaw,trigger\n'

export default function RecordingPanel({ state, onStart, onStop, onSave }) {
  const { recording, hasData } = state

  return (
    <div className="rec-panel">
      <div className="rec-title">Recording</div>
      <div className="rec-buttons">
        <button
          className={`rec-btn start ${recording ? 'disabled' : ''}`}
          onClick={onStart}
          disabled={recording}
        >
          ▶ Start
        </button>
        <button
          className={`rec-btn stop ${!recording ? 'disabled' : ''}`}
          onClick={onStop}
          disabled={!recording}
        >
          ■ Stop
        </button>
        <button
          className={`rec-btn save ${!hasData || recording ? 'disabled' : ''}`}
          onClick={onSave}
          disabled={!hasData || recording}
        >
          ↓ Save
        </button>
      </div>
      {recording && <div className="rec-indicator">● Recording</div>}
    </div>
  )
}

export function buildCSV(rows) {
  return CSV_HEADER + rows.map(r =>
    `${r.timestamp},${r.ax},${r.ay},${r.az},${r.qi},${r.qj},${r.qk},${r.qw},${r.pitch},${r.roll},${r.yaw},${r.trigger}`
  ).join('\n')
}
