self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass-through: Let the browser handle everything normally.
  // We only intercept to handle offline fallback if needed, but for "ultra-safe" 
  // we prefer letting the network handle it.
  return;
});
