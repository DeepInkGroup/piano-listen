import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, extname, sep } from 'node:path';
import { frequency } from '../src/music.js';
import { wavFile } from '../src/exports.js';

// Uses the installed Chrome, avoiding a separate browser download. This is a
// test-only synthetic stream; the app always asks for the real microphone.
mkdirSync('artifacts',{recursive:true});
const root=resolve('dist');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=createServer((req,res)=>{
 const route=decodeURIComponent(new URL(req.url,'http://local').pathname).replace(/^\/piano-listen\//,'/');
 const path=resolve(root,'.'+route+(route.endsWith('/')?'index.html':''));
 if(!path.startsWith(root+sep)){res.writeHead(403);res.end();return;}
 try{const data=readFileSync(path);res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream'});res.end(data);}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(4175,'127.0.0.1',r));
let browser;
const errors=[];
try{
 browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1050}});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4175/piano-listen/');
 await page.locator('#score svg').first().waitFor();
 assert.ok(await page.locator('#score svg').count()>0);
 assert.match(await page.locator('#score-stats').textContent(),/16 notes/);
 await page.screenshot({path:'artifacts/desktop.png',fullPage:true});
 for(const width of [320,375,390,768]){
  await page.setViewportSize({width,height:900});
  await page.waitForFunction(()=>parseFloat(document.querySelector('#score svg').getAttribute('width'))<=Math.max(300,document.querySelector('#score').clientWidth)+1);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Horizontal overflow at ${width}px`);
  assert.ok(await page.locator('#record').isVisible());
 }
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>parseFloat(document.querySelector('#score svg').getAttribute('width'))<=Math.max(300,document.querySelector('#score').clientWidth)+1);await page.screenshot({path:'artifacts/iphone.png',fullPage:true});
 await page.locator('#piece-title').fill('My piano study');await page.locator('#piece-title').press('Tab');
 await page.locator('#save').click();await page.locator('#library').click();assert.ok(await page.getByRole('dialog').isVisible());assert.ok(await page.locator('[data-open]').count()===1);await page.getByRole('button',{name:'Close dialog'}).click();
 await page.locator('#editor').click();assert.equal(await page.locator('.note-row').count(),16);
 await page.locator('select[data-edit="midi"]').first().selectOption('50');assert.equal(await page.locator('select[data-edit="midi"]').first().inputValue(),'50');
 await page.locator('#editor').click();
 for(const kind of ['midi','xml']){
  await page.locator('#export').click();const promise=page.waitForEvent('download');await page.locator(`[data-export="${kind}"]`).click();const d=await promise;assert.ok(d.suggestedFilename().endsWith(kind==='midi'?'.mid':'.musicxml'));await d.saveAs(`artifacts/${d.suggestedFilename()}`);
 }
 await page.locator('#play').click();await page.getByRole('button',{name:'Stop playback'}).waitFor();await page.locator('#play').click();
 await page.locator('#new-piece').click();assert.ok(await page.locator('#empty-score').isVisible());assert.ok(await page.locator('#export').isDisabled());
 await page.locator('#record').click();await page.getByText('Microphone unavailable',{exact:true}).waitFor();assert.ok(await page.locator('#toast').isVisible());
 await page.locator('#install').click();assert.match(await page.getByRole('dialog').textContent(),/Add to Home Screen/);await page.getByRole('button',{name:'Close dialog'}).click();
 // Exercise actual AudioWorklet -> rolling window -> worker -> NoteTracker.
 await page.addInitScript(()=>{
  navigator.mediaDevices.getUserMedia=async()=>{
   const ctx=new AudioContext(),destination=ctx.createMediaStreamDestination();
   for(const midi of [60,64,67])for(let h=1;h<=8;h++){
    const osc=ctx.createOscillator(),gain=ctx.createGain();osc.frequency.value=440*2**((midi-69)/12)*h;gain.gain.value=.1/h**1.3;osc.connect(gain).connect(destination);osc.start();
   }
   await ctx.resume();window.__syntheticContext=ctx;window.__syntheticStream=destination.stream;return destination.stream;
  };
 });
 await page.reload();await page.locator('#record').click();await page.getByText('Listening to your piano',{exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('#chord').textContent==='C',{timeout:15000});
 await page.waitForFunction(()=>document.querySelector('#score-stats').textContent.startsWith('3 notes'),{timeout:15000});
 assert.equal(await page.locator('.note-pill').count(),3);await page.locator('#record').click();assert.match(await page.locator('#score-stats').textContent(),/3 notes/);
 assert.equal(await page.evaluate(()=>window.__syntheticContext?true:false),true);
 assert.ok(await page.evaluate(()=>window.__syntheticStream.getTracks().every(track=>track.readyState==='ended')));
 // Import a generated chord with leading silence and a decaying envelope.
 const sr=44100,samples=Float32Array.from({length:sr*3},(_,i)=>{
  const t=i/sr;if(t<.3||t>2.4)return 0;
  return [60,64,67].reduce((sum,midi)=>sum+Array.from({length:8},(_,h)=>Math.sin(2*Math.PI*frequency(midi)*(h+1)*t)/(h+1)**1.3).reduce((a,b)=>a+b,0)*.1*Math.exp(-(t-.3)*.4),0);
 });
 writeFileSync('artifacts/chord.wav',Buffer.from(wavFile(samples,sr)));
 await page.locator('#audio-file').setInputFiles('artifacts/chord.wav');
 await page.waitForFunction(()=>document.querySelector('#record-status').textContent==='Ready when you are'&&!document.querySelector('#refine').disabled,{timeout:30000});
 const noteNames=await page.locator('#score-stats').textContent();assert.match(noteNames,/3 notes/);
 await page.locator('#refine').click();await page.waitForFunction(()=>!document.querySelector('#refine').disabled,{timeout:30000});assert.match(await page.locator('#score-stats').textContent(),/3 notes/);
 // Every generated SVG system can flow across printed pages independently.
 await page.emulateMedia({media:'print'});await page.pdf({path:'artifacts/score.pdf',format:'A4',printBackground:true});await page.emulateMedia({media:'screen'});
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();
 assert.ok(await page.evaluate(()=>Boolean(navigator.serviceWorker.controller)));
 await context.setOffline(true);await page.reload();await page.locator('#score svg').first().waitFor();
 assert.ok(await page.locator('#record').isVisible());
 await page.locator('#record').click();await page.waitForFunction(()=>document.querySelector('#score-stats').textContent.startsWith('3 notes'),{timeout:15000});await page.locator('#record').click();
 await context.setOffline(false);await context.close();
 assert.deepEqual(errors,[]);
 console.log('PASS: responsive score, storage, correction, exports, playback, permission denial, synthesized mic, import, PDF, project subpath, PWA, offline.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
