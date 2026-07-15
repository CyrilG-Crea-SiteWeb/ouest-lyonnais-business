import { supabase } from "@/integrations/supabase/client";

// ⚠️ REMPLACE par TA clé VAPID PUBLIQUE (étape 1, "Public Key").
// La clé PRIVÉE ne va JAMAIS ici : elle reste côté Edge Function.
const VAPID_PUBLIC_KEY =
  "BFa1R8MRZRrq6TwD2CjwXoXphcVRC1jPRGSKi9fAiXrOl1doIBoxkiq3Vb3jwpGRYXgEgsIaqlDipWoL2NYQ-JI";

// Web Push exige la clé publique au format Uint8Array.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
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

// Compare deux clés binaires (celle d'un abonnement existant vs. la nôtre).
// Sert à détecter un abonnement créé avec une ancienne clé VAPID : dans ce
// cas le serveur push refuse l'envoi (403) et l'abonnement est inutile.
function memeCle(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const va = new Uint8Array(a);
  if (va.length !== b.length) return false;
  for (let i = 0; i < va.length; i++) if (va[i] !== b[i]) return false;
  return true;
}

// Crée (ou réutilise) l'abonnement push et l'enregistre en base.
// Si un abonnement existe mais avec une clé VAPID différente, on le
// remplace. Idempotent grâce à l'upsert sur `endpoint`.
async function souscrireEtEnregistrer(
  reg: ServiceWorkerRegistration,
  membreId: string,
): Promise<{ ok: boolean; raison?: string }> {
  const cleAttendue = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);

  let sub = await reg.pushManager.getSubscription();

  // Abonnement présent mais signé avec une autre clé VAPID : on le jette
  // pour en recréer un valide (sinon les envois échouent en silence).
  if (sub && !memeCle(sub.options.applicationServerKey, cleAttendue)) {
    try {
      await sub.unsubscribe();
    } catch {
      // pas bloquant : on tente quand même de re-souscrire
    }
    sub = null;
  }

  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: cleAttendue,
    });
  }

  const json = sub.toJSON();
  const endpoint = json.endpoint!;
  const p256dh = json.keys?.p256dh ?? "";
  const auth = json.keys?.auth ?? "";

  // upsert sur endpoint (unique) : évite les doublons si on réactive.
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({ membre_id: membreId, endpoint, p256dh, auth }, { onConflict: "endpoint" });

  if (error) {
    console.error("[push] enregistrement abonnement échoué:", error);
    return { ok: false, raison: "Échec de l'enregistrement." };
  }

  return { ok: true };
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
export async function activerPush(membreId: string): Promise<{ ok: boolean; raison?: string }> {
  if (!pushSupporte()) {
    return { ok: false, raison: "Notifications non supportées sur cet appareil." };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, raison: "Permission refusée." };
  }

  const reg = await getRegistration();
  return souscrireEtEnregistrer(reg, membreId);
}

/**
 * Re-synchronise l'abonnement push SANS demander la permission.
 *
 * À appeler au chargement de l'app quand la permission est déjà "granted".
 * Corrige le cas fréquent où l'utilisateur a bien autorisé les notifications
 * mais n'a plus (ou n'a jamais eu) d'abonnement valide en base :
 *   - abonnement expiré puis nettoyé côté serveur (erreur 410) ;
 *   - abonnement jamais persisté (échec réseau au premier essai) ;
 *   - abonnement créé avec une ancienne clé VAPID.
 * Sans cette re-synchro, le bouton "Activer" reste caché (permission déjà
 * accordée) et l'utilisateur ne reçoit plus rien sans pouvoir agir.
 *
 * Best-effort : n'échoue jamais bruyamment, se contente de loguer.
 */
export async function synchroniserPush(membreId: string): Promise<void> {
  if (!pushSupporte()) return;
  if (Notification.permission !== "granted") return;

  try {
    const reg = await getRegistration();
    const res = await souscrireEtEnregistrer(reg, membreId);
    if (!res.ok) {
      console.warn("[push] re-synchronisation non aboutie:", res.raison);
    }
  } catch (e) {
    console.error("[push] échec re-synchronisation (non bloquant):", e);
  }
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
