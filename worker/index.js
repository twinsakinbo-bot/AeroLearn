// Remove response caches made by older AeroLearn workers when this worker
// activates. These caches can hold private API responses from a shared device.
self.addEventListener("activate", (event) => {
  const privateCaches = new Set([
    "start-url", "apis", "pages", "pages-rsc", "pages-rsc-prefetch",
    "next-data", "static-data-assets", "cross-origin",
  ])
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((name) => privateCaches.has(name)).map((name) => caches.delete(name)),
    )),
  )
})
