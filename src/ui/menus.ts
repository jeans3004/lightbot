import { audio } from '../audio/audio'
import { CHAPTERS, LEVELS, levelById } from '../core/levels'
import { Save } from '../core/save'
import { VOID, type Chapter, type Level } from '../core/types'
import { LOCK_SVG, STAR_GREY_SVG, STAR_SVG } from './commands'

export type ScreenId = 'splash' | 'chapters' | 'levels' | 'game'

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`elemento #${id} nao encontrado`)
  return node as T
}

/**
 * As tres telas fora do jogo — splash, capitulos e grade de fases — e a
 * troca entre elas. O fluxo espelha o original: splash → capitulo com setas
 * laterais → grade de fases com cadeados → jogo.
 */
export class Menus {
  private screens: Record<ScreenId, HTMLElement> = {
    splash: el('screen-splash'),
    chapters: el('screen-chapters'),
    levels: el('screen-levels'),
    game: el('screen-game'),
  }

  private chapterIndex = 0
  current: ScreenId = 'splash'

  constructor(private onPickLevel: (id: number) => void) {
    this.screens.splash.addEventListener('click', () => {
      audio.play('ui')
      this.show('chapters')
    })

    el('chapters-back').addEventListener('click', () => {
      audio.play('ui')
      this.show('splash')
    })
    el('chapter-prev').addEventListener('click', () => this.stepChapter(-1))
    el('chapter-next').addEventListener('click', () => this.stepChapter(1))
    el('chapter-card').addEventListener('click', () => {
      audio.play('ui')
      this.show('levels')
    })

    el('levels-back').addEventListener('click', () => {
      audio.play('ui')
      this.show('chapters')
    })

    // Setas do teclado navegam os capitulos, como um carrossel.
    window.addEventListener('keydown', (e) => {
      if (this.current !== 'chapters') return
      if (e.key === 'ArrowLeft') this.stepChapter(-1)
      else if (e.key === 'ArrowRight') this.stepChapter(1)
      else if (e.key === 'Enter') el('chapter-card').click()
    })
  }

  show(screen: ScreenId): void {
    this.current = screen
    for (const [id, node] of Object.entries(this.screens)) {
      node.classList.toggle('hidden', id !== screen)
    }
    if (screen === 'chapters') this.renderChapter()
    if (screen === 'levels') this.renderLevels()
  }

  /** Abre o menu ja posicionado no capitulo de uma fase. */
  focusLevel(levelId: number): void {
    const idx = CHAPTERS.findIndex((c) => c.levelIds.includes(levelId))
    if (idx >= 0) this.chapterIndex = idx
  }

  private get chapter(): Chapter {
    return CHAPTERS[this.chapterIndex]
  }

  private stepChapter(delta: number): void {
    const next = this.chapterIndex + delta
    if (next < 0 || next >= CHAPTERS.length) return
    audio.play('ui')
    this.chapterIndex = next
    this.renderChapter()
  }

  private starsText(): string {
    return `${Save.completedIds().length}/${LEVELS.length}`
  }

  // ------------------------------------------------------------ capitulos

  private renderChapter(): void {
    const chapter = this.chapter
    el('chapter-num').textContent = String(chapter.id)
    el('chapter-name').textContent = chapter.name
    el('chapter-stars').textContent = this.starsText()
    ;(el('chapter-prev') as HTMLButtonElement).disabled = this.chapterIndex === 0
    ;(el('chapter-next') as HTMLButtonElement).disabled = this.chapterIndex === CHAPTERS.length - 1

    // A vinheta do capitulo e uma fase dele desenhada em isometrico 2D — a
    // ultima, que costuma ser a mais vistosa.
    const showcase = levelById(chapter.levelIds[chapter.levelIds.length - 1])!
    el('chapter-preview').innerHTML = isoPreview(showcase)

    el('chapter-dots').innerHTML = CHAPTERS.map((_, i) => `<i class="${i === this.chapterIndex ? 'on' : ''}"></i>`).join('')
  }

  // ---------------------------------------------------------------- fases

  private renderLevels(): void {
    const chapter = this.chapter
    el('levels-chapter-num').textContent = String(chapter.id)
    el('levels-chapter-name').textContent = chapter.name
    el('levels-stars').textContent = this.starsText()

    const grid = el('level-grid')
    grid.replaceChildren(
      ...chapter.levelIds.map((id, i) => {
        const unlocked = Save.isUnlocked(id)
        const done = Save.isCompleted(id)
        const tile = document.createElement('button')
        tile.type = 'button'
        tile.className = `level-tile${unlocked ? ' open' : ''}`
        tile.disabled = !unlocked
        tile.setAttribute('aria-label', unlocked ? `Fase ${i + 1}` : `Fase ${i + 1}, bloqueada`)
        tile.innerHTML = unlocked
          ? `${i + 1}<span class="tile-star">${done ? STAR_SVG : STAR_GREY_SVG}</span>`
          : LOCK_SVG
        tile.addEventListener('click', () => {
          audio.play('ui')
          this.onPickLevel(id)
        })
        return tile
      }),
    )
  }
}

/**
 * Desenho isometrico 2D de uma fase, em SVG puro — usado como vinheta do
 * capitulo. Bem mais leve que uma segunda cena Three.js so para um icone.
 */
export function isoPreview(level: Level): string {
  const W = 200
  const H = 200
  const cols = Math.max(...level.grid.map((r) => r.length))
  const rows = level.grid.length
  const maxH = Math.max(0, ...level.grid.flat())

  // Tamanho da celula escolhido para caber tudo no quadro, com folga para as
  // colunas mais altas.
  const s = Math.min(W / ((cols + rows) * 0.62 + maxH * 0.35), 44)
  const hStep = s * 0.5
  const halfW = s * 0.5
  const halfH = s * 0.25
  const cx = W / 2
  const cy = H / 2 - ((rows - cols) * halfH) / 2 + (maxH * hStep) / 2 - s * 0.2

  const lightSet = new Set(level.lights.map(([x, z]) => `${x},${z}`))
  const parts: string[] = []

  // Ordem de pintura: de tras para frente (z crescente, depois x crescente).
  for (let z = 0; z < rows; z++) {
    for (let x = 0; x < cols; x++) {
      const h = level.grid[z]?.[x]
      if (h === undefined || h === VOID) continue

      const px = cx + (x - z) * halfW
      const py = cy + (x + z) * halfH - h * hStep
      const top = lightSet.has(`${x},${z}`) ? '#2f86c9' : '#c9d6e6'

      // faces laterais da coluna
      if (h > 0) {
        const depth = h * hStep
        parts.push(
          `<path d="M${px - halfW},${py} L${px},${py + halfH} L${px},${py + halfH + depth} L${px - halfW},${py + depth} Z" fill="#9fb0c8" stroke="#6d7f9c" stroke-width="1"/>`,
          `<path d="M${px + halfW},${py} L${px},${py + halfH} L${px},${py + halfH + depth} L${px + halfW},${py + depth} Z" fill="#8797b0" stroke="#6d7f9c" stroke-width="1"/>`,
        )
      }
      // topo
      parts.push(
        `<path d="M${px},${py - halfH} L${px + halfW},${py} L${px},${py + halfH} L${px - halfW},${py} Z" fill="${top}" stroke="#6d7f9c" stroke-width="1"/>`,
      )
      // pernas finas nas celulas do nivel zero
      if (h === 0) {
        const leg = s * 0.35
        parts.push(
          `<path d="M${px - halfW},${py} v${leg} M${px},${py + halfH} v${leg} M${px + halfW},${py} v${leg}" stroke="#8b9bb5" stroke-width="1"/>`,
        )
      }
    }
  }

  // Robo simplificado na celula inicial.
  const rx = cx + (level.start.x - level.start.z) * halfW
  const startH = level.grid[level.start.z]?.[level.start.x] ?? 0
  const ry = cy + (level.start.x + level.start.z) * halfH - startH * hStep
  const r = s * 0.28
  parts.push(
    `<g stroke="#5f6f8b" stroke-width="1.4">
       <ellipse cx="${rx}" cy="${ry + r * 0.2}" rx="${r * 0.9}" ry="${r * 0.35}" fill="#9fb0c8"/>
       <circle cx="${rx}" cy="${ry - r * 0.6}" r="${r * 0.7}" fill="#b9c6da"/>
       <circle cx="${rx}" cy="${ry - r * 2}" r="${r}" fill="#b9c6da"/>
       <ellipse cx="${rx - r * 0.35}" cy="${ry - r * 2}" rx="${r * 0.28}" ry="${r * 0.36}" fill="#fff"/>
       <ellipse cx="${rx + r * 0.35}" cy="${ry - r * 2}" rx="${r * 0.28}" ry="${r * 0.36}" fill="#fff"/>
       <path d="M${rx},${ry - r * 3} v${-r * 0.7}"/>
       <circle cx="${rx}" cy="${ry - r * 3.9}" r="${r * 0.3}" fill="#b9c6da"/>
     </g>`,
  )

  return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${parts.join('')}</svg>`
}
