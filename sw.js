const CACHE_NAME = "cuadrante-cache-v15";
const APP_SHELL = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];
const NETWORK_TIMEOUT = 3000; // ms que se espera a la red antes de usar la copia guardada

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Archivos propios: red primero (para tener siempre la última versión), pero si la red
// tarda más de NETWORK_TIMEOUT o falla, se sirve al momento la última copia guardada.
// La respuesta de la red, cuando llega, actualiza la copia para la próxima vez.
function networkFirstWithTimeout(req) {
  return caches.open(CACHE_NAME).then((cache) => {
    const net = fetch(req).then((res) => {
      if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    });
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NETWORK_TIMEOUT));
    return Promise.race([net.catch(() => null), timeout]).then((res) => {
      if (res) return res;
      return cache.match(req)
        .then((hit) => hit || cache.match("./index.html"))
        .then((hit) => hit || net);
    });
  });
}

// Librerías de Firebase (versión fija en la URL): primero la copia guardada, así la app arranca
// sin esperar a descargarlas de nuevo.
function cacheFirst(req) {
  return caches.open(CACHE_NAME).then((cache) =>
    cache.match(req).then((hit) =>
      hit ||
      fetch(req).then((res) => {
        if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()).catch(() => {});
        return res;
      })
    )
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname === "www.gstatic.com" && url.pathname.indexOf("/firebasejs/") !== -1) {
    event.respondWith(cacheFirst(req));
    return;
  }
  // El resto de peticiones a otros dominios (la propia base de datos, el inicio de sesión...) no se tocan.
  if (url.origin !== self.location.origin) return;
  event.respondWith(networkFirstWithTimeout(req));
});
