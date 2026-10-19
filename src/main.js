import './style.css';
import { icon } from './icons.js';
import { demoNotes, noteName, identifyChord, scoreMeasures } from './music.js';
import { NoteTracker } from './detector.js';
import { renderScore } from './score.js';
import { PianoAudio, decodeAudio } from './audio.js';
import { musicXML, midiFile, wavFile, download, xmlEscape } from './exports.js';

const $ = s => document.querySelector(s);
const escape = xmlEscape;
const audio = new PianoAudio();
const state = { notes: demoNotes(), title: 'A quiet beginning', bpm: 120, sensitivity: 55, recording: false, busy: false, demo: true, playing: false, active: [], elapsed: 0, audio: null, id: null, saved: false, editor: false };
let worker, tracker, stream, capture, source, ring, ringAt = 0, sampleCount = 0, chunks = [], lastFrame = 0, pendingFrame = false, lastScore = 0, drawTimer, timer, playbackTimer;
let library = [];
try { library = JSON.parse(localStorage.getItem('piano-listen-library') || '[]'); if (!Array.isArray(library)) library = []; } catch { library = []; }
library = library.filter(p => p && typeof p.title === 'string' && Number.isFinite(p.bpm) && Array.isArray(p.notes) && p.notes.every(n => Number.isFinite(n.midi) && n.midi >= 21 && n.midi <= 108 && Number.isFinite(n.start) && n.start >= 0 && n.start <= 121 && Number.isFinite(n.duration) && n.duration > 0 && n.duration <= 121));

$('#app').innerHTML = `
<header class="topbar"><a class="brand" href="./" aria-label="Piano Listen home"><span class="brand-icon">${icon('piano')}</span><span>piano<span class="brand-light">listen</span><span class="brand-dot">.</span></span></a>
<nav aria-label="Main navigation"><button class="nav-item selected" id="studio">Studio</button><button class="nav-item" id="library">My pieces <span id="library-count">${library.length}</span></button></nav>
<div class="header-actions"><span class="local-badge"><span></span> On your device</span><button class="btn subtle install-btn" id="install">${icon('phone')}<span>Install app</span></button><button class="icon-btn" id="help" aria-label="How to use Piano Listen">${icon('help')}</button></div></header>
<main><section class="intro"><div><p class="eyebrow"><span></span> A LITTLE SPACE FOR YOUR MUSIC</p><h1>Your playing, <em>on paper.</em></h1><p class="intro-copy">Sit down. Play something. Let the notes find their way onto the page.</p></div><div class="intro-note">Made for those<br>“let me play that again” moments.<span>↙</span></div></section>
<section class="record-panel" aria-label="Recording controls"><div class="record-main"><button class="record-button" id="record">${icon('mic')}<span>Start listening</span></button><div class="record-description"><strong id="record-status">Ready when you are</strong><span id="record-hint">Allow your microphone, then play your piano.</span></div></div><div class="recorder-right"><div class="waveform" id="waveform" aria-hidden="true">${Array.from({length:32},(_,i)=>`<i style="--h:${[8,13,21,12,30,18,36,24,14,27,38,19,26,12,32,22][i%16]}px"></i>`).join('')}</div><span class="timer" id="timer">00:00</span><span class="control-divider"></span><button class="btn subtle" id="import">${icon('upload')}<span>Import audio</span></button><input type="file" id="audio-file" accept="audio/*,.wav,.mp3,.m4a,.flac" hidden></div></section>
<div class="workspace"><section class="score-panel"><div class="score-toolbar"><div class="score-title-wrap"><span class="small-label">YOUR SCORE</span><div class="title-row"><input id="piece-title" aria-label="Piece title" value="A quiet beginning" maxlength="80"><span class="tag" id="score-tag">Demo score</span></div></div><div class="score-actions"><button class="icon-btn" id="save" aria-label="Save piece to this device" title="Save piece">${icon('save')}</button><button class="btn export-button" id="export" aria-expanded="false" aria-controls="export-menu">${icon('download')} Export ${icon('down')}</button><div class="export-menu" id="export-menu" hidden><p>TAKE YOUR MUSIC WITH YOU</p><button data-export="midi">${icon('music')}<span>MIDI<small>Play or edit in your music app</small></span><span>.mid</span></button><button data-export="xml">${icon('book')}<span>MusicXML<small>Edit in MuseScore, Sibelius & more</small></span><span>.musicxml</span></button><button data-export="pdf">${icon('download')}<span>Print / Save as PDF<small>A clean copy of your sheet music</small></span><span>↗</span></button><button data-export="wav" id="wav-export" hidden>${icon('headphones')}<span>Original recording<small>Unedited microphone audio</small></span><span>.wav</span></button></div></div></div>
<div class="notation-tools"><div class="score-meta"><span class="time-signature">4/4</span><span>C major / A minor</span><span class="dot-separator">·</span><label class="tempo-label" title="Set the tempo you played at to quantize the score"><span>♩ =</span><input id="bpm" aria-label="Score tempo in beats per minute" type="number" min="30" max="240" value="120"><span>BPM</span></label></div><button class="text-button" id="new-piece">${icon('plus')} New piece</button></div>
<div class="score-paper"><div class="paper-heading"><span>PIANO</span><span id="paper-status">A small idea. A place to start.</span></div><div id="score" class="score"></div><div id="empty-score" class="empty-score" hidden>${icon('music')}<h3>A blank page, full of possibility.</h3><p>Start listening to turn your playing into notes.<br>Or try the demo to see how it works.</p><button class="btn" id="try-demo">Try a little demo ${icon('arrow')}</button></div><div class="paper-footer"><span id="score-stats">16 notes · 4 measures</span><span>Transcribed with piano<span>listen.</span></span></div></div>
<div class="playback-bar"><button class="play-button" id="play" aria-label="Play score">${icon('play')}</button><div class="playback-info"><strong id="playback-title">Listen back</strong><span id="playback-subtitle">A preview of the notes on your page</span></div><div class="playback-track"><span id="playhead"></span></div><span class="playback-time" id="piece-length">00:08</span><button class="icon-btn" id="editor" aria-label="Edit detected notes" title="Edit detected notes">${icon('settings')}</button></div>
<div class="note-editor" id="note-editor" hidden><div class="editor-head"><div><strong>Make it yours</strong><p>Correct pitches and timing before exporting.</p></div><button class="btn subtle" id="add-note">${icon('plus')} Add note</button></div><div id="note-rows"></div></div>
</section>
<aside class="inspector"><section class="live-card"><div class="card-label"><span class="small-label">LIVE DETECTION</span><span class="live-indicator" id="live-indicator">Standby</span></div><div class="chord-display"><span class="chord-label">CHORD</span><strong id="chord">—</strong><span id="chord-description">Play a note or chord</span></div><div class="detected-notes" id="detected-notes"><span class="note-placeholder">Your notes will appear here</span></div><div class="input-level"><div><span>Microphone level</span><span id="level-label">Waiting</span></div><div class="level-meter"><span id="level-fill"></span></div></div></section>
<section class="settings-card"><div class="settings-heading">${icon('settings')}<strong>A little fine-tuning</strong></div><label class="range-heading" for="sensitivity"><span>Note sensitivity</span><output id="sensitivity-value">55%</output></label><input type="range" id="sensitivity" min="10" max="90" value="55"><div class="range-labels"><span>Less background noise</span><span>Softer notes</span></div><p>Place your phone near the piano. A quiet room and a light sustain pedal work best.</p><button class="refine-button" id="refine" disabled>${icon('spark')} Re-analyze recording ${icon('arrow')}</button><span class="refine-hint">Review your take after you finish playing.</span></section>
<section class="tip-card"><span class="tip-number">A SMALL NOTE</span><h3>Keep the feeling.<br>We’ll keep the notes.</h3><p>Live detection is a first draft. Dense chords, pedal and room noise can add or miss notes — listen back and make it yours.</p><button id="how-it-works" class="text-button">A few helpful tips ${icon('arrow')}</button></section></aside></div>
<section class="keyboard-panel"><div class="keyboard-heading"><div>${icon('piano')}<span>Your piano, visualized</span><span class="keyboard-range">C2 – B6</span></div><span class="keyboard-caption">Played notes light up here · Tap a key to try it</span></div><div class="keyboard-scroll"><div class="keyboard" id="keyboard"></div></div><div class="keyboard-bottom"><span><i></i> Detected note</span><span id="keyboard-notes">88-key detection · 5-octave view</span></div></section>
<footer><span>${icon('shield')} Your music stays yours. Audio is processed on this device.</span><button id="footer-help">A little help ${icon('arrow')}</button></footer></main>
<div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
<dialog id="modal"><div id="modal-content"></div></dialog>
<div class="print-header"><h1 id="print-title"></h1><p id="print-meta"></p></div>`;

const whiteNotes = [];
$('.score-panel').prepend($('.print-header'));
for (let midi = 36; midi <= 95; midi++) if (![1,3,6,8,10].includes(midi % 12)) whiteNotes.push(midi);
$('#keyboard').innerHTML = whiteNotes.map((midi, i) => `<button class="key white-key" data-midi="${midi}" style="left:${i / 35 * 100}%;width:${100/35}%" aria-label="Play ${noteName(midi)}"><span>${midi % 12 === 0 ? noteName(midi) : ''}</span></button>`).join('') + Array.from({length:60},(_,i)=>i+36).filter(m=>[1,3,6,8,10].includes(m%12)).map(midi => { const before = whiteNotes.filter(m=>m<midi).length; return `<button class="key black-key" data-midi="${midi}" style="left:${(before-0.31)/35*100}%;width:${0.62/35*100}%" aria-label="Play ${noteName(midi)}"></button>`; }).join('');

function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(()=>$('#toast').hidden=true, 4800); }
function clock(seconds) { return `${Math.floor(seconds / 60).toString().padStart(2,'0')}:${Math.floor(seconds % 60).toString().padStart(2,'0')}`; }
function duration() { return Math.max(0, ...state.notes.map(n => n.start + n.duration)); }
function setDetection(midis, rms = 0) {
  state.active = midis;
  const chord = identifyChord(midis);
  $('#chord').textContent = chord.symbol; $('#chord').classList.toggle('long', chord.symbol.length > 6);
  $('#chord-description').textContent = chord.description;
  $('#detected-notes').innerHTML = midis.length ? midis.map(m=>`<span class="note-pill">${noteName(m)}</span>`).join('') : '<span class="note-placeholder">Your notes will appear here</span>';
  document.querySelectorAll('.key').forEach(key=>key.classList.toggle('active', midis.includes(Number(key.dataset.midi))));
  $('#level-fill').style.width = `${Math.min(100, Math.sqrt(rms) * 200)}%`;
  $('#level-label').textContent = state.recording ? rms > 0.008 ? 'Receiving' : 'Quiet' : 'Waiting';
  $('#waveform').style.setProperty('--level', Math.min(1, Math.max(0.15, rms * 9)));
  $('#keyboard-notes').textContent = midis.length ? midis.map(m=>noteName(m)).join(' · ') : '88-key detection · 5-octave view';
}
function drawScore() {
  clearTimeout(drawTimer); lastScore = performance.now();
  try { renderScore($('#score'), state.notes, state.bpm); } catch (error) { console.error(error); toast('The score could not be drawn. Your notes are still available for export.'); }
  $('#empty-score').hidden = state.notes.length > 0;
  $('#score').classList.toggle('is-empty', !state.notes.length);
  const measures = scoreMeasures(state.notes, state.bpm).length;
  $('#score-stats').textContent = `${state.notes.length} ${state.notes.length === 1 ? 'note' : 'notes'} · ${measures} ${measures === 1 ? 'measure' : 'measures'}`;
  $('#piece-length').textContent = clock(duration());
  $('#score-tag').textContent = state.demo ? 'Demo score' : state.recording ? 'Listening' : state.saved ? 'Saved on device' : 'Draft';
  $('#score-tag').classList.toggle('recording-tag', state.recording);
  $('#paper-status').textContent = state.demo ? 'A small idea. A place to start.' : state.recording ? 'Listening to your piano…' : state.notes.length ? 'A little piece of your world.' : 'Your next idea starts here.';
  $('#play').disabled = !state.notes.length || state.recording || state.busy;
  $('#export').disabled = !state.notes.length || state.recording || state.busy;
  $('#refine').disabled = !state.audio || state.recording || state.busy;
  $('#save').disabled = !state.notes.length || state.recording || state.busy;
  $('#editor').disabled = state.recording || state.busy;
  $('#bpm').disabled = state.recording || state.busy;
  $('#new-piece').disabled = state.recording || state.busy;
  $('#import').disabled = state.recording || state.busy;
  $('#library').disabled = state.recording || state.busy;
  $('#wav-export').hidden = !state.audio;
  if (state.editor) renderEditor();
}
function scheduleScore() { if (performance.now() - lastScore > 900) drawScore(); else if (!drawTimer) drawTimer = setTimeout(()=>{ drawTimer=null;drawScore(); },900); }
function persist(showToast = false) {
  if (!state.notes.length) { if (showToast) toast('Play a few notes first.'); return; }
  state.id ||= crypto.randomUUID();
  const piece = { id:state.id, title:state.title || 'Untitled piece', bpm:state.bpm, notes:state.notes, updated:Date.now() };
  library = [piece, ...library.filter(p=>p.id!==state.id)].slice(0,30);
  try { localStorage.setItem('piano-listen-library', JSON.stringify(library)); state.saved = true; $('#library-count').textContent = library.length; if (showToast) toast('Saved to My pieces on this device.'); }
  catch { state.saved = false; toast('Device storage is full or unavailable. Export your score to keep it.'); }
  drawScore();
}
function stopPlayback() { audio.stop(); clearInterval(playbackTimer); state.playing = false; $('#play').innerHTML=icon('play'); $('#play').setAttribute('aria-label','Play score'); $('#playback-title').textContent='Listen back'; $('#playhead').style.width='0%'; setDetection([]); }
function reset() {
  stopPlayback();
  if (!state.demo && state.notes.length) persist();
  Object.assign(state, { notes:[], title:'Untitled piece', demo:false, saved:false, id:null, audio:null, elapsed:0 });
  $('#piece-title').value=state.title; $('#timer').textContent='00:00'; drawScore();
}
function makeWorker() {
  const w = new Worker(new URL('./analysis-worker.js', import.meta.url), {type:'module'});
  w.onerror = () => { if (state.recording) stopRecording(); toast('Audio analysis was interrupted. Please try again.'); };
  return w;
}
async function startRecording() {
  if (state.busy || state.recording) return;
  stopPlayback();
  state.busy = true;
  drawScore();
  $('#record').disabled = true;
  $('#record-status').textContent='Connecting to your microphone…';
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access needs HTTPS and a supported browser. Open this page in Safari on iPhone.');
    const ctx = await audio.ready();
    stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:1},video:false});
    if (!ctx.audioWorklet) throw new Error('This browser does not support audio capture. Use an up-to-date Safari or import an audio recording.');
    await ctx.audioWorklet.addModule(new URL('capture-worklet.js', document.baseURI));
    if (!state.demo && state.notes.length) persist();
    Object.assign(state, {notes:[],title:state.title==='A quiet beginning'?'Untitled piece':state.title,demo:false,saved:false,id:null,audio:null,elapsed:0,recording:true});
    $('#piece-title').value=state.title;
    state.editor=false; $('#note-editor').hidden=true;
    tracker = new NoteTracker(); ring = new Float32Array(16384); ringAt=0;sampleCount=0;chunks=[];lastFrame=0;pendingFrame=false;
    worker = makeWorker();worker.postMessage({type:'init',sampleRate:ctx.sampleRate});
    worker.onmessage = ({data})=> {
      if (!state.recording || data.type!=='frame') return;
      pendingFrame=false;
      const time = Math.max(0,data.time);
      state.notes=tracker.update(data.notes,time);
      setDetection(data.notes.map(n=>n.midi),data.rms); scheduleScore();
    };
    capture = new AudioWorkletNode(ctx,'piano-capture'); source=ctx.createMediaStreamSource(stream); source.connect(capture);capture.connect(ctx.destination);
    capture.port.onmessage = ({data}) => {
      if (!state.recording) return;
      chunks.push(data);sampleCount+=data.length;
      for (const x of data) {ring[ringAt]=x;ringAt=(ringAt+1)%ring.length;}
      const time = sampleCount/ctx.sampleRate;
      state.elapsed=time;$('#timer').textContent=clock(time);
      if (time-lastFrame>0.1 && !pendingFrame && sampleCount>=ring.length) {
        const samples=new Float32Array(ring.length);samples.set(ring.subarray(ringAt));samples.set(ring.subarray(0,ringAt),ring.length-ringAt);
        worker.postMessage({type:'frame',samples,time:time-ring.length/ctx.sampleRate/2,sensitivity:state.sensitivity},[samples.buffer]);lastFrame=time;pendingFrame=true;
      }
      if (time>=120) {stopRecording();toast('Two-minute take saved. Start a new take whenever you’re ready.');}
    };
    stream.getAudioTracks().forEach(track=>track.addEventListener('ended',()=>{if(state.recording){stopRecording();toast('The microphone disconnected. Your take has been saved.');}}));
    $('#record').innerHTML=`${icon('stop')}<span>Stop listening</span>`;$('#record').classList.add('is-recording');
    $('#record-status').textContent='Listening to your piano';$('#record-hint').textContent='Play naturally. Stop when your idea is on the page.';
    $('#waveform').classList.add('is-live');$('#live-indicator').textContent='Listening';$('#live-indicator').classList.add('on');
    state.busy = false;
    drawScore();
  } catch(e) {
    state.recording=false;cleanupCapture();
    const messages = {NotAllowedError:'Microphone access was denied. In Safari, allow microphone access in Website Settings, then try again.', NotFoundError:'No microphone was found. Connect one or import an audio file.', NotReadableError:'The microphone is in use. Close other recording apps and try again.'};
    toast(messages[e.name] || e.message || 'Could not open the microphone.');
    $('#record-status').textContent='Microphone unavailable';$('#record-hint').textContent='Check microphone permission, or import a recording.';
  } finally {state.busy=false;$('#record').disabled=false;drawScore();}
}
function cleanupCapture() {
  if(capture){capture.port.onmessage=null;capture.disconnect();capture=null;}
  source?.disconnect();source=null;
  stream?.getTracks().forEach(t=>t.stop());stream=null;
  worker?.terminate();worker=null;
}
function stopRecording() {
  if(!state.recording)return;
  state.recording=false;
  state.notes=tracker.stop(state.elapsed);
  const samples=new Float32Array(sampleCount);let at=0;for(const chunk of chunks){samples.set(chunk,at);at+=chunk.length;}
  state.audio={samples,sampleRate:audio.context.sampleRate};chunks=[];
  cleanupCapture();
  $('#record').innerHTML=`${icon('mic')}<span>Start listening</span>`;$('#record').classList.remove('is-recording');
  $('#record-status').textContent='A little music, captured';$('#record-hint').textContent='Listen back, refine the notes, or export your score.';
  $('#waveform').classList.remove('is-live');$('#live-indicator').textContent='Standby';$('#live-indicator').classList.remove('on');
  setDetection([]);if(state.notes.length)persist();else{drawScore();toast('No notes detected yet. Try moving closer, raising sensitivity, or re-analyzing your recording.');}
}
async function analyze(take) {
  stopPlayback();
  state.busy=true;$('#record').disabled=true;$('#record-status').textContent='Finding the notes in your take…';$('#record-hint').textContent='Keep this page open while your audio is analyzed.';drawScore();
  const w=makeWorker();
  try {
    const result=await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{w.terminate();reject(new Error('Analysis took too long. Try a shorter recording.'));},180000);
      w.onmessage=({data})=>{if(data.type==='progress')$('#record-status').textContent=`Finding your notes… ${Math.round(data.progress*100)}%`;if(data.type==='complete'){clearTimeout(timeout);resolve(data.notes);}};
      w.onerror=()=>{clearTimeout(timeout);reject(new Error('This recording could not be analyzed. Try a shorter WAV or MP3 file.'));};
      const samples=take.samples.slice();w.postMessage({type:'analyze',samples,sampleRate:take.sampleRate,sensitivity:state.sensitivity},[samples.buffer]);
    });
    state.notes=result;state.demo=false;state.saved=false;
    if(result.length){persist();toast(`Found ${result.length} notes. Listen back and correct anything that needs a touch.`);}else toast('No piano notes found. Try a clearer recording or higher sensitivity.');
  } catch(e){toast(e.message);} finally {w.terminate();state.busy=false;$('#record').disabled=false;$('#record-status').textContent='Ready when you are';$('#record-hint').textContent='Allow your microphone, then play your piano.';drawScore();}
}
function modal(html) {
  $('#modal-content').innerHTML=`<button class="icon-btn modal-close" aria-label="Close dialog">${icon('close')}</button>${html}`;
  $('#modal').showModal();$('.modal-close').onclick=()=>$('#modal').close();
}
function help(install=false) {
  modal(`<span class="modal-eyebrow">${icon(install?'phone':'music')} ${install?'YOUR POCKET STUDIO':'A FEW HELPFUL TIPS'}</span><h2>${install?'A home for your music.':'From piano to page.'}</h2>${install?`<p>On iPhone, open this website in <strong>Safari</strong>, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>. Enable “Open as Web App” if offered, then tap Add.</p><div class="help-step"><span>01</span><div><strong>Open in Safari</strong><p>Use the published HTTPS address on your iPhone.</p></div></div><div class="help-step"><span>02</span><div><strong>Share → Add to Home Screen</strong><p>Your piano studio gets its own icon.</p></div></div><div class="help-step"><span>03</span><div><strong>Open, allow the mic, and play</strong><p>After the first full visit, the app works offline. Keep it open and your screen awake while recording.</p></div></div>`:`<div class="help-step"><span>01</span><div><strong>A quiet room, a clear piano</strong><p>Place the microphone near the instrument. Use one piano at a time and keep the sustain pedal light.</p></div></div><div class="help-step"><span>02</span><div><strong>Listen, then make it yours</strong><p>Tap Start listening and allow the microphone. Notes and chords appear as you play. Takes are limited to two minutes. Set your playing tempo before exporting; notation is rounded to sixteenth notes in 4/4, with C major / A minor key signatures.</p></div></div><div class="help-step"><span>03</span><div><strong>A first draft, ready to refine</strong><p>Acoustic transcription is approximate. Fast repeated notes, low bass, rich chords, tuning and pedal may cause errors. Re-analyze your take, then use the sliders icon under the score to edit pitches and timing. Chord names include common triads, inversions and seventh chords.</p></div></div><div class="help-step"><span>04</span><div><strong>Your music, wherever you need it</strong><p>Export MIDI for music apps, MusicXML for score editors, or print to PDF. On iPhone, save from the share sheet to Files. My pieces stores your last 30 scores in this browser; export to keep a backup. Audio is kept only until a new take or page reload.</p></div></div>`}<div class="privacy-note">${icon('shield')} Analysis happens entirely on this device. No audio uploads, accounts or tracking.</div>`);
}
function showLibrary() {
  modal(`<span class="modal-eyebrow">${icon('book')} YOUR MUSIC, COLLECTED</span><h2>Little ideas. Worth keeping.</h2><p>Your last 30 saved pieces, on this device.</p><div class="library-list">${library.length?library.map(p=>`<div class="library-row"><button data-open="${escape(p.id)}"><span class="library-icon">${icon('music')}</span><span><strong>${escape(p.title)}</strong><small>${p.notes.length} notes · ${p.bpm} BPM · ${new Date(p.updated).toLocaleDateString()}</small></span>${icon('arrow')}</button><button class="icon-btn" data-delete="${escape(p.id)}" aria-label="Delete ${escape(p.title)}">${icon('trash')}</button></div>`).join(''):'<div class="library-empty">Your next little idea belongs here.<br>Record a piece or save the demo to begin.</div>'}</div>`);
  document.querySelectorAll('[data-open]').forEach(button=>button.onclick=()=>{if(!state.demo&&state.notes.length)persist();stopPlayback();const piece=library.find(p=>p.id===button.dataset.open);Object.assign(state,{notes:structuredClone(piece.notes),bpm:piece.bpm,title:piece.title,id:piece.id,demo:false,saved:true,audio:null});$('#piece-title').value=state.title;$('#bpm').value=state.bpm;$('#modal').close();drawScore();});
  document.querySelectorAll('[data-delete]').forEach(button=>button.onclick=()=>{const id=button.dataset.delete;library=library.filter(p=>p.id!==id);try{localStorage.setItem('piano-listen-library',JSON.stringify(library));}catch{toast('Could not update device storage.');}if(state.id===id){state.saved=false;state.id=null;}$('#library-count').textContent=library.length;$('#modal').close();showLibrary();});
}
function renderEditor() {
  $('#note-rows').innerHTML=state.notes.map((n,i)=>`<div class="note-row"><span>${String(i+1).padStart(2,'0')}</span><label>Note<select data-edit="midi" data-index="${i}" aria-label="Pitch of note ${i+1}">${Array.from({length:88},(_,p)=>p+21).map(m=>`<option value="${m}" ${m===n.midi?'selected':''}>${noteName(m)}</option>`).join('')}</select></label><label>Start (s)<input data-edit="start" data-index="${i}" type="number" min="0" max="120" step="0.05" value="${n.start.toFixed(2)}" aria-label="Start of note ${i+1}"></label><label>Length (s)<input data-edit="duration" data-index="${i}" type="number" min="0.06" max="120" step="0.05" value="${n.duration.toFixed(2)}" aria-label="Length of note ${i+1}"></label><button class="icon-btn" data-remove="${i}" aria-label="Remove note ${i+1}">${icon('trash')}</button></div>`).join('')||'<p class="editor-empty">Add a note, or start listening to your piano.</p>';
}

$('#record').onclick=()=>state.recording?stopRecording():startRecording();
$('#studio').onclick=()=>window.scrollTo({top:0,behavior:'smooth'});
$('#new-piece').onclick=reset;
$('#save').onclick=()=>persist(true);
$('#library').onclick=showLibrary;
$('#help').onclick=()=>help();$('#how-it-works').onclick=()=>help();$('#footer-help').onclick=()=>help();
let installPrompt;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});
$('#install').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;}else help(true);};
$('#piece-title').onchange=e=>{state.title=e.target.value.trim()||'Untitled piece';e.target.value=state.title;if(state.saved)persist();};
$('#bpm').onchange=e=>{state.bpm=Math.max(30,Math.min(240,Number(e.target.value)||120));e.target.value=state.bpm;if(state.saved)persist();else drawScore();};
$('#sensitivity').oninput=e=>{state.sensitivity=Number(e.target.value);$('#sensitivity-value').value=`${state.sensitivity}%`;};
$('#import').onclick=()=>$('#audio-file').click();
$('#audio-file').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  if(file.size>30*1024*1024){toast('Please choose an audio file smaller than 30 MB.');return;}
  try{state.busy=true;$('#record').disabled=true;drawScore();stopPlayback();const take=await decodeAudio(file);if(!state.demo&&state.notes.length)persist();Object.assign(state,{audio:take,id:null,saved:false,demo:false,title:file.name.replace(/\.[^.]+$/,'').slice(0,80),elapsed:take.samples.length/take.sampleRate});$('#piece-title').value=state.title;$('#timer').textContent=clock(state.elapsed);await analyze(take);}catch(error){toast(error.message?.includes('2 minutes')?error.message:'That audio file could not be opened. Try WAV, MP3 or M4A.');}finally{state.busy=false;$('#record').disabled=false;drawScore();}
};
$('#refine').onclick=()=>{if(state.audio)analyze(state.audio);};
$('#play').onclick=async()=>{
  if(state.playing){stopPlayback();return;}if(!state.notes.length)return;
  try{
    state.playing=true;$('#play').innerHTML=icon('stop');$('#play').setAttribute('aria-label','Stop playback');$('#playback-title').textContent='Your little idea, playing';
    await audio.play(state.notes,stopPlayback);const started=performance.now();
    playbackTimer=setInterval(()=>{const t=(performance.now()-started)/1000;$('#playhead').style.width=`${Math.min(100,t/duration()*100)}%`;setDetection([...new Set(state.notes.filter(n=>n.start<=t&&n.start+n.duration>t).map(n=>n.midi))]);},75);
  }catch{stopPlayback();toast('Playback could not start. Tap play again.');}
};
$('#try-demo').onclick=()=>{Object.assign(state,{notes:demoNotes(),demo:true,title:'A quiet beginning',bpm:120,saved:false,id:null,audio:null});$('#piece-title').value=state.title;$('#bpm').value=120;drawScore();};
$('#export').onclick=()=>{const open=$('#export-menu').hidden;$('#export-menu').hidden=!open;$('#export').setAttribute('aria-expanded',String(open));};
document.addEventListener('click',e=>{if(!e.target.closest('.score-actions')){$('#export-menu').hidden=true;$('#export').setAttribute('aria-expanded','false');}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('#export-menu').hidden=true;$('#export').setAttribute('aria-expanded','false');}});
document.querySelectorAll('[data-export]').forEach(button=>button.onclick=async()=>{
  const name=(state.title||'Piano piece').replace(/[<>:"/\\|?*\x00-\x1f]/g,'-');
  const kind=button.dataset.export;
  if(kind==='midi')await download(midiFile(state.notes,state.bpm,state.title),`${name}.mid`,'audio/midi');
  if(kind==='xml')await download(musicXML(state.notes,state.bpm,state.title),`${name}.musicxml`,'application/vnd.recordare.musicxml+xml');
  if(kind==='wav'&&state.audio)await download(wavFile(state.audio.samples,state.audio.sampleRate),`${name}.wav`,'audio/wav');
  if(kind==='pdf'){$('#print-title').textContent=state.title;$('#print-meta').textContent=`Piano · 4/4 · ♩ = ${state.bpm} · Piano Listen`;window.print();}
  $('#export-menu').hidden=true;$('#export').setAttribute('aria-expanded','false');
});
$('#editor').onclick=()=>{state.editor=!state.editor;$('#note-editor').hidden=!state.editor;if(state.editor)renderEditor();};
$('#add-note').onclick=()=>{state.notes.push({midi:60,start:Math.round(duration()*100)/100,duration:60/state.bpm,velocity:0.75});state.demo=false;state.saved=false;drawScore();};
$('#note-rows').onchange=e=>{const field=e.target.dataset.edit;if(!field)return;const index=Number(e.target.dataset.index),value=Number(e.target.value);if(!Number.isFinite(value))return;state.notes[index][field]=field==='midi'?Math.max(21,Math.min(108,Math.round(value))):Math.max(field==='start'?0:0.06,Math.min(120,value));state.demo=false;persist();};
$('#note-rows').onclick=e=>{const button=e.target.closest('[data-remove]');if(!button)return;state.notes.splice(Number(button.dataset.remove),1);state.demo=false;if(state.notes.length)persist();else{if(state.id){library=library.filter(p=>p.id!==state.id);try{localStorage.setItem('piano-listen-library',JSON.stringify(library));}catch{}$('#library-count').textContent=library.length;}state.id=null;state.saved=false;drawScore();}};
document.querySelectorAll('.key').forEach(key=>key.addEventListener('pointerdown',async e=>{e.preventDefault();if(state.recording||state.busy)return;await audio.ready();const midi=Number(key.dataset.midi);audio.tone(midi,audio.context.currentTime,0.6);setDetection([midi]);clearTimeout(timer);timer=setTimeout(()=>setDetection([]),700);}));
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal'))$('#modal').close();});
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(drawScore,200);});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(state.recording){stopRecording();toast('Recording stopped when the app went to the background. Your take is saved.');}if(state.playing)stopPlayback();}});
window.addEventListener('pagehide',()=>{if(state.recording)stopRecording();audio.stop();});
window.addEventListener('beforeprint',()=>{$('#print-title').textContent=state.title;$('#print-meta').textContent=`Piano · 4/4 · ♩ = ${state.bpm} · Piano Listen`;renderScore($('#score'),state.notes,state.bpm);});
window.addEventListener('afterprint',drawScore);
if('serviceWorker' in navigator && import.meta.env.PROD)navigator.serviceWorker.register(new URL('sw.js',document.baseURI)).catch(()=>toast('Offline mode could not be enabled. You can still use the app online.'));
drawScore();
