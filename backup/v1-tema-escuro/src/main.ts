import './style.css'
import { AUDIO_MODES, AUDIO_MODE_LABEL, audio, type SfxName } from './audio/audio'
import { LEVELS, levelById } from './core/levels'
import { Save } from './core/save'
import { countCommands, emptyProgram, programFromSolution, type Level, type Program } from './core/types'
import { run, type Outcome, type RunResult, type Step } from './core/vm'
import { DURATION, View } from './render/view'
import { AUDIO_ICON } from './ui/commands'
import { ProgramEditor } from './ui/program'
import { Hud, type BannerAction } from './ui/hud'

const SPEEDS = [1, 2, 0.5] as const

const OUTCOME_MESSAGE: Record<Exclude<Outcome, 'win'>, string> = {
  empty: 'O bloco MAIN esta vazio. Toque em um comando para adiciona-lo.',
  incomplete: 'O programa terminou com luzes apagadas.',
  timeout:
    'O programa ficou repetindo sem acender tudo. Uma chamada recursiva precisa avancar o robo a cada volta.',
  overflow:
    'Chamadas empilhadas demais. Coloque a chamada recursiva no fim do bloco para ela substituir a anterior em vez de acumular.',
}

class Game {
  private view: View
  private editor: ProgramEditor
  private hud: Hud

  private level: Level = LEVELS[0]
  private program: Program = emptyProgram(LEVELS[0])
  private speedIndex = 0
  private playing = false
  /** Incrementado a cada parada; a reproducao em curso percebe e desiste. */
  private runToken = 0

  private runBtn = document.getElementById('btn-run') as HTMLButtonElement
  private runLabel = document.getElementById('btn-run-text')!

  constructor() {
    audio.setMode(Save.audioMode())
    // Navegadores so deixam criar o contexto de audio dentro de um gesto do
    // usuario, entao o primeiro toque ou tecla e o que liga o som.
    const unlock = () => audio.unlock()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })

    const canvas = document.getElementById('scene') as HTMLCanvasElement
    this.view = new View(canvas)
    this.editor = new ProgramEditor(document.getElementById('editor')!, (program) => {
      this.program = program
      Save.saveProgram(this.level, program)
      // Editar invalida o que estiver na tela: volta o tabuleiro ao inicio
      // para o jogador nunca ler luzes de uma execucao antiga como atuais.
      if (!this.playing) {
        this.view.reset()
        this.hud.setLights(0, this.level.lights.length)
      }
    })
    this.hud = new Hud((id) => this.loadLevel(id))

    this.bindControls()
    window.addEventListener('hashchange', () => this.loadLevel(this.levelFromHash()))
    this.loadLevel(this.levelFromHash() ?? this.firstUnfinished())
  }

  // ------------------------------------------------------------- navegacao

  private levelFromHash(): number | null {
    const match = /^#fase-(\d+)$/.exec(location.hash)
    if (!match) return null
    const id = Number(match[1])
    return levelById(id) && Save.isUnlocked(id) ? id : null
  }

  private firstUnfinished(): number {
    const next = LEVELS.find((l) => !Save.isCompleted(l.id))
    return next?.id ?? LEVELS[LEVELS.length - 1].id
  }

  private loadLevel(id: number | null): void {
    const level = levelById(id ?? 1) ?? LEVELS[0]
    this.stop()
    this.level = level
    this.program = Save.loadProgram(level) ?? emptyProgram(level)

    this.view.loadLevel(level)
    this.editor.setLevel(level, this.program)
    this.editor.setLocked(false)
    this.hud.setLevel(level)
    this.hud.trackCurrent(level.id)
    this.hud.hideBanner()

    audio.play('levelStart')

    const target = `#fase-${level.id}`
    if (location.hash !== target) history.replaceState(null, '', target)
  }

  private nextLevel(): void {
    const next = levelById(this.level.id + 1)
    if (next) this.loadLevel(next.id)
    else {
      this.hud.showBanner('Voce terminou todas as fases. Obrigado por jogar!', 'win', [
        { label: 'Escolher fase', onClick: () => document.getElementById('btn-levels')?.click() },
      ])
    }
  }

  // -------------------------------------------------------------- controles

  private bindControls(): void {
    this.runBtn.addEventListener('click', () => (this.playing ? this.stop() : void this.play()))

    document.getElementById('btn-clear')!.addEventListener('click', () => {
      if (this.playing) return
      this.editor.clearProgram()
      this.view.reset()
      this.hud.setLights(0, this.level.lights.length)
      this.hud.hideBanner()
    })

    const speedBtn = document.getElementById('btn-speed')!
    speedBtn.addEventListener('click', () => {
      this.speedIndex = (this.speedIndex + 1) % SPEEDS.length
      speedBtn.textContent = `${SPEEDS[this.speedIndex]}x`
      audio.play('ui')
    })

    document.getElementById('btn-hint')!.addEventListener('click', () => {
      audio.play('ui')
      this.showHint()
    })
    document.getElementById('btn-view')!.addEventListener('click', () => {
      audio.play('ui')
      this.view.resetView()
    })

    const audioBtn = document.getElementById('btn-audio')!
    const audioIcon = document.getElementById('btn-audio-icon')!
    const paintAudioButton = () => {
      const mode = audio.getMode()
      audioIcon.innerHTML = AUDIO_ICON[mode]
      audioBtn.title = AUDIO_MODE_LABEL[mode]
      audioBtn.setAttribute('aria-label', `Som: ${AUDIO_MODE_LABEL[mode]}`)
    }
    audioBtn.addEventListener('click', () => {
      const next = AUDIO_MODES[(AUDIO_MODES.indexOf(audio.getMode()) + 1) % AUDIO_MODES.length]
      audio.setMode(next)
      // O clique e um gesto valido: se o jogo abriu mudo, e aqui que o
      // contexto de audio finalmente pode ser criado.
      audio.unlock()
      Save.setAudioMode(next)
      paintAudioButton()
      audio.play('ui') // silencioso no modo mudo, que e a confirmacao certa
    })
    paintAudioButton()

    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLElement && e.target.closest('dialog')) return
      if (e.key === 'Enter') {
        e.preventDefault()
        this.playing ? this.stop() : void this.play()
      } else if (e.key === 'Escape' && this.playing) {
        this.stop()
      }
    })
  }

  private showHint(): void {
    this.hud.showBanner(this.level.hint, 'info', [
      {
        label: 'Ver solucao',
        onClick: () => {
          if (this.playing) this.stop()
          this.program = programFromSolution(this.level)
          this.editor.setLevel(this.level, this.program)
          Save.saveProgram(this.level, this.program)
          this.hud.showBanner('Solucao preenchida. Toque em Executar para ver o robo segui-la.', 'info', [
            { label: 'Fechar', onClick: () => this.hud.hideBanner() },
          ])
        },
      },
      { label: 'Fechar', onClick: () => this.hud.hideBanner() },
    ])
  }

  // ------------------------------------------------------------- execucao

  private setPlaying(playing: boolean): void {
    this.playing = playing
    this.editor.setLocked(playing)
    this.runBtn.classList.toggle('stopping', playing)
    this.runLabel.textContent = playing ? 'Parar' : 'Executar'
  }

  private stop(): void {
    this.runToken++
    this.view.stop()
    this.editor.highlight(null)
    this.setPlaying(false)
  }

  private async play(): Promise<void> {
    const result = run(this.level, this.program)
    if (result.outcome === 'empty') {
      audio.play('fail')
      this.hud.showBanner(OUTCOME_MESSAGE.empty, 'error', [
        { label: 'Ok', onClick: () => this.hud.hideBanner() },
      ])
      return
    }

    const token = ++this.runToken
    this.setPlaying(true)
    this.hud.hideBanner()
    this.hud.closeLevels()
    this.view.reset()

    const total = this.level.lights.length
    let lit = 0
    this.hud.setLights(0, total)

    for (const step of result.steps) {
      if (token !== this.runToken) return
      this.editor.highlight({ slot: step.slot, index: step.index })
      this.playStepSound(step)
      await this.view.playStep(step, SPEEDS[this.speedIndex])
      if (token !== this.runToken) return

      if (step.lightOn !== undefined) {
        lit += step.lightOn ? 1 : -1
        this.hud.setLights(lit, total)
      }
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
        // O som da aterrissagem e agendado a partir da duracao real do arco,
        // entao continua caindo no lugar certo em 0.5x e em 2x.
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
      this.hud.showBanner(detail, 'error', [{ label: 'Ok', onClick: () => this.hud.hideBanner() }])
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
      : `Fase concluida com ${used} comandos.`

    const actions: BannerAction[] = [{ label: 'Refazer', onClick: () => this.hud.hideBanner() }]
    if (levelById(this.level.id + 1)) {
      actions.unshift({ label: 'Proxima fase', primary: true, onClick: () => this.nextLevel() })
    }
    this.hud.showBanner(message, 'win', actions)
  }
}

new Game()
