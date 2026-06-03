import { useState, useCallback, useRef, useEffect } from 'react'
import SensorScene from './SensorScene.jsx'
import AxisMapPanel, { defaultAxisMap, applyAxisMap } from './AxisMapPanel.jsx'
import RecordingPanel, { buildCSV } from './RecordingPanel.jsx'
import ReplayPanel from './ReplayPanel.jsx'
import { useReplay } from './useReplay.js'
import { useSerial } from './useSerial.js'
import './App.css'

const DEG = v => typeof v === 'number' ? v.toFixed(1) : '—'
const FIX = v => typeof v === 'number' ? v.toFixed(4) : '—'

export default function App() {
  const [mode, setMode]         = useState('live')
  const [rotation, setRotation] = useState({ type: 'demo', y: 0 })
  const [latest, setLatest]     = useState(null)
  const [log, setLog]           = useState([])
  const [axisMap, setAxisMap]   = useState(defaultAxisMap())
  const axisMapRef = useRef(axisMap)
  useEffect(() => { axisMapRef.current = axisMap }, [axisMap])

  const offsetRef  = useRef({ pitch: 0, roll: 0, yaw: 0 })
  const demoRef    = useRef(null)
  const demoAngle  = useRef(0)
  const modeRef    = useRef('live')
  useEffect(() => { modeRef.current = mode }, [mode])

  // ── Recording ────────────────────────────────────────────────
  const [recState, setRecState] = useState({ recording: false, hasData: false })
  const recordingRef            = useRef(false)
  const recStartTimeRef         = useRef(0)
  const recRowsRef              = useRef([])
  const savedRowsRef            = useRef([])

  const handleRecStart = useCallback(() => {
    recRowsRef.current      = []
    recStartTimeRef.current = performance.now()
    recordingRef.current    = true
    setRecState({ recording: true, hasData: false })
  }, [])

  const handleRecStop = useCallback(() => {
    recordingRef.current = false
    savedRowsRef.current = recRowsRef.current
    setRecState({ recording: false, hasData: savedRowsRef.current.length > 0 })
  }, [])

  const handleRecSave = useCallback(async () => {
    const csv = buildCSV(savedRowsRef.current)
    const blob = new Blob([csv], { type: 'text/csv' })
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filename = `imu_${ts}.csv`
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          startIn: 'documents',
          types: [{ description: 'CSV file', accept: { 'text/csv': ['.csv'] } }],
        })
        const writable = await handle.createWritable()
        await writable.write(blob)
        await writable.close()
        return
      } catch (e) {
        if (e.name === 'AbortError') return
      }
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }, [])

  // ── Replay ───────────────────────────────────────────────────
  const onReplayFrame = useCallback((row) => {
    const euler = { pitch: row.pitch, roll: row.roll, yaw: row.yaw }
    const zeroed = {
      pitch: euler.pitch - offsetRef.current.pitch,
      roll:  euler.roll  - offsetRef.current.roll,
      yaw:   euler.yaw   - offsetRef.current.yaw,
    }
    setRotation(applyAxisMap(zeroed, axisMapRef.current))
    setLatest({
      type: 'csv',
      timestamp: row.timestamp,
      accel: { x: row.ax, y: row.ay, z: row.az },
      quat:  { w: row.qw, x: row.qi, y: row.qj, z: row.qk },
      euler,
      trigger: row.trigger,
    })
  }, [])

  const replay = useReplay(onReplayFrame)

  // ── Demo spin ────────────────────────────────────────────────
  useEffect(() => {
    demoRef.current = setInterval(() => {
      demoAngle.current += 0.008
      setRotation({ type: 'demo', y: demoAngle.current })
    }, 16)
    return () => clearInterval(demoRef.current)
  }, [])

  // ── Live serial data ─────────────────────────────────────────
  const onData = useCallback((data) => {
    if (modeRef.current === 'replay') return
    setLatest(data)
    if (data.type === 'csv') {
      clearInterval(demoRef.current)
      if (data.trigger) offsetRef.current = { ...data.euler }
      const zeroed = {
        pitch: data.euler.pitch - offsetRef.current.pitch,
        roll:  data.euler.roll  - offsetRef.current.roll,
        yaw:   data.euler.yaw   - offsetRef.current.yaw,
      }
      setRotation(applyAxisMap(zeroed, axisMapRef.current))
      if (recordingRef.current) {
        const t = Math.round(performance.now() - recStartTimeRef.current)
        recRowsRef.current.push({
          timestamp: t,
          ax: data.accel.x.toFixed(4), ay: data.accel.y.toFixed(4), az: data.accel.z.toFixed(4),
          qi: data.quat.x.toFixed(4),  qj: data.quat.y.toFixed(4),  qk: data.quat.z.toFixed(4), qw: data.quat.w.toFixed(4),
          pitch: data.euler.pitch.toFixed(2), roll: data.euler.roll.toFixed(2), yaw: data.euler.yaw.toFixed(2),
          trigger: data.trigger ? 1 : 0,
        })
      }
    }
    setLog(prev => {
      const line = data.type === 'csv'
        ? `${data.timestamp}ms  P:${data.euler.pitch.toFixed(1)}° R:${data.euler.roll.toFixed(1)}° Y:${data.euler.yaw.toFixed(1)}°${data.trigger ? '  ● ZERO' : ''}`
        : `[raw] ${data.line}`
      return [{ text: line, type: data.type }, ...prev].slice(0, 120)
    })
  }, [])

  const { connected, error, connect, disconnect, softReset } = useSerial(onData)

  const handleConnect = () => {
    if (connected) {
      disconnect()
      demoRef.current = setInterval(() => {
        demoAngle.current += 0.008
        setRotation({ type: 'demo', y: demoAngle.current })
      }, 16)
    } else {
      connect()
    }
  }

  const switchMode = (m) => {
    setMode(m)
    if (m === 'replay') {
      clearInterval(demoRef.current)
      replay.pause()
    } else {
      replay.pause()
      if (!connected) {
        demoRef.current = setInterval(() => {
          demoAngle.current += 0.008
          setRotation({ type: 'demo', y: demoAngle.current })
        }, 16)
      }
    }
  }

  const csv = latest?.type === 'csv' ? latest : null

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <span className="logo">IMU</span>
          <span className="subtitle">BNO085 · RP2040</span>
        </div>

        <div className="mode-toggle">
          <button className={`mode-btn ${mode === 'live' ? 'active' : ''}`} onClick={() => switchMode('live')}>
            ● Live
          </button>
          <button className={`mode-btn ${mode === 'replay' ? 'active' : ''}`} onClick={() => switchMode('replay')}>
            ▶ Replay
          </button>
        </div>

        <div className="header-right">
          {error && <span className="error-badge">{error}</span>}
          {mode === 'live' && csv?.trigger && <span className="trigger-badge">● ZERO</span>}
          {mode === 'live' && (
            <>
              <div className={`status-dot ${connected ? 'connected' : 'disconnected'}`} />
              <span className="status-label">{connected ? 'Connected' : 'Disconnected'}</span>
              {connected && (
                <button className="reset-btn" onClick={softReset} title="Send Ctrl-D soft reset to CircuitPython">
                  ↺ Reset
                </button>
              )}
              <button className={`connect-btn ${connected ? 'active' : ''}`} onClick={handleConnect}>
                {connected ? 'Disconnect' : 'Connect USB'}
              </button>
            </>
          )}
          {mode === 'replay' && <span className="status-label" style={{ color: '#5af' }}>Replay mode</span>}
        </div>
      </header>

      <div className="main">
        <div className="scene-area">
          <SensorScene rotation={rotation} />
          <AxisMapPanel axisMap={axisMap} onChange={setAxisMap} />

          {mode === 'live' && (
            <RecordingPanel
              state={recState}
              onStart={handleRecStart}
              onStop={handleRecStop}
              onSave={handleRecSave}
            />
          )}

          {mode === 'replay' && <ReplayPanel replay={replay} />}

          {mode === 'live' && !connected && (
            <div className="demo-badge">DEMO — connect sensor for live data</div>
          )}
        </div>

        <aside className="sidebar">
          <section className="data-card">
            <h3>Euler Angles</h3>
            {csv ? (
              <table className="data-table">
                <tbody>
                  <tr><td>Pitch</td><td>{DEG(csv.euler.pitch)}°</td></tr>
                  <tr><td>Roll</td><td>{DEG(csv.euler.roll)}°</td></tr>
                  <tr><td>Yaw</td><td>{DEG(csv.euler.yaw)}°</td></tr>
                </tbody>
              </table>
            ) : <p className="no-data">No data yet</p>}
          </section>

          <section className="data-card">
            <h3>Quaternion</h3>
            {csv ? (
              <table className="data-table">
                <tbody>
                  <tr><td>W</td><td>{FIX(csv.quat.w)}</td></tr>
                  <tr><td>X</td><td>{FIX(csv.quat.x)}</td></tr>
                  <tr><td>Y</td><td>{FIX(csv.quat.y)}</td></tr>
                  <tr><td>Z</td><td>{FIX(csv.quat.z)}</td></tr>
                </tbody>
              </table>
            ) : <p className="no-data">No data yet</p>}
          </section>

          <section className="data-card">
            <h3>Accelerometer (m/s²)</h3>
            {csv ? (
              <table className="data-table">
                <tbody>
                  <tr><td>X</td><td>{FIX(csv.accel.x)}</td></tr>
                  <tr><td>Y</td><td>{FIX(csv.accel.y)}</td></tr>
                  <tr><td>Z</td><td>{FIX(csv.accel.z)}</td></tr>
                </tbody>
              </table>
            ) : <p className="no-data">No data yet</p>}
          </section>

          {mode === 'live' && (
            <section className="data-card log-card">
              <h3>Serial Console</h3>
              <div className="log">
                {log.length === 0 && <span className="no-data">Waiting for data…</span>}
                {log.map((entry, i) => (
                  <div key={i} className={`log-line log-${entry.type}${entry.text.includes('ZERO') ? ' log-trigger' : ''}`}>
                    {entry.text}
                  </div>
                ))}
              </div>
            </section>
          )}

          {mode === 'replay' && csv && (
            <section className="data-card">
              <h3>Frame</h3>
              <table className="data-table">
                <tbody>
                  <tr><td>Time</td><td>{csv.timestamp}ms</td></tr>
                  <tr><td>Rows</td><td>{replay.rows.length}</td></tr>
                  <tr><td>Speed</td><td>{replay.speed}×</td></tr>
                </tbody>
              </table>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}
