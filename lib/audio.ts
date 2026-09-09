/**
 * Procedural horror audio built entirely with the Web Audio API —
 * no audio files needed. A low drone + wind bed runs during play,
 * a heartbeat speeds up with fear, and one-shot stingers punctuate
 * events (talisman pickup, being spotted, being caught, escape).
 */

class NightfallAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private droneNodes: OscillatorNode[] = [];
  private windSource: AudioBufferSourceNode | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private huntNodes: AudioNode[] = [];
  private huntRunning = false;
  private fear = 0;
  private ambientRunning = false;

  /** Must be called from a user gesture (the Start button). */
  init(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(this.ctx.destination);
  }

  setFear(value: number): void {
    this.fear = Math.min(1, Math.max(0, value));
  }

  startAmbient(): void {
    if (!this.ctx || !this.master || this.ambientRunning) return;
    this.ambientRunning = true;
    const ctx = this.ctx;

    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.05;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 160;
    droneGain.connect(filter);
    filter.connect(this.master);
    for (const freq of [54, 54.7, 81.2]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      osc.connect(droneGain);
      osc.start();
      this.droneNodes.push(osc);
    }

    const seconds = 4;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const wind = ctx.createBufferSource();
    wind.buffer = buffer;
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = "bandpass";
    windFilter.frequency.value = 420;
    windFilter.Q.value = 0.6;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.028;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.018;
    lfo.connect(lfoGain);
    lfoGain.connect(windGain.gain);
    wind.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(this.master);
    wind.start();
    lfo.start();
    this.windSource = wind;
    this.droneNodes.push(lfo);

    this.scheduleHeartbeat();
  }

  private scheduleHeartbeat(): void {
    if (!this.ambientRunning) return;
    const interval = 1350 - this.fear * 950;
    this.heartbeatTimer = setTimeout(() => {
      if (this.fear > 0.08) this.thump();
      this.scheduleHeartbeat();
    }, interval);
  }

  private thump(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const volume = 0.1 + this.fear * 0.35;
    const beat = (delay: number, vol: number) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(58, ctx.currentTime + delay);
      osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + delay + 0.12);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime + delay);
      gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + delay + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.22);
      osc.connect(gain);
      gain.connect(this.master as GainNode);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.3);
    };
    beat(0, volume);
    beat(0.18, volume * 0.65);
  }

  private noiseBurst(
    duration: number,
    startFreq: number,
    endFreq: number,
    volume: number,
    q = 6
  ): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const length = Math.ceil(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = q;
    filter.frequency.setValueAtTime(startFreq, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), ctx.currentTime + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    noise.start();
    noise.stop(ctx.currentTime + duration + 0.05);
  }

  collect(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    for (const [i, freq] of [660, 990, 1320].entries()) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      const t = ctx.currentTime + i * 0.06;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.8);
    }
  }

  /** Bright ascending shimmer for a stat powerup. */
  powerup(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    for (const [i, freq] of [440, 554.4, 659.3, 880, 1108.7].entries()) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      const t = ctx.currentTime + i * 0.045;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.1, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + 1);
    }
    this.noiseBurst(0.35, 2400, 5200, 0.05, 2);
  }

  /** A clawing hit: thud plus a short pained gasp. */
  hurt(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const thud = ctx.createOscillator();
    thud.type = "sine";
    thud.frequency.setValueAtTime(140, t0);
    thud.frequency.exponentialRampToValueAtTime(38, t0 + 0.28);
    const thudGain = ctx.createGain();
    thudGain.gain.setValueAtTime(0.5, t0);
    thudGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
    thud.connect(thudGain);
    thudGain.connect(this.master);
    thud.start(t0);
    thud.stop(t0 + 0.4);

    const gasp = ctx.createOscillator();
    gasp.type = "sawtooth";
    gasp.frequency.setValueAtTime(520, t0 + 0.03);
    gasp.frequency.exponentialRampToValueAtTime(300, t0 + 0.32);
    const gaspFilter = ctx.createBiquadFilter();
    gaspFilter.type = "bandpass";
    gaspFilter.Q.value = 3;
    gaspFilter.frequency.value = 900;
    const gaspGain = ctx.createGain();
    gaspGain.gain.setValueAtTime(0, t0 + 0.03);
    gaspGain.gain.linearRampToValueAtTime(0.16, t0 + 0.07);
    gaspGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4);
    gasp.connect(gaspFilter);
    gaspFilter.connect(gaspGain);
    gaspGain.connect(this.master);
    gasp.start(t0 + 0.03);
    gasp.stop(t0 + 0.45);

    this.noiseBurst(0.3, 2600, 500, 0.22, 4);
  }

  /** Called the instant the Hollow One spots you and starts the chase. */
  huntSting(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;

    // Dissonant brass shriek — "it sees you".
    for (const [i, freq] of [110, 165, 247, 370].entries()) {
      const osc = ctx.createOscillator();
      osc.type = i % 2 === 0 ? "sawtooth" : "square";
      osc.frequency.setValueAtTime(freq, t0);
      osc.frequency.exponentialRampToValueAtTime(freq * 3.4, t0 + 0.55);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.7, t0 + 1.35);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.16, t0 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 1.5);
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(900, t0);
      filter.frequency.linearRampToValueAtTime(2400, t0 + 0.4);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + 1.6);
    }

    this.noiseBurst(0.7, 1800, 280, 0.32, 3);

    // Low growl under the shriek.
    const growl = ctx.createOscillator();
    growl.type = "sawtooth";
    growl.frequency.setValueAtTime(48, t0);
    growl.frequency.linearRampToValueAtTime(36, t0 + 1.1);
    const growlGain = ctx.createGain();
    growlGain.gain.setValueAtTime(0.28, t0);
    growlGain.gain.exponentialRampToValueAtTime(0.001, t0 + 1.4);
    growl.connect(growlGain);
    growlGain.connect(this.master);
    growl.start(t0);
    growl.stop(t0 + 1.5);

    this.startHuntPresence();
  }

  /** Low looping rumble + wet breath while you are being chased. */
  startHuntPresence(): void {
    if (!this.ctx || !this.master || this.huntRunning) return;
    this.huntRunning = true;
    const ctx = this.ctx;

    const rumble = ctx.createOscillator();
    rumble.type = "sawtooth";
    rumble.frequency.value = 42;
    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = "lowpass";
    rumbleFilter.frequency.value = 90;
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0.12;
    rumble.connect(rumbleFilter);
    rumbleFilter.connect(rumbleGain);
    rumbleGain.connect(this.master);
    rumble.start();

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 2.4;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 8;
    lfo.connect(lfoGain);
    lfoGain.connect(rumble.frequency);
    lfo.start();

    const seconds = 1.2;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const breath = ctx.createBufferSource();
    breath.buffer = buffer;
    breath.loop = true;
    const breathFilter = ctx.createBiquadFilter();
    breathFilter.type = "bandpass";
    breathFilter.frequency.value = 900;
    breathFilter.Q.value = 0.8;
    const breathGain = ctx.createGain();
    breathGain.gain.value = 0.07;
    breath.connect(breathFilter);
    breathFilter.connect(breathGain);
    breathGain.connect(this.master);
    breath.start();

    this.huntNodes = [rumble, lfo, rumbleGain, breath, breathGain];
  }

  stopHuntPresence(): void {
    this.huntRunning = false;
    for (const node of this.huntNodes) {
      if (node instanceof OscillatorNode || node instanceof AudioBufferSourceNode) {
        try {
          node.stop();
        } catch {
          // already stopped
        }
      }
      if (node instanceof GainNode) {
        node.gain.value = 0;
      }
    }
    this.huntNodes = [];
  }

  /** Called the instant the Hollow One catches you. */
  death(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    this.stopHuntPresence();

    // Impact boom.
    const boom = ctx.createOscillator();
    boom.type = "sine";
    boom.frequency.setValueAtTime(110, t0);
    boom.frequency.exponentialRampToValueAtTime(22, t0 + 1.4);
    const boomGain = ctx.createGain();
    boomGain.gain.setValueAtTime(0.85, t0);
    boomGain.gain.exponentialRampToValueAtTime(0.001, t0 + 1.8);
    boom.connect(boomGain);
    boomGain.connect(this.master);
    boom.start(t0);
    boom.stop(t0 + 1.9);

    // Victim scream — rising then tearing down.
    const scream = ctx.createOscillator();
    scream.type = "sawtooth";
    scream.frequency.setValueAtTime(420, t0);
    scream.frequency.exponentialRampToValueAtTime(980, t0 + 0.22);
    scream.frequency.exponentialRampToValueAtTime(180, t0 + 1.1);
    const screamFilter = ctx.createBiquadFilter();
    screamFilter.type = "bandpass";
    screamFilter.Q.value = 4;
    screamFilter.frequency.setValueAtTime(1400, t0);
    screamFilter.frequency.linearRampToValueAtTime(700, t0 + 1);
    const screamGain = ctx.createGain();
    screamGain.gain.setValueAtTime(0, t0);
    screamGain.gain.linearRampToValueAtTime(0.38, t0 + 0.05);
    screamGain.gain.exponentialRampToValueAtTime(0.001, t0 + 1.25);
    scream.connect(screamFilter);
    screamFilter.connect(screamGain);
    screamGain.connect(this.master);
    scream.start(t0);
    scream.stop(t0 + 1.3);

    // Monster roar over the scream.
    const roar = ctx.createOscillator();
    roar.type = "square";
    roar.frequency.setValueAtTime(70, t0 + 0.08);
    roar.frequency.exponentialRampToValueAtTime(38, t0 + 1.5);
    const roarGain = ctx.createGain();
    roarGain.gain.setValueAtTime(0, t0 + 0.08);
    roarGain.gain.linearRampToValueAtTime(0.32, t0 + 0.14);
    roarGain.gain.exponentialRampToValueAtTime(0.001, t0 + 1.7);
    roar.connect(roarGain);
    roarGain.connect(this.master);
    roar.start(t0 + 0.08);
    roar.stop(t0 + 1.8);

    this.noiseBurst(1.05, 3200, 420, 0.42, 7);
    this.stopAmbient();
  }

  win(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    this.stopHuntPresence();
    for (const [i, freq] of [523.25, 659.25, 783.99, 1046.5].entries()) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      const t = ctx.currentTime + i * 0.16;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.14, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + 1.5);
    }
    this.stopAmbient();
  }

  stopAmbient(): void {
    this.ambientRunning = false;
    this.stopHuntPresence();
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    for (const node of this.droneNodes) {
      try {
        node.stop();
      } catch {
        // already stopped
      }
    }
    this.droneNodes = [];
    if (this.windSource) {
      try {
        this.windSource.stop();
      } catch {
        // already stopped
      }
      this.windSource = null;
    }
  }
}

export const audio = new NightfallAudio();
