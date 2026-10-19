import { frequency } from './music.js';
export class PianoAudio {
  constructor() { this.voices = []; }
  async ready() {
    if (!this.context || this.context.state === 'closed') this.context = new (window.AudioContext || window.webkitAudioContext)();
    await this.context.resume(); return this.context;
  }
  tone(midi, start, duration, velocity = 0.7) {
    const ctx = this.context;
    const gain = ctx.createGain(); gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(velocity * 0.06, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration + 0.2);
    const oscillators = [];
    for (let h = 1; h <= 5; h++) {
      const osc = ctx.createOscillator(), harmonicGain = ctx.createGain();
      osc.frequency.value = frequency(midi) * h; harmonicGain.gain.value = 1 / h ** 1.5;
      osc.connect(harmonicGain); harmonicGain.connect(gain); osc.start(start); osc.stop(start + duration + 0.25); oscillators.push(osc);
    }
    this.voices.push({ oscillators, gain });
  }
  async play(notes, onEnd) {
    await this.ready(); this.stop();
    const start = this.context.currentTime + 0.08;
    for (const n of notes) this.tone(n.midi, start + n.start, n.duration, n.velocity);
    const end = Math.max(0, ...notes.map(n => n.start + n.duration));
    this.timer = setTimeout(() => { this.stop(); onEnd?.(); }, (end + 0.4) * 1000);
  }
  stop() {
    clearTimeout(this.timer);
    for (const voice of this.voices) { voice.gain.disconnect(); for (const osc of voice.oscillators) { try { osc.stop(); } catch {} osc.disconnect(); } }
    this.voices = [];
  }
}
export async function decodeAudio(file) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  try {
    const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    if (buffer.duration > 120) throw new Error('Please choose a recording shorter than 2 minutes.');
    const samples = new Float32Array(buffer.length);
    for (let c = 0; c < buffer.numberOfChannels; c++) { const channel = buffer.getChannelData(c); for (let i = 0; i < samples.length; i++) samples[i] += channel[i] / buffer.numberOfChannels; }
    return { samples, sampleRate: buffer.sampleRate };
  } finally { await ctx.close(); }
}
