// Service Worker OLB — Web Push (notifications app fermée).
// Placé dans public/ pour être servi à la racine : /sw.js

// Réception d'un push : affiche la notification système.
self.addEventListener("push", (event) => {
  let data = { titre: "OLB", corps: "", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (_e) {
    // payload non-JSON : on garde les valeurs par défaut
  }

  const options = {
    body: data.corps,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url || "/" },
    // regroupe les notifs d'un même contenu plutôt que d'empiler
    tag: data.tag || undefined,
  };

  event.waitUntil(self.registration.showNotification(data.titre, options));
});

// Clic sur la notification : ouvre (ou focus) l'app sur la bonne page.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  const cible = new URL(url, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientsList) => {
        for (const client of clientsList) {
          if ("focus" in client) {
            return client.focus().then((c) => {
              const win = c || client;
              if ("navigate" in win) return win.navigate(cible);
              return win;
            });
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(cible);
      }),
  );
});