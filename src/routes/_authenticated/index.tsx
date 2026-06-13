import { createFileRoute } from "@tanstack/react-router";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Users, HandshakeIcon, Vote, CalendarDays } from "lucide-react";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Tableau de bord — OLB" }] }),
  component: Dashboard,
});

const STATS = [
  { label: "Membres actifs", value: "—", icon: Users },
  { label: "Recommandations", value: "—", icon: HandshakeIcon },
  { label: "Sondages en cours", value: "—", icon: Vote },
  { label: "Prochains événements", value: "—", icon: CalendarDays },
];

function Dashboard() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Tableau de bord</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Bienvenue dans l'espace Ouest Lyonnais Business.
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {STATS.map(({ label, value, icon: Icon }) => (
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
          <CardTitle>Prochaine réunion</CardTitle>
          <CardDescription>Jeudi matin — 7h00</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Les modules Membres, Recommandations, Sondages et Événements seront ajoutés progressivement.
        </CardContent>
      </Card>
    </div>
  );
}
