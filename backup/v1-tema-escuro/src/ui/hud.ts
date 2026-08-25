import { audio } from '../audio/audio'
import { LEVELS } from '../core/levels'
import { Save } from '../core/save'
import type { Level } from '../core/types'

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`elemento #${id} nao encontrado`)
  return node as T
}

export interface BannerAction {
  label: string
  primary?: boolean
  onClick: () => void
}

export class Hud {
  private levelNum = el('level-num')
  private levelName = el('level-name')
  private lights = el('lights')
  private lightsText = el('lights-text')
  private banner = el('banner')
  private bannerText = el('banner-text')
  private bannerActions = el('banner-actions')
  private dialog = el<HTMLDialogElement>('levels-dialog')
  private levelGrid = el('level-grid')

  constructor(private onPickLevel: (id: number) => void) {
    el('btn-levels').addEventListener('click', () => {
      audio.play('ui')
      this.openLevels()
    })
    el('btn-close-levels').addEventListener('click', () => {
      audio.play('ui')
      this.dialog.close()
    })
    el('btn-reset-progress').addEventListener('click', () => {
      if (!confirm('Apagar todo o progresso e os programas salvos?')) return
      Save.reset()
      this.renderLevelGrid()
      this.onPickLevel(1)
      this.dialog.close()
    })
  }

  setLevel(level: Level): void {
    this.levelNum.textContent = `Fase ${level.id} de ${LEVELS.length}`
    this.levelName.textContent = level.name
    this.setLights(0, level.lights.length)
  }

  setLights(done: number, total: number): void {
    this.lightsText.textContent = `${done}/${total}`
    this.lights.classList.toggle('complete', total > 0 && done === total)
  }

  showBanner(text: string, tone: 'info' | 'win' | 'error', actions: BannerAction[] = []): void {
    this.bannerText.textContent = text
    this.banner.className = `banner ${tone === 'info' ? '' : tone}`.trim()
    this.bannerActions.replaceChildren(
      ...actions.map((action) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = action.primary ? 'primary-btn' : 'ghost-btn small'
        button.textContent = action.label
        button.addEventListener('click', () => {
          audio.play('ui')
          action.onClick()
        })
        return button
      }),
    )
  }

  hideBanner(): void {
    this.banner.classList.add('hidden')
  }

  private openLevels(): void {
    this.renderLevelGrid()
    this.dialog.showModal()
  }

  closeLevels(): void {
    if (this.dialog.open) this.dialog.close()
  }

  private renderLevelGrid(): void {
    const currentId = Number(this.levelNum.dataset.id ?? 0)
    this.levelGrid.replaceChildren(
      ...LEVELS.map((level) => {
        const unlocked = Save.isUnlocked(level.id)
        const done = Save.isCompleted(level.id)
        const best = Save.bestFor(level.id)

        const card = document.createElement('button')
        card.type = 'button'
        card.className = `level-card${done ? ' done' : ''}${level.id === currentId ? ' current' : ''}`
        card.disabled = !unlocked
        card.innerHTML = `
          <span class="card-num">${level.id}${done ? '<span class="check">✔</span>' : ''}</span>
          <span class="card-name">${unlocked ? level.name : 'Bloqueada'}</span>
          ${best !== null ? `<span class="card-num">${best} comandos</span>` : ''}
        `
        card.addEventListener('click', () => {
          this.dialog.close()
          this.onPickLevel(level.id)
        })
        return card
      }),
    )
  }

  /** Guarda a fase atual para o grid conseguir destacar o cartao certo. */
  trackCurrent(id: number): void {
    this.levelNum.dataset.id = String(id)
  }
}
