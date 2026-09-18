/* 想我了吧 · 离线缓存（可选增强，注册失败不影响使用） */
const CACHE = 'xwlb-v1';
const ASSETS = ['./', './mood.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE)
            .then((c) => c.addAll(ASSETS))
            .then(() => self.skipWaiting())
            .catch(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

/* 页面优先走网络，离线时回落到缓存 */
self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') { return; }
    e.respondWith(
        fetch(e.request)
            .then((res) => {
                const copy = res.clone();
                caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => { });
                return res;
            })
            .catch(() => caches.match(e.request).then((r) => r || caches.match('./mood.html')))
    );
});
