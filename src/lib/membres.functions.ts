import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getCallerRole(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase
    .from("membres")
    .select("role")
    .eq("id", ctx.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.role ?? "membre") as "membre" | "bureau" | "admin";
}

function assertBureau(role: string) {
  if (role !== "bureau" && role !== "admin") throw new Error("Action réservée au bureau.");
}
function assertAdmin(role: string) {
  if (role !== "admin") throw new Error("Action réservée à l'administrateur.");
}

const inviteSchema = z.object({
  email: z.string().trim().email().max(255),
  prenom: z.string().trim().min(1).max(100),
  nom: z.string().trim().min(1).max(100),
  entreprise: z.string().trim().max(150).optional().nullable(),
  categorie: z.string().trim().max(150).optional().nullable(),
  telephone: z.string().trim().max(40).optional().nullable(),
  site_web: z.string().trim().max(500).optional().nullable(),
});

export const inviteMembre = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inviteSchema.parse(data))
  .handler(async ({ data, context }) => {
    const role = await getCallerRole(context);
    assertBureau(role);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: { prenom: data.prenom, nom: data.nom },
    });
    if (error) throw new Error(error.message);
    const userId = invited.user?.id;
    if (!userId) throw new Error("Invitation envoyée mais identifiant manquant.");

    const { error: upErr } = await supabaseAdmin
      .from("membres")
      .update({
        prenom: data.prenom,
        nom: data.nom,
        entreprise: data.entreprise || null,
        categorie: data.categorie || null,
        telephone: data.telephone || null,
        site_web: data.site_web || null,
      })
      .eq("id", userId);
    if (upErr) throw new Error(upErr.message);
    return { id: userId };
  });

const updateSchema = z.object({
  id: z.string().uuid(),
  prenom: z.string().trim().min(1).max(100).optional(),
  nom: z.string().trim().min(1).max(100).optional(),
  entreprise: z.string().trim().max(150).nullable().optional(),
  categorie: z.string().trim().max(150).nullable().optional(),
  telephone: z.string().trim().max(40).nullable().optional(),
  photo_url: z.string().trim().max(500).nullable().optional(),
  site_web: z.string().trim().max(500).nullable().optional(),
});

export const updateMembre = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => updateSchema.parse(data))
  .handler(async ({ data, context }) => {
    const role = await getCallerRole(context);
    assertBureau(role);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...rest } = data;
    const { error } = await supabaseAdmin.from("membres").update(rest).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const roleStatutSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["membre", "comite_membres", "bureau", "admin"]).optional(),
  statut: z.enum(["actif", "inactif"]).optional(),
});

export const updateMembreRoleStatut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => roleStatutSchema.parse(data))
  .handler(async ({ data, context }) => {
    const callerRole = await getCallerRole(context);
    assertAdmin(callerRole);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: { role?: "membre" | "bureau" | "admin"; statut?: "actif" | "inactif" } = {};
    if (data.role) patch.role = data.role;
    if (data.statut) patch.statut = data.statut;
    if (!patch.role && !patch.statut) return { ok: true };
    const { error } = await supabaseAdmin.from("membres").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const deleteSchema = z.object({ id: z.string().uuid() });

export const deleteMembre = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => deleteSchema.parse(data))
  .handler(async ({ data, context }) => {
    const callerRole = await getCallerRole(context);
    assertAdmin(callerRole);
    if (data.id === context.userId) throw new Error("Vous ne pouvez pas vous supprimer vous-même.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
