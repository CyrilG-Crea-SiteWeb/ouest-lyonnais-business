// Edge Function OLB — send-push
// Reçoit { typeContenu, contenuId, titre, membreIds }, récupère les
// abonnements push de ces membres et envoie une notification à chacun.
// Déployée sur Lovable Cloud (Supabase Edge Functions, runtime Deno).

import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:contact@olb.fr";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

// Vers quelle page de l'app le clic doit ouvrir.
function lienVers(typeContenu: string, contenuId: number): string {
  switch (typeContenu) {
    case "rappel":
    case "recommandation":
      return `/recommandations`;
    case "demande":
      return `/demandes/${contenuId}`;
    case "evenement":
      return `/evenements`;
    case "sondage":
      return `/sondages`;
    default:
      return `/`;
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { typeContenu, contenuId, titre, membreIds } = await req.json();

    if (!Array.isArray(membreIds) || membreIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, envoyes: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Client admin (service_role) : contourne la RLS pour lire les
    // abonnements de TOUS les destinataires.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: subs, error } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth, membre_id")
      .in("membre_id", membreIds);

    if (error) throw error;
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ ok: true, envoyes: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.stringify({
      titre: "OLB",
      corps: titre,
      url: lienVers(typeContenu, contenuId),
      tag: `${typeContenu}-${contenuId}`,
    });

    let envoyes = 0;
    const aSupprimer: string[] = [];

    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: s.endpoint,
              keys: { p256dh: s.p256dh, auth: s.auth },
            },
            payload,
          );
          envoyes++;
        } catch (e: unknown) {
          // 404/410 = abonnement expiré : on le marque pour nettoyage.
          const status = (e as { statusCode?: number })?.statusCode;
          if (status === 404 || status === 410) {
            aSupprimer.push(s.endpoint);
          } else {
            console.error("[send-push] échec envoi:", status, e);
          }
        }
      }),
    );

    // Nettoyage des abonnements morts.
    if (aSupprimer.length > 0) {
      await admin
        .from("push_subscriptions")
        .delete()
        .in("endpoint", aSupprimer);
    }

    return new Response(
      JSON.stringify({ ok: true, envoyes, nettoyes: aSupprimer.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[send-push] erreur:", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});