self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SHOW_DIGEST_NOTIFICATION') {
    const title = data.title || 'Droplet Daily Digest';
    const body = data.body || 'Your summary is ready.';
    if (self.registration && self.registration.showNotification) {
      self.registration.showNotification(title, {
        body,
        tag: 'droplet-digest-' + Date.now()
      }).catch(() => {});
    }
    self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clients) => {
      clients.forEach((client) => {
        client.postMessage({
          type: 'DIGEST_DELIVERED',
          title,
          body
        });
      });
    });
  }
});
