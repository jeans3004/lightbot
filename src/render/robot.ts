import * as THREE from 'three'

/**
 * Robo montado com primitivas — nenhum asset externo, nenhum carregamento.
 * Silhueta arredondada e simpatica: cabeca grande, olhos brancos enormes,
 * corpo em gomos, maozinhas soltas e antena com bolinha. Olha para +x.
 */
export interface Robot {
  root: THREE.Group
  /** Escalado no eixo Y para o efeito de agachar/esticar. */
  body: THREE.Group
  /** A bolinha da antena — acende quando o robo aciona uma luz. */
  antenna: THREE.MeshLambertMaterial
  /** Os olhos — piscam na comemoracao. */
  eyes: THREE.Mesh[]
}

const SHELL = 0xb9c6da
const SHELL_DARK = 0x8f9fb8
const OUTLINE = 0x5f6f8b
const EYE_WHITE = 0xffffff
const EYE_PUPIL = 0x3d4a63
const BULB = 0xfff07a

function lambert(color: number, opts: Partial<THREE.MeshLambertMaterialParameters> = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts })
}

/** Esfera com contorno: a malha e uma copia levemente maior, escura, de faces
 *  invertidas — truque classico de cel-shading que reproduz o traco do original. */
function outlinedSphere(radius: number, material: THREE.Material, outlineMat: THREE.Material): THREE.Group {
  const g = new THREE.Group()
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 16), material)
  mesh.castShadow = true
  g.add(mesh)
  const outline = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.06 + 0.008, 20, 16), outlineMat)
  g.add(outline)
  return g
}

export function createRobot(): Robot {
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)

  const shell = lambert(SHELL)
  const dark = lambert(SHELL_DARK)
  const outline = new THREE.MeshBasicMaterial({ color: OUTLINE, side: THREE.BackSide })
  const eyeWhite = lambert(EYE_WHITE, { emissive: 0xffffff, emissiveIntensity: 0.35 })
  const pupil = lambert(EYE_PUPIL)
  const antenna = lambert(BULB, { emissive: BULB, emissiveIntensity: 0.4 })

  // pes: duas meias-esferas achatadas
  for (const dz of [-0.11, 0.11]) {
    const foot = outlinedSphere(0.11, dark, outline)
    foot.scale.set(1.1, 0.55, 1)
    foot.position.set(0.02, 0.06, dz)
    body.add(foot)
  }

  // corpo em dois gomos
  const hip = outlinedSphere(0.17, shell, outline)
  hip.position.set(0, 0.22, 0)
  body.add(hip)
  const chest = outlinedSphere(0.15, shell, outline)
  chest.position.set(0, 0.42, 0)
  body.add(chest)

  // maos flutuantes, um pouco a frente do corpo
  for (const dz of [-0.24, 0.24]) {
    const hand = outlinedSphere(0.075, shell, outline)
    hand.position.set(0.08, 0.36, dz)
    body.add(hand)
  }

  // pescoco
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 10), dark)
  neck.position.set(0, 0.56, 0)
  body.add(neck)

  // cabeca grande
  const head = outlinedSphere(0.27, shell, outline)
  head.position.set(0, 0.84, 0)
  body.add(head)

  // olhos: dois discos brancos grandes com pupila, virados para +x
  const eyes: THREE.Mesh[] = []
  for (const dz of [-0.1, 0.1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), eyeWhite)
    eye.scale.set(0.45, 1, 1)
    eye.position.set(0.235, 0.86, dz)
    body.add(eye)
    eyes.push(eye)

    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), pupil)
    dot.position.set(0.27, 0.86, dz)
    body.add(dot)
  }

  // antena
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 6), dark)
  rod.position.set(0, 1.17, 0)
  body.add(rod)
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), antenna)
  bulb.position.set(0, 1.27, 0)
  bulb.castShadow = true
  body.add(bulb)

  return { root, body, antenna, eyes }
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
