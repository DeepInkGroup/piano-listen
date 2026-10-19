import { scoreMeasures, noteName } from './music.js';
export const xmlEscape = s => String(s).replace(/[<>&"']/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;' })[c]);
const pitchParts = midi => { const n = noteName(midi); return { step: n[0], alter: n.includes('♯') ? 1 : 0, octave: Math.floor(midi / 12) - 1 }; };
export function musicXML(notes, bpm, title) {
  const measures = scoreMeasures(notes, bpm);
  const durationType = { 16:'whole', 8:'half', 4:'quarter', 2:'eighth', 1:'16th' };
  const staffXML = (segments, staff) => segments.map(s => {
    const pitches = s.midis.length ? s.midis : [null];
    return pitches.map((midi, i) => {
      const p = midi === null ? null : pitchParts(midi);
      const tiedIn = s.tiesIn.includes(midi), tiedOut = s.tiesOut.includes(midi);
      return `<note>${i ? '<chord/>' : ''}${p ? `<pitch><step>${p.step}</step>${p.alter ? '<alter>1</alter>' : ''}<octave>${p.octave}</octave></pitch>` : '<rest/>'}<duration>${s.ticks}</duration>${tiedIn ? '<tie type="stop"/>' : ''}${tiedOut ? '<tie type="start"/>' : ''}<voice>${staff}</voice><type>${durationType[s.ticks]}</type><staff>${staff}</staff>${tiedIn || tiedOut ? `<notations>${tiedIn ? '<tied type="stop"/>' : ''}${tiedOut ? '<tied type="start"/>' : ''}</notations>` : ''}</note>`;
    }).join('');
  }).join('');
  return `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n<score-partwise version="4.0"><work><work-title>${xmlEscape(title)}</work-title></work><identification><creator type="composer">Piano Listen</creator></identification><part-list><score-part id="P1"><part-name>Piano</part-name><score-instrument id="I1"><instrument-name>Piano</instrument-name></score-instrument><midi-instrument id="I1"><midi-channel>1</midi-channel><midi-program>1</midi-program></midi-instrument></score-part></part-list><part id="P1">${measures.map((m, i) => `<measure number="${i + 1}">${i === 0 ? `<attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes><direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${bpm}</per-minute></metronome></direction-type><sound tempo="${bpm}"/></direction>` : ''}${staffXML(m.treble, 1)}<backup><duration>16</duration></backup>${staffXML(m.bass, 2)}${i === measures.length - 1 ? '<barline location="right"><bar-style>light-heavy</bar-style></barline>' : ''}</measure>`).join('')}</part></score-partwise>`;
}
const u32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const vlq = value => { let n = Math.max(0, Math.round(value)); const out = [n & 127]; while ((n >>= 7)) out.unshift((n & 127) | 128); return out; };
export function midiFile(notes, bpm, title) {
  const ppq = 480, events = [], tempo = Math.round(60000000 / bpm);
  const name = [...new TextEncoder().encode(title)].slice(0, 120);
  const track = [0, 255, 3, ...vlq(name.length), ...name, 0, 255, 81, 3, (tempo >>> 16) & 255, (tempo >>> 8) & 255, tempo & 255, 0, 255, 88, 4, 4, 2, 24, 8, 0, 192, 0];
  for (const n of notes) {
    const tick = Math.max(0, Math.round(n.start * bpm / 60 * ppq));
    const end = Math.max(tick + 1, Math.round((n.start + n.duration) * bpm / 60 * ppq));
    events.push({ tick, bytes:[144, n.midi, Math.max(1, Math.min(127, Math.round((n.velocity ?? 0.75) * 127)))] }, { tick:end, bytes:[128, n.midi, 0] });
  }
  events.sort((a, b) => a.tick - b.tick || a.bytes[0] - b.bytes[0]);
  let previous = 0;
  for (const e of events) { track.push(...vlq(e.tick - previous), ...e.bytes); previous = e.tick; }
  track.push(0, 255, 47, 0);
  return new Uint8Array([77, 84, 104, 100, 0, 0, 0, 6, 0, 0, 0, 1, 1, 224, 77, 84, 114, 107, ...u32(track.length), ...track]);
}
export function wavFile(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2), view = new DataView(buffer);
  const str = (offset, text) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  str(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  str(36, 'data'); view.setUint32(40, samples.length * 2, true);
  samples.forEach((x, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x)) * (x < 0 ? 32768 : 32767), true));
  return buffer;
}
export async function download(data, name, type) {
  const blob = new Blob([data], { type });
  const file = new File([blob], name, { type });
  if (/iPhone|iPad|iPod/.test(navigator.userAgent) && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
