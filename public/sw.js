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
    (async () => {
      const clientsList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // 1) Un onglet est déjà ouvert EXACTEMENT sur la cible : on le focus.
      for (const client of clientsList) {
        if (client.url === cible && "focus" in client) {
          return client.focus();
        }
      }

      // 2) Un onglet de l'app est ouvert ailleurs : on le focus puis on
      //    tente d'y naviguer. navigate() peut rejeter (client non contrôlé
      //    par le SW, fréquent sur mobile) : dans ce cas on retombe sur
      //    openWindow pour garantir d'arriver sur la bonne page.
      for (const client of clientsList) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              const navigated = await client.navigate(cible);
              if (navigated) return;
            } catch (_e) {
              // navigate impossible : on ouvre une fenêtre ci-dessous.
            }
          }
          break;
        }
      }

      // 3) Aucun onglet exploitable (ou navigate impossible) : on ouvre.
      if (self.clients.openWindow) return self.clients.openWindow(cible);
    })(),
  );
});