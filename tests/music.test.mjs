import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identifyChord, noteName, frequency, quantize, scoreMeasures, demoNotes } from '../src/music.js';
import { PolyphonicDetector, NoteTracker } from '../src/detector.js';
import { midiFile, musicXML, wavFile } from '../src/exports.js';

const synth = (pitches, sampleRate=44100, size=16384, level=0.1) => Float32Array.from({length:size},(_,i)=>pitches.reduce((sum,m)=>sum+Array.from({length:8},(_,h)=>Math.sin(2*Math.PI*frequency(m)*(h+1)*i/sampleRate)/(h+1)**1.3).reduce((a,b)=>a+b,0)*level,0));
test('names and frequencies cover piano endpoints',()=>{assert.equal(noteName(21),'A0');assert.equal(noteName(108),'C8');assert.equal(frequency(69),440);});
test('chords, inversions, seventh and ninth qualities',()=>{
 for(const [pitches,symbol] of [[[60,64,67],'C'],[[64,67,72],'C/E'],[[57,60,64],'Am'],[[48,60,64,67,71],'Cmaj7'],[[55,59,62,65],'G7'],[[60,63,66],'Cdim'],[[60,65,67],'Csus4'],[[60,62,64,67,70],'C9']])assert.equal(identifyChord(pitches).symbol,symbol);
 assert.equal(identifyChord([]).symbol,'—');assert.equal(identifyChord([60,72]).description,'Single note · octaves');assert.equal(identifyChord([60,61,62]).description,'Note cluster');
});
test('synthetic piano-harmonic mixtures identify multiple fundamentals without overtone ghosts',()=>{
 for(const sampleRate of [44100,48000]){
  const detector=new PolyphonicDetector(sampleRate);
  for(const pitches of [[69],[21],[33],[108],[60,64,67],[48,60,64,67],[48,55,60,64],[57,60,64,67],[60,61],[48,55,60,64,67,72]]){
   const detected=detector.detect(synth(pitches,sampleRate)).notes.map(n=>n.midi);
   assert.deepEqual(detected,pitches.toSorted((a,b)=>a-b),`${sampleRate}Hz ${pitches}`);
  }
 }
});
test('silence does not invent notes',()=>{const d=new PolyphonicDetector(44100);assert.deepEqual(d.detect(new Float32Array(16384)).notes,[]);});
test('temporal tracker rejects one-frame noise and closes sustained chord',()=>{
 const tracker=new NoteTracker();tracker.update([{midi:60,amplitude:.2}],0.1);tracker.update([],0.2);assert.equal(tracker.snapshot(0.2).length,0);
 tracker.update([{midi:64,amplitude:.2},{midi:67,amplitude:.2}],0.5);tracker.update([{midi:64,amplitude:.2},{midi:67,amplitude:.2}],0.6);tracker.update([],0.9);
 assert.deepEqual(tracker.stop(1).map(n=>n.midi),[64,67]);assert.ok(tracker.events.every(n=>n.duration>=0.08));
});
test('grand staff segments fill each bar exactly, with ties for held notes',()=>{
 const notes=[{midi:48,start:0,duration:5},{midi:60,start:.25,duration:1.25},{midi:64,start:1,duration:.75}];
 const measures=scoreMeasures(notes,120);assert.equal(measures.length,3);
 for(const m of measures)for(const staff of ['treble','bass'])assert.equal(m[staff].reduce((s,n)=>s+n.ticks,0),16);
 assert.ok(measures[0].bass.at(-1).tiesOut.includes(48));assert.ok(measures[1].bass[0].tiesIn.includes(48));
 assert.equal(quantize([{midi:60,start:.13,duration:.37}],120)[0].tick,1);
});
test('MusicXML escapes titles, preserves chords, rests, and cross-bar ties',()=>{
 const xml=musicXML([{midi:48,start:0,duration:3},{midi:60,start:0,duration:1},{midi:64,start:0,duration:1}],120,'A & B <study>');
 assert.ok(xml.includes('A &amp; B &lt;study&gt;'));assert.ok(xml.includes('<chord/>'));assert.ok(xml.includes('<rest/>'));assert.ok(xml.includes('<tie type="start"/>'));assert.ok(xml.includes('<tie type="stop"/>'));assert.ok(xml.includes('<backup><duration>16</duration></backup>'));
});
test('MIDI file has valid header, track size, tempo, and matching note-on/off events',()=>{
 const midi=midiFile(demoNotes(),120,'Demo');const view=new DataView(midi.buffer);
 assert.equal(new TextDecoder().decode(midi.slice(0,4)),'MThd');assert.equal(view.getUint32(4),6);assert.equal(view.getUint16(12),480);assert.equal(view.getUint32(18),midi.length-22);
 let at=22,tick=0,ons=0,offs=0,tempo;
 const variable=()=>{let n=0,b;do{b=midi[at++];n=(n<<7)|(b&127);}while(b&128);return n;};
 while(at<midi.length){tick+=variable();const status=midi[at++];if(status===255){const type=midi[at++],length=variable();if(type===81)tempo=(midi[at]<<16)|(midi[at+1]<<8)|midi[at+2];at+=length;}else if(status===192)at++;else{if(status===144)ons++;if(status===128)offs++;at+=2;}}
 assert.equal(ons,16);assert.equal(offs,16);assert.equal(tempo,500000);assert.equal(tick,7488);
});
test('WAV encoding declares mono PCM, rate, duration, and sample clipping',()=>{
 const wav=wavFile(new Float32Array([-2,-.5,0,.5,2]),44100),v=new DataView(wav);
 assert.equal(new TextDecoder().decode(new Uint8Array(wav,0,4)),'RIFF');assert.equal(v.getUint32(24,true),44100);assert.equal(v.getUint32(40,true),10);assert.equal(v.getInt16(44,true),-32768);assert.equal(v.getInt16(52,true),32767);
});
