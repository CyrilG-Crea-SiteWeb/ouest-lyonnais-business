import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/membres")({
  head: () => ({ meta: [{ title: "Membres — OLB" }] }),
  component: () => (
    <div className="space-y-6">
      <h1 className="text-2xl md:text-3xl font-bold">Membres</h1>
      <Card><CardContent className="p-6 text-sm text-muted-foreground">Liste des membres à venir.</CardContent></Card>
    </div>
  ),
});
