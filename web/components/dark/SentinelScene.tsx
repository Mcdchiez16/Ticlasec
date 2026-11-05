"use client"

import { useEffect, useRef } from "react"
import * as THREE from "three"
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js"

export type SceneMode =
  | "idle"
  | "email"
  | "password"
  | "peek"
  | "loading"
  | "error"
  | "success"
  | "sleep"

interface SentinelSceneProps {
  mode: SceneMode
  /** hero = mascot with orbiting tiles; compact = mascot only, tighter camera */
  variant?: "hero" | "compact"
  /** floating companion: soft glow underneath instead of a ground shadow */
  hover?: boolean
  onUnsupported?: () => void
  className?: string
}

const C = {
  body: "#2563EB",
  plate: "#1D4ED8",
  trim: "#93C5FD",
  visor: "#0F2744",
  navy: "#14233B",
  white: "#FFFFFF",
  slate: "#CBD5E1",
}
const EYE_IDLE = new THREE.Color("#BAE6FD")
const EYE_ERROR = new THREE.Color("#FCA5A5")
const EYE_OK = new THREE.Color("#86EFAC")
const BODY_BASE = new THREE.Color(C.body)
const BODY_ERROR = new THREE.Color("#DC2626")
const BODY_OK = new THREE.Color("#16A34A")

const GLYPHS: { text: string; color: string }[] = [
  { text: "IOC", color: "#2563EB" },
  { text: "CVE", color: "#DC2626" },
  { text: "TTP", color: "#0891B2" },
  { text: "STIX", color: "#7C3AED" },
  { text: "OSINT", color: "#15803D" },
  { text: "C2", color: "#B45309" },
]

// Screen-relative anchors (-1..1); the top-centre stays clear for the speech bubble.
const ANCHORS: [number, number, number][] = [
  [-0.84, 0.4, 0.4],
  [0.84, 0.4, -0.3],
  [-0.9, -0.24, -0.5],
  [0.9, -0.2, 0.5],
  [-0.7, -0.82, 0.2],
  [0.7, -0.82, -0.2],
  [0.62, 0.8, 0.1], // node cluster
  [-0.62, 0.8, -0.2], // crystal
  [0, -0.9, 0.9], // padlock
]

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const damp = (a: number, b: number, k: number, dt: number) => lerp(a, b, 1 - Math.exp(-k * dt))
const easeOutBack = (t: number) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas")
  c.width = c.height = 128
  const ctx = c.getContext("2d")!
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, "rgba(255,255,255,1)")
  g.addColorStop(0.35, "rgba(255,255,255,0.35)")
  g.addColorStop(1, "rgba(255,255,255,0)")
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function shadowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas")
  c.width = c.height = 128
  const ctx = c.getContext("2d")!
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, "rgba(20, 35, 59, 0.28)")
  g.addColorStop(1, "rgba(20, 35, 59, 0)")
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

function glyphTexture(text: string, color: string): THREE.CanvasTexture {
  const size = 256
  const c = document.createElement("canvas")
  c.width = c.height = size
  const ctx = c.getContext("2d")!
  const fs = text.length > 4 ? 78 : text.length > 3 ? 92 : text.length > 2 ? 104 : 140
  ctx.font = `900 ${fs}px -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillStyle = color
  ctx.fillText(text, size / 2, size / 2 + 6)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

function gradientMap(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([140, 205, 255]), 3, 1, THREE.RedFormat)
  t.minFilter = THREE.NearestFilter
  t.magFilter = THREE.NearestFilter
  t.generateMipmaps = false
  t.needsUpdate = true
  return t
}

function shieldShape(scale = 1): THREE.Shape {
  const s = new THREE.Shape()
  s.moveTo(0, 1.25 * scale)
  s.bezierCurveTo(0.45 * scale, 1.25 * scale, 0.8 * scale, 1.18 * scale, 1.0 * scale, 1.1 * scale)
  s.lineTo(1.0 * scale, 0.1 * scale)
  s.bezierCurveTo(1.0 * scale, -0.7 * scale, 0.5 * scale, -1.25 * scale, 0, -1.45 * scale)
  s.bezierCurveTo(-0.5 * scale, -1.25 * scale, -1.0 * scale, -0.7 * scale, -1.0 * scale, 0.1 * scale)
  s.lineTo(-1.0 * scale, 1.1 * scale)
  s.bezierCurveTo(-0.8 * scale, 1.18 * scale, -0.45 * scale, 1.25 * scale, 0, 1.25 * scale)
  return s
}

function roundedRect(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape()
  const x = -w / 2, y = -h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

interface Floater {
  obj: THREE.Object3D
  baseScale: THREE.Vector3
  anchor: [number, number, number]
  base: THREE.Vector3
  phase: number
  spin: number
  bob: number
  delay: number
}

export default function SentinelScene({ mode, variant = "hero", hover = false, onUnsupported, className }: SentinelSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const modeRef = useRef<SceneMode>(mode)
  const unsupportedRef = useRef(onUnsupported)

  useEffect(() => {
    modeRef.current = mode
  }, [mode])
  useEffect(() => {
    unsupportedRef.current = onUnsupported
  }, [onUnsupported])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" })
    } catch {
      unsupportedRef.current?.()
      return
    }

    const compact = variant === "compact"
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setClearColor(0x000000, 0)
    host.appendChild(renderer.domElement)
    renderer.domElement.style.cssText = "display:block;width:100%;height:100%;"
    renderer.domElement.setAttribute("aria-hidden", "true")

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100)
    const CAM_DIST = compact ? 6.4 : 9.5
    camera.position.set(0, 0.2, CAM_DIST)
    camera.lookAt(0, 0, 0)

    scene.add(new THREE.AmbientLight(0xffffff, 1.7))
    const key = new THREE.DirectionalLight(0xffffff, 2.1)
    key.position.set(-3, 5, 6)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xbfdbfe, 0.8)
    fill.position.set(4, -1, 3)
    scene.add(fill)

    const disposables: { dispose: () => void }[] = []
    const track = <T extends { dispose: () => void }>(d: T): T => {
      disposables.push(d)
      return d
    }
    const gmap = track(gradientMap())
    const toon = (color: string) => track(new THREE.MeshToonMaterial({ color, gradientMap: gmap }))
    const glowTex = track(glowTexture())

    // ── Sentinel ──────────────────────────────────────────────
    const crit = new THREE.Group()
    scene.add(crit)
    const body = new THREE.Group()
    crit.add(body)

    const bodyMat = toon(C.body)
    const bodyGeo = track(new THREE.ExtrudeGeometry(shieldShape(1), { depth: 0.5, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.12, bevelSegments: 6, curveSegments: 28 }))
    bodyGeo.center()
    body.add(new THREE.Mesh(bodyGeo, bodyMat))

    const plateGeo = track(new THREE.ExtrudeGeometry(shieldShape(0.84), { depth: 0.06, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.03, bevelSegments: 3, curveSegments: 28 }))
    plateGeo.center()
    const plate = new THREE.Mesh(plateGeo, toon(C.plate))
    plate.position.set(0, 0.01, 0.4)
    body.add(plate)

    // visor
    const visorGeo = track(new THREE.ExtrudeGeometry(roundedRect(1.4, 0.82, 0.32), { depth: 0.05, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 3 }))
    visorGeo.center()
    const visor = new THREE.Mesh(visorGeo, track(new THREE.MeshToonMaterial({ color: C.visor, gradientMap: gmap })))
    visor.position.set(0, 0.42, 0.5)
    body.add(visor)
    const rimGeo = track(new THREE.ExtrudeGeometry(roundedRect(1.52, 0.94, 0.36), { depth: 0.03, bevelEnabled: false }))
    rimGeo.center()
    const rim = new THREE.Mesh(rimGeo, toon(C.trim))
    rim.position.set(0, 0.42, 0.46)
    body.add(rim)

    // eyes
    const eyeMat = track(new THREE.MeshBasicMaterial({ color: EYE_IDLE.clone() }))
    const sphere = track(new THREE.SphereGeometry(1, 32, 24))
    const eyes = [-1, 1].map((side) => {
      const g = new THREE.Group()
      g.position.set(side * 0.3, 0.46, 0.6)
      const e = new THREE.Mesh(sphere, eyeMat)
      e.scale.set(0.12, 0.15, 0.04)
      g.add(e)
      const halo = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: glowTex, color: EYE_IDLE.clone(), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })))
      halo.scale.setScalar(0.5)
      halo.position.z = 0.04
      g.add(halo)
      body.add(g)
      return { g, halo }
    })
    // smile
    const smileMat = track(new THREE.MeshBasicMaterial({ color: EYE_IDLE.clone() }))
    const smile = new THREE.Mesh(track(new THREE.TorusGeometry(0.15, 0.02, 8, 24, Math.PI)), smileMat)
    smile.rotation.z = Math.PI
    smile.position.set(0, 0.36, 0.6)
    body.add(smile)

    // chest emblem: magnifier
    const emblem = new THREE.Group()
    emblem.position.set(0, -0.5, 0.5)
    const whiteMat = toon(C.white)
    const lens = new THREE.Mesh(track(new THREE.TorusGeometry(0.2, 0.055, 12, 36)), whiteMat)
    emblem.add(lens)
    const handle = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.05, 0.16, 6, 10)), whiteMat)
    handle.position.set(0.17, -0.17, 0)
    handle.rotation.z = Math.PI / 4
    emblem.add(handle)
    body.add(emblem)

    // arms
    const armGeo = track(new THREE.CapsuleGeometry(0.15, 0.36, 8, 16))
    armGeo.translate(0, 0.28, 0)
    const armMat = toon(C.trim)
    const arms = [-1, 1].map((side) => {
      const m = new THREE.Mesh(armGeo, armMat)
      m.position.set(side * 1.12, -0.05, 0.1)
      m.rotation.z = side * (Math.PI - 0.5)
      body.add(m)
      return { mesh: m, side }
    })

    // success badge
    const badge = new THREE.Group()
    const badgeDisc = new THREE.Mesh(track(new THREE.CircleGeometry(0.34, 40)), track(new THREE.MeshBasicMaterial({ color: "#16A34A" })))
    badge.add(badgeDisc)
    const tick = new THREE.Shape()
    tick.moveTo(-0.15, 0.0)
    tick.lineTo(-0.05, -0.1)
    tick.lineTo(0.16, 0.12)
    tick.lineTo(0.11, 0.17)
    tick.lineTo(-0.05, 0.0)
    tick.lineTo(-0.1, 0.05)
    const tickMesh = new THREE.Mesh(track(new THREE.ShapeGeometry(tick)), track(new THREE.MeshBasicMaterial({ color: "#FFFFFF" })))
    tickMesh.position.z = 0.01
    badge.add(tickMesh)
    badge.position.set(0.95, 1.1, 0.8)
    badge.scale.setScalar(0.0001)
    body.add(badge)

    // soft ground shadow
    const shadowTex = track(shadowTexture())
    const shadowMat = track(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }))
    const shadow = new THREE.Mesh(track(new THREE.PlaneGeometry(2.8, 1.0)), shadowMat)
    shadow.rotation.x = -Math.PI / 2
    shadow.position.set(0, -1.75, 0)
    shadow.visible = !hover
    scene.add(shadow)
    const hoverGlow = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color("#60A5FA"), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })))
    hoverGlow.scale.set(2.6, 0.9, 1)
    hoverGlow.position.set(0, -1.8, -0.2)
    hoverGlow.visible = hover
    scene.add(hoverGlow)

    // orbit ring with satellites (hero)
    const orbit = new THREE.Group()
    if (!compact) {
      const ring = new THREE.Mesh(track(new THREE.TorusGeometry(2.3, 0.014, 8, 140)), track(new THREE.MeshBasicMaterial({ color: "#93C5FD", transparent: true, opacity: 0.8 })))
      orbit.add(ring)
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2
        const d = new THREE.Mesh(track(new THREE.SphereGeometry(0.075, 16, 12)), track(new THREE.MeshBasicMaterial({ color: i % 2 ? "#0891B2" : "#2563EB" })))
        d.position.set(Math.cos(a) * 2.3, Math.sin(a) * 2.3, 0)
        orbit.add(d)
      }
      orbit.rotation.x = 0.4
      orbit.position.z = -1.3
      scene.add(orbit)
    }

    // ── Floating threat-intel tiles (hero) ────────────────────
    const floaters: Floater[] = []
    const addFloater = (obj: THREE.Object3D, i: number, spin: number, k = 0.82) => {
      if (compact) return
      const baseScale = obj.scale.clone().multiplyScalar(k)
      obj.scale.setScalar(0.0001)
      scene.add(obj)
      floaters.push({ obj, baseScale, anchor: ANCHORS[i], base: new THREE.Vector3(), phase: Math.random() * 6.28, spin, bob: 0.08 + Math.random() * 0.06, delay: 0.3 + i * 0.08 })
    }
    if (!compact) {
      const slabGeo = track(new RoundedBoxGeometry(1.15, 0.86, 0.3, 4, 0.14))
      const glyphPlane = track(new THREE.PlaneGeometry(1.0, 1.0))
      GLYPHS.forEach((g, i) => {
        const tile = new THREE.Group()
        tile.add(new THREE.Mesh(slabGeo, toon("#FFFFFF")))
        const lip = new THREE.Mesh(slabGeo, toon("#BFD4F2"))
        lip.position.set(0, -0.07, -0.05)
        tile.add(lip)
        const tex = track(glyphTexture(g.text, g.color))
        const face = new THREE.Mesh(glyphPlane, track(new THREE.MeshBasicMaterial({ map: tex, transparent: true })))
        face.position.z = 0.16
        tile.add(face)
        addFloater(tile, i, 0.4)
      })
      // node cluster
      const cluster = new THREE.Group()
      const nodeMat = toon("#2563EB")
      const pts = [new THREE.Vector3(0, 0.3, 0), new THREE.Vector3(-0.38, -0.22, 0), new THREE.Vector3(0.4, -0.2, 0)]
      pts.forEach((p) => {
        const n = new THREE.Mesh(track(new THREE.SphereGeometry(0.16, 20, 16)), nodeMat)
        n.position.copy(p)
        cluster.add(n)
      })
      const lg = track(new THREE.BufferGeometry().setFromPoints([pts[0], pts[1], pts[1], pts[2], pts[2], pts[0]]))
      cluster.add(new THREE.LineSegments(lg, track(new THREE.LineBasicMaterial({ color: "#60A5FA" }))))
      addFloater(cluster, 6, 0.8, 1)
      // crystal
      const crystal = new THREE.Mesh(track(new THREE.OctahedronGeometry(0.42, 0)), toon("#0891B2"))
      crystal.scale.y = 1.35
      addFloater(crystal, 7, 1.2, 0.95)
      // padlock
      const lock = new THREE.Group()
      const lockBody = new THREE.Mesh(track(new RoundedBoxGeometry(0.8, 0.62, 0.3, 3, 0.1)), toon("#F59E0B"))
      lock.add(lockBody)
      const shackle = new THREE.Mesh(track(new THREE.TorusGeometry(0.22, 0.06, 10, 24, Math.PI)), toon("#94A3B8"))
      shackle.position.y = 0.31
      lock.add(shackle)
      const keyhole = new THREE.Mesh(track(new THREE.CircleGeometry(0.07, 16)), track(new THREE.MeshBasicMaterial({ color: "#92400E" })))
      keyhole.position.z = 0.16
      lock.add(keyhole)
      addFloater(lock, 8, 0.6, 0.7)
    }

    // ── Confetti (success) ────────────────────────────────────
    const CN = 70
    const cMat = track(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
    const confetti = new THREE.InstancedMesh(track(new THREE.PlaneGeometry(0.14, 0.09)), cMat, CN)
    confetti.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    confetti.frustumCulled = false
    confetti.visible = false
    scene.add(confetti)
    const palette = ["#2563EB", "#0891B2", "#16A34A", "#F59E0B", "#94A3B8"].map((c) => new THREE.Color(c))
    for (let i = 0; i < CN; i++) confetti.setColorAt(i, palette[i % palette.length])
    const cPos = Array.from({ length: CN }, () => new THREE.Vector3())
    const cVel = Array.from({ length: CN }, () => new THREE.Vector3())
    const cRot = Array.from({ length: CN }, () => new THREE.Vector3())
    const dummy = new THREE.Object3D()
    let confettiStart = -1

    // ── Layout ────────────────────────────────────────────────
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * CAM_DIST
    let halfW = halfH
    const layout = () => {
      for (const f of floaters) f.base.set(f.anchor[0] * halfW * 0.78, f.anchor[1] * halfH * 0.82, f.anchor[2])
    }
    const resize = () => {
      const w = Math.max(host.clientWidth, 1)
      const h = Math.max(host.clientHeight, 1)
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      halfW = halfH * camera.aspect
      crit.scale.setScalar(Math.min(1, (halfW * 0.8) / 1.25) * (compact ? 1 : 0.92))
      layout()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(host)
    resize()

    const pointer = { x: 0, y: 0 }
    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect()
      pointer.x = THREE.MathUtils.clamp((e.clientX - (r.left + r.width / 2)) / (window.innerWidth * 0.5), -1, 1)
      pointer.y = THREE.MathUtils.clamp((e.clientY - (r.top + r.height * 0.45)) / (window.innerHeight * 0.5), -1, 1)
    }
    window.addEventListener("pointermove", onMove, { passive: true })

    // ── Animate ───────────────────────────────────────────────
    const timer = new THREE.Timer()
    const st = { yaw: 0, pitch: 0, roll: 0, coverL: 0, coverR: 0, eye: 1, lookX: 0, lookY: 0, squash: 0, orbit: 1, badge: 0, nextBlink: 2 + Math.random() * 2, blinkT: -1 }
    let lastMode: SceneMode = modeRef.current
    let modeSince = 0
    let raf = 0
    const eyeTarget = new THREE.Color()
    const bodyTarget = new THREE.Color()

    const frame = () => {
      raf = requestAnimationFrame(frame)
      timer.update()
      const dt = Math.min(timer.getDelta(), 0.05)
      const t = timer.getElapsed()
      const m = modeRef.current
      if (m !== lastMode) {
        lastMode = m
        modeSince = t
        if (m === "success" && !reduced) {
          confettiStart = t
          confetti.visible = true
          for (let i = 0; i < CN; i++) {
            cPos[i].set((Math.random() - 0.5) * 0.6, 0.9, 0.8)
            const a = Math.random() * Math.PI * 2
            const sp = 1.5 + Math.random() * 3
            cVel[i].set(Math.cos(a) * sp * 0.9, 3 + Math.random() * 3.5, Math.sin(a) * sp * 0.4)
            cRot[i].set(Math.random() * 6, Math.random() * 6, Math.random() * 6)
          }
        }
      }
      const since = t - modeSince
      const amp = reduced ? 0 : 1

      let tYaw = pointer.x * 0.35, tPitch = pointer.y * 0.16
      let tLookX = pointer.x * 0.07, tLookY = -pointer.y * 0.05
      let tCoverL = 0, tCoverR = 0, tRoll = 0, tEye = 1, tOrbit = 1
      eyeTarget.copy(EYE_IDLE)
      bodyTarget.copy(BODY_BASE)
      switch (m) {
        case "email": tYaw = compact ? 0.1 : 0.32; tPitch = 0.12; tEye = 1.12; break
        case "sleep": tYaw = 0; tPitch = 0.28; tLookX = 0; tLookY = -0.05; tEye = 0.04; break
        case "password": tYaw = 0.12; tCoverL = tCoverR = 1; tEye = 0.9; break
        case "peek": tYaw = 0.16; tCoverL = 1; break
        case "loading": tLookX = Math.sin(t * 5) * 0.12; tLookY = 0; tOrbit = 6; break
        case "error": {
          const d = Math.exp(-since * 2.2)
          tRoll = Math.sin(since * 26) * 0.16 * d
          tYaw = Math.sin(since * 26) * 0.28 * d
          tLookX = 0; tLookY = -0.04; tEye = 0.7
          eyeTarget.copy(EYE_ERROR)
          bodyTarget.lerpColors(BODY_BASE, BODY_ERROR, 0.55)
          break
        }
        case "success":
          tYaw = Math.sin(since * 6) * 0.18; tEye = 1.1
          eyeTarget.copy(EYE_OK)
          bodyTarget.lerpColors(BODY_BASE, BODY_OK, 0.5)
          break
      }
      st.yaw = damp(st.yaw, tYaw, 8, dt)
      st.pitch = damp(st.pitch, tPitch, 8, dt)
      st.roll = damp(st.roll, tRoll, 14, dt)
      st.lookX = damp(st.lookX, tLookX, 12, dt)
      st.lookY = damp(st.lookY, tLookY, 12, dt)
      st.coverL = damp(st.coverL, tCoverL, 9, dt)
      st.coverR = damp(st.coverR, tCoverR, 9, dt)
      st.eye = damp(st.eye, tEye, 10, dt)
      st.orbit = damp(st.orbit, tOrbit, 3, dt)
      st.badge = damp(st.badge, m === "success" ? 1 : 0, 8, dt)

      // blink
      if (st.blinkT < 0 && t > st.nextBlink) st.blinkT = 0
      let blink = 1
      if (st.blinkT >= 0) {
        st.blinkT += dt
        blink = 1 - Math.sin(Math.min(st.blinkT / 0.16, 1) * Math.PI)
        if (st.blinkT > 0.16) {
          st.blinkT = -1
          st.nextBlink = t + 2.5 + Math.random() * 3
        }
      }
      const open = Math.max(0.08, st.eye * blink)
      eyeMat.color.lerp(eyeTarget, 1 - Math.exp(-10 * dt))
      smileMat.color.copy(eyeMat.color)
      bodyMat.color.lerp(bodyTarget, 1 - Math.exp(-8 * dt))
      eyes.forEach((e, i) => {
        e.g.scale.set(1, open, 1)
        e.g.position.x = (i ? 1 : -1) * 0.3 + st.lookX
        e.g.position.y = 0.46 + st.lookY
        ;(e.halo.material as THREE.SpriteMaterial).color.copy(eyeMat.color)
      })

      // float, hop, squash
      let hop = 0, spin = 0
      let squashT = Math.sin(t * 2.1) * 0.012 * amp
      if (m === "loading" && !reduced) {
        hop = Math.abs(Math.sin(t * 6)) * 0.12
        squashT = Math.cos(t * 6) * 0.03
      }
      if (m === "success" && !reduced) {
        const jt = Math.min(since / 1.1, 1)
        hop = Math.sin(jt * Math.PI) * 0.9
        spin = easeOutBack(jt) * Math.PI * 2
        squashT = jt < 0.12 ? -0.12 * (jt / 0.12) : 0.08 * Math.sin(jt * Math.PI)
      }
      st.squash = damp(st.squash, squashT, 18, dt)
      const bob = Math.sin(t * 1.6) * 0.07 * amp
      crit.position.y = bob + hop
      crit.rotation.set(st.pitch, st.yaw + spin, st.roll)
      body.scale.set(1 - st.squash * 0.7, 1 + st.squash, 1 - st.squash * 0.7)
      hoverGlow.material.opacity = 0.42 + Math.sin(t * 2.2) * 0.12 * amp + (m === "loading" ? 0.2 : 0)
      hoverGlow.scale.set(2.6 + Math.sin(t * 2.2) * 0.12 * amp, 0.9, 1)
      const sh = 1 - (bob + hop) * 0.18
      shadow.scale.set(sh, sh, 1)
      shadowMat.opacity = 1 - Math.min((bob + hop) * 0.35, 0.5)

      // arms
      arms.forEach((a) => {
        const c = a.side < 0 ? st.coverL : st.coverR
        a.mesh.rotation.z = lerp(a.side * (Math.PI - 0.5), -a.side * 0.18, c)
        a.mesh.position.x = a.side * lerp(1.12, 0.36, c)
        a.mesh.position.y = lerp(-0.05, 0.28, c)
        a.mesh.position.z = lerp(0.1, 0.82, c)
        if (m === "success" && c < 0.5 && !reduced) a.mesh.rotation.z = a.side * (2.3 + Math.sin(since * 14) * 0.22)
        else if (c < 0.5) a.mesh.rotation.z += Math.sin(t * 2 + a.side) * 0.03 * amp
      })

      badge.scale.setScalar(Math.max(0.0001, easeOutBack(Math.min(st.badge, 1)) * st.badge))

      // orbit
      orbit.rotation.z += dt * 0.4 * st.orbit * amp
      orbit.rotation.y = Math.sin(t * 0.3) * 0.12 * amp

      // confetti
      if (confetti.visible) {
        const ct = t - confettiStart
        for (let i = 0; i < CN; i++) {
          cVel[i].y -= 8 * dt
          cPos[i].addScaledVector(cVel[i], dt)
          dummy.position.copy(cPos[i])
          dummy.rotation.set(cRot[i].x + ct * 6, cRot[i].y + ct * 5, cRot[i].z + ct * 4)
          dummy.scale.setScalar(Math.max(0, 1 - Math.max(ct - 1.4, 0) / 0.6))
          dummy.updateMatrix()
          confetti.setMatrixAt(i, dummy.matrix)
        }
        confetti.instanceMatrix.needsUpdate = true
        if (ct > 2.2) confetti.visible = false
      }

      // floaters
      for (const f of floaters) {
        const k = reduced ? 1 : Math.min(Math.max((t - f.delay) / 0.7, 0), 1)
        f.obj.scale.copy(f.baseScale).multiplyScalar(k <= 0 ? 0.0001 : easeOutBack(k))
        f.obj.position.set(f.base.x + Math.sin(t * 0.7 + f.phase) * 0.05 * amp, f.base.y + Math.sin(t * 1.1 + f.phase) * f.bob * amp, f.base.z)
        f.obj.rotation.y = Math.sin(t * 0.6 * f.spin + f.phase) * 0.45 * amp + pointer.x * 0.18
        f.obj.rotation.x = Math.cos(t * 0.5 + f.phase) * 0.12 * amp - pointer.y * 0.1
        if (f.spin > 0.8) f.obj.rotation.z = Math.sin(t * 0.9 + f.phase) * 0.2 * amp
      }

      renderer.render(scene, camera)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener("pointermove", onMove)
      confetti.dispose()
      disposables.forEach((d) => d.dispose())
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
  }, [variant, hover])

  return <div ref={hostRef} className={className} />
}
