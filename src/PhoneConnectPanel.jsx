import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import './PhoneConnectPanel.css'

export default function PhoneConnectPanel({ wsConnected, phoneConnected, onConnect, onDisconnect }) {
  const [open, setOpen] = useState(false)
  const [phoneUrl, setPhoneUrl] = useState(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!open) return
    fetch('/local-ip')
      .then(r => r.json())
      .then(({ ip }) => {
        // Railway returns a domain name; local returns an IP address
        const isDomain = !/^(\d+\.){3}\d+$/.test(ip)
        if (isDomain) {
          setPhoneUrl(`https://${ip}/phone.html`)
        } else {
          const port = location.port || (location.protocol === 'https:' ? '443' : '80')
          const proto = location.protocol === 'https:' ? 'https' : 'http'
          setPhoneUrl(`${proto}://${ip}:${port}/phone.html`)
        }
      })
      .catch(() => {
        setPhoneUrl(`${location.protocol}//${location.hostname}:${location.port}/phone.html`)
      })
  }, [open])

  useEffect(() => {
    if (canvasRef.current && phoneUrl) {
      QRCode.toCanvas(canvasRef.current, phoneUrl, {
        width: 180,
        margin: 2,
        color: { dark: '#cde', light: '#0e0e1a' },
      })
    }
  }, [phoneUrl, open])

  const handleToggle = () => {
    if (wsConnected) {
      onDisconnect()
      setOpen(false)
    } else {
      setOpen(!open)
    }
  }

  const handleConnect = () => {
    onConnect()
  }

  return (
    <div className="phone-connect">
      <button
        className={`phone-btn ${wsConnected ? 'active' : ''}`}
        onClick={handleToggle}
      >
        {wsConnected ? 'Disconnect Phone' : 'Connect Phone'}
      </button>

      {open && !wsConnected && (
        <div className="phone-panel">
          <div className="phone-panel-header">
            <span>Connect iPhone Sensor</span>
            <button className="phone-panel-close" onClick={() => setOpen(false)}>✕</button>
          </div>
          <div className="phone-panel-body">
            <p className="phone-step">1. Connect to the same WiFi network</p>
            <p className="phone-step">2. Scan QR code or open URL on your phone</p>
            {phoneUrl && (
              <>
                <canvas ref={canvasRef} className="phone-qr" />
                <code className="phone-url">{phoneUrl}</code>
              </>
            )}
            <p className="phone-step">3. Tap "Start Sensor" on your phone</p>
            <button className="phone-go-btn" onClick={handleConnect}>
              Start Listening
            </button>
          </div>
        </div>
      )}

      {wsConnected && (
        <div className={`phone-status-badge ${phoneConnected ? 'has-phone' : ''}`}>
          {phoneConnected ? 'Phone streaming' : 'Waiting for phone…'}
        </div>
      )}
    </div>
  )
}
