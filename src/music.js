export const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const noteName = (midi, octave = true) => NAMES[((midi % 12) + 12) % 12] + (octave ? Math.floor(midi / 12) - 1 : '');
export const frequency = midi => 440 * 2 ** ((midi - 69) / 12);
const QUALITIES = [
  ['', [0, 4, 7], 'major'], ['m', [0, 3, 7], 'minor'],
  ['7', [0, 4, 7, 10], 'dominant seventh'], ['maj7', [0, 4, 7, 11], 'major seventh'],
  ['m7', [0, 3, 7, 10], 'minor seventh'], ['dim', [0, 3, 6], 'diminished'],
  ['aug', [0, 4, 8], 'augmented'], ['sus2', [0, 2, 7], 'suspended second'],
  ['sus4', [0, 5, 7], 'suspended fourth'], ['6', [0, 4, 7, 9], 'major sixth'],
  ['m6', [0, 3, 7, 9], 'minor sixth'], ['dim7', [0, 3, 6, 9], 'diminished seventh'],
  ['m7♭5', [0, 3, 6, 10], 'half-diminished seventh'], ['add9', [0, 2, 4, 7], 'added ninth'],
  ['9', [0, 2, 4, 7, 10], 'dominant ninth'], ['m9', [0, 2, 3, 7, 10], 'minor ninth'],
  ['maj9', [0, 2, 4, 7, 11], 'major ninth'], ['11', [0, 2, 4, 5, 7, 10], 'eleventh'],
  ['13', [0, 2, 4, 7, 9, 10], 'thirteenth'],
];
export function identifyChord(midis) {
  if (!midis.length) return { symbol: '—', description: 'Play a note or chord', notes: [] };
  const sorted = [...new Set(midis)].sort((a, b) => a - b);
  const pcs = [...new Set(sorted.map(m => m % 12))];
  if (pcs.length === 1) return { symbol: noteName(sorted[0], false), description: 'Single note' + (sorted.length > 1 ? ' · octaves' : ''), notes: sorted };
  let best = null;
  for (const root of pcs) for (const [suffix, intervals, description] of QUALITIES) {
    const expected = intervals.map(i => (root + i) % 12);
    const matched = expected.filter(p => pcs.includes(p)).length;
    const extra = pcs.length - matched;
    const missing = expected.length - matched;
    if (missing || extra) continue;
    const rank = (root === sorted[0] % 12 ? 2 : 0) + (suffix === '' || suffix === 'm' ? 1 : 0);
    if (!best || rank > best.rank) best = { root, suffix, description, rank };
  }
  if (best) {
    const inversion = sorted[0] % 12 !== best.root;
    return { symbol: NAMES[best.root] + best.suffix + (inversion ? '/' + noteName(sorted[0], false) : ''), description: best.description + (inversion ? ' · inversion' : ''), notes: sorted };
  }
  if (pcs.length === 2 && (pcs[1] - pcs[0] + 12) % 12 === 7) return { symbol: NAMES[pcs[0]] + '5', description: 'Power chord', notes: sorted };
  return { symbol: pcs.map(p => NAMES[p]).join(' · '), description: pcs.length === 2 ? 'Interval' : 'Note cluster', notes: sorted };
}
export function demoNotes() {
  const chords = [[48, 60, 64, 67], [45, 60, 64, 69], [41, 60, 65, 69], [43, 59, 62, 67]];
  return chords.flatMap((chord, i) => chord.map(midi => ({ midi, start: i * 2, duration: 1.8, velocity: 0.75 })));
}
export function quantize(notes, bpm = 120) {
  const step = 60 / bpm / 4;
  return notes.filter(n => n.midi >= 21 && n.midi <= 108 && n.duration >= 0.06).map(n => ({ ...n,
    tick: Math.max(0, Math.round(n.start / step)),
    length: Math.max(1, Math.round(n.duration / step)),
  })).sort((a, b) => a.tick - b.tick || a.midi - b.midi);
}
export function scoreMeasures(notes, bpm = 120) {
  const q = quantize(notes, bpm);
  const count = Math.max(1, Math.ceil(Math.max(0, ...q.map(n => n.tick + n.length)) / 16));
  return Array.from({ length: count }, (_, index) => {
    const from = index * 16, to = from + 16;
    const build = bass => {
      const ns = q.filter(n => (n.midi < 60) === bass && n.tick < to && n.tick + n.length > from);
      const bounds = [...new Set([from, to, ...ns.flatMap(n => [Math.max(from, n.tick), Math.min(to, n.tick + n.length)])])].sort((a, b) => a - b);
      const segments = [];
      for (let i = 0; i < bounds.length - 1; i++) {
        let at = bounds[i], remaining = bounds[i + 1] - at;
        const active = ns.filter(n => n.tick <= at && n.tick + n.length > at);
        while (remaining) {
          const ticks = [16, 8, 4, 2, 1].find(t => t <= remaining && (at % 16) % t === 0);
          segments.push({ tick: at, ticks, midis: [...new Set(active.map(n => n.midi))].sort((a, b) => a - b),
            tiesIn: active.filter(n => n.tick < at).map(n => n.midi), tiesOut: active.filter(n => n.tick + n.length > at + ticks).map(n => n.midi) });
          at += ticks; remaining -= ticks;
        }
      }
      return segments;
    };
    return { index, treble: build(false), bass: build(true) };
  });
}
