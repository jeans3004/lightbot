import { AUDIO_MODES, type AudioMode } from '../audio/audio'
import { SLOT_IDS, type Cmd, type Level, type Program } from './types'

const KEY = 'lightbot.save.v1'

interface SaveData {
  version: 1
  /** Ids de fases ja concluidas. */
  completed: number[]
  /** Ultimo programa escrito em cada fase, para nao perder trabalho ao sair. */
  programs: Record<string, Program>
  /** Menor numero de comandos com que a fase foi vencida. */
  best: Record<string, number>
  /** Preferencia de audio do jogador. */
  audio: AudioMode
}

function blank(): SaveData {
  return { version: 1, completed: [], programs: {}, best: {}, audio: 'full' }
}

function isCmd(value: unknown): value is Cmd {
  return typeof value === 'string' && ['F', 'L', 'R', 'J', 'X', 'P1', 'P2'].includes(value)
}

/** Aceita apenas o que reconhece: um localStorage adulterado nao pode
 *  derrubar o jogo nem injetar comandos invalidos na VM. */
function sanitize(raw: unknown): SaveData {
  if (typeof raw !== 'object' || raw === null) return blank()
  const data = raw as Partial<SaveData>
  const out = blank()

  if (Array.isArray(data.completed)) {
    out.completed = data.completed.filter((n): n is number => Number.isInteger(n))
  }
  if (data.programs && typeof data.programs === 'object') {
    for (const [id, prog] of Object.entries(data.programs)) {
      if (!prog || typeof prog !== 'object') continue
      const clean = {} as Program
      let valid = true
      for (const slot of SLOT_IDS) {
        const cells = (prog as Program)[slot]
        if (!Array.isArray(cells)) {
          valid = false
          break
        }
        clean[slot] = cells.map((c) => (isCmd(c) ? c : null))
      }
      if (valid) out.programs[id] = clean
    }
  }
  if (data.best && typeof data.best === 'object') {
    for (const [id, n] of Object.entries(data.best)) {
      if (typeof n === 'number' && Number.isFinite(n)) out.best[id] = n
    }
  }
  if (AUDIO_MODES.includes(data.audio as AudioMode)) out.audio = data.audio as AudioMode
  return out
}

function read(): SaveData {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? sanitize(JSON.parse(raw)) : blank()
  } catch {
    // Modo privado, cota cheia, JSON corrompido: seguir sem progresso salvo.
    return blank()
  }
}

function write(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    /* sem persistencia; o jogo continua funcionando na sessao */
  }
}

export const Save = {
  isCompleted(id: number): boolean {
    return read().completed.includes(id)
  },

  completedIds(): number[] {
    return read().completed
  },

  /** Uma fase e jogavel se e a primeira ou se a anterior foi concluida. */
  isUnlocked(id: number): boolean {
    if (id <= 1) return true
    const data = read()
    return data.completed.includes(id - 1) || data.completed.includes(id)
  },

  markCompleted(id: number, commandCount: number): void {
    const data = read()
    if (!data.completed.includes(id)) data.completed.push(id)
    const key = String(id)
    const previous = data.best[key]
    if (previous === undefined || commandCount < previous) data.best[key] = commandCount
    write(data)
  },

  bestFor(id: number): number | null {
    return read().best[String(id)] ?? null
  },

  saveProgram(level: Level, prog: Program): void {
    const data = read()
    data.programs[String(level.id)] = prog
    write(data)
  },

  /** Ajusta o programa salvo ao formato atual da fase, caso os limites mudem. */
  loadProgram(level: Level): Program | null {
    const stored = read().programs[String(level.id)]
    if (!stored) return null
    const prog = {} as Program
    for (const slot of SLOT_IDS) {
      const size = level.slots[slot]
      const cells = stored[slot] ?? []
      prog[slot] = Array.from({ length: size }, (_, i) => {
        const cmd = cells[i] ?? null
        return cmd !== null && level.allowed.includes(cmd) ? cmd : null
      })
    }
    return prog
  },

  audioMode(): AudioMode {
    return read().audio
  },

  setAudioMode(mode: AudioMode): void {
    const data = read()
    data.audio = mode
    write(data)
  },

  /** Apaga o progresso, mas preserva a preferencia de audio: ela e uma
   *  configuracao do jogador, nao parte do avanco no jogo. */
  reset(): void {
    const { audio } = read()
    write({ ...blank(), audio })
  },
}
