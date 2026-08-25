import type { AudioMode } from '../audio/audio'
import type { Cmd, SlotId } from '../core/types'

interface CmdMeta {
  /** Rotulo curto usado em leitores de tela e tooltips. */
  name: string
  hint: string
  /** Conteudo interno do <svg viewBox="0 0 24 24">. */
  icon: string
}

// Icones de contorno, no traco grosso e simples do original.
const stroke = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"'

export const CMD_META: Record<Cmd, CmdMeta> = {
  F: {
    name: 'Andar',
    hint: 'Avanca uma celula, se o piso a frente estiver na mesma altura.',
    // seta larga para cima
    icon: `<path ${stroke} d="M12 3.5L4.5 11h4.5v9h6v-9h4.5z"/>`,
  },
  L: {
    name: 'Virar a esquerda',
    hint: 'Gira 90 graus no sentido anti-horario. Nao muda de celula.',
    icon: `<path ${stroke} d="M8 7.5H16a4.5 4.5 0 0 1 0 9h-3"/><path ${stroke} d="M11 4l-4 3.5L11 11"/>`,
  },
  R: {
    name: 'Virar a direita',
    hint: 'Gira 90 graus no sentido horario. Nao muda de celula.',
    icon: `<path ${stroke} d="M16 7.5H8a4.5 4.5 0 0 0 0 9h3"/><path ${stroke} d="M13 4l4 3.5L13 11"/>`,
  },
  J: {
    name: 'Pular',
    hint: 'Sobe exatamente um degrau, ou desce qualquer altura.',
    // arco de pulo com uma linha de chao
    icon: `<path ${stroke} d="M4 17.5c0-7 4-11 8-11s8 4 8 11"/><path ${stroke} d="M17 14l3 3.5 3-3.5" transform="translate(-3 0)"/><path ${stroke} d="M3 20.5h18"/>`,
  },
  X: {
    name: 'Acender',
    hint: 'Liga ou desliga a lampada da celula em que o robo esta.',
    // lampada classica
    icon: `<path ${stroke} d="M12 3a6.2 6.2 0 0 1 3.6 11.2c-.6.5-.9 1.2-.9 1.9V17H9.3v-.9c0-.7-.3-1.4-.9-1.9A6.2 6.2 0 0 1 12 3z"/><path ${stroke} d="M9.5 19h5"/><path ${stroke} d="M10.5 21.5h3"/>`,
  },
  P1: {
    name: 'Chamar P1',
    hint: 'Executa tudo o que estiver no bloco P1 e volta.',
    icon: `<text x="12" y="17" text-anchor="middle" font-size="12.5" font-weight="700" fill="currentColor" font-family="inherit">P1</text>`,
  },
  P2: {
    name: 'Chamar P2',
    hint: 'Executa tudo o que estiver no bloco P2 e volta.',
    icon: `<text x="12" y="17" text-anchor="middle" font-size="12.5" font-weight="700" fill="currentColor" font-family="inherit">P2</text>`,
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

/** Alto-falante verde do original; ganha ondas conforme o modo abre. */
const speaker = 'M4 9.5h3.5L12 5.5v13L7.5 14.5H4z'
const green = 'fill="none" stroke="#3fbf47" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"'
export const AUDIO_ICON: Record<AudioMode, string> = {
  full: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#3fbf47" d="${speaker}"/><path ${green} d="M15.5 9.2a4 4 0 0 1 0 5.6"/><path ${green} d="M18.2 6.5a8 8 0 0 1 0 11"/></svg>`,
  sfx: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#3fbf47" d="${speaker}"/><path ${green} d="M15.5 9.2a4 4 0 0 1 0 5.6"/></svg>`,
  off: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#9aa9bd" d="${speaker}"/><path fill="none" stroke="#9aa9bd" stroke-width="2.2" stroke-linecap="round" d="M16 10l4 4M20 10l-4 4"/></svg>`,
}

export const STAR_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#ffd21e" stroke="#e0a800" stroke-width="1.2" stroke-linejoin="round" d="M12 2.5l2.9 6.2 6.8.8-5 4.6 1.3 6.7L12 17.5l-6 3.3 1.3-6.7-5-4.6 6.8-.8z"/></svg>`
export const STAR_GREY_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#c3c9d1" stroke="#a5adb8" stroke-width="1.2" stroke-linejoin="round" d="M12 2.5l2.9 6.2 6.8.8-5 4.6 1.3 6.7L12 17.5l-6 3.3 1.3-6.7-5-4.6 6.8-.8z"/></svg>`
export const LOCK_SVG = `<svg class="lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2" fill="#fff"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="#fff" stroke-width="2.6"/></svg>`
