const isAero = location.pathname.startsWith('/Aero');
const uvBase = isAero ? '/Aero/uv/' : '/uv/';

importScripts(uvBase + 'uv.bundle.js');
importScripts(uvBase + 'uv.config.js');
importScripts(uvBase + 'uv.sw.js');

const uv = new UVServiceWorker();

self.addEventListener('fetch', (event) => {
  if (uv.route(event)) {
    event.respondWith(uv.fetch(event));
  }
});
