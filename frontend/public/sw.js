const CACHE_VERSION = "edusphere-shell-v4";
const APP_SHELL = ["/", "/manifest.webmanifest", "/icons/edusphere.svg"];
const NEVER_CACHE = ["/api/", "/@vite/", "/node_modules/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    cacheAppShell()
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith("edusphere-shell-") && key !== CACHE_VERSION)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    NEVER_CACHE.some((path) => url.pathname.startsWith(path))
  ) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (/\.(?:js|css|woff2?|svg|png|ico)$/.test(url.pathname)) {
    event.respondWith(cacheFirstAsset(request));
  }
});

async function cacheAppShell() {
  const cache = await caches.open(CACHE_VERSION);
  const response = await fetch("/");
  if (!response.ok) throw new Error("EduSphere app shell could not be cached.");
  await cache.put("/", response.clone());
  const html = await response.text();
  const entryAssets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)]
    .map((match) => new URL(match[1], self.location.origin).href);
  const manifestResponse = await fetch("/precache-manifest.json");
  if (!manifestResponse.ok) throw new Error("EduSphere offline asset manifest could not be loaded.");
  const manifestAssets = await manifestResponse.json();
  if (!Array.isArray(manifestAssets) || manifestAssets.some((asset) => typeof asset !== "string" || !asset.startsWith("/"))) {
    throw new Error("EduSphere offline asset manifest is invalid.");
  }
  await cache.addAll(APP_SHELL);
  await Promise.all([...new Set([...entryAssets, ...manifestAssets])].map(async (assetUrl) => {
    const asset = await fetch(assetUrl);
    if (!asset.ok) throw new Error(`EduSphere app asset could not be cached: ${assetUrl}`);
    await cache.put(assetUrl, asset);
  }));
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (!response.ok) {
      return await cachedAppShellOrError(request);
    }
    const cache = await caches.open(CACHE_VERSION);
    await cache.put("/", response.clone());
    return response;
  } catch {
    return cachedAppShellOrError(request);
  }
}

async function cachedAppShellOrError(request) {
  const cachedPage = await caches.match(request);
  if (cachedPage) return cachedPage;
  const shell = await caches.match("/");
  if (shell) return shell;
  return new Response("EduSphere has not been opened online on this device yet.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

async function cacheFirstAsset(request) {
  const cachedAsset = await caches.match(request);
  if (cachedAsset) return cachedAsset;

  try {
    const response = await fetch(request);
    if (!response.ok) {
      return response;
    }
    const cache = await caches.open(CACHE_VERSION);
    await cache.put(request, response.clone());
    return response;
  } catch {
    return new Response("This app asset has not been cached on this device yet.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
