// ══════════════════════════════════════════════════════════
// TYPEFALL — Service Worker (PWA Offline Support)
// ══════════════════════════════════════════════════════════

const CACHE_NAME = 'typefall-v1';

// Assets to cache on install (app shell)
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  // Google Fonts — cached at runtime (see below)
  // Supabase CDN — network-first (leaderboard requires live data)
];

// External assets to cache on first use
const RUNTIME_CACHE_PATTERNS = [
  /^https:\/\/fonts\.googleapis\.com/,
  /^https:\/\/fonts\.gstatic\.com/,
  /^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome/,
];

// ── Install: pre-cache app shell ─────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching app shell');
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean up old caches ───────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: strategy per request type ─────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET & Chrome extension requests
  if (request.method !== 'GET' || url.protocol === 'chrome-extension:') return;

  // Supabase API → Network-only (live leaderboard data)
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(fetch(request));
    return;
  }

  // External font/icon CDNs → Cache-first with runtime fallback
  if (RUNTIME_CACHE_PATTERNS.some((pattern) => pattern.test(request.url))) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // App shell assets → Cache-first, network fallback
  event.respondWith(cacheFirst(request));
});

// ── Cache-first strategy ─────────────────────────────────
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) return cachedResponse;

  try {
    const networkResponse = await fetch(request);
    // Cache valid responses
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    console.warn('[SW] Network request failed, no cache available:', request.url);
    // Return a minimal offline fallback for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('/index.html');
    }
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}
