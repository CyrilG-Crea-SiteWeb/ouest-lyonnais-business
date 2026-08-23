import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, HandshakeIcon, Euro, Coffee, Mic } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Comments } from "@/components/Comments";
import { titreConference } from "@/lib/conferences";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { useProfile } from "@/hooks/use-profile";

const TEAL = "#006875";
const ORANGE = "#F6A000";

/**
 * Compte les tête-à-tête en pondérant par le nombre de participants :
 * un T-à-T déclaré avec 3 membres compte pour 3.
 * Les anciennes saisies sans participant enregistré comptent pour 1.
 */
async function compterTeteATete(recos: { id: number; type: string }[]) {
  const ids = recos.filter((r) => r.type === "tete_a_tete").map((r) => r.id);
  if (ids.length === 0) return 0;
  const { data, error } = await supabase
    .from("reco_participants")
    .select("recommandation_id")
    .in("recommandation_id", ids);
  if (error) throw error;
  const comptes = new Map<number, number>();
  (data ?? []).forEach((row: any) => {
    comptes.set(row.recommandation_id, (comptes.get(row.recommandation_id) ?? 0) + 1);
  });
  return ids.reduce((somme, id) => somme + Math.max(1, comptes.get(id) ?? 0), 0);
}

const euros = (n: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Tableau de bord — OLB" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data: profile } = useProfile();

  // Conférences à venir (carrousel en tête de page), triées par date croissante.
  const { data: prochainesConfs } = useQuery({
    queryKey: ["dashboard", "prochaines-conferences"],
    queryFn: async () => {
      // est_conference / conference_intervenants pas encore dans les types
      // générés → cast minimal (à régénérer côté Lovable).
      const { data: evs, error } = await (supabase as any)
        .from("evenements")
        .select("id, date_event")
        .eq("est_conference", true)
        .gte("date_event", new Date().toISOString())
        .order("date_event", { ascending: true });
      if (error) throw error;
      if (!evs?.length) return [] as { id: number; date_event: string; noms: string[] }[];

      const ids = evs.map((e: any) => e.id);
      const { data: ci, error: e2 } = await (supabase as any)
        .from("conference_intervenants")
        .select("evenement_id, membres(prenom, nom)")
        .in("evenement_id", ids);
      if (e2) throw e2;

      const nomsByEv = new Map<number, string[]>();
      (ci ?? []).forEach((row: any) => {
        if (!row.membres) return;
        const arr = nomsByEv.get(row.evenement_id) ?? [];
        arr.push(`${row.membres.prenom} ${row.membres.nom}`);
        nomsByEv.set(row.evenement_id, arr);
      });

      return evs.map((e: any) => ({
        id: e.id as number,
        date_event: e.date_event as string,
        noms: nomsByEv.get(e.id) ?? [],
      }));
    },
    staleTime: 60_000,
  });

  // Semaine en cours
  const { data: semaineId } = useQuery({
    queryKey: ["semaine", "courante"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_or_create_semaine");
      if (error) throw error;
      return data as number;
    },
  });

  const { data: semaineCourante } = useQuery({
    enabled: !!semaineId,
    queryKey: ["semaine", "info", semaineId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("semaines")
        .select("libelle")
        .eq("id", semaineId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Recos de la semaine courante (pour KPI groupe)
  const { data: recosSemaine } = useQuery({
    enabled: !!semaineId,
    queryKey: ["dashboard", "recos-semaine", semaineId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recommandations")
        .select("id, type, montant, valide")
        .eq("semaine_id", semaineId!);
      if (error) throw error;
      const rows = data ?? [];
      return { rows, nbTeteATete: await compterTeteATete(rows) };
    },
  });

  // Semaine en cours + semaine précédente (2 lignes les plus récentes déjà passées).
  const { data: deuxSemaines } = useQuery({
    queryKey: ["dashboard", "deux-dernieres-semaines"],
    queryFn: async () => {
      const aujourdHui = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("semaines")
        .select("id, date_debut, libelle")
        .lte("date_debut", aujourdHui)
        .order("date_debut", { ascending: false })
        .limit(2);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  // Recos reçues par le membre connecté : il est la cible de la recommandation.
  const semainesIds = (deuxSemaines ?? []).map((s) => s.id);

  const { data: mesRecosRecues, isLoading: recosRecuesLoading } = useQuery({
    enabled: !!profile?.id && semainesIds.length > 0,
    queryKey: ["dashboard", "recos-recues", profile?.id, semainesIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recommandations")
        .select(
          `id, type, membre_id, contact_externe, notes, montant, semaine_id, created_at,
           emetteur:membres!recommandations_membre_id_fkey (prenom, nom, photo_url, entreprise),
           semaines ( libelle )`,
        )
        .eq("membre_cible_id", profile!.id)
        .in("type", ["reco_interne", "reco_externe", "merci_business"])
        .in("semaine_id", semainesIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Exclusion des auto-recos : notes === "auto_reco" signifie que l'émetteur
      // s'est recommandé LUI-MÊME auprès du membre connecté — ce n'est donc pas
      // une reco reçue.
      return (data ?? []).filter(
        (r: any) => !(r.type === "reco_interne" && r.notes === "auto_reco"),
      );
    },
  });

  const nbTeteATete = recosSemaine?.nbTeteATete ?? 0;
  const nbRecos =
    recosSemaine?.rows.filter((r: any) => r.type === "reco_interne" || r.type === "reco_externe")
      .length ?? 0;
  const caValide =
    recosSemaine?.rows
      .filter((r: any) => r.type === "merci_business" && r.valide)
      .reduce((s: number, r: any) => s + Number(r.montant ?? 0), 0) ?? 0;

  // Evolution par année OLB (juin -> juin), regroupée par mois
  const { data: evolution } = useQuery({
    queryKey: ["dashboard", "evolution-annee"],
    queryFn: async () => {
      // Bornes de l'année OLB en cours : 1er juin -> 1er juin suivant
      const now = new Date();
      const anneeDebut = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
      const debut = `${anneeDebut}-06-01`;
      const fin = `${anneeDebut + 1}-06-01`;

      // Semaines de l'année OLB
      const { data: semaines, error: e1 } = await supabase
        .from("semaines")
        .select("id, date_debut")
        .gte("date_debut", debut)
        .lt("date_debut", fin)
        .order("date_debut", { ascending: true });
      if (e1) throw e1;
      const ids = (semaines ?? []).map((s) => s.id);

      // 12 mois de juin à mai (libellés FR courts)
      const moisOrdre = [5, 6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4];
      const moisLabels = [
        "Juin",
        "Juil",
        "Août",
        "Sept",
        "Oct",
        "Nov",
        "Déc",
        "Janv",
        "Févr",
        "Mars",
        "Avr",
        "Mai",
      ];
      const buckets = moisOrdre.map((m, i) => ({
        mois: moisLabels[i],
        moisNum: m,
        recommandations: 0,
        ca: 0,
      }));

      if (!ids.length) return buckets;

      const { data: recos, error: e2 } = await supabase
        .from("recommandations")
        .select("type, montant, valide, semaine_id")
        .in("semaine_id", ids);
      if (e2) throw e2;

      const moisParSemaine = new Map<number, number>();
      (semaines ?? []).forEach((s) => {
        moisParSemaine.set(s.id, new Date(s.date_debut as string).getMonth());
      });

      (recos ?? []).forEach((r: any) => {
        const moisNum = moisParSemaine.get(r.semaine_id);
        if (moisNum === undefined) return;
        const b = buckets.find((x) => x.moisNum === moisNum);
        if (!b) return;
        if (r.type === "reco_interne" || r.type === "reco_externe") {
          b.recommandations += 1;
        } else if (r.type === "merci_business" && r.valide) {
          b.ca += Number(r.montant ?? 0);
        }
      });

      return buckets;
    },
  });

  // Liste membres pour vue individuelle
  const { data: membres } = useQuery({
    queryKey: ["dashboard", "membres-lite"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("membres")
        .select("id, nom, prenom, photo_url, entreprise")
        .eq("statut", "actif")
        .order("prenom", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const [selectedMembre, setSelectedMembre] = useState<string | undefined>();
  const membreId = selectedMembre ?? profile?.id;

  const { data: statsIndiv } = useQuery({
    enabled: !!membreId,
    queryKey: ["dashboard", "indiv", membreId],
    queryFn: async () => {
      // Recos données
      const { data: donnees, error: e1 } = await supabase
        .from("recommandations")
        .select("id, type, montant, valide")
        .eq("membre_id", membreId!);
      if (e1) throw e1;
      // Recos reçues (en tant que cible)
      const { data: recues, error: e2 } = await supabase
        .from("recommandations")
        .select("type, montant, valide")
        .eq("membre_cible_id", membreId!);
      if (e2) throw e2;
      const recosDonnees = donnees.filter(
        (r: any) => r.type === "reco_interne" || r.type === "reco_externe",
      ).length;
      const recosRecues = recues.filter((r: any) => r.type === "reco_interne").length;
      const teteATete = await compterTeteATete(donnees as any);
      // CA apporté AUX autres = "merci_business" validés où le membre a apporté
      // le business, c.-à-d. où il est la cible du remerciement (membre_cible_id → recues).
      const caApporte = recues
        .filter((r: any) => r.type === "merci_business" && r.valide)
        .reduce((s: number, r: any) => s + Number(r.montant ?? 0), 0);
      // CA perçu PAR le membre = "merci_business" validés où il est l'auteur du
      // remerciement, c.-à-d. celui qui a reçu le business (membre_id → donnees).
      const caPercu = donnees
        .filter((r: any) => r.type === "merci_business" && r.valide)
        .reduce((s: number, r: any) => s + Number(r.montant ?? 0), 0);
      return { recosDonnees, recosRecues, teteATete, caApporte, caPercu };
    },
  });

  const { data: tauxPresence } = useQuery({
    enabled: !!membreId,
    queryKey: ["dashboard", "taux-presence", membreId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_taux_presence_membre")
        .select("taux_presence, nb_present, nb_reunions_dues")
        .eq("membre_id", membreId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const stats = [
    { label: "Tête-à-tête (semaine)", value: nbTeteATete, icon: Coffee },
    { label: "Recos (semaine)", value: nbRecos, icon: HandshakeIcon },
    { label: "CA (semaine)", value: euros(caValide), icon: Euro },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Tableau de bord</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {semaineCourante?.libelle ?? "Semaine OLB en cours"} — indicateurs du groupe.
        </p>
      </header>

      {/* Prochaines conférences — carrousel, masqué s'il n'y en a aucune à venir. */}
      {prochainesConfs && prochainesConfs.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold" style={{ color: TEAL }}>
              <Mic className="h-5 w-5" style={{ color: TEAL }} />
              Prochaines conférences
            </h2>
          </div>
          <Carousel opts={{ align: "start" }} className="w-full">
            <CarouselContent>
              {prochainesConfs.map((conf: { id: number; date_event: string; noms: string[] }) => (
                <CarouselItem key={conf.id} className="sm:basis-1/2 lg:basis-1/3">
                  <Card style={{ borderColor: TEAL }} className="h-full bg-[#006875]/5">
                    <CardContent className="flex h-full items-center p-4">
                      <p className="text-sm font-medium">
                        {titreConference(conf.date_event, conf.noms)}
                      </p>
                    </CardContent>
                  </Card>
                </CarouselItem>
              ))}
            </CarouselContent>
            {prochainesConfs.length > 1 && (
              <div className="mt-3 flex justify-end gap-2">
                <CarouselPrevious className="static translate-y-0" />
                <CarouselNext className="static translate-y-0" />
              </div>
            )}
          </Carousel>
        </section>
      )}

      {/* KPIs semaine */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs md:text-sm text-muted-foreground">{label}</span>
                <Icon className="h-4 w-4" style={{ color: TEAL }} />
              </div>
              <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recos reçues */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HandshakeIcon className="h-5 w-5" style={{ color: TEAL }} />
            Recos
          </CardTitle>
          <CardDescription>
            Ce que vous avez reçu sur les deux dernières semaines OLB
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {recosRecuesLoading ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">Chargement…</p>
          ) : !mesRecosRecues?.length ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              Aucune reco reçue sur les deux dernières semaines.
            </p>
          ) : (
            <ul className="divide-y">
              {mesRecosRecues.map((r: any) => (
                <li key={r.id} className="px-4 py-3">
                  <RecoRecueRow reco={r} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Vue individuelle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" style={{ color: TEAL }} />
            Vue individuelle
          </CardTitle>
          <CardDescription>Activité cumulée d'un membre</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={membreId} onValueChange={setSelectedMembre}>
            <SelectTrigger className="w-full md:w-80">
              <SelectValue placeholder="Sélectionner un membre" />
            </SelectTrigger>
            <SelectContent>
              {(membres ?? []).map((m: any) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.prenom} {m.nom}
                  {m.entreprise ? ` — ${m.entreprise}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {membreId && statsIndiv && (
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="Recos données" value={statsIndiv.recosDonnees} color={TEAL} />
              <MiniStat label="Recos reçues" value={statsIndiv.recosRecues} color={TEAL} />
              <MiniStat label="Tête-à-tête" value={statsIndiv.teteATete} color={TEAL} />
              <MiniStat
                label="Taux de présence"
                value={
                  tauxPresence?.taux_presence != null
                    ? `${Math.round(tauxPresence.taux_presence * 100)} %`
                    : "—"
                }
                color={TEAL}
              />
              <MiniStat label="CA perçu" value={euros(statsIndiv.caPercu)} color={ORANGE} />
              <MiniStat label="CA apporté" value={euros(statsIndiv.caApporte)} color={ORANGE} />
            </div>
          )}

          {membreId && <MembreHeader membreId={membreId} membres={membres ?? []} />}
        </CardContent>
      </Card>

      {/* Évolution */}
      <Card>
        <CardHeader>
          <CardTitle>Évolution sur l'année OLB</CardTitle>
          <CardDescription>De juin à mai — recommandations et CA par mois</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={evolution ?? []} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke={TEAL} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  stroke={ORANGE}
                  tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                />
                <Tooltip
                  formatter={(value: any, name: string) =>
                    name === "CA (€)" ? euros(Number(value)) : value
                  }
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="recommandations"
                  name="Recommandations"
                  stroke={TEAL}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="ca"
                  name="CA (€)"
                  stroke={ORANGE}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MiniStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

function MembreHeader({ membreId, membres }: { membreId: string; membres: any[] }) {
  const m = membres.find((x) => x.id === membreId);
  if (!m) return null;
  const initials = `${(m.prenom?.[0] ?? "").toUpperCase()}${(m.nom?.[0] ?? "").toUpperCase()}`;
  return (
    <div className="flex items-center gap-3 pt-2 border-t">
      <Avatar className="h-10 w-10">
        {m.photo_url ? <AvatarImage src={m.photo_url} alt="" /> : null}
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">
          {m.prenom} {m.nom}
        </p>
        {m.entreprise && <p className="text-xs text-muted-foreground truncate">{m.entreprise}</p>}
      </div>
    </div>
  );
}

function RecoRecueRow({ reco }: { reco: any }) {
  const e = reco.emetteur;
  const nomComplet = e ? `${e.prenom ?? ""} ${e.nom ?? ""}`.trim() : "Membre";
  const initials = `${(e?.prenom?.[0] ?? "").toUpperCase()}${(e?.nom?.[0] ?? "").toUpperCase()}`;
  const typeLabel =
    reco.type === "reco_interne"
      ? "Interne"
      : reco.type === "reco_externe"
        ? "Externe"
        : "Merci";
  const dateAffichee = new Intl.DateTimeFormat("fr-FR").format(new Date(reco.created_at));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10">
          {e?.photo_url ? <AvatarImage src={e.photo_url} alt="" /> : null}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">{nomComplet}</p>
            <Badge variant="outline" className="text-[10px]">
              {typeLabel}
            </Badge>
          </div>
          {e?.entreprise && (
            <p className="text-xs text-muted-foreground truncate">{e.entreprise}</p>
          )}
        </div>
        {reco.type === "merci_business" && (
          <Badge className="whitespace-nowrap">{euros(Number(reco.montant ?? 0))}</Badge>
        )}
      </div>

      {reco.type === "reco_externe" && reco.contact_externe && (
        <p className="text-sm">Contact : {reco.contact_externe}</p>
      )}

      {reco.type === "merci_business" && (
        <p className="text-sm">{nomComplet} vous remercie pour le business apporté</p>
      )}

      {reco.notes && reco.notes !== "auto_reco" && (
        <p className="text-sm text-foreground">{reco.notes}</p>
      )}

      <p className="text-xs text-muted-foreground">
        {reco.semaines?.libelle ? `${reco.semaines.libelle} · ` : ""}
        {dateAffichee}
      </p>

      <Comments typeContenu="recommandation" contenuId={reco.id} />
    </div>
  );
}
