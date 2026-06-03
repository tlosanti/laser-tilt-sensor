import { WebSocketServer } from 'ws'
import { networkInterfaces } from 'os'

export function wsRelayPlugin() {
  let wss

  return {
    name: 'ws-relay',
    configureServer(server) {
      wss = new WebSocketServer({ noServer: true })

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

      server.httpServer.on('upgrade', (req, socket, head) => {
        if (req.url === '/ws-relay') {
          wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req)
          })
        }
      })

      server.middlewares.use((req, res, next) => {
        if (req.url === '/local-ip') {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ip: getLocalIP() }))
          return
        }
        next()
      })
    },
  }
}

function getLocalIP() {
  const nets = networkInterfaces()
  const candidates = []
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        candidates.push(net.address)
      }
    }
  }
  // Prefer 192.168.x.x (typical WiFi) over virtual adapter IPs (172.x, 10.x)
  return candidates.find(ip => ip.startsWith('192.168.'))
    || candidates.find(ip => ip.startsWith('10.'))
    || candidates[0]
    || 'localhost'
}
