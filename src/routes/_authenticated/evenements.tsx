import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/evenements")({
  head: () => ({ meta: [{ title: "Événements — OLB" }] }),
  component: () => (
    <div className="space-y-6">
      <h1 className="text-2xl md:text-3xl font-bold">Événements</h1>
      <Card><CardContent className="p-6 text-sm text-muted-foreground">Calendrier des événements à venir.</CardContent></Card>
    </div>
  ),
});
