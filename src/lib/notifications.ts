import { supabase } from "@/integrations/supabase/client";

/**
 * Crée des notifications in-app pour une liste de membres.
 *
 * Réutilisable pour les demandes, mais aussi (plus tard) pour les
 * événements et sondages : il suffit de passer le bon `typeContenu`.
 *
 * @param typeContenu  'demande' | 'evenement' | 'sondage' | 'recommandation'
 * @param contenuId    id de la ligne concernée (ex. demandes.id)
 * @param titre        texte court affiché dans la cloche
 * @param membreIds    destinataires (on s'auto-exclut pour ne pas se notifier soi-même)
 * @param exclureId    id à exclure (généralement l'auteur)
 */
export async function creerNotifications(opts: {
  typeContenu: "demande" | "evenement" | "sondage" | "recommandation" | "invite";
  contenuId: number;
  titre: string;
  membreIds: string[];
  exclureId?: string | null;
}) {
  const { typeContenu, contenuId, titre, membreIds, exclureId } = opts;

  const destinataires = Array.from(new Set(membreIds)).filter(
    (id) => id && id !== exclureId,
  );
  if (destinataires.length === 0) return;

  const rows = destinataires.map((membre_id) => ({
    membre_id,
    type_contenu: typeContenu,
    contenu_id: contenuId,
    titre,
    lu: false,
  }));

  const { error } = await supabase.from("notifications").insert(rows);
  if (error) throw error;

  // Push (best-effort) : on déclenche l'Edge Function après l'in-app.
  // N'échoue jamais l'action principale (try/catch interne).
  try {
    await supabase.functions.invoke("send-push", {
      body: { typeContenu, contenuId, titre, membreIds: destinataires },
    });
  } catch (e) {
    console.error("[push] échec envoi (non bloquant):", e);
  }
}

/**
 * Variante "best-effort" : ne fait jamais échouer l'action principale.
 * Utile à la création d'une demande : si l'insertion des notifications
 * échoue (ex. RLS, réseau), la demande a déjà été créée et on ne veut
 * pas afficher une erreur bloquante. On loggue simplement.
 */
export async function creerNotificationsSafe(
  opts: Parameters<typeof creerNotifications>[0],
): Promise<{ ok: boolean }> {
  try {
    await creerNotifications(opts);
    return { ok: true };
  } catch (e) {
    console.error("[notifications] échec création (non bloquant):", e);
    return { ok: false };
  }
}

/**
 * Renvoie les ids des membres ACTIFS (pour le ciblage "Tous").
 */
export async function getMembresActifsIds(): Promise<string[]> {
  const { data, error } = await supabase
    .from("membres")
    .select("id")
    .eq("statut", "actif");
  if (error) throw error;
  return (data ?? []).map((m) => m.id);
}

/** Ids des membres gestionnaires d'invités (comité membres, bureau, admin). */
export async function getGestionnairesInvitesIds(): Promise<string[]> {
  const { data, error } = await supabase
    .from("membres")
    .select("id")
    .eq("statut", "actif")
    .in("role", ["comite_membres", "bureau", "admin"]);
  if (error) throw error;
  return (data ?? []).map((m) => m.id);
}

/**
 * Ids des administrateurs actifs.
 *
 * Sert à garantir que le rôle « admin » est toujours notifié (in-app + push)
 * lors des créations clés — invité, événement, demande, sondage — même quand
 * le ciblage par défaut ne les inclut pas (ex. conférence, demande spécifique).
 * À fusionner dans `membreIds` : `creerNotifications` déduplique et exclut
 * l'auteur, donc l'ajout est sans effet là où les admins figurent déjà.
 */
export async function getAdminsIds(): Promise<string[]> {
  const { data, error } = await supabase
    .from("membres")
    .select("id")
    .eq("statut", "actif")
    .eq("role", "admin");
  if (error) throw error;
  return (data ?? []).map((m) => m.id);
}
