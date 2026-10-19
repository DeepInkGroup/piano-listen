import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
mkdirSync('public/icons', {recursive:true});
// A tiny PNG encoder keeps icon generation reproducible without native dependencies.
function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function chunk(type,data){const t=Buffer.from(type),len=Buffer.alloc(4),crc=Buffer.alloc(4);len.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([t,data])));return Buffer.concat([len,t,data,crc]);}
for(const size of [180,192,512]){
 const pixels=Buffer.alloc(size*(size*4+1));
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const px=x/size*512,py=y/size*512;
  let color=[35,60,51];
  if(py>=145&&py<=370&&px>=108&&px<=404){const key=Math.floor((px-108)/101);if(px-108-key*101<93)color=[247,246,239];}
  if(py>=135&&py<=272&&((px>=177&&px<=232)||(px>=278&&px<=333)))color=[35,60,51];
  if((px-392)**2+(py-113)**2<24**2)color=[191,219,171];
  const at=y*(size*4+1)+1+x*4;pixels[at]=color[0];pixels[at+1]=color[1];pixels[at+2]=color[2];pixels[at+3]=255;
 }
 const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
 const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
 writeFileSync(`public/icons/${size===180?'apple-touch-icon':`icon-${size}`}.png`,png);
}
// Vite emits hashed asset names; the worker caches them from the HTML and
// recursively follows same-origin JS imports after first navigation.
writeFileSync('public/sw.js',readFileSync('scripts/sw-template.js','utf8'));
console.log('PWA icons and service worker prepared.');
