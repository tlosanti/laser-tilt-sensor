import { useState, useCallback, useRef, useEffect } from 'react'
import SensorScene from './SensorScene.jsx'
import AxisMapPanel, { defaultAxisMap, applyAxisMap } from './AxisMapPanel.jsx'
import RecordingPanel, { buildCSV } from './RecordingPanel.jsx'
import ReplayPanel from './ReplayPanel.jsx'
import PhoneConnectPanel from './PhoneConnectPanel.jsx'
import { useReplay } from './useReplay.js'
import { useSerial } from './useSerial.js'
import { useWebSocket } from './useWebSocket.js'
import './App.css'

const DEG = v => typeof v === 'number' ? v.toFixed(1) : '—'
const FIX = v => typeof v === 'number' ? v.toFixed(4) : '—'

// ── Quaternion helpers (no Three.js dep needed in App) ────────
const S2 = Math.SQRT2
const quatMul = (a, b) => ({
  w: a.w*b.w - a.x*b.x - a.y*b.y - a.z*b.z,
  x: a.w*b.x + a.x*b.w + a.y*b.z - a.z*b.y,
  y: a.w*b.y - a.x*b.z + a.y*b.w + a.z*b.x,
  z: a.w*b.z + a.x*b.y - a.y*b.x + a.z*b.w,
})
const axisAngleQ = (ax, ay, az, deg) => {
  const r = deg * Math.PI / 360
  const s = Math.sin(r)
  return { x: ax*s, y: ay*s, z: az*s, w: Math.cos(r) }
}
const IDENTITY_Q = { x: 0, y: 0, z: 0, w: 1 }

// 45° mount steps — pre-multiply = world-space rotation
const MOUNT_DIRS = [
  ['↖', 1/S2, 0, -1/S2], ['↑', 1, 0, 0],      ['↗', 1/S2, 0, 1/S2],
  ['←', 0, 0, -1],        [null, 0, 0, 0],      ['→', 0, 0, 1],
  ['↙',-1/S2, 0,-1/S2],  ['↓',-1, 0, 0],       ['↘',-1/S2, 0, 1/S2],
]

export default function App() {
  const [showMobileWarning, setShowMobileWarning] = useState(
    () => window.innerWidth < 1024 && !localStorage.getItem('mobile-warning-dismissed')
  )
  const [screenSize, setScreenSize] = useState({ w: window.innerWidth, h: window.innerHeight })

  useEffect(() => {
    const onResize = () => setScreenSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const dismissMobileWarning = () => {
    localStorage.setItem('mobile-warning-dismissed', '1')
    setShowMobileWarning(false)
  }

  const [mode, setMode]         = useState('live')
  const [rotation, setRotation] = useState({ type: 'demo', y: 0 })
  const [latest, setLatest]     = useState(null)
  const [log, setLog]           = useState([])
  const [axisMap, setAxisMap]   = useState(defaultAxisMap())
  const axisMapRef = useRef(axisMap)
  useEffect(() => { axisMapRef.current = axisMap }, [axisMap])

  const offsetRef    = useRef({ pitch: 0, roll: 0, yaw: 0 })
  const latestEulerRef = useRef({ pitch: 0, roll: 0, yaw: 0 })
  const [mountQuat, setMountQuat] = useState(IDENTITY_Q)
  const demoRef      = useRef(null)
  const demoAngle    = useRef(0)
  const modeRef      = useRef('live')
  useEffect(() => { modeRef.current = mode }, [mode])

  const sceneRef          = useRef(null)
  const fileInputRef      = useRef(null)
  const [modelName, setModelName] = useState(null)
  const phoneModelRef     = useRef(false) // true when we auto-loaded the phone model

  const handleModelFile = useCallback((e) => {
    const file = e.target.files[0]
    if (!file) return
    sceneRef.current?.loadModel(file)
    setModelName(file.name)
    phoneModelRef.current = false // user took manual control
    e.target.value = ''
  }, [])

  const handleClearModel = useCallback(() => {
    sceneRef.current?.clearModel()
    setModelName(null)
    phoneModelRef.current = false
  }, [])

  const handleZero = useCallback(() => {
    offsetRef.current = { ...latestEulerRef.current }
  }, [])

  const rotateMountBy = useCallback((ax, ay, az, deg) => {
    const delta = axisAngleQ(ax, ay, az, deg)
    setMountQuat(prev => quatMul(delta, prev)) // pre-multiply = world-space
  }, [])

  const resetMount = useCallback(() => setMountQuat(IDENTITY_Q), [])

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
      latestEulerRef.current = data.euler
      clearInterval(demoRef.current)
      if (data.source === 'phone') {
        const zeroed = {
          pitch: data.euler.pitch - offsetRef.current.pitch,
          roll:  data.euler.roll  - offsetRef.current.roll,
          yaw:   data.euler.yaw   - offsetRef.current.yaw,
        }
        setRotation(applyAxisMap(zeroed, axisMapRef.current))
      } else {
        if (data.trigger) offsetRef.current = { ...data.euler }
        const zeroed = {
          pitch: data.euler.pitch - offsetRef.current.pitch,
          roll:  data.euler.roll  - offsetRef.current.roll,
          yaw:   data.euler.yaw   - offsetRef.current.yaw,
        }
        setRotation(applyAxisMap(zeroed, axisMapRef.current))
      }
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
  const {
    connected: wsConnected,
    phoneConnected,
    connect: wsConnect,
    disconnect: wsDisconnect,
  } = useWebSocket(onData)

  // Switch to iPhone model when phone connects; restore default on disconnect
  // useEffect(() => {
  //   if (phoneConnected) {
  //     fetch('/iPhone_15_Pro.stl')
  //       .then(r => r.ok ? r.blob() : Promise.reject())
  //       .then(blob => {
  //         const file = new File([blob], 'iPhone_15_Pro.stl')
  //         sceneRef.current?.loadModel(file)
  //         setModelName('iPhone (phone mode)')
  //         phoneModelRef.current = true
  //       })
  //       .catch(() => {})
  //   } else if (phoneModelRef.current) {
  //     sceneRef.current?.clearModel()
  //     setModelName(null)
  //     phoneModelRef.current = false
  //   }
  // }, [phoneConnected])

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

  const handlePhoneConnect = () => {
    clearInterval(demoRef.current)
    wsConnect()
  }

  const handlePhoneDisconnect = () => {
    wsDisconnect()
    demoRef.current = setInterval(() => {
      demoAngle.current += 0.008
      setRotation({ type: 'demo', y: demoAngle.current })
    }, 16)
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
    <>
    {showMobileWarning && (
      <div
        className="mobile-warning-overlay"
        style={{ width: screenSize.w, height: screenSize.h }}
        onClick={dismissMobileWarning}
      >
        <div className="mobile-warning-modal" onClick={e => e.stopPropagation()}>
          <div className="mobile-warning-icon">🖥️</div>
          <h2 className="mobile-warning-title">Best on Desktop</h2>
          <p className="mobile-warning-body">
            This app is designed for desktop browsers. On mobile the layout may not display correctly.
          </p>
          <button className="mobile-warning-btn" onClick={dismissMobileWarning}>
            Got it
          </button>
        </div>
      </div>
    )}
    <div className="app">
      <header className="header">
        <div className="header-left">
          <span className="logo">IMU</span>
          <span className="subtitle">BNO085 · RP2040</span>
        </div>

        <div className="model-loader">
          <input
            ref={fileInputRef}
            type="file"
            accept=".glb,.gltf,.stl,.obj"
            style={{ display: 'none' }}
            onChange={handleModelFile}
          />
          {modelName
            ? <><span className="model-name" title={modelName}>{modelName}</span>
                <button className="model-btn" onClick={handleClearModel}>✕</button></>
            : <button className="model-btn" onClick={() => fileInputRef.current.click()}>⬆ Load Model</button>
          }
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
          {mode === 'live' && (connected || wsConnected) && (
            <button className="zero-btn" onClick={handleZero} title="Zero current orientation">⊙ Zero</button>
          )}
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
              <PhoneConnectPanel
                wsConnected={wsConnected}
                phoneConnected={phoneConnected}
                onConnect={handlePhoneConnect}
                onDisconnect={handlePhoneDisconnect}
              />
            </>
          )}
          {mode === 'replay' && <span className="status-label" style={{ color: '#5af' }}>Replay mode</span>}
        </div>
      </header>

      <div className="main">
        <div className="scene-area">
          <SensorScene rotation={rotation} mountQuat={mountQuat} ref={sceneRef} />
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

          {mode === 'live' && !connected && !wsConnected && (
            <div className="demo-badge">DEMO — connect USB sensor or phone for live data</div>
          )}

          <div className="mount-panel">
            <div className="mount-title">Orient Model</div>
            <div className="mount-grid">
              {MOUNT_DIRS.map(([lbl, ax, ay, az], i) =>
                lbl
                  ? <button key={i} className="mount-dir-btn" onClick={() => rotateMountBy(ax, ay, az, 45)}>{lbl}</button>
                  : <button key={i} className="mount-dir-btn mount-reset" onClick={resetMount} title="Reset orientation">⊙</button>
              )}
            </div>
            <div className="mount-yaw">
              <button className="mount-dir-btn" onClick={() => rotateMountBy(0, 1, 0, -45)}>↺</button>
              <span className="mount-yaw-label">Yaw</span>
              <button className="mount-dir-btn" onClick={() => rotateMountBy(0, 1, 0,  45)}>↻</button>
            </div>
          </div>
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
    </>
  )
}
