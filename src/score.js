import Vex from 'vexflow';
import { scoreMeasures, noteName, identifyChord } from './music.js';
const { Renderer, Stave, StaveNote, Voice, Formatter, Accidental, StaveConnector, StaveTie } = Vex.Flow;
const durations = {16:'w', 8:'h', 4:'q', 2:'8', 1:'16'};
export function renderScore(container, notes, bpm = 120) {
  container.replaceChildren();
  const measures = scoreMeasures(notes, bpm);
  const width = Math.max(300, container.clientWidth || 900);
  const perRow = width < 560 ? 1 : width < 850 ? 2 : 3;
  const rows = Math.ceil(measures.length / perRow), rowHeight = 255;
  const contexts = Array.from({ length: rows }, () => {
    const system = document.createElement('div'); system.className = 'score-system'; container.append(system);
    const renderer = new Renderer(system, Renderer.Backends.SVG); renderer.resize(width, rowHeight + 20);
    const ctx = renderer.getContext(); ctx.setFont('Georgia', 12); ctx.setFillStyle('#27392f'); ctx.setStrokeStyle('#657067');
    return ctx;
  });
  const previous = { treble: new Map(), bass: new Map() };
  measures.forEach((measure, index) => {
    const row = Math.floor(index / perRow), col = index % perRow;
    const ctx = contexts[row];
    const measureWidth = (width - 24) / perRow;
    const x = 12 + col * measureWidth, y = 25;
    const treble = new Stave(x, y, measureWidth), bass = new Stave(x, y + 110, measureWidth);
    if (col === 0) { treble.addClef('treble'); bass.addClef('bass'); if (index === 0) { treble.addTimeSignature('4/4'); bass.addTimeSignature('4/4'); } }
    treble.setContext(ctx).draw(); bass.setContext(ctx).draw();
    new StaveConnector(treble, bass).setType(StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
    if (col === 0) new StaveConnector(treble, bass).setType(StaveConnector.type.BRACE).setContext(ctx).draw();
    ctx.save(); ctx.setFillStyle('#9b9e93'); ctx.setFont('Arial', 10); ctx.fillText(String(index + 1).padStart(2, '0'), x + 5, y - 5); ctx.restore();
    const byStaff = {};
    for (const [staff, stave] of [['treble', treble], ['bass', bass]]) {
      const tickables = measure[staff].map(segment => {
        const keys = segment.midis.length ? segment.midis.map(midi => noteName(midi).replace('♯', '#').replace(/(\d+)$/, '/$1').toLowerCase()) : [staff === 'bass' ? 'd/3' : 'b/4'];
        const n = new StaveNote({ keys, duration: durations[segment.ticks] + (segment.midis.length ? '' : 'r'), clef: staff, auto_stem: true });
        segment.midis.forEach((midi, i) => { if (noteName(midi).includes('♯')) n.addModifier(new Accidental('#'), i); });
        return n;
      });
      const voice = new Voice({ num_beats: 4, beat_value: 4 }).addTickables(tickables);
      byStaff[staff] = { tickables, voice, stave };
    }
    const formatter = new Formatter();
    formatter.joinVoices([byStaff.treble.voice]); formatter.joinVoices([byStaff.bass.voice]);
    formatter.format([byStaff.treble.voice, byStaff.bass.voice], Math.max(80, measureWidth - (col === 0 ? 115 : 40)));
    for (const staff of ['treble', 'bass']) {
      const { voice, stave, tickables } = byStaff[staff]; voice.draw(ctx, stave);
      measure[staff].forEach((segment, i) => {
        segment.midis.forEach((midi, keyIndex) => {
          const prior = previous[staff].get(midi);
          if (segment.tiesIn.includes(midi) && prior) {
            if (prior.row === row) new StaveTie({ first_note: prior.note, last_note: tickables[i], first_indices:[prior.keyIndex], last_indices:[keyIndex] }).setContext(ctx).draw();
            else {
              new StaveTie({ first_note: prior.note, first_indices:[prior.keyIndex], last_indices:[prior.keyIndex] }).setContext(prior.context).draw();
              new StaveTie({ last_note: tickables[i], first_indices:[keyIndex], last_indices:[keyIndex] }).setContext(ctx).draw();
            }
          }
          previous[staff].set(midi, { note: tickables[i], keyIndex, row, context:ctx });
        });
        for (const midi of previous[staff].keys()) if (!segment.midis.includes(midi)) previous[staff].delete(midi);
      });
    }
    const chordNotes = notes.filter(n => n.start >= index * 240 / bpm - 0.05 && n.start < index * 240 / bpm + 0.18).map(n => n.midi);
    if (chordNotes.length > 1) { ctx.save(); ctx.setFillStyle('#4d7056'); ctx.setFont('Arial', 12, 'bold'); ctx.fillText(identifyChord(chordNotes).symbol, treble.getNoteStartX() + 2, y + 7); ctx.restore(); }
  });
  container.querySelectorAll('svg').forEach((svg, i) => { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `Piano score, system ${i + 1} of ${rows}, treble and bass clefs`); });
  return measures.length;
}
