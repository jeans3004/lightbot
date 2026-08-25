import * as THREE from 'three'
import { Board } from './board'
import { Ease, Timeline } from './anim'
import { createRobot, disposeRobot, shortestYaw, yawFor, type Robot } from './robot'
import type { Level, RobotState } from '../core/types'
import type { Step } from '../core/vm'

/** Duracao base de cada tipo de passo, em ms a velocidade 1x.
 *  Exportado para o audio casar a aterrissagem do pulo com a animacao. */
export const DURATION: Record<Step['kind'], number> = {
  move: 300,
  jump: 430,
  turn: 230,
  light: 380,
  bump: 320,
  call: 110,
}

const ELEVATION = 0.62 // rad, proximo da isometrica classica
const DEFAULT_AZIMUTH = Math.PI / 4

export class View {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.OrthographicCamera()
  private sun: THREE.DirectionalLight
  private timeline = new Timeline()
  private robot: Robot
  private board: Board | null = null
  private level: Level | null = null

  private azimuth = DEFAULT_AZIMUTH
  private zoom = 1
  private radius = 6
  private viewportAspect = 1
  private focus = new THREE.Vector3()

  private running = true
  private lastFrame = 0
  private resizeObserver: ResizeObserver

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    // PCFSoft foi removido no three 0.185; PCF continua sendo o melhor
    // custo-beneficio para sombras suaves aqui.
    this.renderer.shadowMap.type = THREE.PCFShadowMap

    this.scene.add(new THREE.HemisphereLight(0xdcecff, 0x37405c, 2.1))

    this.sun = new THREE.DirectionalLight(0xffffff, 2.4)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(1024, 1024)
    this.sun.shadow.bias = -0.0012
    this.scene.add(this.sun)
    this.scene.add(this.sun.target)

    this.robot = createRobot()
    this.scene.add(this.robot.root)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas.parentElement ?? canvas)

    this.bindOrbit()
    this.resize()
    this.lastFrame = performance.now()
    requestAnimationFrame(this.tick)
  }

  // ---------------------------------------------------------------- fases

  loadLevel(level: Level): void {
    this.timeline.clear()
    this.board?.dispose()
    this.level = level
    this.board = new Board(level)
    this.scene.add(this.board.group)

    this.radius = this.board.boundingRadius()
    this.focus.set(0, this.board.focusHeight(), 0)
    this.azimuth = DEFAULT_AZIMUTH
    this.zoom = 1

    this.placeRobot(level.start)
    this.resize()
  }

  /** Volta o tabuleiro ao estado inicial da fase, sem animacao. */
  reset(): void {
    if (!this.level || !this.board) return
    this.timeline.clear()
    this.board.resetLights()
    this.placeRobot(this.level.start)
  }

  private placeRobot(state: RobotState): void {
    if (!this.board) return
    const h = this.board.heightOf(state.x, state.z)
    this.robot.root.position.copy(this.board.worldPosition(state.x, state.z, h))
    this.robot.root.rotation.y = yawFor(state.dir)
    this.robot.body.scale.set(1, 1, 1)
    this.robot.body.position.set(0, 0, 0)
  }

  // -------------------------------------------------------------- animacao

  /** Anima um passo do trace. Resolve quando a animacao termina. */
  async playStep(step: Step, speed: number): Promise<void> {
    if (!this.board) return
    const duration = DURATION[step.kind] / speed

    switch (step.kind) {
      case 'move':
        return this.animateWalk(step, duration)
      case 'jump':
        return this.animateJump(step, duration)
      case 'turn':
        return this.animateTurn(step, duration)
      case 'light':
        return this.animateLight(step, duration)
      case 'bump':
        return this.animateBump(step, duration)
      case 'call':
        return this.timeline.wait(duration)
    }
  }

  private posOf(state: RobotState): THREE.Vector3 {
    const board = this.board!
    return board.worldPosition(state.x, state.z, board.heightOf(state.x, state.z))
  }

  private animateWalk(step: Step, duration: number): Promise<void> {
    const from = this.posOf(step.from)
    const to = this.posOf(step.to)
    const root = this.robot.root
    const body = this.robot.body
    return this.timeline.run(duration, (k) => {
      root.position.lerpVectors(from, to, k)
      // dois passinhos por celula: sobe e desce duas vezes
      body.position.y = Math.abs(Math.sin(k * Math.PI * 2)) * 0.055
      body.rotation.z = Math.sin(k * Math.PI * 2) * 0.05
    })
  }

  private animateJump(step: Step, duration: number): Promise<void> {
    const from = this.posOf(step.from)
    const to = this.posOf(step.to)
    const rise = Math.max(0.35, Math.abs(to.y - from.y) * 0.5 + 0.3)
    const root = this.robot.root
    const body = this.robot.body
    return this.timeline.run(
      duration,
      (k) => {
        root.position.lerpVectors(from, to, k)
        root.position.y += Math.sin(k * Math.PI) * rise
        // encolhe na saida, estica no ar, absorve na aterrissagem
        const squash = k < 0.15 ? 1 - k * 1.4 : k > 0.85 ? 1 - (1 - k) * 1.4 : 1 + Math.sin(k * Math.PI) * 0.12
        body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash))
        body.position.y = 0
        body.rotation.z = 0
      },
      Ease.linear,
    ).then(() => {
      this.robot.body.scale.set(1, 1, 1)
    })
  }

  private animateTurn(step: Step, duration: number): Promise<void> {
    const root = this.robot.root
    const from = root.rotation.y
    const to = shortestYaw(from, yawFor(step.to.dir))
    return this.timeline.run(duration, (k) => {
      root.rotation.y = from + (to - from) * k
      this.robot.body.position.y = Math.sin(k * Math.PI) * 0.03
    })
  }

  private animateLight(step: Step, duration: number): Promise<void> {
    const board = this.board!
    const [x, z] = step.lightAt ?? [step.from.x, step.from.z]
    const turningOn = step.lightOn === true
    const changes = step.lightOn !== undefined
    const body = this.robot.body

    return this.timeline.run(
      duration,
      (k) => {
        // agacha e volta
        const dip = Math.sin(k * Math.PI)
        body.scale.set(1 + dip * 0.1, 1 - dip * 0.18, 1 + dip * 0.1)
        board.pressPlate(x, z, k)
        if (changes) board.setLight(x, z, turningOn, Ease.out(Math.min(1, k * 1.6)))
        this.robot.antenna.emissiveIntensity = 2.2 + dip * 3.5
      },
      Ease.linear,
    ).then(() => {
      body.scale.set(1, 1, 1)
      this.robot.antenna.emissiveIntensity = 2.2
      if (changes) board.setLight(x, z, turningOn, 1)
    })
  }

  private animateBump(_step: Step, duration: number): Promise<void> {
    const root = this.robot.root
    const start = root.position.clone()
    const forward = new THREE.Vector3(Math.cos(root.rotation.y), 0, -Math.sin(root.rotation.y))
    const body = this.robot.body
    return this.timeline.run(
      duration,
      (k) => {
        const push = Math.sin(k * Math.PI) * 0.22
        root.position.copy(start).addScaledVector(forward, push)
        // treme depois da batida
        const shake = k > 0.4 ? Math.sin(k * 34) * 0.05 * (1 - k) : 0
        body.rotation.z = shake
        body.position.y = 0
      },
      Ease.linear,
    ).then(() => {
      root.position.copy(start)
      body.rotation.z = 0
    })
  }

  /** Comemoracao ao completar a fase. */
  async celebrate(): Promise<void> {
    const root = this.robot.root
    const body = this.robot.body
    const startYaw = root.rotation.y
    const baseY = root.position.y
    await this.timeline.run(
      900,
      (k) => {
        root.rotation.y = startYaw + k * Math.PI * 2
        const hop = Math.abs(Math.sin(k * Math.PI * 2))
        root.position.y = baseY + hop * 0.3
        body.scale.set(1 - hop * 0.08, 1 + hop * 0.14, 1 - hop * 0.08)
        this.robot.visor.emissiveIntensity = 1.6 + hop * 3
      },
      Ease.linear,
    )
    root.rotation.y = startYaw
    root.position.y = baseY
    body.scale.set(1, 1, 1)
    this.robot.visor.emissiveIntensity = 1.6
  }

  /** Cancela a animacao em curso; promessas pendentes resolvem. */
  stop(): void {
    this.timeline.clear()
  }

  // ---------------------------------------------------------------- camera

  rotateBy(delta: number): void {
    this.azimuth += delta
    this.updateCamera()
  }

  zoomBy(factor: number): void {
    this.zoom = THREE.MathUtils.clamp(this.zoom * factor, 0.55, 2.4)
    this.updateCamera()
  }

  resetView(): void {
    this.azimuth = DEFAULT_AZIMUTH
    this.zoom = 1
    this.updateCamera()
  }

  private bindOrbit(): void {
    let dragging = false
    let lastX = 0
    let pinchDistance = 0

    const pointers = new Map<number, { x: number; y: number }>()

    this.canvas.addEventListener('pointerdown', (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      this.canvas.setPointerCapture(e.pointerId)
      dragging = true
      lastX = e.clientX
    })

    this.canvas.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

      if (pointers.size >= 2) {
        const [a, b] = [...pointers.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (pinchDistance > 0) this.zoomBy(d / pinchDistance)
        pinchDistance = d
        return
      }
      if (!dragging) return
      this.rotateBy((e.clientX - lastX) * 0.008)
      lastX = e.clientX
    })

    const release = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinchDistance = 0
      if (pointers.size === 0) dragging = false
    }
    this.canvas.addEventListener('pointerup', release)
    this.canvas.addEventListener('pointercancel', release)

    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        this.zoomBy(e.deltaY > 0 ? 0.92 : 1.08)
      },
      { passive: false },
    )

    this.canvas.addEventListener('dblclick', () => this.resetView())
  }

  private updateCamera(): void {
    const dist = 40
    const cosEl = Math.cos(ELEVATION)
    this.camera.position.set(
      this.focus.x + Math.sin(this.azimuth) * cosEl * dist,
      this.focus.y + Math.sin(ELEVATION) * dist,
      this.focus.z + Math.cos(this.azimuth) * cosEl * dist,
    )
    this.camera.lookAt(this.focus)
    this.camera.near = 0.1
    this.camera.far = 200
    this.camera.zoom = this.zoom
    this.fitFrustum()

    // O sol acompanha a camera para o tabuleiro nunca ficar de costas para a luz.
    this.sun.position.set(
      this.focus.x + Math.sin(this.azimuth + 0.9) * 14,
      this.focus.y + 18,
      this.focus.z + Math.cos(this.azimuth + 0.9) * 14,
    )
    this.sun.target.position.copy(this.focus)

    const shadowSpan = this.radius * 1.6
    const cam = this.sun.shadow.camera
    cam.left = -shadowSpan
    cam.right = shadowSpan
    cam.top = shadowSpan
    cam.bottom = -shadowSpan
    cam.near = 1
    cam.far = 60
    cam.updateProjectionMatrix()
  }

  /**
   * Enquadra o tabuleiro exatamente: projeta os 8 vertices da caixa no espaco
   * da camera e usa o retangulo resultante como frustum. Uma esfera envolvente
   * sobraria muito nas fases compridas e baixas, que sao a maioria.
   */
  private fitFrustum(): void {
    const box = this.board?.boundingBox()
    if (!box) return

    this.camera.updateMatrixWorld()
    const toCamera = this.camera.matrixWorldInverse
    const corner = new THREE.Vector3()
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity

    for (let i = 0; i < 8; i++) {
      corner
        .set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z)
        .applyMatrix4(toCamera)
      minX = Math.min(minX, corner.x)
      maxX = Math.max(maxX, corner.x)
      minY = Math.min(minY, corner.y)
      maxY = Math.max(maxY, corner.y)
    }

    const MARGIN = 0.35
    // Folga extra embaixo: o aviso de resultado flutua sobre essa faixa.
    const BOTTOM_MARGIN = 1.1
    let left = minX - MARGIN
    let right = maxX + MARGIN
    let bottom = minY - BOTTOM_MARGIN
    let top = maxY + MARGIN

    // Estica o lado folgado ate bater com o formato da tela, sem cortar nada.
    const boxAspect = (right - left) / (top - bottom)
    if (boxAspect < this.viewportAspect) {
      const half = ((top - bottom) * this.viewportAspect) / 2
      const cx = (left + right) / 2
      left = cx - half
      right = cx + half
    } else {
      const half = (right - left) / this.viewportAspect / 2
      const cy = (top + bottom) / 2
      bottom = cy - half
      top = cy + half
    }

    this.camera.left = left
    this.camera.right = right
    this.camera.top = top
    this.camera.bottom = bottom
    this.camera.updateProjectionMatrix()
  }

  private resize(): void {
    const parent = this.canvas.parentElement
    const width = Math.max(1, parent?.clientWidth ?? this.canvas.clientWidth)
    const height = Math.max(1, parent?.clientHeight ?? this.canvas.clientHeight)

    this.renderer.setSize(width, height, false)
    this.viewportAspect = width / height
    this.updateCamera()
  }

  private tick = (now: number) => {
    if (!this.running) return
    // Um salto grande (aba em segundo plano) nao deve teleportar a animacao.
    const delta = Math.min(now - this.lastFrame, 64)
    this.lastFrame = now
    this.timeline.advance(delta)
    this.renderer.render(this.scene, this.camera)
    requestAnimationFrame(this.tick)
  }

  dispose(): void {
    this.running = false
    this.resizeObserver.disconnect()
    this.timeline.clear()
    this.board?.dispose()
    disposeRobot(this.robot)
    this.renderer.dispose()
  }
}
