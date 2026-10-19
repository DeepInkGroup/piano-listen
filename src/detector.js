import { frequency } from './music.js';

// Radix-2 FFT + a sparse, nonnegative harmonic fit. The fit explains overtones
// jointly rather than treating every spectral peak as a separate piano key.
export function fftMagnitude(input) {
  const n = input.length;
  const real = new Float64Array(n), imag = new Float64Array(n);
  for (let i = 0; i < n; i++) real[i] = input[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)));
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [real[i], real[j]] = [real[j], real[i]];
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = -2 * Math.PI / len, wr = Math.cos(angle), wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let ur = 1, ui = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j, b = a + len / 2;
        const vr = real[b] * ur - imag[b] * ui, vi = real[b] * ui + imag[b] * ur;
        real[b] = real[a] - vr; imag[b] = imag[a] - vi;
        real[a] += vr; imag[a] += vi;
        const next = ur * wr - ui * wi; ui = ur * wi + ui * wr; ur = next;
      }
    }
  }
  return Float32Array.from(real.subarray(0, n / 2), (v, i) => Math.hypot(v, imag[i]) * 4 / n);
}
export class PolyphonicDetector {
  constructor(sampleRate, size = 16384) {
    this.sampleRate = sampleRate; this.size = size;
    this.templates = Array.from({ length: 88 }, (_, p) => {
      const bins = new Map(), f = frequency(p + 21);
      for (let h = 1; h <= 8 && f * h < sampleRate / 2; h++) {
        const center = f * h * size / sampleRate;
        for (let k = Math.max(1, Math.floor(center) - 2); k <= Math.ceil(center) + 2 && k < size / 2; k++) {
          const d = k - center;
          const sinc = x => Math.abs(x) < 1e-7 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
          const hann = Math.abs(sinc(d) + 0.5 * sinc(d - 1) + 0.5 * sinc(d + 1));
          const value = hann / h ** 1.3;
          bins.set(k, (bins.get(k) || 0) + value);
        }
      }
      const entries = [...bins];
      return { entries, norm: entries.reduce((s, [, w]) => s + w * w, 0), fundamental: f * size / sampleRate };
    });
  }
  detect(input, sensitivity = 55) {
    let energy = 0;
    for (const x of input) energy += x * x;
    const rms = Math.sqrt(energy / input.length);
    if (rms < 0.0015 * 10 ** ((55 - sensitivity) / 60)) return { notes: [], rms };
    const spectrum = fftMagnitude(input), residual = Float32Array.from(spectrum), amps = new Float32Array(88);
    // Coordinate descent with soft sparsity suppresses weak harmonic ghosts.
    const peak = Math.max(...spectrum);
    const penalty = peak * 0.025;
    for (let iter = 0; iter < 12; iter++) for (let p = 0; p < 88; p++) {
      const { entries, norm } = this.templates[p];
      let correlation = 0;
      for (const [k, w] of entries) correlation += residual[k] * w;
      const next = Math.max(0, amps[p] + (correlation - penalty) / norm);
      const delta = next - amps[p]; amps[p] = next;
      if (delta) for (const [k, w] of entries) residual[k] -= delta * w;
    }
    const max = Math.max(...amps);
    const threshold = max * (0.38 - sensitivity * 0.0033);
    const notes = [];
    for (let p = 0; p < 88; p++) {
      const bin = this.templates[p].fundamental;
      const k = Math.round(bin);
      const fundamental = Math.max(spectrum[k - 1] || 0, spectrum[k] || 0, spectrum[k + 1] || 0);
      if (amps[p] > Math.max(0.0012, threshold) && fundamental > peak * 0.025) notes.push({ midi: p + 21, amplitude: amps[p] });
    }
    return { notes: notes.sort((a, b) => b.amplitude - a.amplitude).slice(0, 10).sort((a, b) => a.midi - b.midi), rms };
  }
}
export class NoteTracker {
  constructor() { this.active = new Map(); this.pending = new Map(); this.events = []; }
  update(notes, time) {
    const present = new Set(notes.map(n => n.midi));
    for (const n of notes) {
      if (this.active.has(n.midi)) { this.active.get(n.midi).last = time; continue; }
      const pending = this.pending.get(n.midi);
      if (pending && time - pending.last < 0.3) {
        this.active.set(n.midi, { start: pending.start, last: time, velocity: Math.min(1, Math.max(0.3, n.amplitude * 4)) });
        this.pending.delete(n.midi);
      } else this.pending.set(n.midi, { start: Math.max(0, time - 0.09), last: time });
    }
    for (const [midi, n] of this.active) if (!present.has(midi) && time - n.last > 0.18) this.finish(midi, n.last + 0.08);
    for (const [midi, n] of this.pending) if (time - n.last > 0.3) this.pending.delete(midi);
    return this.snapshot(time);
  }
  finish(midi, end) {
    const n = this.active.get(midi);
    if (n && end - n.start >= 0.08) this.events.push({ midi, start: n.start, duration: end - n.start, velocity: n.velocity });
    this.active.delete(midi);
  }
  snapshot(time) { return [...this.events, ...[...this.active].map(([midi, n]) => ({ midi, start: n.start, duration: Math.max(0.08, time - n.start), velocity: n.velocity }))].sort((a, b) => a.start - b.start || a.midi - b.midi); }
  stop(time) { for (const midi of this.active.keys()) this.finish(midi, time); return this.snapshot(time); }
}
