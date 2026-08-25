/** Motor de tweens minimo: o loop de render avanca o relogio, cada tween
 *  recebe um progresso 0..1 ja suavizado e escreve direto nos objetos. */

export type Easing = (k: number) => number

export const Ease = {
  linear: (k: number) => k,
  inOut: (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2),
  out: (k: number) => 1 - (1 - k) ** 3,
  outBack: (k: number) => 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2,
} satisfies Record<string, Easing>

interface Tween {
  elapsed: number
  duration: number
  ease: Easing
  update: (k: number) => void
  resolve: () => void
  cancelled: boolean
}

export class Timeline {
  private tweens: Tween[] = []

  /** Roda `update` de 0 a 1 ao longo de `duration` ms. */
  run(duration: number, update: (k: number) => void, ease: Easing = Ease.inOut): Promise<void> {
    if (duration <= 0) {
      update(1)
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      this.tweens.push({ elapsed: 0, duration, ease, update, resolve, cancelled: false })
    })
  }

  /** Espera sem animar nada. */
  wait(duration: number): Promise<void> {
    return this.run(duration, () => {}, Ease.linear)
  }

  advance(deltaMs: number): void {
    if (this.tweens.length === 0) return
    const active = this.tweens
    this.tweens = []
    for (const t of active) {
      if (t.cancelled) continue
      t.elapsed += deltaMs
      const raw = Math.min(1, t.elapsed / t.duration)
      t.update(t.ease(raw))
      if (raw >= 1) t.resolve()
      else this.tweens.push(t)
    }
  }

  /** Interrompe tudo. As promessas pendentes resolvem para nao travar quem espera. */
  clear(): void {
    const pending = this.tweens
    this.tweens = []
    for (const t of pending) {
      t.cancelled = true
      t.resolve()
    }
  }

  get busy(): boolean {
    return this.tweens.length > 0
  }
}
