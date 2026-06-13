import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/recommandations")({
  head: () => ({ meta: [{ title: "Recommandations — OLB" }] }),
  component: () => (
    <div className="space-y-6">
      <h1 className="text-2xl md:text-3xl font-bold">Recommandations</h1>
      <Card><CardContent className="p-6 text-sm text-muted-foreground">Saisie et suivi des recommandations à venir.</CardContent></Card>
    </div>
  ),
});
