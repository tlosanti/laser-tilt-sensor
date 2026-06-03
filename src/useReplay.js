import { useState, useRef, useCallback, useEffect } from 'react'

export function parseCSV(text) {
  const lines = text.trim().split('\n')
  return lines.slice(1).map(line => {
    const [timestamp, ax, ay, az, qi, qj, qk, qw, pitch, roll, yaw, trigger] = line.split(',').map(Number)
    return { timestamp, ax, ay, az, qi, qj, qk, qw, pitch, roll, yaw, trigger: trigger === 1 }
  }).filter(r => isFinite(r.timestamp))
}

export function useReplay(onFrame) {
  const [rows, setRows]       = useState([])
  const [playing, setPlaying] = useState(false)
  const [cursor, setCursor]   = useState(0)
  const [speed, setSpeed]     = useState(1)
  const [filename, setFilename] = useState(null)

  const rowsRef    = useRef([])
  const cursorRef  = useRef(0)
  const speedRef   = useRef(1)
  const playingRef = useRef(false)
  const anchorRef  = useRef({ realTime: 0, dataTime: 0 })
  const onFrameRef = useRef(onFrame)
  useEffect(() => { onFrameRef.current = onFrame }, [onFrame])

  const applyFile = useCallback(async (file) => {
    const parsed = parseCSV(await file.text())
    rowsRef.current = parsed
    setRows(parsed)
    setFilename(file.name)
    cursorRef.current = 0
    setCursor(0)
    playingRef.current = false
    setPlaying(false)
    if (parsed.length > 0) onFrameRef.current(parsed[0])
  }, [])

  const loadFile = useCallback(async () => {
    if ('showOpenFilePicker' in window) {
      try {
        const [handle] = await window.showOpenFilePicker({
          startIn: 'documents',
          types: [{ description: 'CSV', accept: { 'text/csv': ['.csv'] } }],
        })
        await applyFile(await handle.getFile())
      } catch (e) {
        if (e.name !== 'AbortError') console.error(e)
      }
    } else {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.csv,text/csv'
      input.onchange = async () => {
        if (input.files[0]) await applyFile(input.files[0])
      }
      input.click()
    }
  }, [applyFile])

  const play = useCallback(() => {
    if (!rowsRef.current.length) return
    const idx = cursorRef.current >= rowsRef.current.length - 1 ? 0 : cursorRef.current
    cursorRef.current = idx
    setCursor(idx)
    anchorRef.current = { realTime: performance.now(), dataTime: rowsRef.current[idx].timestamp }
    playingRef.current = true
    setPlaying(true)
  }, [])

  const pause = useCallback(() => {
    playingRef.current = false
    setPlaying(false)
  }, [])

  const seek = useCallback((idx) => {
    const rows = rowsRef.current
    if (!rows.length) return
    const clamped = Math.max(0, Math.min(rows.length - 1, idx))
    cursorRef.current = clamped
    setCursor(clamped)
    anchorRef.current = { realTime: performance.now(), dataTime: rows[clamped].timestamp }
    onFrameRef.current(rows[clamped])
  }, [])

  const changeSpeed = useCallback((s) => {
    const rows = rowsRef.current
    if (rows.length && cursorRef.current < rows.length) {
      anchorRef.current = { realTime: performance.now(), dataTime: rows[cursorRef.current].timestamp }
    }
    speedRef.current = s
    setSpeed(s)
  }, [])

  useEffect(() => {
    let raf
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (!playingRef.current) return
      const rows = rowsRef.current
      if (!rows.length) return
      const dataTime = anchorRef.current.dataTime + (performance.now() - anchorRef.current.realTime) * speedRef.current
      let idx = cursorRef.current
      while (idx < rows.length - 1 && rows[idx + 1].timestamp <= dataTime) idx++
      if (idx !== cursorRef.current) {
        cursorRef.current = idx
        setCursor(idx)
        onFrameRef.current(rows[idx])
      }
      if (idx >= rows.length - 1) {
        playingRef.current = false
        setPlaying(false)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const duration    = rows.length > 0 ? rows[rows.length - 1].timestamp : 0
  const currentTime = rows.length > 0 && cursor < rows.length ? rows[cursor].timestamp : 0

  return { rows, playing, cursor, speed, filename, duration, currentTime, loadFile, play, pause, seek, changeSpeed }
}
