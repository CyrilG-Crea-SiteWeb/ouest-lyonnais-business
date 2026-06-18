import { supabase } from "@/integrations/supabase/client";

// ⚠️ REMPLACE par TA clé VAPID PUBLIQUE (étape 1, "Public Key").
// La clé PRIVÉE ne va JAMAIS ici : elle reste côté Edge Function.
const VAPID_PUBLIC_KEY = "BFa1R8MRZRrq6TwD2CjwXoXphcVRC1jPRGSKi9fAiXrOl1doIBoxkiq3Vb3jwpGRYXgEgsIaqlDipWoL2NYQ-JI";

// Web Push exige la clé publique au format Uint8Array.
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// Le navigateur supporte-t-il le Web Push ?
export function pushSupporte(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

// État courant de la permission ("default" | "granted" | "denied").
export function permissionPush(): NotificationPermission | "unsupported" {
  if (!pushSupporte()) return "unsupported";
  return Notification.permission;
}

// Enregistre le service worker (idempotent).
async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/sw.js");
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js");
}

/**
 * Active les notifications push pour le membre courant :
 * 1. enregistre le service worker
 * 2. demande la permission
 * 3. crée l'abonnement push
 * 4. l'enregistre en base (push_subscriptions)
 *
 * Renvoie { ok, raison? } pour afficher un message clair.
 */
export async function activerPush(
  membreId: string,
): Promise<{ ok: boolean; raison?: string }> {
  if (!pushSupporte()) {
    return { ok: false, raison: "Notifications non supportées sur cet appareil." };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, raison: "Permission refusée." };
  }

  const reg = await getRegistration();

  // Réutilise un abonnement existant ou en crée un nouveau.
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const json = sub.toJSON();
  const endpoint = json.endpoint!;
  const p256dh = json.keys?.p256dh ?? "";
  const auth = json.keys?.auth ?? "";

  // upsert sur endpoint (unique) : évite les doublons si on réactive.
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      { membre_id: membreId, endpoint, p256dh, auth },
      { onConflict: "endpoint" },
    );

  if (error) {
    console.error("[push] enregistrement abonnement échoué:", error);
    return { ok: false, raison: "Échec de l'enregistrement." };
  }

  return { ok: true };
}

/**
 * Désactive les notifications : supprime l'abonnement local + en base.
 */
export async function desactiverPush(): Promise<{ ok: boolean }> {
  if (!pushSupporte()) return { ok: false };
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    const endpoint = sub.toJSON().endpoint!;
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
    await sub.unsubscribe();
  }
  return { ok: true };
}