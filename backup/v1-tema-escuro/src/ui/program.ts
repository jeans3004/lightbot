import { audio } from '../audio/audio'
import { SLOT_IDS, type Cmd, type Level, type Program, type SlotId } from '../core/types'
import { CMD_META, SLOT_LABEL, cmdSvg } from './commands'

interface DragSource {
  cmd: Cmd
  /** Ausente quando o arrasto veio da paleta. */
  from?: { slot: SlotId; index: number }
}

/**
 * Blocos de programa + paleta de comandos.
 *
 * Entrada pensada para toque primeiro: tocar um comando o adiciona ao bloco
 * ativo, tocar um comando ja colocado o remove. Arrastar existe por cima
 * disso, para quem estiver no mouse, mas nada depende dele.
 */
export class ProgramEditor {
  private level: Level | null = null
  private program: Program | null = null
  private active: SlotId = 'main'
  private locked = false
  private drag: DragSource | null = null

  private stripsEl: HTMLElement
  private paletteEl: HTMLElement

  constructor(
    root: HTMLElement,
    private onChange: (program: Program) => void,
  ) {
    root.innerHTML = `
      <div class="strips" role="group" aria-label="Blocos de programa"></div>
      <div class="palette" role="group" aria-label="Comandos disponiveis"></div>
    `
    this.stripsEl = root.querySelector('.strips')!
    this.paletteEl = root.querySelector('.palette')!
  }

  setLevel(level: Level, program: Program): void {
    this.level = level
    this.program = program
    this.active = 'main'
    this.render()
  }

  setLocked(locked: boolean): void {
    this.locked = locked
    this.stripsEl.classList.toggle('locked', locked)
    this.paletteEl.classList.toggle('locked', locked)
    for (const el of this.paletteEl.querySelectorAll('button')) el.disabled = locked
  }

  /** Destaca o comando em execucao; `null` limpa o destaque. */
  highlight(target: { slot: SlotId; index: number } | null): void {
    for (const el of this.stripsEl.querySelectorAll('.slot.running')) {
      el.classList.remove('running')
    }
    if (!target) return
    const el = this.slotEl(target.slot, target.index)
    el?.classList.add('running')
  }

  clearProgram(): void {
    if (!this.program || !this.level || this.locked) return
    for (const slot of SLOT_IDS) this.program[slot].fill(null)
    audio.play('remove')
    this.commit()
  }

  private slotEl(slot: SlotId, index: number): HTMLElement | null {
    return this.stripsEl.querySelector(`[data-slot="${slot}"] [data-index="${index}"]`)
  }

  // --------------------------------------------------------------- render

  private render(): void {
    const level = this.level
    const program = this.program
    if (!level || !program) return

    this.stripsEl.innerHTML = SLOT_IDS.filter((slot) => level.slots[slot] > 0)
      .map((slot) => this.stripHtml(slot, program[slot]))
      .join('')

    this.paletteEl.innerHTML = level.allowed
      .map((cmd) => {
        const meta = CMD_META[cmd]
        return `<button type="button" class="chip tone-${meta.tone}" data-cmd="${cmd}"
                  draggable="true" title="${meta.name} — ${meta.hint}" aria-label="${meta.name}">
                  ${cmdSvg(cmd)}<span class="chip-name">${meta.name}</span>
                </button>`
      })
      .join('')

    this.bind()
    this.syncActive()
  }

  private stripHtml(slot: SlotId, cells: (Cmd | null)[]): string {
    const used = cells.filter((c) => c !== null).length
    const slots = cells
      .map((cmd, index) => {
        if (cmd === null) {
          return `<div class="slot empty" data-index="${index}" role="gridcell" aria-label="espaco vazio"></div>`
        }
        const meta = CMD_META[cmd]
        return `<div class="slot filled tone-${meta.tone}" data-index="${index}" data-cmd="${cmd}"
                  draggable="true" role="gridcell" title="${meta.name} (toque para remover)"
                  aria-label="${meta.name}">${cmdSvg(cmd)}</div>`
      })
      .join('')

    return `
      <div class="strip" data-slot="${slot}" role="grid" aria-label="Bloco ${SLOT_LABEL[slot]}">
        <div class="strip-head">
          <span class="strip-name tone-${slot}">${SLOT_LABEL[slot]}</span>
          <span class="strip-count">${used}/${cells.length}</span>
        </div>
        <div class="slots">${slots}</div>
      </div>`
  }

  private syncActive(): void {
    for (const el of this.stripsEl.querySelectorAll('.strip')) {
      el.classList.toggle('active', (el as HTMLElement).dataset.slot === this.active)
    }
  }

  private commit(): void {
    this.render()
    if (this.program) this.onChange(this.program)
  }

  // --------------------------------------------------------------- eventos

  private bind(): void {
    for (const btn of this.paletteEl.querySelectorAll<HTMLButtonElement>('[data-cmd]')) {
      const cmd = btn.dataset.cmd as Cmd
      btn.disabled = this.locked
      btn.addEventListener('click', () => this.append(cmd))
      btn.addEventListener('dragstart', (e) => {
        this.drag = { cmd }
        e.dataTransfer?.setData('text/plain', cmd)
      })
      btn.addEventListener('dragend', () => (this.drag = null))
    }

    for (const stripEl of this.stripsEl.querySelectorAll<HTMLElement>('.strip')) {
      const slot = stripEl.dataset.slot as SlotId
      stripEl.addEventListener('pointerdown', () => {
        this.active = slot
        this.syncActive()
      })

      for (const slotEl of stripEl.querySelectorAll<HTMLElement>('.slot')) {
        const index = Number(slotEl.dataset.index)

        slotEl.addEventListener('click', () => {
          if (this.locked) return
          if (slotEl.classList.contains('filled')) this.removeAt(slot, index)
        })

        if (slotEl.classList.contains('filled')) {
          slotEl.addEventListener('dragstart', (e) => {
            if (this.locked) {
              e.preventDefault()
              return
            }
            this.drag = { cmd: slotEl.dataset.cmd as Cmd, from: { slot, index } }
            e.dataTransfer?.setData('text/plain', slotEl.dataset.cmd ?? '')
          })
          slotEl.addEventListener('dragend', () => (this.drag = null))
        }

        slotEl.addEventListener('dragover', (e) => {
          if (this.locked || !this.drag) return
          e.preventDefault()
          slotEl.classList.add('drop-target')
        })
        slotEl.addEventListener('dragleave', () => slotEl.classList.remove('drop-target'))
        slotEl.addEventListener('drop', (e) => {
          e.preventDefault()
          slotEl.classList.remove('drop-target')
          if (this.locked || !this.drag) return
          this.dropInto(slot, index, this.drag)
          this.drag = null
        })
      }
    }
  }

  // --------------------------------------------------------------- edicao

  /** Insere no primeiro espaco livre do bloco ativo. */
  private append(cmd: Cmd): void {
    if (!this.program || this.locked) return
    const cells = this.program[this.active]
    const free = cells.indexOf(null)
    if (free === -1) {
      this.flashFull(this.active)
      return
    }
    cells[free] = cmd
    audio.play('place')
    this.commit()
  }

  private removeAt(slot: SlotId, index: number): void {
    if (!this.program) return
    audio.play('remove')
    const cells = this.program[slot]
    // Remover empurra o resto para a esquerda: buracos no meio do programa
    // sao quase sempre um acidente, nao uma intencao.
    cells.splice(index, 1)
    cells.push(null)
    this.commit()
  }

  private dropInto(slot: SlotId, index: number, source: DragSource): void {
    if (!this.program) return
    const target = this.program[slot]

    if (source.from && source.from.slot === slot) {
      // Reordenar dentro do mesmo bloco: tira e reinsere na posicao alvo.
      // O tamanho se preserva sozinho, entao nao ha nada a compensar.
      const [moved] = target.splice(source.from.index, 1)
      target.splice(index, 0, moved)
      audio.play('place')
      this.commit()
      return
    }

    if (target.indexOf(null) === -1) {
      this.flashFull(slot)
      return
    }

    if (source.from) {
      const origin = this.program[source.from.slot]
      origin.splice(source.from.index, 1)
      origin.push(null)
    }

    audio.play('place')
    target.splice(index, 0, source.cmd)
    // Inserir aumentou o bloco em um. Descartar o ultimo elemento perderia um
    // comando quando o espaco livre esta no meio, entao remove-se o vazio
    // mais a direita — que existe, pois isso foi verificado acima.
    target.splice(target.lastIndexOf(null), 1)
    this.commit()
  }

  private flashFull(slot: SlotId): void {
    audio.play('bump')
    const el = this.stripsEl.querySelector(`[data-slot="${slot}"]`)
    if (!el) return
    el.classList.remove('full-warning')
    // Reinicia a animacao mesmo se o aviso ja estiver em curso.
    void (el as HTMLElement).offsetWidth
    el.classList.add('full-warning')
  }
}
