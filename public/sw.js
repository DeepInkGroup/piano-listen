const CACHE = 'piano-listen-v1';
const root = new URL('./', self.location.href);
const local = name => new URL(name, root).href;
const CORE = ['./','index.html','manifest.webmanifest','icon.svg','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png','capture-worklet.js'].map(local);
self.addEventListener('install',event=>{event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);await cache.addAll(CORE);
 const response=await cache.match(local('index.html'));const html=await response.text();
 const assets=[...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(m=>new URL(m[1],root).href).filter(u=>new URL(u).origin===root.origin);
 for(const url of assets)await cache.add(url);
 // Worker imports are emitted as their own hashed bundle by Vite.
 for(const url of assets.filter(u=>u.endsWith('.js'))){const js=await(await cache.match(url)).text();const workerPaths=[...js.matchAll(/["'`]([^"'`]*analysis-worker[^"'`]*\.js)["'`]/g)].map(m=>new URL(m[1],url).href);for(const worker of workerPaths)await cache.add(worker);}
 await self.skipWaiting();
})());});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('piano-listen-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})());});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==root.origin||!url.href.startsWith(root.href))return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  if(request.mode==='navigate'){try{const response=await fetch(request);if(response.ok)await cache.put(request,response.clone());return response;}catch{return(await cache.match(request))||(await cache.match(local('index.html')));}}
  const existing=await cache.match(request);if(existing)return existing;
  const response=await fetch(request);if(response.ok)await cache.put(request,response.clone());return response;
 })());
});
