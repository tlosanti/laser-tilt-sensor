import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'

const INIT_DIST  = Math.sqrt(3 * 3 + 2.5 * 2.5 + 4 * 4)
const INIT_PHI   = Math.acos(2.5 / INIT_DIST)
const INIT_THETA = Math.atan2(3, 4)

function buildDefaultModel() {
  const group = new THREE.Group()

  const pcbGeo = new THREE.BoxGeometry(2.4, 0.12, 1.6)
  const pcb = new THREE.Mesh(pcbGeo, new THREE.MeshStandardMaterial({ color: 0x1a5c2a, roughness: 0.6, metalness: 0.1 }))
  pcb.castShadow = true
  group.add(pcb)
  group.add(new THREE.LineSegments(new THREE.EdgesGeometry(pcbGeo), new THREE.LineBasicMaterial({ color: 0x33aa55 })))

  const chip = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.08, 0.32),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.6 })
  )
  chip.position.set(0, 0.1, 0)
  group.add(chip)

  for (let i = -1; i <= 1; i += 2)
    for (let j = -1; j <= 1; j += 2) {
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.018, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6 })
      )
      dot.position.set(i * 0.1, 0.15, j * 0.1)
      group.add(dot)
    }

  const usb = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.1, 0.18),
    new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.2 })
  )
  usb.position.set(0, 0.05, -0.9)
  group.add(usb)

  return group
}

function addAxes(group) {
  const len = 1.4, headLen = 0.18, headWidth = 0.08
  const origin = new THREE.Vector3(0, 0.2, 0)
  group.add(new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), origin, len, 0xff3333, headLen, headWidth))
  group.add(new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), origin, len, 0x3399ff, headLen, headWidth))
  group.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), origin, len, 0x33ff66, headLen, headWidth))
}

const SensorScene = forwardRef(function SensorScene({ rotation, mountQuat }, ref) {
  const mountRef    = useRef(null)
  const sceneRef    = useRef(null)
  const orbitRef    = useRef({ phi: INIT_PHI, theta: INIT_THETA, dist: INIT_DIST })
  const dragRef     = useRef(null)

  useImperativeHandle(ref, () => ({
    loadModel: (file) => loadModelFile(file, sceneRef.current),
    clearModel: () => clearCustomModel(sceneRef.current),
  }))

  useEffect(() => {
    const mount = mountRef.current
    const w = mount.clientWidth, h = mount.clientHeight

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(w, h)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.shadowMap.enabled = true
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000)
    camera.position.set(3, 2.5, 4)
    camera.lookAt(0, 0, 0)

    scene.add(new THREE.AmbientLight(0xffffff, 0.5))
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2)
    dirLight.position.set(5, 8, 5)
    dirLight.castShadow = true
    scene.add(dirLight)
    const fillLight = new THREE.DirectionalLight(0x8888ff, 0.4)
    fillLight.position.set(-5, -2, -3)
    scene.add(fillLight)

    const grid = new THREE.GridHelper(6, 12, 0x222244, 0x111133)
    grid.position.y = -1.2
    scene.add(grid)

    // boardGroup holds the model + axes and receives all rotations
    const boardGroup = new THREE.Group()
    scene.add(boardGroup)

    const defaultModel = buildDefaultModel()
    boardGroup.add(defaultModel)
    addAxes(boardGroup)

    sceneRef.current = { boardGroup, defaultModel, customModel: null, renderer, scene, camera }

    // Orbit
    const onMouseDown = (e) => { dragRef.current = { x: e.clientX, y: e.clientY }; mount.style.cursor = 'grabbing' }
    const onMouseMove = (e) => {
      if (!dragRef.current) return
      const orbit = orbitRef.current
      orbit.theta -= (e.clientX - dragRef.current.x) * 0.008
      orbit.phi = Math.max(0.1, Math.min(Math.PI - 0.1, orbit.phi + (e.clientY - dragRef.current.y) * 0.008))
      dragRef.current = { x: e.clientX, y: e.clientY }
    }
    const onMouseUp = () => { dragRef.current = null; mount.style.cursor = 'grab' }
    const onWheel = (e) => { e.preventDefault(); orbitRef.current.dist = Math.max(2, Math.min(40, orbitRef.current.dist + e.deltaY * 0.02)) }

    mount.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    mount.addEventListener('wheel', onWheel, { passive: false })
    mount.style.cursor = 'grab'

    const ro = new ResizeObserver(() => {
      const w2 = mount.clientWidth, h2 = mount.clientHeight
      renderer.setSize(w2, h2)
      camera.aspect = w2 / h2
      camera.updateProjectionMatrix()
    })
    ro.observe(mount)

    let raf
    const animate = () => {
      raf = requestAnimationFrame(animate)
      const { phi, theta, dist } = orbitRef.current
      camera.position.set(dist * Math.sin(phi) * Math.sin(theta), dist * Math.cos(phi), dist * Math.sin(phi) * Math.cos(theta))
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

  // Apply rotation + mount offset
  useEffect(() => {
    if (!sceneRef.current) return
    const { boardGroup } = sceneRef.current
    const d = Math.PI / 180

    // Convert any rotation type to a THREE.Quaternion
    const q = new THREE.Quaternion()
    if (rotation.type === 'quat') {
      q.set(rotation.x, rotation.y, rotation.z, rotation.w)
    } else if (rotation.type === 'euler') {
      q.setFromEuler(new THREE.Euler(rotation.roll * d, rotation.yaw * d, rotation.pitch * d, 'ZYX'))
    } else if (rotation.type === 'demo') {
      q.setFromEuler(new THREE.Euler(0, rotation.y, 0))
    }

    // Pre-multiply by mount offset: boardGroup = mountQuat * sensorQuat
    if (mountQuat) {
      const m = new THREE.Quaternion(mountQuat.x, mountQuat.y, mountQuat.z, mountQuat.w)
      boardGroup.quaternion.copy(m).multiply(q)
    } else {
      boardGroup.quaternion.copy(q)
    }
  }, [rotation, mountQuat])

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
})

export default SensorScene

// ── Model loading helpers ─────────────────────────────────────

function clearCustomModel(refs) {
  if (!refs) return
  if (refs.customModel) {
    refs.boardGroup.remove(refs.customModel)
    refs.customModel = null
  }
  refs.boardGroup.add(refs.defaultModel)
}

function loadModelFile(file, refs) {
  if (!refs) return
  const ext = file.name.split('.').pop().toLowerCase()
  const url = URL.createObjectURL(file)

  if (ext === 'glb' || ext === 'gltf') {
    new GLTFLoader().load(url, (gltf) => {
      URL.revokeObjectURL(url)
      swapModel(gltf.scene, refs)
    }, undefined, (e) => { URL.revokeObjectURL(url); console.error(e) })

  } else if (ext === 'stl') {
    new STLLoader().load(url, (geometry) => {
      URL.revokeObjectURL(url)
      geometry.computeVertexNormals()
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xaaaacc, metalness: 0.3, roughness: 0.5 }))
      const obj = new THREE.Group()
      obj.add(mesh)
      swapModel(obj, refs)
    }, undefined, (e) => { URL.revokeObjectURL(url); console.error(e) })

  } else if (ext === 'obj') {
    // Dynamic import so OBJLoader only loads if needed
    import('three/examples/jsm/loaders/OBJLoader.js').then(({ OBJLoader }) => {
      new OBJLoader().load(url, (obj) => {
        URL.revokeObjectURL(url)
        obj.traverse(child => {
          if (child.isMesh) child.material = new THREE.MeshStandardMaterial({ color: 0xaaaacc, metalness: 0.3, roughness: 0.5 })
        })
        swapModel(obj, refs)
      }, undefined, (e) => { URL.revokeObjectURL(url); console.error(e) })
    })
  }
}

function swapModel(object, refs) {
  // Remove old custom model or default model
  if (refs.customModel) refs.boardGroup.remove(refs.customModel)
  else refs.boardGroup.remove(refs.defaultModel)

  // Auto-scale to fit within a ~2 unit bounding box
  const box = new THREE.Box3().setFromObject(object)
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  if (maxDim > 0) object.scale.setScalar(2 / maxDim)

  // Centre the model at origin
  box.setFromObject(object)
  const centre = box.getCenter(new THREE.Vector3())
  object.position.sub(centre)

  refs.customModel = object
  refs.boardGroup.add(object)
}
