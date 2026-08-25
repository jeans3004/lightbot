import * as THREE from 'three'

/**
 * Robo montado com primitivas — nenhum asset externo, nenhum carregamento.
 * O modelo olha para +x em repouso; a rotacao em Y e derivada da direcao.
 */
export interface Robot {
  root: THREE.Group
  /** Escalado no eixo Y para o efeito de agachar/esticar. */
  body: THREE.Group
  visor: THREE.MeshStandardMaterial
  antenna: THREE.MeshStandardMaterial
}

const SHELL = 0xf2f5f9
const SHELL_DARK = 0x9aa7bd
const ACCENT = 0x2f7bff
const GLOW = 0x63e6ff

function mat(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.12, ...opts })
}

function box(
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  return mesh
}

export function createRobot(): Robot {
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)

  const shell = mat(SHELL)
  const dark = mat(SHELL_DARK, { roughness: 0.6 })
  const accent = mat(ACCENT, { roughness: 0.35 })
  const visor = mat(0x0a1428, { emissive: GLOW, emissiveIntensity: 1.6, roughness: 0.2 })
  const antenna = mat(0x0a1428, { emissive: GLOW, emissiveIntensity: 2.2, roughness: 0.2 })

  // pes
  body.add(box(0.16, 0.09, 0.2, dark, 0.02, 0.045, -0.13))
  body.add(box(0.16, 0.09, 0.2, dark, 0.02, 0.045, 0.13))

  // pernas
  body.add(box(0.1, 0.13, 0.11, accent, 0, 0.15, -0.11))
  body.add(box(0.1, 0.13, 0.11, accent, 0, 0.15, 0.11))

  // tronco
  body.add(box(0.3, 0.28, 0.34, shell, 0, 0.35, 0))
  // faixa peitoral
  body.add(box(0.31, 0.06, 0.35, accent, 0, 0.28, 0))

  // bracos
  body.add(box(0.11, 0.2, 0.09, shell, 0, 0.37, -0.21))
  body.add(box(0.11, 0.2, 0.09, shell, 0, 0.37, 0.21))

  // pescoco
  body.add(box(0.09, 0.05, 0.09, dark, 0, 0.51, 0))

  // cabeca
  body.add(box(0.3, 0.24, 0.3, shell, 0, 0.65, 0))
  // visor virado para +x
  const visorMesh = box(0.03, 0.11, 0.22, visor, 0.15, 0.67, 0)
  visorMesh.castShadow = false
  body.add(visorMesh)

  // antena
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 6), dark)
  rod.position.set(0, 0.83, 0)
  body.add(rod)
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), antenna)
  bulb.position.set(0, 0.92, 0)
  body.add(bulb)

  root.castShadow = true
  return { root, body, visor, antenna }
}

/** Rotacao em Y para que o modelo (que olha para +x) encare `dir`. */
export function yawFor(dir: number): number {
  return -dir * (Math.PI / 2)
}

/** Caminho angular mais curto entre dois yaws — evita o giro de 270 graus. */
export function shortestYaw(from: number, to: number): number {
  let delta = to - from
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  return from + delta
}

export function disposeRobot(robot: Robot): void {
  robot.root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose()
      const m = obj.material
      if (Array.isArray(m)) m.forEach((x) => x.dispose())
      else m.dispose()
    }
  })
}
