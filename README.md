# IMU Sensor Visualizer

> Real-time 3D orientation visualization for BNO085 / RP2040 — connect via USB Serial or your phone's built-in gyroscope.

![demo mode](https://img.shields.io/badge/status-active-brightgreen) ![three.js](https://img.shields.io/badge/three.js-r170-blue) ![react](https://img.shields.io/badge/react-18-61dafb) ![vite](https://img.shields.io/badge/vite-6-646cff)

---

## What it does

Point a laser, level a surface, or track any rigid body — this app reads orientation data from an IMU sensor and renders it live in a 3D scene. No driver installs, no native app: it runs entirely in the browser.

Two sensor paths are supported:

- **USB Serial** — plug in an RP2040 running CircuitPython/MicroPython firmware. The BNO085 streams quaternions and Euler angles over USB CDC at 115200 baud. Chrome or Edge 89+ picks it up directly via the Web Serial API.
- **Phone sensor** — no hardware required. Scan a QR code on your phone, tap *Start Sensor*, and your device's gyroscope streams over WebSocket to the desktop view in real time.

---

## Features

- **Live 3D scene** — three.js renders the sensor (or any custom model you drop in) rotating in real time
- **Custom model loading** — drag-and-drop `.glb`, `.gltf`, `.stl`, or `.obj` files onto the viewer
- **Axis mapping** — remap or invert any axis to match your physical mounting orientation
- **Mount orientation panel** — fine-tune the model's reference frame in 45° steps without touching the firmware
- **Zero / tare** — snapshot the current orientation as the new zero point at any time
- **Recording** — capture a timed session and export it as a `.csv` file (timestamp, accel XYZ, quaternion IJKW, Euler pitch/roll/yaw, trigger flag)
- **Replay** — load a previously saved CSV and scrub through it with variable speed playback
- **Phone connect panel** — generates a QR code and local URL so any phone on the same network can act as a wireless sensor
- **Demo mode** — the scene auto-spins when no sensor is connected so you always have something to look at

---

## Project structure

```
├── server.js              Node.js HTTP + WebSocket relay server
├── phone.html             Standalone phone sensor page (no React)
├── vite.config.js         Vite config — HTTPS dev server, dual entry points
├── src/
│   ├── App.jsx            Root component — wires all panels and sensor hooks together
│   ├── SensorScene.jsx    three.js scene (renderer, camera, model loader, rotation)
│   ├── AxisMapPanel       Axis remap UI
│   ├── RecordingPanel     Record / stop / export CSV
│   ├── ReplayPanel        CSV playback controls
│   ├── PhoneConnectPanel  QR code + WebSocket connect flow
│   ├── useSerial.js       Web Serial API hook — parses the BNO085 CSV wire format
│   ├── useWebSocket.js    WebSocket hook — receives phone DeviceOrientation events
│   ├── useReplay.js       Replay engine with speed control
│   └── ws-relay-plugin.js Vite dev-server plugin that mirrors the production WS relay
├── models/
│   └── iPhone_15_Pro.stl  Bundled reference model
└── FIRMWARE_EXAMPLE.md    Firmware serial format reference + MicroPython boilerplate
```

---

## Serial wire format

The firmware must emit one line per sample at **115200 baud**. Two formats are accepted:

**CSV (preferred — used by BNO085)**
```
timestamp_ms,ax,ay,az,qi,qj,qk,qw,pitch,roll,yaw,trigger
```
Example:
```
1234,0.0012,-0.0034,9.8100,0.0523,-0.0314,0.0012,0.9971,5.23,-12.10,87.44,0
```

**Quaternion string**
```
QUAT:0.9971,0.0523,-0.0314,0.0012
```

**Euler string**
```
EULER:5.23,-12.10,87.44
```

See [`FIRMWARE_EXAMPLE.md`](./FIRMWARE_EXAMPLE.md) for a full MicroPython boilerplate.

---

## Local deployment

### Prerequisites

- **Node.js** 18+ and npm
- **Chrome or Edge** 89+ (required for Web Serial API)
- An RP2040 with BNO085 and CircuitPython/MicroPython firmware, *or* just a phone for wireless mode

### 1. Install dependencies

```bash
npm install
```

### 2. Run the development server

```bash
npm run dev
```

Vite starts on **https://localhost:5174** (HTTPS is required for Web Serial and phone DeviceOrientation permission on iOS).

> The dev server self-signs a certificate. Your browser will show a security warning — click *Advanced → Proceed* to continue. This is expected for local development.

Open **https://localhost:5174** in Chrome or Edge.

### 3. Connect a USB sensor

1. Plug in your RP2040.
2. Click **Connect USB** in the top-right corner.
3. Select the serial port from the browser dialog.
4. The 3D model will start rotating immediately.

Use **⊙ Zero** to tare the current orientation. Use **↺ Reset** to send a CircuitPython soft-reset (`Ctrl-D`) to the device.

### 4. Connect a phone (wireless mode)

1. Make sure your phone and computer are on the same WiFi network.
2. Click **Connect Phone** in the header.
3. Scan the QR code or open the displayed URL on your phone.
4. Tap **Start Sensor** on the phone page, then tap **Start Listening** on the desktop.

iOS requires a user gesture before granting motion access — the *Start Sensor* button triggers the permission prompt automatically.

### 5. Build for production

```bash
npm run build
npm start
```

`npm run build` outputs to `dist/`. `npm start` serves the built files and runs the WebSocket relay on port **3000** (or `$PORT` if set).

The production server exposes a single `/ws-relay` WebSocket endpoint that bridges phone clients to desktop clients. Both `phone.html` and the main React app are served from the same origin.

---

## Deploying to Railway

The app is Railway-ready out of the box. Set the start command to `npm start` and Railway will inject `$PORT` and `$RAILWAY_PUBLIC_DOMAIN` automatically. The server reads both environment variables to serve the correct phone QR code URL over HTTPS.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, three.js r170, Vite 6 |
| 3D | three.js — GLTFLoader, STLLoader, OBJLoader |
| Sensor (USB) | Web Serial API |
| Sensor (phone) | DeviceOrientation API → WebSocket |
| Server | Node.js, `ws` WebSocket library |
| Dev server | Vite + self-signed HTTPS + custom WS relay plugin |
| Deployment | Railway (or any Node host) |
