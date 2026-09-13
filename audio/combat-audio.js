// Procedural combat Foley: cached noise, pressure waves, mechanical transients.
// No external recordings or downloads. The game owns the AudioContext lifecycle.
const singleScreenStyles = document.createElement("link");
singleScreenStyles.rel = "stylesheet";
singleScreenStyles.href = "/iron-front-defense-3d/layout-single-screen.css?v=5";
document.head.append(singleScreenStyles);

export class CombatAudio {
  constructor(context) {
    this.context = context;
    this.voices = new Set();
    this.master = context.createGain();
    this.master.gain.value = 0.7;
    this.compressor = context.createDynamicsCompressor();
    this.compressor.threshold.value = -16;
    this.compressor.knee.value = 16;
    this.compressor.ratio.value = 8;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.18;
    this.master.connect(this.compressor);
    this.compressor.connect(context.destination);
    this.noise = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  stop() {
    for (const source of this.voices) { try { source.stop(); } catch {} }
  }
  layer(bus, time, duration, volume, frequency, endFrequency, noise = false, highpass = false) {
    const c = this.context;
    const source = noise ? c.createBufferSource() : c.createOscillator();
    const filter = c.createBiquadFilter();
    const gain = c.createGain();
    if (noise) source.buffer = this.noise;
    else {
      source.type = 'sine';
      source.frequency.setValueAtTime(frequency, time);
      source.frequency.exponentialRampToValueAtTime(endFrequency, time + duration);
    }
    filter.type = highpass ? 'highpass' : 'lowpass';
    filter.frequency.setValueAtTime(noise ? frequency : 9000, time);
    if (noise) filter.frequency.exponentialRampToValueAtTime(endFrequency, time + duration);
    filter.Q.value = 0.6;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter); filter.connect(gain); gain.connect(bus);
    this.voices.add(source);
    source.onended = () => {
      this.voices.delete(source);
      source.disconnect(); filter.disconnect(); gain.disconnect();
    };
    if (noise) source.start(time, Math.random() * 0.5);
    else source.start(time);
    source.stop(time + duration + 0.01);
  }
  play(kind, x = 480, y = 300) {
    const c = this.context;
    const offline = typeof OfflineAudioContext !== 'undefined' && c instanceof OfflineAudioContext;
    if ((!offline && c.state !== 'running') || this.voices.size >= 100) return;
    const bus = c.createGain();
    // Fixed tactical listener: rear of the battlefield is softer.
    bus.gain.value = 0.65 + Math.max(0, Math.min(600, y)) / 1700;
    const pan = c.createStereoPanner();
    pan.pan.value = Math.max(-0.85, Math.min(0.85, (x - 480) / 560));
    bus.connect(pan); pan.connect(this.master);
    const t = c.currentTime;
    const variation = 0.93 + Math.random() * 0.14;
    const layer = (delay, duration, volume, frequency, end, noise = false, high = false) =>
      this.layer(bus, t + delay, duration, volume, frequency * variation, end * variation, noise, high);
    if (kind === 'mg' || kind === 'infantry' || kind === 'heli') {
      const heavy = kind === 'heli';
      layer(0, 0.035, 0.26, 8200, 2400, true, true); // muzzle crack
      layer(0, 0.12, heavy ? 0.32 : 0.2, heavy ? 145 : 205, 48); // body
      layer(0.006, 0.14, 0.22, 2900, 500, true); // gas release
      layer(0.045, 0.025, 0.075, 5400, 1900, true); // bolt
      layer(0.11, 0.24, 0.055, 1900, 350, true); // outdoor reflection
    } else if (kind === 'tank') {
      layer(0, 0.055, 0.48, 9000, 1100, true);
      layer(0, 0.55, 0.55, 110, 30);
      layer(0.018, 0.7, 0.44, 1800, 100, true);
      layer(0.11, 0.12, 0.11, 2400, 500, true);
      layer(0.16, 0.8, 0.14, 900, 90, true);
    } else if (kind === 'missile') {
      layer(0, 0.09, 0.24, 3000, 600, true);
      layer(0, 0.2, 0.2, 160, 45);
      layer(0.035, 0.65, 0.36, 850, 4200, true); // rocket exhaust
      layer(0.12, 0.55, 0.1, 4600, 700, true);
    } else if (kind === 'impact' || kind === 'explosion' || kind === 'airstrike') {
      const big = kind === 'airstrike';
      layer(0, 0.05, 0.36, 6800, 1100, true);
      layer(0, big ? 1.4 : 0.7, big ? 0.65 : 0.4, 95, 26);
      layer(0.012, big ? 1.8 : 0.9, 0.48, 2200, 85, true);
      layer(0.08, 0.28, 0.14, 4800, 600, true); // debris
      layer(0.18, 1.1, 0.16, 700, 80, true);
    }
    // Disconnect the event bus after its last possible layer, using audio time.
    const tail = c.createBufferSource();
    tail.buffer = c.createBuffer(1, 1, c.sampleRate);
    tail.connect(bus); this.voices.add(tail);
    tail.onended = () => { this.voices.delete(tail); tail.disconnect(); bus.disconnect(); pan.disconnect(); };
    tail.start(t + 2.1);
  }
}
