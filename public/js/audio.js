// WebAudio ile prosedürel sesler: silah, motor, dalga, adım, çevre.
export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.muted = true;
    this.volume = 0;
    this.engine = null;
    this.ambientStarted = false;
    this.nextGull = 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);

    const len = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buffer;
    this.startAmbient();
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, Number(vol) || 0));
    if (this.master && !this.muted) {
      this.master.gain.value = this.volume;
    }
  }

  setMuted(muted) {
    this.muted = !!muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  noiseBurst(duration, gainValue, filterType, freq, q = 1, when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freq, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, freq * 0.25), t + duration);
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + duration + 0.02);
  }

  tone(freq, duration, gainValue, type = 'sine', slideTo = null, when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  shot(type, distance = 0) {
    if (!this.ctx) return;
    const vol = Math.max(0.05, 1 - distance / 260);
    if (type === 'pistol') {
      this.noiseBurst(0.09, 0.32 * vol, 'bandpass', 1500, 0.8);
      this.tone(150, 0.08, 0.16 * vol, 'square', 60);
    } else if (type === 'shotgun') {
      this.noiseBurst(0.22, 0.5 * vol, 'lowpass', 1800, 0.7);
      this.tone(90, 0.18, 0.3 * vol, 'sine', 40);
    } else if (type === 'sniper') {
      this.noiseBurst(0.16, 0.55 * vol, 'highpass', 900, 0.6);
      this.tone(220, 0.22, 0.2 * vol, 'sawtooth', 50);
      this.noiseBurst(0.5, 0.08 * vol, 'lowpass', 500, 0.5, 0.04);
    } else if (type === 'lmg') {
      this.noiseBurst(0.07, 0.26 * vol, 'bandpass', 1100, 0.7);
      this.tone(120, 0.06, 0.13 * vol, 'square', 55);
    } else if (type === 'knife') {
      this.noiseBurst(0.11, 0.22 * vol, 'bandpass', 2400, 1.4);
      this.tone(920, 0.08, 0.09 * vol, 'triangle', 260);
    } else {
      this.noiseBurst(0.1, 0.25 * vol, 'bandpass', 1200, 0.7);
    }
  }

  reloadStart() {
    this.tone(700, 0.03, 0.05, 'square');
    this.noiseBurst(0.04, 0.08, 'highpass', 2000);
  }

  reloadDone() {
    this.tone(420, 0.05, 0.06, 'square');
    this.tone(620, 0.05, 0.05, 'square', null, 0.08);
    this.noiseBurst(0.05, 0.1, 'highpass', 1800, 1, 0.08);
  }

  hit(head = false) {
    this.tone(head ? 1500 : 1050, 0.05, 0.08, 'square');
    if (head) this.tone(2100, 0.05, 0.06, 'square', null, 0.04);
  }

  kill() {
    this.tone(880, 0.07, 0.08, 'square');
    this.tone(1320, 0.1, 0.07, 'square', null, 0.06);
  }

  hurt() {
    this.noiseBurst(0.18, 0.2, 'lowpass', 500, 0.8);
    this.tone(90, 0.15, 0.12, 'sine', 50);
  }

  footstep(surface = 'grass') {
    if (!this.ctx) return;
    if (surface === 'water') {
      this.noiseBurst(0.12, 0.05, 'bandpass', 700, 1.5);
    } else if (surface === 'sand') {
      this.noiseBurst(0.06, 0.035, 'bandpass', 900, 1.2);
    } else {
      this.noiseBurst(0.05, 0.045, 'bandpass', 500, 1.4);
    }
  }

  splash() {
    this.noiseBurst(0.3, 0.18, 'bandpass', 900, 0.8);
    this.tone(300, 0.2, 0.05, 'sine', 120);
  }

  capture(good = true) {
    if (good) {
      this.tone(440, 0.12, 0.08, 'sawtooth');
      this.tone(660, 0.12, 0.07, 'sawtooth', null, 0.1);
      this.tone(880, 0.2, 0.06, 'sawtooth', null, 0.2);
    } else {
      this.tone(300, 0.2, 0.08, 'sawtooth', 180);
    }
  }

  ui() {
    this.tone(600, 0.03, 0.04, 'square');
  }

  weaponSwitch() {
    this.tone(520, 0.035, 0.045, 'triangle', 680);
    this.noiseBurst(0.03, 0.05, 'highpass', 2200);
  }

  startAmbient() {
    if (!this.ctx || this.ambientStarted) return;
    this.ambientStarted = true;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.035;
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
    this.nextGull = performance.now() + 6000;
  }

  updateAmbient() {
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    if (now > this.nextGull) {
      this.nextGull = now + 9000 + Math.random() * 14000;
      const base = 900 + Math.random() * 500;
      this.tone(base, 0.18, 0.025, 'sine', base * 1.5);
      this.tone(base * 1.5, 0.22, 0.02, 'sine', base * 0.8, 0.22);
    }
  }

  startEngine(type) {
    if (!this.ctx || this.engine) return;
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc2.type = 'square';
    osc.frequency.value = type === 'boat' ? 48 : 70;
    osc2.frequency.value = type === 'boat' ? 24 : 35;
    filter.type = 'lowpass';
    filter.frequency.value = 380;
    filter.Q.value = 2;
    gain.gain.value = 0.0;
    gain.gain.linearRampToValueAtTime(0.05, this.ctx.currentTime + 0.25);
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain).connect(this.master);
    osc.start();
    osc2.start();
    this.engine = { osc, osc2, gain, filter, type };
  }

  updateEngine(speed, maxSpeed) {
    if (!this.engine || !this.ctx) return;
    const ratio = Math.min(1, Math.abs(speed) / (maxSpeed || 20));
    const base = this.engine.type === 'boat' ? 46 : 64;
    const t = this.ctx.currentTime;
    this.engine.osc.frequency.setTargetAtTime(base + ratio * 65, t, 0.08);
    this.engine.osc2.frequency.setTargetAtTime((base + ratio * 65) * 0.5, t, 0.08);
    this.engine.filter.frequency.setTargetAtTime(260 + ratio * 500, t, 0.1);
    this.engine.gain.gain.setTargetAtTime(0.035 + ratio * 0.05, t, 0.1);
  }

  stopEngine() {
    if (!this.engine || !this.ctx) return;
    const { osc, osc2, gain } = this.engine;
    const t = this.ctx.currentTime;
    gain.gain.setTargetAtTime(0, t, 0.12);
    try {
      osc.stop(t + 0.5);
      osc2.stop(t + 0.5);
    } catch {
      // zaten durmuş
    }
    this.engine = null;
  }
}
