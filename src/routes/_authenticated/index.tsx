import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Users, HandshakeIcon, Vote, CalendarDays, Euro } from "lucide-react";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Tableau de bord — OLB" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data: membresCount } = useQuery({
    queryKey: ["stats", "membres-actifs"],
    queryFn: async () => {
      const { count, error } = await supabase.from("membres").select("*", { count: "exact", head: true }).eq("statut", "actif");
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: recosCount } = useQuery({
    queryKey: ["stats", "recos"],
    queryFn: async () => {
      const { count, error } = await supabase.from("recommandations").select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: sondagesCount } = useQuery({
    queryKey: ["stats", "sondages-ouverts"],
    queryFn: async () => {
      const { count, error } = await supabase.from("sondages").select("*", { count: "exact", head: true }).eq("statut", "ouvert");
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: eventsCount } = useQuery({
    queryKey: ["stats", "evenements-futurs"],
    queryFn: async () => {
      const { count, error } = await supabase.from("evenements").select("*", { count: "exact", head: true }).gte("date_event", new Date().toISOString().split("T")[0]);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: caValide } = useQuery({
    queryKey: ["stats", "ca-valide"],
    queryFn: async () => {
      const { data, error } = await supabase.from("recommandations").select("montant").eq("type", "merci_business").eq("valide", true);
      if (error) throw error;
      return (data ?? []).reduce((sum: number, r: any) => sum + (Number(r.montant) || 0), 0);
    },
  });

  const stats = [
    { label: "Membres actifs", value: membresCount ?? "—", icon: Users },
    { label: "Recommandations", value: recosCount ?? "—", icon: HandshakeIcon },
    { label: "Sondages en cours", value: sondagesCount ?? "—", icon: Vote },
    { label: "Prochains événements", value: eventsCount ?? "—", icon: CalendarDays },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Tableau de bord</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Bienvenue dans l'espace Ouest Lyonnais Business.
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs md:text-sm text-muted-foreground">{label}</span>
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Euro className="h-5 w-5 text-primary" />
            Chiffre d'affaires validé
          </CardTitle>
          <CardDescription>Montants "Merci pour le business" validés uniquement</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-foreground">
            {caValide != null
              ? new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(caValide)
              : "—"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
