// 和樂典 Service Worker：離線可用、第二次以後開啟更快
// 自動換新版（不必再手動改版本號）：
//   每個存進快取的檔案，都會記下「內容指紋」（ETag／最後修改時間，以及內容雜湊）。
//   開啟頁面、或從背景回到前景時，sw.js 會在背景用「條件式請求」問伺服器：
//   沒變動只回 304（幾乎不耗流量）；發現檔案內容真的變了，就一次換好整批快取，
//   再通知頁面顯示「有新版本，點此重新整理」。
const CACHE = 'holo-app';   // 固定名稱；舊的 holo-v5 這類帶版本號的快取，啟用時會自動清掉
// 啟動時先存起來的檔案（variants.js、compare.js 是用到才載入，第一次用到時由 fetch 規則自動存，之後也會一起檢查更新）
const PRECACHE = ['index.html', 'styles.css', 'script.js', 'data.js', 'category.js', 'name.js', 'radical.js', 'favicon.svg', 'apple-touch-icon.png', 'manifest.webmanifest'];
const CHECK_GAP = 2 * 60 * 1000;   // 兩次檢查至少間隔 2 分鐘

const abs = u => new URL(u, self.registration.scope).href;
const INDEX = abs('index.html');
const H_SIG = 'x-holo-sig', H_HASH = 'x-holo-hash';

// 同網域檔案的快取鍵：去掉 ?q=…&t=…；資料夾網址與 index.html 共用同一份，避免每個查詢網址各存一份
function keyOf(url) {
  if (url.origin !== location.origin) return url.href;
  if (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html')) return INDEX;
  return url.origin + url.pathname;
}

const sigOf = res => res.headers.get('etag') || res.headers.get('last-modified') || '';

async function sha1(buf) {
  const d = await crypto.subtle.digest('SHA-1', buf);
  return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, '0')).join('');
}

// 存進快取前，在標頭記下指紋：sig＝伺服器給的版本標記（便宜的比對）、hash＝內容雜湊（確認內容真的不同）
async function stamp(res) {
  const buf = await res.arrayBuffer();
  const h = new Headers(res.headers);
  h.delete('content-encoding'); h.delete('content-length');   // body 已解壓縮，標頭不能再宣稱壓縮
  h.set(H_SIG, sigOf(res));
  h.set(H_HASH, await sha1(buf));
  return new Response(buf, { status: res.status, statusText: res.statusText, headers: h });
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(PRECACHE.map(async u => {   // 單一檔案失敗不影響其他
      try {
        const res = await fetch(abs(u), { cache: 'reload' });   // 略過瀏覽器的 HTTP 快取，確保拿到最新
        if (res.ok) await cache.put(abs(u), await stamp(res));
      } catch (err) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('holo-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ---- 偵測新版 ----
let lastCheck = 0, running = null;
function checkForUpdate(force) {
  if (running) return running;
  if (!force && Date.now() - lastCheck < CHECK_GAP) return Promise.resolve();
  lastCheck = Date.now();
  running = doCheck().catch(() => {}).finally(() => { running = null; });
  return running;
}

async function doCheck() {
  const cache = await caches.open(CACHE);
  const urls = (await cache.keys()).map(r => r.url).filter(u => new URL(u).origin === location.origin);
  const fresh = [];        // 有更新的檔案：先全部下載好，最後再一起寫入，縮短新舊檔案混在一起的時間
  let changed = false;
  await Promise.all(urls.map(async u => {
    const old = await cache.match(u);
    if (!old) return;
    let res;
    try { res = await fetch(u, { cache: 'no-cache' }); } catch (err) { return; }   // 離線：略過
    if (!res.ok) return;
    const sig = sigOf(res);
    if (sig && sig === old.headers.get(H_SIG)) return;           // 版本標記一樣：沒變
    const s = await stamp(res);
    if (s.headers.get(H_HASH) !== old.headers.get(H_HASH)) changed = true;   // 內容真的不同，才通知
    fresh.push([u, s]);                                          // 標記變了但內容相同：只更新標記，不通知
  }));
  await Promise.all(fresh.map(([u, s]) => cache.put(u, s)));
  if (changed) {
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    cs.forEach(c => c.postMessage({ type: 'HOLO_UPDATED' }));
  }
}

// 頁面從背景回到前景時，會要求檢查一次（長時間開著的 PWA 才收得到新版）
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'HOLO_CHECK') e.waitUntil(checkForUpdate(!!e.data.force));
});

// ---- 回應請求 ----
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (req.mode === 'navigate') e.waitUntil(checkForUpdate());   // 開啟頁面時，順便在背景檢查有沒有新版
  e.respondWith(respond(e, req, url));
});

async function respond(e, req, url) {
  const cache = await caches.open(CACHE);
  const key = keyOf(url);
  const cached = await cache.match(key);
  const offline = () => new Response('離線中，且尚未快取此檔案', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  if (url.origin === location.origin) {
    if (cached) return cached;   // 有快取就直接給；更新由 checkForUpdate() 統一處理，不再每個請求各自背景更新
    try {
      const res = await fetch(req);
      if (res.ok) e.waitUntil(stamp(res.clone()).then(s => cache.put(key, s)).catch(() => {}));   // 用到才載入的檔案（variants.js、compare.js）
      return res;
    } catch (err) {
      return (req.mode === 'navigate' && await cache.match(INDEX)) || offline();
    }
  }

  // 其他網域（Sortable、字型 CSS）：維持「先給快取、背景更新」
  const update = fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(key, res.clone()).catch(() => {});
    return res;
  });
  if (cached) { update.catch(() => {}); return cached; }
  try { return await update; } catch (err) { return offline(); }
}
