/**
 * Audio sintetizado em tempo real com a Web Audio API.
 *
 * Nada de arquivos: cada som e construido com osciladores e ruido no momento
 * em que toca. Isso mantem o bundle do mesmo tamanho, elimina carregamento e
 * deixa os sons responderem a parametros do jogo — o pulo, por exemplo, ajusta
 * a hora da aterrissagem a velocidade da execucao.
 */

export type SfxName =
  | 'step'
  | 'jump'
  | 'turn'
  | 'lightOn'
  | 'lightOff'
  | 'lightNone'
  | 'bump'
  | 'call1'
  | 'call2'
  | 'win'
  | 'fail'
  | 'place'
  | 'remove'
  | 'ui'
  | 'levelStart'

/** Tudo ligado, so efeitos, ou silencio. */
export type AudioMode = 'full' | 'sfx' | 'off'

export const AUDIO_MODES: readonly AudioMode[] = ['full', 'sfx', 'off']

export const AUDIO_MODE_LABEL: Record<AudioMode, string> = {
  full: 'Som e musica',
  sfx: 'So efeitos',
  off: 'Mudo',
}

/** Frequencias em Hz, para os sons ficarem legiveis em vez de numeros soltos. */
const NOTE = {
  A2: 110,
  G2: 98,
  F2: 87.31,
  C3: 130.81,
  A3: 220,
  B3: 246.94,
  D4: 293.66,
  C4: 261.63,
  E4: 329.63,
  G4: 392,
  A4: 440,
  B4: 493.88,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  G5: 783.99,
  A5: 880,
  C6: 1046.5,
  E6: 1318.5,
} as const

/** Progressao do fundo: quatro acordes de quatro segundos, em la menor. */
const CHORDS: number[][] = [
  [NOTE.A2, NOTE.E4, NOTE.G4, NOTE.C5],
  [NOTE.F2, NOTE.C4, NOTE.E4, NOTE.A4],
  [NOTE.C3, NOTE.E4, NOTE.G4, NOTE.B4],
  [NOTE.G2, NOTE.B3, NOTE.D4, NOTE.G4],
]

const MELODY_SCALE = [NOTE.A4, NOTE.C5, NOTE.D5, NOTE.E5, NOTE.G5, NOTE.A5]

const CHORD_SECONDS = 4
const MUSIC_LOOKAHEAD = 0.35
const MUSIC_TICK_MS = 120

/** Sons identicos disparados quase juntos viram um ruido so; espaca-os. */
const MIN_GAP_MS: Partial<Record<SfxName, number>> = {
  step: 60,
  turn: 60,
  call1: 45,
  call2: 45,
  place: 40,
}

export class AudioEngine {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private sfxBus!: GainNode
  private musicBus!: GainNode
  private noiseBuffer!: AudioBuffer

  private mode: AudioMode = 'full'
  private lastPlayed = new Map<SfxName, number>()

  private musicTimer: number | null = null
  private musicChord = 0
  private musicBeat = 0
  private nextEventTime = 0

  // ------------------------------------------------------------- ciclo de vida

  /**
   * Cria o contexto de audio. Navegadores so permitem isso dentro de um gesto
   * do usuario, entao este metodo e chamado no primeiro toque/tecla e e seguro
   * chamar de novo depois.
   */
  unlock(): void {
    // Quem abriu o jogo no mudo nao precisa de um contexto de audio ligado.
    if (this.mode === 'off') return
    if (!this.ctx) {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      try {
        this.ctx = new Ctor()
      } catch {
        return // sem audio disponivel; o jogo segue mudo
      }
      this.buildGraph()
    }
    void this.ctx.resume()
    if (this.mode === 'full') this.startMusic()
  }

  private buildGraph(): void {
    const ctx = this.ctx!

    this.master = ctx.createGain()
    this.master.gain.value = this.mode === 'off' ? 0 : 1

    // Impede que uma rajada de sons (recursao rapida) distorca a saida.
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -14
    limiter.knee.value = 18
    limiter.ratio.value = 8
    limiter.attack.value = 0.004
    limiter.release.value = 0.2

    this.master.connect(limiter)
    limiter.connect(ctx.destination)

    this.sfxBus = ctx.createGain()
    this.sfxBus.gain.value = 0.55
    this.sfxBus.connect(this.master)

    this.musicBus = ctx.createGain()
    this.musicBus.gain.value = 0
    this.musicBus.connect(this.master)

    // Ruido branco de um segundo, reaproveitado por todos os sons percussivos.
    const frames = ctx.sampleRate
    this.noiseBuffer = ctx.createBuffer(1, frames, ctx.sampleRate)
    const data = this.noiseBuffer.getChannelData(0)
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1
  }

  setMode(mode: AudioMode): void {
    this.mode = mode
    // Sem contexto ainda: nao se cria um aqui. setMode roda tambem na abertura
    // da pagina, fora de qualquer gesto, e o navegador recusaria. Quem chama a
    // partir de um clique deve chamar unlock() em seguida.
    if (!this.ctx) return
    this.master.gain.setTargetAtTime(mode === 'off' ? 0 : 1, this.ctx.currentTime, 0.05)
    if (mode === 'full') this.startMusic()
    else this.stopMusic()
  }

  getMode(): AudioMode {
    return this.mode
  }

  // ------------------------------------------------------------------ efeitos

  play(name: SfxName, options: { duration?: number } = {}): void {
    const ctx = this.ctx
    if (!ctx || this.mode === 'off' || ctx.state !== 'running') return

    const gap = MIN_GAP_MS[name]
    if (gap !== undefined) {
      const now = ctx.currentTime * 1000
      const last = this.lastPlayed.get(name)
      if (last !== undefined && now - last < gap) return
      this.lastPlayed.set(name, now)
    }

    const t = ctx.currentTime
    switch (name) {
      case 'step':
        this.thump(t, 190, 0.07, 0.22)
        this.noise(t, 0.05, 0.1, 2200, 'highpass')
        break

      case 'jump': {
        // A aterrissagem acompanha a animacao: no fim do arco, seja qual for
        // a velocidade escolhida pelo jogador.
        const flight = options.duration ?? 0.43
        this.sweep(t, 300, 700, flight * 0.55, 0.16, 'sine')
        this.thump(t + flight * 0.82, 150, 0.09, 0.3)
        this.noise(t + flight * 0.82, 0.06, 0.12, 1800, 'highpass')
        break
      }

      case 'turn':
        this.noise(t, 0.09, 0.07, 1400, 'bandpass')
        this.tone(t, NOTE.E5, 0.05, 0.05, 'triangle')
        break

      case 'lightOn':
        // Sino: fundamental, quinta e duas oitavas acima, decaindo juntas.
        this.tone(t, NOTE.A5, 0.55, 0.16, 'sine')
        this.tone(t + 0.01, NOTE.E6, 0.42, 0.1, 'sine')
        this.tone(t + 0.02, NOTE.C6, 0.32, 0.07, 'sine')
        this.sweep(t, NOTE.A4, NOTE.A5 * 2, 0.14, 0.05, 'triangle')
        break

      case 'lightOff':
        this.sweep(t, NOTE.A5, NOTE.A4, 0.18, 0.13, 'triangle')
        break

      case 'lightNone':
        // Acionou fora de um alvo: um tique seco, sem recompensa.
        this.tone(t, NOTE.C4, 0.06, 0.06, 'square')
        break

      case 'bump':
        this.thump(t, 110, 0.16, 0.42)
        this.tone(t, 92, 0.14, 0.16, 'sawtooth')
        this.noise(t, 0.07, 0.14, 700, 'lowpass')
        break

      case 'call1':
        this.tone(t, NOTE.G5, 0.07, 0.055, 'triangle')
        break

      case 'call2':
        this.tone(t, NOTE.C6, 0.07, 0.055, 'triangle')
        break

      case 'win': {
        const arpeggio = [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6]
        arpeggio.forEach((freq, i) => {
          const at = t + i * 0.09
          this.tone(at, freq, 0.7, 0.2, 'sine')
          this.tone(at + 0.005, freq * 2, 0.5, 0.08, 'sine')
        })
        this.noise(t, 0.5, 0.05, 5000, 'highpass')
        break
      }

      case 'fail':
        this.tone(t, NOTE.E4, 0.2, 0.16, 'triangle')
        this.tone(t + 0.13, NOTE.C4, 0.34, 0.16, 'triangle')
        break

      case 'place':
        this.tone(t, NOTE.E5, 0.05, 0.1, 'square')
        this.tone(t + 0.008, NOTE.A5, 0.06, 0.06, 'sine')
        break

      case 'remove':
        this.tone(t, NOTE.C4, 0.06, 0.09, 'square')
        break

      case 'ui':
        this.tone(t, NOTE.A4, 0.04, 0.07, 'triangle')
        break

      case 'levelStart':
        this.sweep(t, NOTE.C4, NOTE.C5, 0.3, 0.09, 'triangle')
        this.tone(t + 0.16, NOTE.G5, 0.4, 0.09, 'sine')
        break
    }
  }

  // ------------------------------------------------------- blocos de sintese

  /** Nota simples com envelope percussivo. */
  private tone(
    at: number,
    freq: number,
    decay: number,
    peak: number,
    type: OscillatorType,
    destination: AudioNode = this.sfxBus,
  ): void {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(freq, at)

    const gain = ctx.createGain()
    this.envelope(gain.gain, at, 0.006, decay, peak)

    osc.connect(gain)
    gain.connect(destination)
    osc.start(at)
    osc.stop(at + decay + 0.05)
  }

  /** Nota que desliza de uma frequencia a outra. */
  private sweep(
    at: number,
    from: number,
    to: number,
    duration: number,
    peak: number,
    type: OscillatorType,
  ): void {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(from, at)
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + duration)

    const gain = ctx.createGain()
    this.envelope(gain.gain, at, 0.008, duration, peak)

    osc.connect(gain)
    gain.connect(this.sfxBus)
    osc.start(at)
    osc.stop(at + duration + 0.05)
  }

  /** Corpo grave de um impacto: seno que cai de altura rapidamente. */
  private thump(at: number, freq: number, decay: number, peak: number): void {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, at)
    osc.frequency.exponentialRampToValueAtTime(freq * 0.4, at + decay)

    const gain = ctx.createGain()
    this.envelope(gain.gain, at, 0.004, decay, peak)

    osc.connect(gain)
    gain.connect(this.sfxBus)
    osc.start(at)
    osc.stop(at + decay + 0.05)
  }

  /** Camada de ruido filtrado — o "ar" de passos, atritos e impactos. */
  private noise(at: number, decay: number, peak: number, cutoff: number, filter: BiquadFilterType): void {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    src.loop = true

    const biquad = ctx.createBiquadFilter()
    biquad.type = filter
    biquad.frequency.value = cutoff
    biquad.Q.value = filter === 'bandpass' ? 3 : 1

    const gain = ctx.createGain()
    this.envelope(gain.gain, at, 0.004, decay, peak)

    src.connect(biquad)
    biquad.connect(gain)
    gain.connect(this.sfxBus)
    src.start(at)
    src.stop(at + decay + 0.05)
  }

  /** Ataque rapido e queda exponencial. Nunca chega a zero: rampas
   *  exponenciais nao aceitam zero como alvo. */
  private envelope(param: AudioParam, at: number, attack: number, decay: number, peak: number): void {
    param.setValueAtTime(0.0001, at)
    param.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack)
    param.exponentialRampToValueAtTime(0.0001, at + attack + decay)
  }

  // -------------------------------------------------------------------- musica

  private startMusic(): void {
    const ctx = this.ctx
    if (!ctx || this.musicTimer !== null) return

    this.musicBus.gain.setTargetAtTime(0.13, ctx.currentTime, 1.2)
    this.nextEventTime = ctx.currentTime + 0.1
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), MUSIC_TICK_MS)
  }

  private stopMusic(): void {
    if (this.ctx) this.musicBus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.6)
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer)
      this.musicTimer = null
    }
  }

  /**
   * Agendador com antecedencia: o setInterval so decide o que vem a seguir,
   * enquanto o relogio de audio cuida do tempo exato. Sem isso, a musica
   * tremeria junto com qualquer engasgo do quadro.
   */
  private scheduleMusic(): void {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return

    while (this.nextEventTime < ctx.currentTime + MUSIC_LOOKAHEAD) {
      const at = this.nextEventTime

      if (this.musicBeat === 0) {
        this.playChord(CHORDS[this.musicChord], at)
        this.musicChord = (this.musicChord + 1) % CHORDS.length
      }

      // Uma nota solta de vez em quando, para o fundo nao ficar estatico.
      if (this.musicBeat % 2 === 1 && Math.random() < 0.45) {
        const freq = MELODY_SCALE[Math.floor(Math.random() * MELODY_SCALE.length)]
        this.tone(at, freq, 1.6, 0.05, 'sine', this.musicBus)
      }

      this.musicBeat = (this.musicBeat + 1) % 4
      this.nextEventTime += CHORD_SECONDS / 4
    }
  }

  /** Acorde em pad: ataque e queda longos, com leve desafinacao entre vozes. */
  private playChord(freqs: number[], at: number): void {
    const ctx = this.ctx!
    const duration = CHORD_SECONDS

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(700, at)
    filter.frequency.linearRampToValueAtTime(1400, at + duration * 0.5)
    filter.frequency.linearRampToValueAtTime(700, at + duration)
    filter.connect(this.musicBus)

    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      osc.type = i === 0 ? 'sine' : 'triangle'
      osc.frequency.value = freq
      osc.detune.value = (i - 1.5) * 4

      const gain = ctx.createGain()
      const peak = i === 0 ? 0.22 : 0.1
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.linearRampToValueAtTime(peak, at + duration * 0.35)
      gain.gain.linearRampToValueAtTime(0.0001, at + duration)

      osc.connect(gain)
      gain.connect(filter)
      osc.start(at)
      osc.stop(at + duration + 0.1)
    })
  }
}

/** O audio e um recurso unico do documento; um singleton evita passa-lo
 *  por toda a arvore de componentes so para tocar um clique. */
export const audio = new AudioEngine()
