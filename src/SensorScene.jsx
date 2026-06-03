import { useEffect, useRef } from 'react'
import * as THREE from 'three'

// Initial camera spherical coords matching position (3, 2.5, 4)
const INIT_DIST = Math.sqrt(3 * 3 + 2.5 * 2.5 + 4 * 4)
const INIT_PHI  = Math.acos(2.5 / INIT_DIST)          // polar angle from Y
const INIT_THETA = Math.atan2(3, 4)                     // azimuth

export default function SensorScene({ rotation }) {
  const mountRef = useRef(null)
  const sceneRef = useRef(null)
  const orbitRef = useRef({ phi: INIT_PHI, theta: INIT_THETA, dist: INIT_DIST })
  const dragRef  = useRef(null)

  useEffect(() => {
    const mount = mountRef.current
    const w = mount.clientWidth
    const h = mount.clientHeight

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(w, h)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.shadowMap.enabled = true
    mount.appendChild(renderer.domElement)

    // Scene
    const scene = new THREE.Scene()

    // Camera
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100)
    camera.position.set(3, 2.5, 4)
    camera.lookAt(0, 0, 0)

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.4))
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2)
    dirLight.position.set(5, 8, 5)
    dirLight.castShadow = true
    scene.add(dirLight)
    const fillLight = new THREE.DirectionalLight(0x8888ff, 0.4)
    fillLight.position.set(-5, -2, -3)
    scene.add(fillLight)

    // Grid
    const grid = new THREE.GridHelper(6, 12, 0x222244, 0x111133)
    grid.position.y = -1.2
    scene.add(grid)

    // Board group
    const boardGroup = new THREE.Group()
    scene.add(boardGroup)

    // PCB body
    const pcbGeo = new THREE.BoxGeometry(2.4, 0.12, 1.6)
    const pcbMat = new THREE.MeshStandardMaterial({ color: 0x1a5c2a, roughness: 0.6, metalness: 0.1 })
    const pcb = new THREE.Mesh(pcbGeo, pcbMat)
    pcb.castShadow = true
    boardGroup.add(pcb)

    const edgeGeo = new THREE.EdgesGeometry(pcbGeo)
    boardGroup.add(new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0x33aa55 })))

    // IMU chip
    const chip = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.08, 0.32),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.6 })
    )
    chip.position.set(0, 0.1, 0)
    boardGroup.add(chip)

    for (let i = -1; i <= 1; i += 2) {
      for (let j = -1; j <= 1; j += 2) {
        const dot = new THREE.Mesh(
          new THREE.SphereGeometry(0.018, 6, 6),
          new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6 })
        )
        dot.position.set(i * 0.1, 0.15, j * 0.1)
        boardGroup.add(dot)
      }
    }

    // USB-C port
    const usb = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.1, 0.18),
      new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.2 })
    )
    usb.position.set(0, 0.05, -0.9)
    boardGroup.add(usb)

    // Axis arrows
    const arrowLen = 1.4, arrowHeadLen = 0.18, arrowHeadWidth = 0.08
    const origin = new THREE.Vector3(0, 0.2, 0)
    boardGroup.add(new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), origin, arrowLen, 0xff3333, arrowHeadLen, arrowHeadWidth))
    boardGroup.add(new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), origin, arrowLen, 0x3399ff, arrowHeadLen, arrowHeadWidth))
    boardGroup.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), origin, arrowLen, 0x33ff66, arrowHeadLen, arrowHeadWidth))

    sceneRef.current = { boardGroup, renderer, scene, camera }

    // ── Orbit mouse handlers ──────────────────────────────────────
    const onMouseDown = (e) => {
      dragRef.current = { x: e.clientX, y: e.clientY }
      mount.style.cursor = 'grabbing'
    }
    const onMouseMove = (e) => {
      if (!dragRef.current) return
      const dx = e.clientX - dragRef.current.x
      const dy = e.clientY - dragRef.current.y
      dragRef.current = { x: e.clientX, y: e.clientY }
      const orbit = orbitRef.current
      orbit.theta -= dx * 0.008
      orbit.phi = Math.max(0.1, Math.min(Math.PI - 0.1, orbit.phi + dy * 0.008))
    }
    const onMouseUp = () => {
      dragRef.current = null
      mount.style.cursor = 'grab'
    }
    const onWheel = (e) => {
      e.preventDefault()
      orbitRef.current.dist = Math.max(2, Math.min(14, orbitRef.current.dist + e.deltaY * 0.01))
    }

    mount.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    mount.addEventListener('wheel', onWheel, { passive: false })
    mount.style.cursor = 'grab'

    // Resize
    const onResize = () => {
      const w2 = mount.clientWidth
      const h2 = mount.clientHeight
      renderer.setSize(w2, h2)
      camera.aspect = w2 / h2
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(onResize)
    ro.observe(mount)

    // Animate — update camera from orbit each frame
    let raf
    const animate = () => {
      raf = requestAnimationFrame(animate)
      const { phi, theta, dist } = orbitRef.current
      camera.position.set(
        dist * Math.sin(phi) * Math.sin(theta),
        dist * Math.cos(phi),
        dist * Math.sin(phi) * Math.cos(theta),
      )
      camera.lookAt(0, 0, 0)
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      mount.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      mount.removeEventListener('wheel', onWheel)
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [])

  // Apply rotation from sensor data
  useEffect(() => {
    if (!sceneRef.current) return
    const { boardGroup } = sceneRef.current
    if (rotation.type === 'quat') {
      boardGroup.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)
    } else if (rotation.type === 'euler') {
      const deg = Math.PI / 180
      boardGroup.rotation.set(
        rotation.roll  * deg,
        rotation.yaw   * deg,
        rotation.pitch * deg,
        'ZYX'
      )
    } else if (rotation.type === 'demo') {
      boardGroup.rotation.y = rotation.y
    }
  }, [rotation])

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
}
