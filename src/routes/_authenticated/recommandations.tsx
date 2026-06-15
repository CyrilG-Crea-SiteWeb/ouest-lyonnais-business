import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, hasRole } from "@/hooks/use-profile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Comments } from "@/components/Comments";
import { ExportRecos } from "@/components/ExportRecos";
import { HelpButton } from "@/components/HelpButton";
import {
  Handshake, Users2, UserPlus, Euro, Trash2, Loader2, Check, ClipboardCheck,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/recommandations")({
  head: () => ({ meta: [{ title: "Recommandations — OLB" }] }),
  component: RecosPage,
});

type RecoType = "tete_a_tete" | "reco_interne" | "reco_externe" | "merci_business";

type Reco = {
  id: number;
  type: RecoType;
  membre_id: string;
  membre_cible_id: string | null;
  contact_externe: string | null;
  montant: number | null;
  valide: boolean;
  semaine_id: number;
  created_at: string;
};

type Semaine = { id: number; date_debut: string; libelle: string };
type MembreLite = { id: string; nom: string; prenom: string; entreprise: string | null };

const TYPE_META: Record<RecoType, { label: string; short: string; icon: typeof Handshake; color: string }> = {
  tete_a_tete:    { label: "Tête-à-tête",            short: "T-à-T",   icon: Users2,    color: "bg-blue-100 text-blue-800" },
  reco_interne:   { label: "Reco interne", short: "Interne", icon: Handshake, color: "bg-emerald-100 text-emerald-800" },
  reco_externe:   { label: "Reco externe", short: "Externe", icon: UserPlus,  color: "bg-amber-100 text-amber-800" },
  merci_business: { label: "Thx U 4 Pepette", short: "Merci",   icon: Euro,      color: "bg-fuchsia-100 text-fuchsia-800" },
};

function RecosPage() {
  const { data: profile } = useProfile();
  const isBureau = hasRole(profile?.role, "bureau");
  const qc = useQueryClient();

  const { data: membres = [] } = useQuery({
    queryKey: ["membres", "lite"],
    queryFn: async (): Promise<MembreLite[]> => {
      const { data, error } = await supabase
        .from("membres")
        .select("id, nom, prenom, entreprise")
        .eq("statut", "actif")
        .order("nom");
      if (error) throw error;
      return (data ?? []) as MembreLite[];
    },
  });

  const { data: recos = [], isLoading } = useQuery({
    queryKey: ["recos", "list"],
    queryFn: async (): Promise<Reco[]> => {
      const { data, error } = await supabase
        .from("recommandations")
        .select("id, type, membre_id, membre_cible_id, contact_externe, montant, valide, semaine_id, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Reco[];
    },
  });

  const semaineIds = useMemo(() => Array.from(new Set(recos.map((r) => r.semaine_id))), [recos]);

  const { data: semainesMap = {} } = useQuery({
    queryKey: ["semaines", "byIds", semaineIds],
    enabled: semaineIds.length > 0,
    queryFn: async (): Promise<Record<number, Semaine>> => {
      const { data, error } = await supabase
        .from("semaines")
        .select("id, date_debut, libelle")
        .in("id", semaineIds);
      if (error) throw error;
      const map: Record<number, Semaine> = {};
      (data ?? []).forEach((s: any) => { map[s.id] = s as Semaine; });
      return map;
    },
  });

  const membresMap = useMemo(() => {
    const m: Record<string, MembreLite> = {};
    membres.forEach((x) => { m[x.id] = x; });
    return m;
  }, [membres]);

  // Group recos by semaine, sorted by week date desc
  const grouped = useMemo(() => {
    const groups = new Map<number, Reco[]>();
    recos.forEach((r) => {
      const arr = groups.get(r.semaine_id) ?? [];
      arr.push(r);
      groups.set(r.semaine_id, arr);
    });
    return Array.from(groups.entries())
      .map(([id, items]) => ({ id, items, semaine: semainesMap[id] }))
      .sort((a, b) => {
        const da = a.semaine?.date_debut ?? "";
        const db = b.semaine?.date_debut ?? "";
        return db.localeCompare(da);
      });
  }, [recos, semainesMap]);

  const aValider = useMemo(() => recos.filter((r) => r.type === "merci_business" && !r.valide), [recos]);

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl md:text-3xl font-bold">Recommandations</h1>
          <HelpButton title="Comment fonctionne cette page" ariaLabel="Aide Recommandations">
            <p>Choisissez le type de saisie selon votre activité :</p>
            <ul className="list-disc space-y-1 pl-5">
              <li><strong>Tête-à-tête</strong> : vous avez rencontré un membre en individuel.</li>
              <li><strong>Reco interne</strong> : vous recommandez un membre du groupe.</li>
              <li><strong>Reco externe</strong> : vous recommandez un contact hors groupe.</li>
              <li><strong>Merci pour le business</strong> : un membre vous a apporté du CA (indiquez le montant).</li>
            </ul>
            <p>
              Chaque saisie est automatiquement rattachée à la semaine en cours.
              Vous voyez l'historique de tous, mais ne modifiez que vos propres entrées.
            </p>
          </HelpButton>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Saisie rapide rattachée à la semaine en cours.
        </p>
      </header>

      {isBureau && aValider.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" />
              À valider ({aValider.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 divide-y">
            {aValider.map((r) => (
              <AValiderRow
                key={r.id}
                reco={r}
                emetteur={membresMap[r.membre_id]}
                cible={r.membre_cible_id ? membresMap[r.membre_cible_id] : undefined}
              />
            ))}
          </CardContent>
        </Card>
      )}

      <RecoForm
        membres={membres.filter((m) => m.id !== profile?.id)}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ["recos", "list"] });
        }}
      />

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Historique</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : grouped.length === 0 ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">Aucune recommandation.</CardContent></Card>
        ) : (
          grouped.map((g) => (
            <Card key={g.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-primary">
                  {g.semaine?.libelle ?? `Semaine #${g.id}`}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 divide-y">
                {g.items.map((r) => (
                  <RecoRow
                    key={r.id}
                    reco={r}
                    emetteur={membresMap[r.membre_id]}
                    cible={r.membre_cible_id ? membresMap[r.membre_cible_id] : undefined}
                    canEdit={isBureau || r.membre_id === profile?.id}
                  />
                ))}
              </CardContent>
            </Card>
          ))
        )}
      </section>

      {isBureau && <ExportRecos />}
    </div>
  );
}

function RecoForm({ membres, onCreated }: { membres: MembreLite[]; onCreated: () => void }) {
  const { data: profile } = useProfile();
  const [type, setType] = useState<RecoType>("tete_a_tete");
  const [membreCible, setMembreCible] = useState<string>("");
  const [contactExterne, setContactExterne] = useState("");
  const [montant, setMontant] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("Profil non chargé");
      const { data: semaineId, error: semErr } = await supabase.rpc("get_or_create_semaine");
      if (semErr) throw semErr;

      const payload: any = {
        type,
        membre_id: profile.id,
        semaine_id: semaineId,
      };
      if (type === "reco_externe") {
        if (!contactExterne.trim()) throw new Error("Nom du contact externe requis");
        payload.contact_externe = contactExterne.trim();
      } else {
        if (!membreCible) throw new Error("Sélectionnez un membre");
        payload.membre_cible_id = membreCible;
      }
      if (type === "merci_business") {
        const m = Number(montant.replace(",", "."));
        if (!isFinite(m) || m <= 0) throw new Error("Montant invalide");
        payload.montant = m;
      }
      const { error } = await supabase.from("recommandations").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Recommandation enregistrée");
      setMembreCible("");
      setContactExterne("");
      setMontant("");
      onCreated();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const needsMembre = type !== "reco_externe";
  const needsMontant = type === "merci_business";
  const membreLabel =
    type === "tete_a_tete" ? "Membre rencontré" :
    type === "reco_interne" ? "Membre destinataire" :
    "Membre émetteur";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Nouvelle saisie</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(TYPE_META) as RecoType[]).map((t) => {
              const meta = TYPE_META[t];
              const Icon = meta.icon;
              const active = type === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={
                    "flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition-colors " +
                    (active
                      ? "border-primary bg-primary/10 text-primary font-semibold"
                      : "border-input hover:bg-accent")
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{meta.label}</span>
                  {active && <Check className="h-4 w-4 ml-auto shrink-0" />}
                </button>
              );
            })}
          </div>

          {needsMembre && (
            <div className="space-y-1.5">
              <Label>{membreLabel}</Label>
              <Select value={membreCible} onValueChange={setMembreCible}>
                <SelectTrigger><SelectValue placeholder="Choisir un membre…" /></SelectTrigger>
                <SelectContent>
                  {membres.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.prenom} {m.nom}{m.entreprise ? ` — ${m.entreprise}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {type === "reco_externe" && (
            <div className="space-y-1.5">
              <Label htmlFor="contact">Nom du contact</Label>
              <Input
                id="contact"
                value={contactExterne}
                onChange={(e) => setContactExterne(e.target.value)}
                placeholder="Prénom Nom / Société"
                maxLength={200}
              />
            </div>
          )}

          {needsMontant && (
            <div className="space-y-1.5">
              <Label htmlFor="montant">Montant (€)</Label>
              <Input
                id="montant"
                inputMode="decimal"
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
                placeholder="0,00"
              />
            </div>
          )}

          <Button type="submit" className="w-full h-11" disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function RecoRow({
  reco, emetteur, cible, canEdit,
}: {
  reco: Reco;
  emetteur?: MembreLite;
  cible?: MembreLite;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const meta = TYPE_META[reco.type];
  const Icon = meta.icon;
  const emName = emetteur ? `${emetteur.prenom} ${emetteur.nom}` : "—";
  const cibleName = cible ? `${cible.prenom} ${cible.nom}` : reco.contact_externe ?? "—";

  const description =
    reco.type === "tete_a_tete" ? `${emName} ↔ ${cibleName}` :
    reco.type === "reco_interne" ? `${emName} → ${cibleName}` :
    reco.type === "reco_externe" ? `${emName} → ${cibleName} (externe)` :
    `${cibleName} → ${emName}`; // merci : emetteur du remerciement est membre_id, le membre cible a apporté le business

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("recommandations").delete().eq("id", reco.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Supprimé");
      qc.invalidateQueries({ queryKey: ["recos", "list"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  return (
    <div className="py-3 border-b last:border-b-0">
      <div className="flex items-center gap-3">
        <div className={"h-8 w-8 rounded-md flex items-center justify-center shrink-0 " + meta.color}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[10px]">{meta.short}</Badge>
            {reco.montant != null && (
              <Badge className="text-[10px]">
                {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(reco.montant))}
              </Badge>
            )}
          </div>
          <p className="text-sm mt-0.5 truncate">{description}</p>
        </div>
        {canEdit && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Supprimer cette recommandation ?</AlertDialogTitle>
                <AlertDialogDescription>Cette action est définitive.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => del.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Supprimer
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
      <Comments typeContenu="recommandation" contenuId={reco.id} />
    </div>
  );
}

function AValiderRow({
  reco,
  emetteur,
  cible,
}: {
  reco: Reco;
  emetteur?: MembreLite;
  cible?: MembreLite;
}) {
  const qc = useQueryClient();
  const emName = emetteur ? `${emetteur.prenom} ${emetteur.nom}` : "—";
  const cibleName = cible ? `${cible.prenom} ${cible.nom}` : "—";

  const validate = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("recommandations")
        .update({ valide: true })
        .eq("id", reco.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Montant validé");
      qc.invalidateQueries({ queryKey: ["recos", "list"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  return (
    <div className="flex items-center gap-3 py-3">
      <div className="h-8 w-8 rounded-md flex items-center justify-center shrink-0 bg-fuchsia-100 text-fuchsia-800">
        <Euro className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[10px]">Merci</Badge>
          {reco.montant != null && (
            <Badge className="text-[10px]">
              {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(reco.montant))}
            </Badge>
          )}
        </div>
        <p className="text-sm mt-0.5 truncate">{cibleName} → {emName}</p>
      </div>
      <Button
        size="sm"
        disabled={validate.isPending}
        onClick={() => validate.mutate()}
      >
        {validate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Valider"}
      </Button>
    </div>
  );
}
