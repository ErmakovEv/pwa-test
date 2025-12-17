
self.addEventListener('install', (event) => {
  // Можно сделать pre-cache, но для демо пропустим
  console.log('[sw] Install');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[sw] Activate');
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const title = data.title || 'Напоминание';
  const body = data.body || '';
  const vibrationPattern = data.vibrationPattern || [200, 100, 200];

  const options = {
    body,
    icon: '/icons/icon-1.png',
    badge: '/icons/icon-2.png',
    vibrate: vibrationPattern,
    data: {
      urlToOpen: '/'
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.urlToOpen || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});