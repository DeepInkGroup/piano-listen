import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
function list(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?list(`${dir}/${entry.name}`):[`${dir}/${entry.name}`]);}
const files=list('dist').filter(f=>!f.endsWith('/sw.js'));
const hash=createHash('sha256');for(const f of files)hash.update(readFileSync(f));
const version=hash.digest('hex').slice(0,12);
const template=readFileSync('scripts/sw-template.js','utf8');
writeFileSync('dist/sw.js',template.replace("'piano-listen-v1'",`'piano-listen-${version}'`).replace(/const CORE = .*?;/,`const CORE = ${JSON.stringify(['./',...files.map(f=>f.replace('dist/',''))])}.map(local);`));
console.log(`Offline cache prepared: ${files.length} assets, version ${version}`);
