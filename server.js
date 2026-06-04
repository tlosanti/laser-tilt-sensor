import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { readFileSync, statSync } from 'fs'
import { join, extname } from 'path'
import { networkInterfaces } from 'os'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const PORT = process.env.PORT || 3000
const DIST = join(__dirname, 'dist')

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost`)

  if (url.pathname === '/local-ip') {
    res.setHeader('Content-Type', 'application/json')
    const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN
    res.end(JSON.stringify({ ip: railwayDomain || getLocalIP() }))
    return
  }

  let filePath = join(DIST, url.pathname === '/' ? 'index.html' : url.pathname)
  try {
    statSync(filePath)
  } catch {
    // Check project root for standalone files (e.g. phone.html when dist/ doesn't exist)
    const rootPath = join(__dirname, url.pathname)
    try {
      statSync(rootPath)
      filePath = rootPath
    } catch {
      filePath = join(DIST, 'index.html')
    }
  }

  try {
    const mime = MIME[extname(filePath)] || 'application/octet-stream'
    res.setHeader('Content-Type', mime)
    res.end(readFileSync(filePath))
  } catch {
    res.writeHead(404)
    res.end('Not found')
  }
})

// WebSocket relay
const wss = new WebSocketServer({ noServer: true })
const clients = new Map()

wss.on('connection', (ws) => {
  let role = null

  ws.on('message', (raw) => {
    let msg
    try { msg = JSON.parse(raw) } catch { return }

    if (msg.type === 'register') {
      role = msg.role
      clients.set(ws, role)
      broadcast({ type: 'peer-count', phones: countRole('phone'), desktops: countRole('desktop') })
      return
    }

    if (role === 'phone') {
      for (const [client, r] of clients) {
        if (r === 'desktop' && client.readyState === 1) {
          client.send(raw.toString())
        }
      }
    }
  })

  ws.on('close', () => {
    clients.delete(ws)
    broadcast({ type: 'peer-count', phones: countRole('phone'), desktops: countRole('desktop') })
  })
})

function countRole(r) {
  let n = 0
  for (const role of clients.values()) if (role === r) n++
  return n
}

function broadcast(msg) {
  const data = JSON.stringify(msg)
  for (const [client] of clients) {
    if (client.readyState === 1) client.send(data)
  }
}

server.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws-relay') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  }
})

const VIRTUAL_ADAPTER_RE = /vmware|vmnet|vbox|virtualbox|hyper-v|hyperv|wsl|docker|loopback|bluetooth|pseudo/i

function getLocalIP() {
  const nets = networkInterfaces()
  const real = []
  const fallback = []
  for (const [name, addrs] of Object.entries(nets)) {
    const isVirtual = VIRTUAL_ADAPTER_RE.test(name)
    for (const net of addrs) {
      if (net.family === 'IPv4' && !net.internal) {
        ;(isVirtual ? fallback : real).push(net.address)
      }
    }
  }
  const pool = real.length ? real : fallback
  return pool.find(ip => ip.startsWith('192.168.'))
    || pool.find(ip => ip.startsWith('10.'))
    || pool.find(ip => ip.startsWith('172.'))
    || pool[0]
    || 'localhost'
}

server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`))
