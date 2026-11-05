const aeroMatch = typeof location !== 'undefined' ? location.pathname.match(/^\/([Aa]ero)/) : null;
const repoPrefix = aeroMatch ? '/' + aeroMatch[1] : '';
const uvBase = repoPrefix + '/uv/';

importScripts(uvBase + 'uv.bundle.js');
importScripts(uvBase + 'uv.config.js');
importScripts(uvBase + 'uv.sw.js');

const sw = new UVServiceWorker();

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    sw.fetch(event).catch(() => fetch(event.request))
  );
});
