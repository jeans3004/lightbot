import * as THREE from 'three'
import { VOID, cellKey, type Level } from '../core/types'

/** Largura de uma celula no mundo. */
export const TILE = 1
/** Altura de um degrau. */
export const STEP = 0.5

/** Espessura da laje de cada celula. */
const SLAB = 0.14
/** Comprimento das pernas finas abaixo do nivel zero — o tabuleiro parece
 *  uma mesa flutuando, como no original. */
const LEG_LENGTH = 0.55
const LEG_RADIUS = 0.018

// Paleta pastel do original: cinza-azulado claro para o piso, azul solido
// para os alvos apagados e um azul-claro luminoso para os acesos.
const COLOR_TOP = 0xc9d6e6
const COLOR_SIDE = 0x9fb0c8
const COLOR_EDGE = 0x6d7f9c
const COLOR_LIGHT_OFF = 0x2f86c9
const COLOR_LIGHT_ON = 0xffe36b
const COLOR_LEG = 0x8b9bb5

interface Cell {
  x: number
  z: number
  height: number
  top: THREE.Mesh
  topMat: THREE.MeshLambertMaterial
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

  private build(): void {
    const depth = this.level.grid.length
    const width = Math.max(...this.level.grid.map((r) => r.length))
    this.offsetX = ((width - 1) * TILE) / 2
    this.offsetZ = ((depth - 1) * TILE) / 2

    const lightSet = new Set(this.level.lights.map(([x, z]) => cellKey(x, z)))
    const sideMat = new THREE.MeshLambertMaterial({ color: COLOR_SIDE })
    const legMat = new THREE.MeshLambertMaterial({ color: COLOR_LEG })
    const edgeMat = new THREE.LineBasicMaterial({ color: COLOR_EDGE, transparent: true, opacity: 0.55 })
    this.disposables.push(sideMat, legMat, edgeMat)

    for (let z = 0; z < depth; z++) {
      const row = this.level.grid[z]
      for (let x = 0; x < row.length; x++) {
        const height = row[x]
        if (height === VOID) continue
        const cell = this.buildCell(x, z, height, lightSet.has(cellKey(x, z)), sideMat, legMat, edgeMat)
        this.cells.set(cellKey(x, z), cell)
      }
    }
  }

  private buildCell(
    x: number,
    z: number,
    height: number,
    isLight: boolean,
    sideMat: THREE.Material,
    legMat: THREE.Material,
    edgeMat: THREE.LineBasicMaterial,
  ): Cell {
    const wx = x * TILE - this.offsetX
    const wz = z * TILE - this.offsetZ
    const topY = height * STEP

    // Coluna: cada degrau acima do zero e um bloco solido, como no original.
    if (height > 0) {
      const colGeo = new THREE.BoxGeometry(TILE, height * STEP, TILE)
      const column = new THREE.Mesh(colGeo, sideMat)
      column.position.set(wx, (height * STEP) / 2, wz)
      column.castShadow = true
      column.receiveShadow = true
      this.group.add(column)
      this.disposables.push(colGeo)
      this.addEdges(colGeo, column.position, edgeMat)
    }

    // Laje do topo, com sua propria cor.
    const topMat = new THREE.MeshLambertMaterial({
      color: isLight ? COLOR_LIGHT_OFF : COLOR_TOP,
      emissive: 0x000000,
    })
    const topGeo = new THREE.BoxGeometry(TILE, SLAB, TILE)
    const top = new THREE.Mesh(topGeo, topMat)
    top.position.set(wx, topY + SLAB / 2, wz)
    top.castShadow = true
    top.receiveShadow = true
    this.group.add(top)
    this.disposables.push(topGeo, topMat)
    this.addEdges(topGeo, top.position, edgeMat)

    // Pernas finas nos quatro cantos, so no nivel zero.
    if (height === 0) {
      const legGeo = new THREE.CylinderGeometry(LEG_RADIUS, LEG_RADIUS, LEG_LENGTH, 6)
      this.disposables.push(legGeo)
      for (const [dx, dz] of [
        [-0.5, -0.5],
        [0.5, -0.5],
        [-0.5, 0.5],
        [0.5, 0.5],
      ]) {
        const leg = new THREE.Mesh(legGeo, legMat)
        leg.position.set(wx + dx * TILE * 0.96, -LEG_LENGTH / 2, wz + dz * TILE * 0.96)
        this.group.add(leg)
      }
    }

    return { x, z, height, top, topMat, isLight, lit: false }
  }

  /** Contorno fino nas arestas — e isso que da o traco de desenho do original. */
  private addEdges(geo: THREE.BufferGeometry, position: THREE.Vector3, mat: THREE.LineBasicMaterial): void {
    const edges = new THREE.EdgesGeometry(geo)
    const lines = new THREE.LineSegments(edges, mat)
    lines.position.copy(position)
    this.group.add(lines)
    this.disposables.push(edges)
  }

  /** Posicao do topo da laje de uma celula, onde o robo pousa. */
  worldPosition(x: number, z: number, height: number): THREE.Vector3 {
    return new THREE.Vector3(x * TILE - this.offsetX, height * STEP + SLAB, z * TILE - this.offsetZ)
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
    cell.topMat.color.setHex(COLOR_LIGHT_OFF).lerp(new THREE.Color(COLOR_LIGHT_ON), t)
    cell.topMat.emissive.setHex(COLOR_LIGHT_ON).multiplyScalar(t * 0.45)
  }

  resetLights(): void {
    for (const cell of this.cells.values()) {
      if (cell.isLight) this.setLight(cell.x, cell.z, false, 1)
    }
  }

  /** Empurra a laje para baixo e solta — feedback tatil ao acionar. */
  pressPlate(x: number, z: number, k: number): void {
    const cell = this.cells.get(cellKey(x, z))
    if (!cell) return
    const dip = Math.sin(k * Math.PI) * 0.05
    cell.top.position.y = cell.height * STEP + SLAB / 2 - dip
  }

  /** Caixa que envolve o tabuleiro, com folga acima para a altura do robo. */
  boundingBox(): THREE.Box3 {
    const depth = this.level.grid.length
    const width = Math.max(...this.level.grid.map((r) => r.length))
    let maxHeight = 0
    for (const row of this.level.grid) for (const h of row) if (h > maxHeight) maxHeight = h

    const halfX = (width * TILE) / 2
    const halfZ = (depth * TILE) / 2
    const ROBOT_HEADROOM = 1.15
    return new THREE.Box3(
      new THREE.Vector3(-halfX, -LEG_LENGTH, -halfZ),
      new THREE.Vector3(halfX, maxHeight * STEP + SLAB + ROBOT_HEADROOM, halfZ),
    )
  }

  boundingRadius(): number {
    return this.boundingBox().getSize(new THREE.Vector3()).length() / 2
  }

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
