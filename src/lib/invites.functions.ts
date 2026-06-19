import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Le Comité, le Bureau et l'Admin peuvent gérer les invités et convertir.
async function getCallerRole(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase
    .from("membres")
    .select("role")
    .eq("id", ctx.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.role ?? "membre") as
    | "membre"
    | "bureau"
    | "admin"
    | "comite_membres";
}

function assertComite(role: string) {
  if (role !== "comite_membres" && role !== "bureau" && role !== "admin") {
    throw new Error("Action réservée au Comité des membres.");
  }
}

const convertSchema = z.object({
  invite_id: z.number().int().positive(),
});

/**
 * Convertit un invité en membre :
 *  1. envoie une invitation Supabase (mail de définition de mot de passe) ;
 *  2. le trigger handle_new_user() crée la ligne membres ;
 *  3. on complète la fiche membre avec les infos de l'invité ;
 *  4. on marque la fiche invité "converti" + on la relie au membre créé.
 * La fiche invité est SUPPRIMÉE plus tard, quand l'invité aura défini
 * son mot de passe (voir definir-mot-de-passe.tsx).
 */
export const convertirInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => convertSchema.parse(data))
  .handler(async ({ data, context }) => {
    const role = await getCallerRole(context);
    assertComite(role);

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    // 1) Récupère la fiche invité
    const { data: invite, error: invErr } = await supabaseAdmin
      .from("invites")
      .select("*")
      .eq("id", data.invite_id)
      .maybeSingle();
    if (invErr) throw new Error(invErr.message);
    if (!invite) throw new Error("Invité introuvable.");
    if (invite.statut_conversion === "converti") {
      throw new Error("Cet invité a déjà reçu une invitation.");
    }

    // 2) Envoie l'invitation (mail de mot de passe)
    const { data: invited, error: inviteErr } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(invite.email, {
        data: { prenom: invite.prenom, nom: invite.nom },
        redirectTo: "https://ouest-lyonnais-business.lovable.app/definir-mot-de-passe",
      });
    if (inviteErr) throw new Error(inviteErr.message);
    const userId = invited.user?.id;
    if (!userId) throw new Error("Invitation envoyée mais identifiant manquant.");

    // 3) Complète la fiche membre créée par le trigger
    const { error: upErr } = await supabaseAdmin
      .from("membres")
      .update({
        prenom: invite.prenom,
        nom: invite.nom,
        entreprise: invite.entreprise || null,
        categorie: invite.categorie || null,
        telephone: invite.telephone || null,
      })
      .eq("id", userId);
    if (upErr) throw new Error(upErr.message);

    // 4) Marque l'invité "converti" + lien vers le membre
    const { error: markErr } = await supabaseAdmin
      .from("invites")
      .update({ statut_conversion: "converti", membre_id: userId })
      .eq("id", data.invite_id);
    if (markErr) throw new Error(markErr.message);

    return { ok: true, membre_id: userId };
  });