// AIRQ service worker: shows smog-raid pushes and opens the district when tapped.
self.addEventListener('push', (event) => {
  let data = { title: 'AIRQ', body: 'Air quality update', url: '/' }
  try {
    data = { ...data, ...event.data.json() }
  } catch {
    /* plain-text payload */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: data.url,
      data: { url: data.url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => new URL(w.url).origin === self.location.origin)
      return open ? open.navigate(url).then((w) => w?.focus()) : self.clients.openWindow(url)
    }),
  )
})
