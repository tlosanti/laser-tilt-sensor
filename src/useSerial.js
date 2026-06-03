import { useState, useRef, useCallback, useEffect } from 'react'

// Parses the CSV format output by the BNO085 firmware:
//   timestamp_ms,ax,ay,az,i,j,k,w,pitch,roll,yaw,trigger

export function useSerial(onData) {
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState(null)
  const portRef = useRef(null)
  const readerRef = useRef(null)
  const readingRef = useRef(false)
  const onDataRef = useRef(onData)
  useEffect(() => { onDataRef.current = onData }, [onData])

  const connect = useCallback(async () => {
    if (!('serial' in navigator)) {
      setError('Web Serial API not supported. Use Chrome or Edge 89+.')
      return
    }
    try {
      const port = await navigator.serial.requestPort()
      await port.open({ baudRate: 115200 })
      portRef.current = port
      setConnected(true)
      setError(null)
      readingRef.current = true

      const decoder = new TextDecoderStream()
      port.readable.pipeTo(decoder.writable)
      const reader = decoder.readable.getReader()
      readerRef.current = reader

      let buffer = ''
      while (readingRef.current) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += value
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed) parseLine(trimmed, onDataRef.current)
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message)
      setConnected(false)
    }
  }, [])

  const disconnect = useCallback(async () => {
    readingRef.current = false
    try { await readerRef.current?.cancel() } catch {}
    try { await portRef.current?.close() } catch {}
    setConnected(false)
  }, [])

  const sendBytes = useCallback(async (bytes) => {
    if (!portRef.current?.writable) return
    const writer = portRef.current.writable.getWriter()
    try { await writer.write(bytes) } finally { writer.releaseLock() }
  }, [])

  const softReset = useCallback(() => {
    // CircuitPython soft-reset: Ctrl-D (0x04)
    return sendBytes(new Uint8Array([0x04]))
  }, [sendBytes])

  return { connected, error, connect, disconnect, softReset }
}

function parseLine(line, onData) {
  const parts = line.split(',').map(Number)
  if (parts.length === 12 && parts.every(isFinite)) {
    const [timestamp, ax, ay, az, qi, qj, qk, qw, pitch, roll, yaw, trigger] = parts
    onData({
      type: 'csv',
      timestamp,
      accel: { x: ax, y: ay, z: az },
      quat: { w: qw, x: qi, y: qj, z: qk },
      euler: { pitch, roll, yaw },
      trigger: trigger === 1,
    })
  } else {
    onData({ type: 'raw', line })
  }
}
