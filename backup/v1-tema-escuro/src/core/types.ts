/** Comandos que o robo entende. */
export type Cmd = 'F' | 'L' | 'R' | 'J' | 'X' | 'P1' | 'P2'

/** Direcao no plano do tabuleiro. Vista de cima (x cresce p/ direita, z p/ baixo),
 *  a ordem 0..3 e horaria, entao virar a direita e `(dir + 1) % 4`. */
export type Dir = 0 | 1 | 2 | 3

export const DIRS: readonly { dx: number; dz: number }[] = [
  { dx: 1, dz: 0 },  // 0: leste
  { dx: 0, dz: 1 },  // 1: sul
  { dx: -1, dz: 0 }, // 2: oeste
  { dx: 0, dz: -1 }, // 3: norte
]

/** Altura usada para "nao ha celula aqui". */
export const VOID = -1

export type SlotId = 'main' | 'p1' | 'p2'
export const SLOT_IDS: readonly SlotId[] = ['main', 'p1', 'p2']

export interface RobotState {
  x: number
  z: number
  dir: Dir
}

export interface Level {
  id: number
  name: string
  /** Alturas indexadas por [z][x]; VOID onde nao ha celula. */
  grid: number[][]
  /** Celulas-alvo como [x, z]. */
  lights: [number, number][]
  start: RobotState
  /** Quantidade de espacos disponiveis em cada bloco de programa. */
  slots: Record<SlotId, number>
  /** Comandos liberados na paleta desta fase. */
  allowed: Cmd[]
  hint: string
  /** Uma solucao conhecida — alimenta a dica e a suite de testes. */
  solution: Record<SlotId, Cmd[]>
}

/** Programa do jogador: cada bloco e um vetor de tamanho fixo com buracos. */
export type Program = Record<SlotId, (Cmd | null)[]>

export function emptyProgram(level: Level): Program {
  return {
    main: new Array(level.slots.main).fill(null),
    p1: new Array(level.slots.p1).fill(null),
    p2: new Array(level.slots.p2).fill(null),
  }
}

export function programFromSolution(level: Level): Program {
  const prog = emptyProgram(level)
  for (const slot of SLOT_IDS) {
    level.solution[slot].forEach((cmd, i) => {
      if (i < prog[slot].length) prog[slot][i] = cmd
    })
  }
  return prog
}

export function countCommands(prog: Program): number {
  return SLOT_IDS.reduce((n, s) => n + prog[s].filter((c) => c !== null).length, 0)
}

export function heightAt(level: Level, x: number, z: number): number {
  const row = level.grid[z]
  if (!row) return VOID
  const h = row[x]
  return h === undefined ? VOID : h
}

export function cellKey(x: number, z: number): string {
  return `${x},${z}`
}
