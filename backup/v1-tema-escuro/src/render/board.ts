import * as THREE from 'three'
import { VOID, cellKey, type Level } from '../core/types'

/** Largura de uma celula no mundo. */
export const TILE = 1
/** Altura de um degrau. Menor que TILE para o tabuleiro nao virar uma torre. */
export const STEP = 0.42
/** Quanto a coluna afunda abaixo do nivel zero, para nunca parecer flutuante. */
const PLINTH = 0.7

const TOP_PLATE = 0.06

const COLOR_SIDE = 0x8fa2c0
const COLOR_TOP = 0xdde6f4
const COLOR_LIGHT_OFF = 0x1d3866
const COLOR_LIGHT_ON = 0x8ff2ff

interface Cell {
  x: number
  z: number
  height: number
  column: THREE.Mesh
  plate: THREE.Mesh
  plateMat: THREE.MeshStandardMaterial
  ring?: THREE.Mesh
  ringMat?: THREE.MeshStandardMaterial
  isLight: boolean
  lit: boolean
}

export class Board {
  readonly group = new THREE.Group()
  private cells = new Map<string, Cell>()
  private disposables: (THREE.BufferGeometry | THREE.Material)[] = []
  private offsetX = 0
  private offsetZ = 0

  constructor(private level: Level) {
    this.build()
  }

  /** Centro do tabuleiro na origem, para a camera nao precisar de ajuste por fase. */
  private build(): void {
    const depth = this.level.grid.length
    const width = Math.max(...this.level.grid.map((r) => r.length))
    this.offsetX = ((width - 1) * TILE) / 2
    this.offsetZ = ((depth - 1) * TILE) / 2

    const lightSet = new Set(this.level.lights.map(([x, z]) => cellKey(x, z)))
    const sideMat = new THREE.MeshStandardMaterial({ color: COLOR_SIDE, roughness: 0.9 })
    this.disposables.push(sideMat)

    for (let z = 0; z < depth; z++) {
      const row = this.level.grid[z]
      for (let x = 0; x < row.length; x++) {
        const height = row[x]
        if (height === VOID) continue
        this.cells.set(cellKey(x, z), this.buildCell(x, z, height, lightSet.has(cellKey(x, z)), sideMat))
      }
    }
  }

  private buildCell(
    x: number,
    z: number,
    height: number,
    isLight: boolean,
    sideMat: THREE.Material,
  ): Cell {
    const top = height * STEP
    const columnHeight = top + PLINTH
    const wx = x * TILE - this.offsetX
    const wz = z * TILE - this.offsetZ

    const columnGeo = new THREE.BoxGeometry(TILE * 0.98, columnHeight, TILE * 0.98)
    const column = new THREE.Mesh(columnGeo, sideMat)
    column.position.set(wx, top - columnHeight / 2, wz)
    column.castShadow = true
    column.receiveShadow = true
    this.group.add(column)
    this.disposables.push(columnGeo)

    const plateMat = new THREE.MeshStandardMaterial(
      isLight
        ? { color: COLOR_LIGHT_OFF, roughness: 0.35, emissive: COLOR_LIGHT_ON, emissiveIntensity: 0 }
        : { color: COLOR_TOP, roughness: 0.8 },
    )
    const plateGeo = new THREE.BoxGeometry(TILE * 0.9, TOP_PLATE, TILE * 0.9)
    const plate = new THREE.Mesh(plateGeo, plateMat)
    plate.position.set(wx, top - TOP_PLATE / 2 + 0.001, wz)
    plate.receiveShadow = true
    this.group.add(plate)
    this.disposables.push(plateGeo, plateMat)

    const cell: Cell = { x, z, height, column, plate, plateMat, isLight, lit: false }

    if (isLight) {
      // Anel gravado no ladrilho: legivel mesmo com a luz apagada.
      const ringGeo = new THREE.RingGeometry(TILE * 0.22, TILE * 0.31, 24)
      const ringMat = new THREE.MeshStandardMaterial({
        color: COLOR_LIGHT_ON,
        emissive: COLOR_LIGHT_ON,
        emissiveIntensity: 0.25,
        roughness: 0.3,
      })
      const ring = new THREE.Mesh(ringGeo, ringMat)
      ring.rotation.x = -Math.PI / 2
      ring.position.set(wx, top + 0.006, wz)
      this.group.add(ring)
      this.disposables.push(ringGeo, ringMat)
      cell.ring = ring
      cell.ringMat = ringMat
    }

    return cell
  }

  /** Posicao do topo de uma celula, onde o robo pousa. */
  worldPosition(x: number, z: number, height: number): THREE.Vector3 {
    return new THREE.Vector3(x * TILE - this.offsetX, height * STEP, z * TILE - this.offsetZ)
  }

  heightOf(x: number, z: number): number {
    return this.cells.get(cellKey(x, z))?.height ?? 0
  }

  /** `k` de 0 a 1 permite animar o acender; use 1 para aplicar de imediato. */
  setLight(x: number, z: number, on: boolean, k = 1): void {
    const cell = this.cells.get(cellKey(x, z))
    if (!cell || !cell.isLight) return
    cell.lit = on
    const t = on ? k : 1 - k
    cell.plateMat.emissiveIntensity = t * 2.4
    cell.plateMat.color.setHex(COLOR_LIGHT_OFF).lerp(new THREE.Color(COLOR_LIGHT_ON), t)
    if (cell.ringMat) cell.ringMat.emissiveIntensity = 0.25 + t * 2.6
    if (cell.ring) {
      const s = 1 + t * 0.12
      cell.ring.scale.set(s, s, 1)
    }
  }

  resetLights(): void {
    for (const cell of this.cells.values()) {
      if (cell.isLight) this.setLight(cell.x, cell.z, false, 1)
    }
  }

  /** Empurra o ladrilho para baixo e solta — feedback tatil ao acionar. */
  pressPlate(x: number, z: number, k: number): void {
    const cell = this.cells.get(cellKey(x, z))
    if (!cell) return
    const top = cell.height * STEP
    const dip = Math.sin(k * Math.PI) * 0.05
    cell.plate.position.y = top - TOP_PLATE / 2 + 0.001 - dip
    if (cell.ring) cell.ring.position.y = top + 0.006 - dip
  }

  /** Caixa que envolve o tabuleiro, com folga acima para a altura do robo. */
  boundingBox(): THREE.Box3 {
    const depth = this.level.grid.length
    const width = Math.max(...this.level.grid.map((r) => r.length))
    let maxHeight = 0
    for (const row of this.level.grid) for (const h of row) if (h > maxHeight) maxHeight = h

    const halfX = (width * TILE) / 2
    const halfZ = (depth * TILE) / 2
    const ROBOT_HEADROOM = 1.1
    return new THREE.Box3(
      new THREE.Vector3(-halfX, -PLINTH, -halfZ),
      new THREE.Vector3(halfX, maxHeight * STEP + ROBOT_HEADROOM, halfZ),
    )
  }

  /** Raio usado para dimensionar a camera de sombra. */
  boundingRadius(): number {
    const box = this.boundingBox()
    return box.getSize(new THREE.Vector3()).length() / 2
  }

  /** Altura media para a camera mirar no volume, nao no chao. */
  focusHeight(): number {
    let maxHeight = 0
    for (const row of this.level.grid) for (const h of row) if (h > maxHeight) maxHeight = h
    return (maxHeight * STEP) / 2
  }

  dispose(): void {
    this.group.removeFromParent()
    this.group.clear()
    for (const d of this.disposables) d.dispose()
    this.disposables = []
    this.cells.clear()
  }
}
