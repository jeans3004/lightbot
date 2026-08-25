import './style.css'
import { AUDIO_MODES, audio, type SfxName } from './audio/audio'
import { LEVELS, chapterOf, levelById, levelLabel } from './core/levels'
import { Save } from './core/save'
import { countCommands, emptyProgram, programFromSolution, type Level, type Program } from './core/types'
import { run, type Outcome, type RunResult, type Step } from './core/vm'
import { DURATION, View } from './render/view'
import { AUDIO_ICON, STAR_SVG } from './ui/commands'
import { Menus } from './ui/menus'
import { ProgramEditor } from './ui/program'

const SPEEDS = [1, 2, 0.5] as const

const OUTCOME_MESSAGE: Record<Exclude<Outcome, 'win'>, string> = {
  empty: 'O bloco MAIN esta vazio. Toque em um comando para adiciona-lo.',
  incomplete: 'O programa terminou com luzes apagadas.',
  timeout:
    'O programa ficou repetindo sem acender tudo. Uma chamada recursiva precisa avancar o robo a cada volta.',
  overflow:
    'Chamadas empilhadas demais. Coloque a chamada recursiva no fim do bloco para ela substituir a anterior em vez de acumular.',
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`elemento #${id} nao encontrado`)
  return node as T
}

interface OverlayAction {
  label: string
  tone?: 'primary' | 'cyan'
  onClick: () => void
}

class Game {
  private view: View
  private editor: ProgramEditor
  private menus: Menus

  private level: Level = LEVELS[0]
  private program: Program = emptyProgram(LEVELS[0])
  private speedIndex = 0
  private playing = false
  /** Incrementado a cada parada; a reproducao em curso percebe e desiste. */
  private runToken = 0

  private dialogueQueue: string[] = []

  private runBtn = el<HTMLButtonElement>('game-run')
  private runIcon = el('game-run-icon')

  constructor() {
    audio.setMode(Save.audioMode())
    // Navegadores so deixam criar o contexto de audio dentro de um gesto do
    // usuario, entao o primeiro toque ou tecla e o que liga o som.
    const unlock = () => audio.unlock()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })

    this.view = new View(el<HTMLCanvasElement>('scene'))
    this.editor = new ProgramEditor(el('strips'), el('palette'), (program) => {
      this.program = program
      Save.saveProgram(this.level, program)
      if (!this.playing) this.view.reset()
    })
    this.menus = new Menus((id) => this.openLevel(id))

    this.bindGameControls()
    this.bindAudioButtons()

    // Deep link para uma fase abre direto no jogo; caso contrario, splash.
    const fromHash = this.levelFromHash()
    if (fromHash !== null) this.openLevel(fromHash)
    else this.menus.show('splash')

    window.addEventListener('hashchange', () => {
      const id = this.levelFromHash()
      if (id !== null && (this.menus.current !== 'game' || id !== this.level.id)) this.openLevel(id)
    })
  }

  // ------------------------------------------------------------- navegacao

  private levelFromHash(): number | null {
    const match = /^#fase-(\d+)$/.exec(location.hash)
    if (!match) return null
    const id = Number(match[1])
    return levelById(id) && Save.isUnlocked(id) ? id : null
  }

  private openLevel(id: number): void {
    const level = levelById(id) ?? LEVELS[0]
    this.stop()
    this.hideOverlay()
    this.level = level
    this.program = Save.loadProgram(level) ?? emptyProgram(level)

    this.menus.focusLevel(level.id)
    this.menus.show('game')
    this.view.loadLevel(level)
    this.editor.setLevel(level, this.program)
    this.editor.setLocked(false)
    el('level-label').textContent = levelLabel(level.id)

    audio.play('levelStart')

    const target = `#fase-${level.id}`
    if (location.hash !== target) history.replaceState(null, '', target)

    // O tutorial fala uma vez por fase; depois disso o robo fica quieto.
    if (level.intro && !Save.introSeen(level.id)) {
      this.startDialogue(level.intro)
      Save.markIntroSeen(level.id)
    } else {
      this.endDialogue()
    }
  }

  private backToMenu(): void {
    this.stop()
    this.hideOverlay()
    this.endDialogue()
    history.replaceState(null, '', location.pathname)
    this.menus.show('levels')
  }

  private nextLevel(): void {
    const next = levelById(this.level.id + 1)
    if (next) this.openLevel(next.id)
    else this.backToMenu()
  }

  // -------------------------------------------------------------- dialogo

  private startDialogue(lines: string[]): void {
    this.dialogueQueue = [...lines]
    this.advanceDialogue()
  }

  private advanceDialogue(): void {
    const line = this.dialogueQueue.shift()
    if (line === undefined) {
      this.endDialogue()
      return
    }
    el('speech-text').textContent = line
    el('dialogue').classList.remove('hidden')
    audio.play('ui')
  }

  private endDialogue(): void {
    this.dialogueQueue = []
    el('dialogue').classList.add('hidden')
  }

  // ------------------------------------------------------------- controles

  private bindGameControls(): void {
    this.runBtn.addEventListener('click', () => (this.playing ? this.stop() : void this.play()))

    el('game-back').addEventListener('click', () => {
      audio.play('ui')
      this.backToMenu()
    })

    el('game-restart').addEventListener('click', () => {
      audio.play('ui')
      this.stop()
      this.editor.clearProgram()
      this.view.reset()
      this.hideOverlay()
    })

    const speedIcon = el('game-speed-icon')
    el('game-speed').addEventListener('click', () => {
      this.speedIndex = (this.speedIndex + 1) % SPEEDS.length
      const speed = SPEEDS[this.speedIndex]
      // 1 seta = lento, 2 = normal, 3 = rapido — igual ao botao do original.
      const arrows = speed === 0.5 ? 1 : speed === 1 ? 2 : 3
      const color = speed === 1 ? '#9aa9bd' : '#3fbf47'
      speedIcon.innerHTML = Array.from({ length: arrows }, (_, i) => {
        const x = 12 - (arrows - 1) * 4 + i * 8 - 4
        return `<path fill="${color}" d="M${x} 5v14l8-7z"/>`
      }).join('')
      el('game-speed').title = `Velocidade ${speed}x`
      audio.play('ui')
    })

    el('game-hint').addEventListener('click', () => {
      audio.play('ui')
      this.showHint()
    })

    // Tocar no dialogo (ou em qualquer lugar da cena) avanca a fala.
    el('dialogue').addEventListener('click', () => this.advanceDialogue())
    el('scene').addEventListener('pointerdown', () => {
      if (this.dialogueQueue.length > 0 || !el('dialogue').classList.contains('hidden')) {
        this.advanceDialogue()
      }
    })

    window.addEventListener('keydown', (e) => {
      if (this.menus.current !== 'game') return
      if (e.key === 'Enter') {
        e.preventDefault()
        if (!el('dialogue').classList.contains('hidden')) this.advanceDialogue()
        else this.playing ? this.stop() : void this.play()
      } else if (e.key === 'Escape') {
        if (this.playing) this.stop()
        else if (!el('overlay').classList.contains('hidden')) this.hideOverlay()
        else this.backToMenu()
      }
    })
  }

  private bindAudioButtons(): void {
    const buttons = ['chapters-audio', 'levels-audio', 'game-audio'].map((id) => el(id))
    const paint = () => {
      const mode = audio.getMode()
      for (const b of buttons) {
        b.innerHTML = AUDIO_ICON[mode]
        b.setAttribute('aria-label', `Som: ${mode === 'full' ? 'som e musica' : mode === 'sfx' ? 'so efeitos' : 'mudo'}`)
      }
    }
    for (const b of buttons) {
      b.addEventListener('click', () => {
        const next = AUDIO_MODES[(AUDIO_MODES.indexOf(audio.getMode()) + 1) % AUDIO_MODES.length]
        audio.setMode(next)
        // O clique e um gesto valido: se o jogo abriu mudo, e aqui que o
        // contexto de audio finalmente pode ser criado.
        audio.unlock()
        Save.setAudioMode(next)
        paint()
        audio.play('ui')
      })
    }
    paint()
  }

  private showHint(): void {
    this.showOverlay(this.level.hint, 'info', [
      {
        label: 'Ver solucao',
        tone: 'cyan',
        onClick: () => {
          if (this.playing) this.stop()
          this.program = programFromSolution(this.level)
          this.editor.setLevel(this.level, this.program)
          Save.saveProgram(this.level, this.program)
          this.hideOverlay()
        },
      },
      { label: 'Fechar', onClick: () => this.hideOverlay() },
    ])
  }

  // -------------------------------------------------------------- overlay

  private showOverlay(text: string, tone: 'info' | 'win' | 'error', actions: OverlayAction[], stars?: number): void {
    const card = el('overlay-card')
    card.className = `overlay-card ${tone === 'info' ? '' : tone}`.trim()
    el('overlay-text').textContent = text

    const old = card.querySelector('.overlay-stars')
    old?.remove()
    if (stars !== undefined) {
      const row = document.createElement('div')
      row.className = 'overlay-stars'
      row.innerHTML = STAR_SVG.repeat(stars)
      card.insertBefore(row, el('overlay-actions'))
    }

    el('overlay-actions').replaceChildren(
      ...actions.map((action) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = `pill-btn${action.tone ? ` ${action.tone}` : ''}`
        button.textContent = action.label
        button.addEventListener('click', () => {
          audio.play('ui')
          action.onClick()
        })
        return button
      }),
    )
    el('overlay').classList.remove('hidden')
  }

  private hideOverlay(): void {
    el('overlay').classList.add('hidden')
  }

  // ------------------------------------------------------------- execucao

  private setPlaying(playing: boolean): void {
    this.playing = playing
    this.editor.setLocked(playing)
    this.runBtn.classList.toggle('stopping', playing)
    this.runBtn.setAttribute('aria-label', playing ? 'Parar' : 'Executar')
    this.runIcon.innerHTML = playing
      ? `<rect x="6" y="6" width="12" height="12" rx="1.5" fill="#fff"/>`
      : `<path fill="#fff" d="M7 4v16l13-8z"/>`
  }

  private stop(): void {
    this.runToken++
    this.view.stop()
    this.editor.highlight(null)
    this.setPlaying(false)
  }

  private async play(): Promise<void> {
    this.endDialogue()
    const result = run(this.level, this.program)
    if (result.outcome === 'empty') {
      audio.play('fail')
      this.showOverlay(OUTCOME_MESSAGE.empty, 'error', [{ label: 'Ok', onClick: () => this.hideOverlay() }])
      return
    }

    const token = ++this.runToken
    this.setPlaying(true)
    this.hideOverlay()
    this.view.reset()

    for (const step of result.steps) {
      if (token !== this.runToken) return
      this.editor.highlight({ slot: step.slot, index: step.index })
      this.playStepSound(step)
      await this.view.playStep(step, SPEEDS[this.speedIndex])
      if (token !== this.runToken) return
    }

    this.editor.highlight(null)
    this.setPlaying(false)
    await this.finish(result, token)
  }

  /** Traduz um passo do trace no efeito sonoro correspondente. */
  private playStepSound(step: Step): void {
    const speed = SPEEDS[this.speedIndex]
    switch (step.kind) {
      case 'move':
        audio.play('step')
        break
      case 'jump':
        audio.play('jump', { duration: DURATION.jump / speed / 1000 })
        break
      case 'turn':
        audio.play('turn')
        break
      case 'bump':
        audio.play('bump')
        break
      case 'call':
        audio.play(step.cmd === 'P1' ? 'call1' : 'call2')
        break
      case 'light': {
        const name: SfxName =
          step.lightOn === undefined ? 'lightNone' : step.lightOn ? 'lightOn' : 'lightOff'
        audio.play(name)
        break
      }
    }
  }

  private async finish(result: RunResult, token: number): Promise<void> {
    if (result.outcome !== 'win') {
      const missing = this.level.lights.length - result.litAtEnd.length
      const detail =
        result.outcome === 'incomplete' && missing > 0
          ? `${OUTCOME_MESSAGE.incomplete} Faltou ${missing === 1 ? '1 luz' : `${missing} luzes`}.`
          : OUTCOME_MESSAGE[result.outcome]
      audio.play('fail')
      this.showOverlay(detail, 'error', [{ label: 'Ok', onClick: () => this.hideOverlay() }])
      return
    }

    const used = countCommands(this.program)
    const previousBest = Save.bestFor(this.level.id)
    Save.markCompleted(this.level.id, used)

    audio.play('win')
    await this.view.celebrate()
    if (token !== this.runToken) return

    const record = previousBest !== null && used < previousBest
    const message = record
      ? `Fase concluida com ${used} comandos — melhor que os ${previousBest} anteriores!`
      : `Fase concluida com ${used} comandos!`

    const chapter = chapterOf(this.level.id)
    const isLastOfChapter = chapter.levelIds[chapter.levelIds.length - 1] === this.level.id
    const actions: OverlayAction[] = [{ label: 'Menu', onClick: () => this.backToMenu() }]
    if (levelById(this.level.id + 1)) {
      actions.unshift({
        label: isLastOfChapter ? 'Proximo capitulo' : 'Proxima fase',
        tone: 'primary',
        onClick: () => this.nextLevel(),
      })
    }
    this.showOverlay(message, 'win', actions, 1)
  }
}

new Game()
