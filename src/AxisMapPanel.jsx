import './AxisMapPanel.css'

const SOURCES = ['pitch', 'roll', 'yaw']

export default function AxisMapPanel({ axisMap, onChange }) {
  const set = (axis, key, value) =>
    onChange({ ...axisMap, [axis]: { ...axisMap[axis], [key]: value } })

  return (
    <div className="axis-panel">
      <div className="axis-panel-title">Axis Mapping</div>
      {['x', 'y', 'z'].map(axis => (
        <div key={axis} className="axis-row">
          <span className={`axis-label axis-${axis}`}>{axis.toUpperCase()}</span>
          <select
            value={axisMap[axis].src}
            onChange={e => set(axis, 'src', e.target.value)}
          >
            {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            className={`sign-btn ${axisMap[axis].sign === -1 ? 'inverted' : ''}`}
            onClick={() => set(axis, 'sign', axisMap[axis].sign * -1)}
          >
            {axisMap[axis].sign === 1 ? '+' : '−'}
          </button>
        </div>
      ))}
      <button
        className="reset-btn"
        onClick={() => onChange(defaultAxisMap())}
      >
        Reset
      </button>
    </div>
  )
}

export function defaultAxisMap() {
  return {
    x: { src: 'roll',  sign: 1 },
    y: { src: 'pitch', sign: 1 },
    z: { src: 'yaw',   sign: 1 },
  }
}

export function applyAxisMap(euler, axisMap) {
  return {
    type: 'euler',
    roll:  euler[axisMap.x.src] * axisMap.x.sign,
    pitch: euler[axisMap.y.src] * axisMap.y.sign,
    yaw:   euler[axisMap.z.src] * axisMap.z.sign,
  }
}
