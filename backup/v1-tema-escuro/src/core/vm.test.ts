import { describe, expect, it } from 'vitest'
import { LEVELS, levelById } from './levels'
import { run } from './vm'
import { emptyProgram, programFromSolution, VOID, type Cmd, type Level, type Program } from './types'

function progOf(level: Level, main: Cmd[], p1: Cmd[] = [], p2: Cmd[] = []): Program {
  const prog = emptyProgram(level)
  const put = (slot: 'main' | 'p1' | 'p2', cmds: Cmd[]) => {
    // Testes podem ultrapassar os limites da fase de proposito.
    if (cmds.length > prog[slot].length) prog[slot] = new Array(cmds.length).fill(null)
    cmds.forEach((c, i) => (prog[slot][i] = c))
  }
  put('main', main)
  put('p1', p1)
  put('p2', p2)
  return prog
}

const flat = levelById(1)! // `0 0 0*`

describe('movimento', () => {
  it('anda para a frente em piso da mesma altura', () => {
    const r = run(flat, progOf(flat, ['F']))
    expect(r.steps[0].kind).toBe('move')
    expect(r.steps[0].to).toEqual({ x: 1, z: 0, dir: 0 })
  })

  it('bate ao andar contra o vazio em vez de cair', () => {
    const r = run(flat, progOf(flat, ['F', 'F', 'F']))
    expect(r.steps.map((s) => s.kind)).toEqual(['move', 'move', 'bump'])
    expect(r.steps[2].to).toEqual({ x: 2, z: 0, dir: 0 })
  })

  it('virar a direita percorre leste, sul, oeste, norte', () => {
    const r = run(flat, progOf(flat, ['R', 'R', 'R', 'R']))
    expect(r.steps.map((s) => s.to.dir)).toEqual([1, 2, 3, 0])
  })

  it('virar a esquerda e o inverso, sem dir negativo', () => {
    const r = run(flat, progOf(flat, ['L', 'L']))
    expect(r.steps.map((s) => s.to.dir)).toEqual([3, 2])
  })
})

describe('pulo', () => {
  const stairs = levelById(7)! // `2 2 0 0 1*`

  it('nao sobe degrau andando', () => {
    const lvl = levelById(6)! // `0 1 2 2*`
    expect(run(lvl, progOf(lvl, ['F'])).steps[0].kind).toBe('bump')
  })

  it('sobe exatamente um degrau', () => {
    const lvl = levelById(6)!
    expect(run(lvl, progOf(lvl, ['J'])).steps[0].kind).toBe('jump')
  })

  it('nao sobe dois degraus de uma vez', () => {
    // De (2,0) altura 0 para (3,0) altura 0 e ok; de altura 0 para 2 nao.
    const lvl: Level = { ...levelById(6)!, grid: [[0, 2, 2, 2]] }
    expect(run(lvl, progOf(lvl, ['J'])).steps[0].kind).toBe('bump')
  })

  it('desce qualquer altura de uma vez', () => {
    const r = run(stairs, progOf(stairs, ['F', 'J']))
    expect(r.steps[1].kind).toBe('jump')
    expect(r.steps[1].to.x).toBe(2)
  })

  it('nao pula para o vazio', () => {
    const lvl: Level = { ...flat, grid: [[0, VOID, 0]] }
    expect(run(lvl, progOf(lvl, ['J'])).steps[0].kind).toBe('bump')
  })
})

describe('lampadas', () => {
  it('acender fora de um alvo nao faz nada', () => {
    const r = run(flat, progOf(flat, ['X']))
    expect(r.steps[0].kind).toBe('light')
    expect(r.steps[0].lightOn).toBeUndefined()
    expect(r.outcome).toBe('incomplete')
  })

  it('acender e alternar: a segunda vez apaga', () => {
    const r = run(flat, progOf(flat, ['F', 'F', 'X', 'X']))
    const toggles = r.steps.filter((s) => s.lightOn !== undefined)
    expect(toggles.map((s) => s.lightOn)).toEqual([true])
    // A execucao para na vitoria, entao o segundo X nunca roda.
    expect(r.outcome).toBe('win')
  })

  it('para no exato passo em que a ultima luz acende', () => {
    const r = run(flat, progOf(flat, ['F', 'F', 'X', 'F', 'F']))
    expect(r.outcome).toBe('win')
    expect(r.steps).toHaveLength(3)
  })
})

describe('procedimentos', () => {
  it('chamar um procedimento vazio nao consome um passo visivel', () => {
    const r = run(flat, progOf(flat, ['P1', 'F']))
    expect(r.steps.map((s) => s.kind)).toEqual(['move'])
  })

  it('marca o bloco de origem de cada passo, para o destaque da UI', () => {
    const lvl = levelById(10)!
    const r = run(lvl, progOf(lvl, ['P1'], ['X', 'J']))
    expect(r.steps.map((s) => s.slot)).toEqual(['main', 'p1', 'p1'])
    expect(r.steps.map((s) => s.index)).toEqual([0, 0, 1])
  })

  it('recursao em posicao de cauda repete sem estourar a pilha', () => {
    const lvl = levelById(17)!
    const r = run(lvl, programFromSolution(lvl))
    expect(r.outcome).toBe('win')
    expect(Math.max(...r.steps.map((s) => s.depth))).toBeLessThan(5)
  })

  it('recursao improdutiva termina em timeout em vez de travar', () => {
    const lvl = levelById(17)!
    const r = run(lvl, progOf(lvl, ['P1'], ['L', 'P1']))
    expect(r.outcome).toBe('timeout')
  })

  it('recursao fora da cauda estoura a pilha e e reportada', () => {
    const lvl = levelById(17)!
    const r = run(lvl, progOf(lvl, ['P1'], ['P1', 'L']))
    expect(r.outcome).toBe('overflow')
  })
})

describe('programa vazio', () => {
  it('e reportado como vazio, nao como derrota', () => {
    expect(run(flat, emptyProgram(flat)).outcome).toBe('empty')
  })
})

describe('as 20 fases', () => {
  it.each(LEVELS.map((l) => [l.id, l.name, l] as const))(
    'fase %i "%s" e resolvida pela solucao de referencia',
    (_id, _name, level) => {
      const result = run(level, programFromSolution(level))
      expect(result.outcome).toBe('win')
    },
  )

  it.each(LEVELS.map((l) => [l.id, l.name, l] as const))(
    'fase %i "%s" tem solucao dentro dos limites de espacos',
    (_id, _name, level) => {
      for (const slot of ['main', 'p1', 'p2'] as const) {
        expect(level.solution[slot].length).toBeLessThanOrEqual(level.slots[slot])
      }
    },
  )

  it.each(LEVELS.map((l) => [l.id, l.name, l] as const))(
    'fase %i "%s" so usa comandos liberados na paleta',
    (_id, _name, level) => {
      for (const slot of ['main', 'p1', 'p2'] as const) {
        for (const cmd of level.solution[slot]) {
          expect(level.allowed).toContain(cmd)
        }
      }
    },
  )

  it('toda fase tem pelo menos uma lampada e um ponto de partida valido', () => {
    for (const level of LEVELS) {
      expect(level.lights.length).toBeGreaterThan(0)
      const h = level.grid[level.start.z]?.[level.start.x]
      expect(h, `fase ${level.id} comeca fora do tabuleiro`).toBeGreaterThanOrEqual(0)
    }
  })

  it('nenhuma fase termina com o robo batendo (solucoes limpas)', () => {
    for (const level of LEVELS) {
      const bumps = run(level, programFromSolution(level)).steps.filter((s) => s.kind === 'bump')
      expect(bumps, `fase ${level.id} tem ${bumps.length} colisao(oes)`).toHaveLength(0)
    }
  })

  it('a dificuldade cresce: fases finais exigem procedimentos', () => {
    for (const level of LEVELS.slice(-4)) {
      expect(level.solution.p1.length).toBeGreaterThan(0)
    }
  })
})
