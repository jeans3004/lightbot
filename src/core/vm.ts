import {
  DIRS,
  VOID,
  cellKey,
  heightAt,
  type Cmd,
  type Dir,
  type Level,
  type Program,
  type RobotState,
  type SlotId,
} from './types'

/** O que aconteceu em um passo — o renderizador escolhe a animacao por aqui. */
export type StepKind =
  | 'move'   // andou para a celula vizinha
  | 'jump'   // pulou (subiu 1 ou desceu qualquer altura)
  | 'turn'   // girou 90 graus
  | 'light'  // acionou a lampada
  | 'bump'   // tentou se mover e bateu
  | 'call'   // entrou em P1/P2

export interface Step {
  /** Onde no programa este comando estava — usado para destacar a UI. */
  slot: SlotId
  index: number
  cmd: Cmd
  kind: StepKind
  from: RobotState
  to: RobotState
  /** Celula tocada por 'light'; presente mesmo quando nao ha lampada ali. */
  lightAt?: [number, number]
  /** Estado da lampada apos o toque. Ausente se a celula nao e um alvo. */
  lightOn?: boolean
  /** Profundidade da pilha de chamadas ao executar (para depurar recursao). */
  depth: number
}

export type Outcome =
  | 'win'        // todas as lampadas acesas
  | 'incomplete' // programa terminou com lampadas apagadas
  | 'timeout'    // excedeu o limite de passos (laco improdutivo)
  | 'overflow'   // recursao fundo demais
  | 'empty'      // nao ha nada para executar

export interface RunResult {
  steps: Step[]
  outcome: Outcome
  /** Lampadas acesas ao fim da execucao. */
  litAtEnd: string[]
}

/** Tetos de seguranca: recursao infinita e um recurso do jogo, entao ela
 *  precisa parar sozinha em vez de travar a aba. */
export const MAX_STEPS = 4000
export const MAX_DEPTH = 512

interface Frame {
  slot: SlotId
  pc: number
}

interface CompiledOp {
  cmd: Cmd
  index: number
}

function compile(cells: (Cmd | null)[]): CompiledOp[] {
  const ops: CompiledOp[] = []
  cells.forEach((cmd, index) => {
    if (cmd !== null) ops.push({ cmd, index })
  })
  return ops
}

function turn(dir: Dir, delta: number): Dir {
  return (((dir + delta) % 4) + 4) % 4 as Dir
}

/**
 * Executa o programa inteiro de uma vez e devolve o trace completo.
 *
 * Rodar tudo antes de animar deixa a reproducao trivial (a UI so consome a
 * lista) e permite reportar o desfecho — inclusive lacos infinitos — sem
 * precisar de um passo de "e agora?" no meio da animacao.
 */
export function run(level: Level, prog: Program): RunResult {
  const compiled: Record<SlotId, CompiledOp[]> = {
    main: compile(prog.main),
    p1: compile(prog.p1),
    p2: compile(prog.p2),
  }

  const lights = new Map<string, boolean>()
  for (const [x, z] of level.lights) lights.set(cellKey(x, z), false)
  let remaining = lights.size

  const robot: RobotState = { ...level.start }
  const steps: Step[] = []
  const stack: Frame[] = [{ slot: 'main', pc: 0 }]

  if (compiled.main.length === 0) {
    return { steps, outcome: 'empty', litAtEnd: [] }
  }

  let outcome: Outcome | null = null
  let guard = 0

  while (stack.length > 0) {
    if (++guard > MAX_STEPS) {
      outcome = 'timeout'
      break
    }

    const frame = stack[stack.length - 1]
    const body = compiled[frame.slot]
    if (frame.pc >= body.length) {
      stack.pop()
      continue
    }

    const op = body[frame.pc]
    frame.pc++

    const from: RobotState = { ...robot }
    const depth = stack.length

    if (op.cmd === 'P1' || op.cmd === 'P2') {
      const target: SlotId = op.cmd === 'P1' ? 'p1' : 'p2'
      if (compiled[target].length === 0) continue // procedimento vazio: no-op

      steps.push({ slot: frame.slot, index: op.index, cmd: op.cmd, kind: 'call', from, to: from, depth })

      // Chamada em posicao de cauda descarta o frame atual. Sem isso, um
      // `P1 = [..., P1]` estouraria a pilha em vez de repetir para sempre —
      // e repetir para sempre e exatamente o que as fases de recursao usam.
      if (frame.pc >= body.length) stack.pop()

      if (stack.length >= MAX_DEPTH) {
        outcome = 'overflow'
        break
      }
      stack.push({ slot: target, pc: 0 })
      continue
    }

    const step = execute(level, robot, frame.slot, op, lights, depth)
    steps.push(step)

    if (step.kind === 'light' && step.lightOn !== undefined) {
      remaining += step.lightOn ? -1 : 1
      if (remaining === 0) {
        outcome = 'win'
        break
      }
    }
  }

  if (outcome === null) outcome = remaining === 0 ? 'win' : 'incomplete'

  const litAtEnd: string[] = []
  for (const [key, on] of lights) if (on) litAtEnd.push(key)

  return { steps, outcome, litAtEnd }
}

function execute(
  level: Level,
  robot: RobotState,
  slot: SlotId,
  op: CompiledOp,
  lights: Map<string, boolean>,
  depth: number,
): Step {
  const from: RobotState = { ...robot }
  const base = { slot, index: op.index, cmd: op.cmd, depth }

  switch (op.cmd) {
    case 'L':
    case 'R': {
      robot.dir = turn(robot.dir, op.cmd === 'R' ? 1 : -1)
      return { ...base, kind: 'turn', from, to: { ...robot } }
    }

    case 'F':
    case 'J': {
      const { dx, dz } = DIRS[robot.dir]
      const tx = robot.x + dx
      const tz = robot.z + dz
      const here = heightAt(level, robot.x, robot.z)
      const there = heightAt(level, tx, tz)

      // Andar exige piso na mesma altura. Pular sobe exatamente um degrau ou
      // desce qualquer distancia — descer andando nao vale.
      const ok =
        there !== VOID &&
        (op.cmd === 'F' ? there === here : there === here + 1 || there < here)

      if (!ok) return { ...base, kind: 'bump', from, to: from }

      robot.x = tx
      robot.z = tz
      return { ...base, kind: op.cmd === 'F' ? 'move' : 'jump', from, to: { ...robot } }
    }

    case 'X': {
      const key = cellKey(robot.x, robot.z)
      const current = lights.get(key)
      if (current === undefined) {
        // Acionar fora de um alvo e legal, so nao faz nada.
        return { ...base, kind: 'light', from, to: from, lightAt: [robot.x, robot.z] }
      }
      const next = !current
      lights.set(key, next)
      return { ...base, kind: 'light', from, to: from, lightAt: [robot.x, robot.z], lightOn: next }
    }

    default:
      throw new Error(`comando nao executavel: ${op.cmd}`)
  }
}

/** Util para testes e para a tela de fases: o programa resolve a fase? */
export function solves(level: Level, prog: Program): boolean {
  return run(level, prog).outcome === 'win'
}
