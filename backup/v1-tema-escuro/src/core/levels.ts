import { VOID, type Cmd, type Dir, type Level, type SlotId } from './types'

/**
 * Mapas sao escritos como texto para caberem na cabeca de quem edita.
 * Cada token e uma celula da linha (z), separados por espaco:
 *   `.`   celula vazia (buraco)
 *   `3`   piso na altura 3
 *   `3*`  piso na altura 3 com uma lampada
 */
function parseMap(src: string): { grid: number[][]; lights: [number, number][] } {
  const rows = src
    .trim()
    .split('\n')
    .map((line) => line.trim().split(/\s+/))

  const width = Math.max(...rows.map((r) => r.length))
  const grid: number[][] = []
  const lights: [number, number][] = []

  rows.forEach((tokens, z) => {
    const row: number[] = new Array(width).fill(VOID)
    tokens.forEach((token, x) => {
      if (token === '.') return
      const hasLight = token.endsWith('*')
      const height = Number.parseInt(hasLight ? token.slice(0, -1) : token, 10)
      if (!Number.isFinite(height)) {
        throw new Error(`token invalido "${token}" na linha ${z}`)
      }
      row[x] = height
      if (hasLight) lights.push([x, z])
    })
    grid.push(row)
  })

  return { grid, lights }
}

interface LevelSpec {
  name: string
  map: string
  start: [number, number, Dir]
  slots: Partial<Record<SlotId, number>>
  allowed: Cmd[]
  hint: string
  solution: Partial<Record<SlotId, Cmd[]>>
}

function build(specs: LevelSpec[]): Level[] {
  return specs.map((spec, i) => {
    const { grid, lights } = parseMap(spec.map)
    const [x, z, dir] = spec.start
    return {
      id: i + 1,
      name: spec.name,
      grid,
      lights,
      start: { x, z, dir },
      slots: { main: spec.slots.main ?? 0, p1: spec.slots.p1 ?? 0, p2: spec.slots.p2 ?? 0 },
      allowed: spec.allowed,
      hint: spec.hint,
      solution: {
        main: spec.solution.main ?? [],
        p1: spec.solution.p1 ?? [],
        p2: spec.solution.p2 ?? [],
      },
    }
  })
}

// Direcoes de partida: 0 leste, 1 sul, 2 oeste, 3 norte.
export const LEVELS: Level[] = build([
  // ---------------------------------------------------------------- basico
  {
    name: 'Primeiro passo',
    map: `0 0 0*`,
    start: [0, 0, 0],
    slots: { main: 8 },
    allowed: ['F', 'X'],
    hint: 'Ande ate o ladrilho azul e acenda a luz em cima dele.',
    solution: { main: ['F', 'F', 'X'] },
  },
  {
    name: 'Dois alvos',
    map: `0 0* 0 0 0*`,
    start: [0, 0, 0],
    slots: { main: 8 },
    allowed: ['F', 'X'],
    hint: 'Acenda a primeira luz de passagem, sem voltar depois.',
    solution: { main: ['F', 'X', 'F', 'F', 'F', 'X'] },
  },
  {
    name: 'Vire',
    map: `
      0 0 0
      . . 0
      . . 0*
    `,
    start: [0, 0, 0],
    slots: { main: 8 },
    allowed: ['F', 'L', 'R', 'X'],
    hint: 'Girar nao muda a posicao do robo, so para onde ele olha.',
    solution: { main: ['F', 'F', 'R', 'F', 'F', 'X'] },
  },
  {
    name: 'Zigue-zague',
    map: `
      0 0 . .
      . 0 0 .
      . . 0 0*
      . . . 0*
    `,
    start: [0, 0, 0],
    slots: { main: 14 },
    allowed: ['F', 'L', 'R', 'X'],
    hint: 'Um passo, uma virada, um passo, a virada contraria.',
    solution: {
      main: ['F', 'R', 'F', 'L', 'F', 'R', 'F', 'L', 'F', 'X', 'R', 'F', 'X'],
    },
  },
  {
    name: 'A volta',
    map: `
      0 0 0*
      0 0 0
      0* 0 0*
    `,
    start: [0, 0, 0],
    slots: { main: 12 },
    allowed: ['F', 'L', 'R', 'X'],
    hint: 'Contorne a borda sempre virando para o mesmo lado.',
    solution: {
      main: ['F', 'F', 'X', 'R', 'F', 'F', 'X', 'R', 'F', 'F', 'X'],
    },
  },

  // ----------------------------------------------------------------- pulos
  {
    name: 'Salto',
    map: `0 1 2 2*`,
    start: [0, 0, 0],
    slots: { main: 8 },
    allowed: ['F', 'J', 'X'],
    hint: 'Andar so funciona no plano. Para subir um degrau, pule.',
    solution: { main: ['J', 'J', 'F', 'X'] },
  },
  {
    name: 'Descida',
    map: `2 2 0 0 1*`,
    start: [0, 0, 0],
    slots: { main: 8 },
    allowed: ['F', 'J', 'X'],
    hint: 'O pulo sobe um degrau de cada vez, mas desce qualquer altura.',
    solution: { main: ['F', 'J', 'F', 'J', 'X'] },
  },
  {
    name: 'Escadaria',
    map: `
      0 1 . .
      . 2 . .
      . 3 3 .
      . . 4* .
    `,
    start: [0, 0, 0],
    slots: { main: 10 },
    allowed: ['F', 'L', 'R', 'J', 'X'],
    hint: 'Suba ate o topo trocando de direcao no meio do caminho.',
    solution: { main: ['J', 'R', 'J', 'J', 'L', 'F', 'R', 'J', 'X'] },
  },
  {
    name: 'Ponte quebrada',
    map: `0* 1 0* 1 0*`,
    start: [0, 0, 0],
    slots: { main: 8 },
    allowed: ['F', 'J', 'X'],
    hint: 'Repare no padrao que se repete: acender, pular, pular.',
    solution: { main: ['X', 'J', 'J', 'X', 'J', 'J', 'X'] },
  },

  // ------------------------------------------------------------ procedimentos
  {
    name: 'Procedimento',
    map: `0* 1 0* 1 0* 1 0*`,
    start: [0, 0, 0],
    slots: { main: 5, p1: 4 },
    allowed: ['F', 'J', 'X', 'P1'],
    hint: 'O caminho nao cabe em MAIN. Guarde o trecho repetido em P1 e chame P1 varias vezes.',
    solution: { main: ['P1', 'P1', 'P1', 'X'], p1: ['X', 'J', 'J'] },
  },
  {
    name: 'Quatro cantos',
    map: `
      0* 0 0 0*
      0  0 0 0
      0  0 0 0
      0* 0 0 0*
    `,
    start: [0, 0, 0],
    slots: { main: 6, p1: 5 },
    allowed: ['F', 'L', 'R', 'X', 'P1'],
    hint: 'Cada lado do quadrado e igual: acender, tres passos, virar.',
    solution: { main: ['P1', 'P1', 'P1', 'P1'], p1: ['X', 'F', 'F', 'F', 'R'] },
  },
  {
    name: 'Degraus alternados',
    map: `0 1* 2 3* 4 5* 6`,
    start: [0, 0, 0],
    slots: { main: 4, p1: 4 },
    allowed: ['F', 'J', 'X', 'P1'],
    hint: 'Pule, acenda, pule — e repita.',
    solution: { main: ['P1', 'P1', 'P1'], p1: ['J', 'X', 'J'] },
  },
  {
    name: 'Cruz',
    map: `
      .  0* .
      0* 0  0*
      .  0* .
    `,
    start: [1, 1, 3],
    slots: { main: 5, p1: 6 },
    allowed: ['F', 'L', 'R', 'X', 'P1'],
    hint: 'Va ate a ponta, acenda, volte ao centro e mire no proximo braco.',
    solution: { main: ['P1', 'P1', 'P1', 'P1'], p1: ['F', 'X', 'R', 'R', 'F', 'R'] },
  },
  {
    name: 'Dois procedimentos',
    map: `0 1 2 3* 3 3* 3 3*`,
    start: [0, 0, 0],
    slots: { main: 5, p1: 4, p2: 4 },
    allowed: ['F', 'J', 'X', 'P1', 'P2'],
    hint: 'Subir e um padrao; caminhar acendendo e outro. Um em P1, outro em P2.',
    solution: { main: ['P1', 'P2', 'P2', 'X'], p1: ['J', 'J', 'J'], p2: ['X', 'F', 'F'] },
  },
  {
    name: 'Serpente',
    map: `
      0* 0 0* 0 0*
      0  0 0  0 0
      0* 0 0* 0 0*
      0  0 0  0 0
      0* 0 0* 0 0*
    `,
    start: [0, 0, 0],
    slots: { main: 12, p1: 4, p2: 4 },
    allowed: ['F', 'L', 'R', 'X', 'P1', 'P2'],
    hint: 'P1 acende e avanca dois. P2 usa P1 duas vezes para varrer uma fileira inteira.',
    solution: {
      main: ['P2', 'R', 'F', 'F', 'R', 'P2', 'L', 'F', 'F', 'L', 'P2'],
      p1: ['X', 'F', 'F'],
      p2: ['P1', 'P1', 'X'],
    },
  },
  {
    name: 'O anel',
    map: `
      0* 0 0* 0 0*
      0  . .  . 0
      0* . .  . 0*
      0  . .  . 0
      0* 0 0* 0 0*
    `,
    start: [0, 0, 0],
    slots: { main: 5, p1: 4, p2: 4 },
    allowed: ['F', 'L', 'R', 'X', 'P1', 'P2'],
    hint: 'Deixe a lampada do canto para a primeira chamada do lado seguinte acender.',
    solution: {
      main: ['P2', 'P2', 'P2', 'P2'],
      p1: ['X', 'F', 'F'],
      p2: ['P1', 'P1', 'R'],
    },
  },

  // -------------------------------------------------------------- recursao
  {
    name: 'Recursao',
    map: `0* 0 0* 0 0* 0 0* 0 0*`,
    start: [0, 0, 0],
    slots: { main: 3, p1: 4 },
    allowed: ['F', 'X', 'P1'],
    hint: 'Um procedimento pode chamar a si mesmo. A fase acaba assim que a ultima luz acende — o laco nao precisa de fim.',
    solution: { main: ['P1'], p1: ['X', 'F', 'F', 'P1'] },
  },
  {
    name: 'Escada infinita',
    map: `0 1* 2 3* 4 5* 6 7*`,
    start: [0, 0, 0],
    slots: { main: 3, p1: 4 },
    allowed: ['F', 'J', 'X', 'P1'],
    hint: 'O mesmo laco de antes, agora subindo.',
    solution: { main: ['P1'], p1: ['J', 'X', 'J', 'P1'] },
  },
  {
    name: 'Espiral',
    map: `
      0* 0 0* 0 0* 0 0*
      0  . .  . .  . 0
      0* . .  . .  . 0*
      0  . .  . .  . 0
      0* . .  . .  . 0*
      0  . .  . .  . 0
      0* 0 0* 0 0* 0 0*
    `,
    start: [0, 0, 0],
    slots: { main: 3, p1: 4, p2: 5 },
    allowed: ['F', 'L', 'R', 'X', 'P1', 'P2'],
    hint: 'P2 percorre um lado inteiro, vira, e chama P2 de novo.',
    solution: {
      main: ['P2'],
      p1: ['X', 'F', 'F'],
      p2: ['P1', 'P1', 'P1', 'R', 'P2'],
    },
  },
  {
    name: 'Torre final',
    map: `
      0*  1*  2*  3*
      11* .   .   4*
      10* .   .   5*
      9*  8*  7*  6*
    `,
    start: [0, 0, 0],
    slots: { main: 3, p1: 6, p2: 4 },
    allowed: ['F', 'L', 'R', 'J', 'X', 'P1', 'P2'],
    hint: 'P1 acende e sobe tres vezes. P2 chama P1, vira, e chama P2. O ultimo pulo e uma queda livre.',
    solution: {
      main: ['P2'],
      p1: ['X', 'J', 'X', 'J', 'X', 'J'],
      p2: ['P1', 'R', 'P2'],
    },
  },
])

export function levelById(id: number): Level | undefined {
  return LEVELS.find((l) => l.id === id)
}

export function boardSize(level: Level): { width: number; depth: number; maxHeight: number } {
  const depth = level.grid.length
  const width = Math.max(...level.grid.map((r) => r.length))
  let maxHeight = 0
  for (const row of level.grid) {
    for (const h of row) if (h > maxHeight) maxHeight = h
  }
  return { width, depth, maxHeight }
}
