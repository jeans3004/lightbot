import type { AudioMode } from '../audio/audio'
import type { Cmd, SlotId } from '../core/types'

interface CmdMeta {
  /** Rotulo curto usado em leitores de tela e tooltips. */
  name: string
  hint: string
  /** Classe de cor no CSS. */
  tone: string
  /** Conteudo interno do <svg viewBox="0 0 24 24">. */
  icon: string
}

const stroke = 'fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"'

export const CMD_META: Record<Cmd, CmdMeta> = {
  F: {
    name: 'Andar',
    hint: 'Avanca uma celula, se o piso a frente estiver na mesma altura.',
    tone: 'walk',
    icon: `<path ${stroke} d="M12 20V5"/><path ${stroke} d="M6 11l6-6 6 6"/>`,
  },
  L: {
    name: 'Virar a esquerda',
    hint: 'Gira 90 graus no sentido anti-horario. Nao muda de celula.',
    tone: 'turn',
    icon: `<path ${stroke} d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5"/><path ${stroke} d="M4 3.5v4h4"/>`,
  },
  R: {
    name: 'Virar a direita',
    hint: 'Gira 90 graus no sentido horario. Nao muda de celula.',
    tone: 'turn',
    icon: `<path ${stroke} d="M19.5 12a7.5 7.5 0 1 1-2.4-5.5"/><path ${stroke} d="M20 3.5v4h-4"/>`,
  },
  J: {
    name: 'Pular',
    hint: 'Sobe exatamente um degrau, ou desce qualquer altura.',
    tone: 'jump',
    icon: `<path ${stroke} d="M4.5 19.5v-3.5a7 7 0 0 1 7-7h6"/><path ${stroke} d="M14 5l4 4-4 4"/>`,
  },
  X: {
    name: 'Acender',
    hint: 'Liga ou desliga a lampada da celula em que o robo esta.',
    tone: 'light',
    icon: `<path ${stroke} d="M12 3a6 6 0 0 1 3.4 10.9c-.5.4-.8 1-.8 1.6H9.4c0-.6-.3-1.2-.8-1.6A6 6 0 0 1 12 3z"/><path ${stroke} d="M9.5 18.5h5"/><path ${stroke} d="M10.5 21h3"/>`,
  },
  P1: {
    name: 'Chamar P1',
    hint: 'Executa tudo o que estiver no bloco P1 e volta.',
    tone: 'proc1',
    icon: `<text x="12" y="16.5" text-anchor="middle" font-size="11" font-weight="700" fill="currentColor" font-family="inherit">P1</text>`,
  },
  P2: {
    name: 'Chamar P2',
    hint: 'Executa tudo o que estiver no bloco P2 e volta.',
    tone: 'proc2',
    icon: `<text x="12" y="16.5" text-anchor="middle" font-size="11" font-weight="700" fill="currentColor" font-family="inherit">P2</text>`,
  },
}

export function cmdSvg(cmd: Cmd): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${CMD_META[cmd].icon}</svg>`
}

export const SLOT_LABEL: Record<SlotId, string> = {
  main: 'MAIN',
  p1: 'P1',
  p2: 'P2',
}

/** Icones do botao de som, um por modo. O alto-falante ganha ondas conforme
 *  o modo abre: mudo, so efeitos, efeitos e musica. */
export const AUDIO_ICON: Record<AudioMode, string> = {
  full: `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${stroke} d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z"/><path ${stroke} d="M15.5 9.2a4 4 0 0 1 0 5.6"/><path ${stroke} d="M18.2 6.5a8 8 0 0 1 0 11"/></svg>`,
  sfx: `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${stroke} d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z"/><path ${stroke} d="M15.5 9.2a4 4 0 0 1 0 5.6"/></svg>`,
  off: `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${stroke} d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z"/><path ${stroke} d="M16 10l4 4M20 10l-4 4"/></svg>`,
}
