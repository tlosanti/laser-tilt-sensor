import { useState, useRef, useCallback, useEffect } from 'react'

function quatToEuler(q) {
  const { w, x, y, z } = q
  const rad2deg = 180 / Math.PI

  // ZXY intrinsic decomposition — asin on pitch (middle axis X),
  // atan2 on roll and yaw so roll gets full [-180,180] range
  const pitch = Math.asin(Math.max(-1, Math.min(1, 2 * (y * z + w * x)))) * rad2deg
  const roll  = Math.atan2(2 * (w * y - x * z), 1 - 2 * (x * x + y * y)) * rad2deg
  const yaw   = Math.atan2(2 * (w * z - x * y), 1 - 2 * (x * x + z * z)) * rad2deg

  return {
    pitch,
    roll,
    yaw: ((yaw % 360) + 360) % 360,
  }
}

export function useWebSocket(onData) {
  const [connected, setConnected] = useState(false)
  const [phoneConnected, setPhoneConnected] = useState(false)
  const wsRef = useRef(null)
  const onDataRef = useRef(onData)
  useEffect(() => { onDataRef.current = onData }, [onData])

  const connect = useCallback(() => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/ws-relay`)
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'register', role: 'desktop' }))
      setConnected(true)
    }

    ws.onmessage = (e) => {
      let msg
      try { msg = JSON.parse(e.data) } catch { return }

      if (msg.type === 'peer-count') {
        setPhoneConnected(msg.phones > 0)
        return
      }

      if (msg.type === 'orientation') {
        const { alpha, beta, gamma, quaternion, timestamp } = msg
        const quat = quaternion
          ? { w: quaternion.w, x: quaternion.x, y: quaternion.y, z: quaternion.z }
          : { w: 1, x: 0, y: 0, z: 0 }
        const euler = quaternion
          ? quatToEuler(quat)
          : { pitch: beta || 0, roll: gamma || 0, yaw: alpha || 0 }

        const data = {
          type: 'csv',
          timestamp: Math.round(timestamp),
          accel: { x: 0, y: 0, z: 0 },
          quat,
          euler,
          trigger: false,
        }
        onDataRef.current(data)
      }
    }

    ws.onclose = () => {
      setConnected(false)
      setPhoneConnected(false)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [])

  const disconnect = useCallback(() => {
    wsRef.current?.close()
    wsRef.current = null
    setConnected(false)
    setPhoneConnected(false)
  }, [])

  return { connected, phoneConnected, connect, disconnect }
}
