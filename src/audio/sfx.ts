/** Procedural WebAudio sound effects — no audio files are shipped. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;

  /** Must be called from a user gesture. */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    void this.ctx.resume();
  }

  private ready(): AudioContext | null {
    if (this.muted || !this.ctx || !this.master) return null;
    return this.ctx;
  }

  private env(gain: GainNode, t0: number, attack: number, peak: number, decay: number): void {
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  private noise(t0: number, dur: number): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.05);
    return src;
  }

  /** Deep cinematic impact. */
  boom(power = 1, delay = 0): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(28, t + 1.2);
    const g = ctx.createGain();
    this.env(g, t, 0.005, 0.9 * power, 1.6);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + 1.8);

    const n = this.noise(t, 1.2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3000, t);
    lp.frequency.exponentialRampToValueAtTime(80, t + 1);
    const ng = ctx.createGain();
    this.env(ng, t, 0.002, 0.6 * power, 1.1);
    n.connect(lp).connect(ng).connect(this.master!);
  }

  /** Rising tension sweep lasting `dur` seconds. */
  riser(dur = 3, delay = 0): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const n = this.noise(t, dur);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 4;
    bp.frequency.setValueAtTime(200, t);
    bp.frequency.exponentialRampToValueAtTime(6000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
    n.connect(bp).connect(g).connect(this.master!);

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(55, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + dur);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.12, t + dur);
    og.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    const lp = ctx.createBiquadFilter();
    lp.frequency.value = 2400;
    osc.connect(lp).connect(og).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.1);
  }

  whoosh(dur = 0.6, delay = 0): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const n = this.noise(t, dur);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.5;
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(3500, t + dur * 0.5);
    bp.frequency.exponentialRampToValueAtTime(300, t + dur);
    const g = ctx.createGain();
    this.env(g, t, dur * 0.45, 0.5, dur * 0.55);
    n.connect(bp).connect(g).connect(this.master!);
  }

  /** Paper tear / crackle. */
  tear(delay = 0): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    for (let i = 0; i < 14; i++) {
      const tt = t + i * 0.018 + Math.random() * 0.01;
      const n = this.noise(tt, 0.05);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1500 + Math.random() * 3000;
      const g = ctx.createGain();
      this.env(g, tt, 0.002, 0.35, 0.04);
      n.connect(hp).connect(g).connect(this.master!);
    }
  }

  sparkle(count = 12, delay = 0, spread = 1.2): void {
    const ctx = this.ready();
    if (!ctx) return;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    for (let i = 0; i < count; i++) {
      const t = ctx.currentTime + delay + Math.random() * spread;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 880 * Math.pow(2, scale[Math.floor(Math.random() * scale.length)] / 12);
      const g = ctx.createGain();
      this.env(g, t, 0.003, 0.08, 0.5);
      osc.connect(g).connect(this.master!);
      osc.start(t);
      osc.stop(t + 0.6);
    }
  }

  /** Big major chord pad for the number reveal. */
  chord(delay = 0, root = 261.63, dur = 3): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    for (const ratio of [1, 1.26, 1.5, 2, 2.52, 3]) {
      for (const detune of [-7, 7]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = root * ratio;
        osc.detune.value = detune;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(400, t);
        lp.frequency.exponentialRampToValueAtTime(3200, t + 0.6);
        const g = ctx.createGain();
        this.env(g, t, 0.05, 0.035, dur);
        osc.connect(lp).connect(g).connect(this.master!);
        osc.start(t);
        osc.stop(t + dur + 0.2);
      }
    }
  }

  tick(delay = 0, freq = 2000): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    this.env(g, t, 0.001, 0.06, 0.03);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  glitch(dur = 0.3, delay = 0): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    for (let tt = 0; tt < dur; tt += 0.03) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 80 + Math.random() * 1600;
      const g = ctx.createGain();
      this.env(g, t0 + tt, 0.001, 0.07, 0.025);
      osc.connect(g).connect(this.master!);
      osc.start(t0 + tt);
      osc.stop(t0 + tt + 0.03);
    }
  }

  /** Firework launch whistle followed by crackle. */
  launch(delay = 0): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(2200, t + 0.9);
    const g = ctx.createGain();
    this.env(g, t, 0.05, 0.05, 0.85);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + 1);
  }

  crackle(dur = 1, delay = 0): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const count = Math.floor(dur * 40);
    for (let i = 0; i < count; i++) {
      const tt = t0 + Math.random() * dur;
      const n = this.noise(tt, 0.02);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 3000;
      const g = ctx.createGain();
      this.env(g, tt, 0.001, 0.15 * Math.random(), 0.015);
      n.connect(hp).connect(g).connect(this.master!);
    }
  }

  /** Low sustained drone for tension. */
  drone(dur = 4, delay = 0, freq = 55): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    for (const m of [1, 1.5, 2.01]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq * m;
      const lp = ctx.createBiquadFilter();
      lp.frequency.value = 300;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.08, t + dur * 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(lp).connect(g).connect(this.master!);
      osc.start(t);
      osc.stop(t + dur + 0.1);
    }
  }

  zap(delay = 0): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const n = this.noise(t, 0.5);
    const g = ctx.createGain();
    this.env(g, t, 0.001, 0.9, 0.45);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 500;
    n.connect(hp).connect(g).connect(this.master!);
    this.boom(0.8, delay + 0.08);
  }
}
