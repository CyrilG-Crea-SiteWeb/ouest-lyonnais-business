import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Mail, Phone, Building2, Tag, Plus, Trash2, Search, CalendarPlus,
  UserPlus, User, AlertTriangle, Pencil, ChevronDown,
} from "lucide-react";
import { convertirInvite } from "@/lib/invites.functions";
import { useServerFn } from "@tanstack/react-start";
import { useProfile, type Membre } from "@/hooks/use-profile";

export const Route = createFileRoute("/_authenticated/invites")({
  head: () => ({ meta: [{ title: "Invités — OLB" }] }),
  beforeLoad: async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw redirect({ to: "/auth" });
  },
  component: InvitesPage,
});

type Invite = {
  id: number;
  nom: string;
  prenom: string;
  email: string;
  telephone: string | null;
  entreprise: string | null;
  categorie: string | null;
  notes: string | null;
  statut_conversion: string;
  cree_par: string | null;
};

type Presence = { id: number; invite_id: number; date_reunion: string };

type MembreActif = { id: string; prenom: string; nom: string };

const ROLES_GESTIONNAIRES: Membre["role"][] = ["comite_membres", "bureau", "admin"];

function estGestionnaire(role: Membre["role"] | undefined) {
  return !!role && ROLES_GESTIONNAIRES.includes(role);
}

function InvitesPage() {
  const [search, setSearch] = useState("");

  const { data: invites = [], isLoading } = useQuery({
    queryKey: ["invites", "list"],
    queryFn: async (): Promise<Invite[]> => {
      const { data, error } = await supabase
        .from("invites")
        .select("id, nom, prenom, email, telephone, entreprise, categorie, notes, statut_conversion, cree_par")
        .order("nom", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Invite[];
    },
  });

  const { data: presences = [] } = useQuery({
    queryKey: ["invites", "presences"],
    queryFn: async (): Promise<Presence[]> => {
      const { data, error } = await supabase
        .from("invites_presences")
        .select("id, invite_id, date_reunion")
        .order("date_reunion", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Presence[];
    },
  });

  const { data: membresActifs = [] } = useQuery({
    queryKey: ["membres", "actifs-liste"],
    queryFn: async (): Promise<MembreActif[]> => {
      const { data, error } = await supabase
        .from("membres")
        .select("id, prenom, nom")
        .eq("statut", "actif")
        .order("nom");
      if (error) throw error;
      return (data ?? []) as MembreActif[];
    },
  });

  const nomsMembres = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of membresActifs) map.set(m.id, `${m.prenom} ${m.nom}`);
    return map;
  }, [membresActifs]);

  const presencesParInvite = useMemo(() => {
    const map = new Map<number, Presence[]>();
    for (const p of presences) {
      const arr = map.get(p.invite_id) ?? [];
      arr.push(p);
      map.set(p.invite_id, arr);
    }
    return map;
  }, [presences]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return invites;
    return invites.filter((i) =>
      [i.nom, i.prenom, i.entreprise, i.categorie]
        .filter(Boolean).join(" ").toLowerCase().includes(q),
    );
  }, [invites, search]);

  const { actifs, anciens, membres } = useMemo(() => {
    const actifs: Invite[] = [];
    const anciens: Invite[] = [];
    const membres: Invite[] = [];
    for (const inv of filtered) {
      const nb = (presencesParInvite.get(inv.id) ?? []).length;
      if (inv.statut_conversion === "accepte") {
        membres.push(inv);
      } else if (inv.statut_conversion === "converti") {
        actifs.push(inv);
      } else if (nb >= 2) {
        anciens.push(inv);
      } else {
        actifs.push(inv);
      }
    }
    return { actifs, anciens, membres };
  }, [filtered, presencesParInvite]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Invités</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {invites.length} fiche{invites.length > 1 ? "s" : ""} · 2 réunions gratuites maximum
          </p>
        </div>
        <AddInviteDialog membresActifs={membresActifs} />
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par nom, entreprise ou catégorie…"
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : (
        <div className="space-y-6">
          {actifs.length === 0 ? (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">Aucun invité actif.</CardContent></Card>
          ) : (
            <Grille invites={actifs} presencesParInvite={presencesParInvite} nomsMembres={nomsMembres} />
          )}

          {anciens.length > 0 && (
            <SectionRepliable
              titre={`Anciens invités (${anciens.length})`}
              sousTitre="2 réunions gratuites effectuées, sans candidature"
            >
              <Grille invites={anciens} presencesParInvite={presencesParInvite} nomsMembres={nomsMembres} />
            </SectionRepliable>
          )}

          {membres.length > 0 && (
            <SectionRepliable
              titre={`Anciens invités devenus membres (${membres.length})`}
              sousTitre="Invitation acceptée, compte activé"
            >
              <Grille invites={membres} presencesParInvite={presencesParInvite} nomsMembres={nomsMembres} />
            </SectionRepliable>
          )}
        </div>
      )}
    </div>
  );
}

function SectionRepliable({
  titre, sousTitre, children,
}: { titre: string; sousTitre: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full rounded-lg border border-border bg-muted/40 px-4 py-3 text-left hover:bg-muted/60 transition-colors">
        <div>
          <p className="font-semibold">{titre}</p>
          <p className="text-xs text-muted-foreground">{sousTitre}</p>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function Grille({
  invites, presencesParInvite, nomsMembres,
}: {
  invites: Invite[];
  presencesParInvite: Map<number, Presence[]>;
  nomsMembres: Map<string, string>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {invites.map((inv) => (
        <InviteCard
          key={inv.id}
          invite={inv}
          presences={presencesParInvite.get(inv.id) ?? []}
          nomsMembres={nomsMembres}
        />
      ))}
    </div>
  );
}

function InviteCard({
  invite, presences, nomsMembres,
}: { invite: Invite; presences: Presence[]; nomsMembres: Map<string, string> }) {
  const { data: profil } = useProfile();
  const nb = presences.length;
  const complet = nb >= 2;
  const converti = invite.statut_conversion === "converti";
  const accepte = invite.statut_conversion === "accepte";
  const peutGerer =
    estGestionnaire(profil?.role) || (!!invite.cree_par && invite.cree_par === profil?.id);
  const ajoutePar = invite.cree_par ? (nomsMembres.get(invite.cree_par) ?? "—") : "—";

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold truncate">{invite.prenom} {invite.nom}</p>
            {invite.entreprise && (
              <p className="text-sm text-muted-foreground flex items-center gap-1 truncate">
                <Building2 className="h-3.5 w-3.5 shrink-0" /> {invite.entreprise}
              </p>
            )}
          </div>
          {accepte ? (
            <Badge className="bg-green-600 text-white shrink-0">Invitation acceptée</Badge>
          ) : converti ? (
            <Badge className="bg-[#F6A000] text-white shrink-0">Invitation envoyée</Badge>
          ) : (
            <Badge
              className={complet ? "bg-red-600 text-white shrink-0" : "bg-[#006875] text-white shrink-0"}
            >
              {nb}/2 réunion{nb > 1 ? "s" : ""}
            </Badge>
          )}
        </div>

        {invite.categorie && (
          <p className="text-sm flex items-center gap-1 text-muted-foreground">
            <Tag className="h-3.5 w-3.5 shrink-0" /> {invite.categorie}
          </p>
        )}
        <div className="text-sm space-y-1">
          <a href={`mailto:${invite.email}`} className="flex items-center gap-1 text-[#006875] hover:underline truncate">
            <Mail className="h-3.5 w-3.5 shrink-0" /> {invite.email}
          </a>
          {invite.telephone && (
            <a href={`tel:${invite.telephone}`} className="flex items-center gap-1 text-[#006875] hover:underline">
              <Phone className="h-3.5 w-3.5 shrink-0" /> {invite.telephone}
            </a>
          )}
        </div>

        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <User className="h-3.5 w-3.5 shrink-0" /> Ajouté par : {ajoutePar}
        </p>

        {presences.length > 0 && (
          <div className="text-xs text-muted-foreground">
            Présences :{" "}
            {presences
              .map((p) => new Date(p.date_reunion).toLocaleDateString("fr-FR"))
              .join(", ")}
          </div>
        )}

        {peutGerer && (
          <div className="flex flex-wrap gap-2 pt-1">
            {!converti && !accepte && (
              <>
                <PresenceDialog invite={invite} nb={nb} />
                <ConvertDialog invite={invite} />
              </>
            )}
            <EditInviteDialog invite={invite} />
            <DeleteInvite invite={invite} />
          </div>
        )}

        {converti && (
          <p className="text-xs text-muted-foreground">
            En attente d'activation du compte par l'invité.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

const CHAMPS_VIDES = {
  prenom: "", nom: "", email: "", telephone: "", entreprise: "", categorie: "",
};

function useCategorieAlerte() {
  const [alerte, setAlerte] = useState<string | null>(null);
  async function check(cat: string) {
    setAlerte(null);
    const c = cat.trim();
    if (!c) return;
    const { data } = await supabase
      .from("membres")
      .select("prenom, nom")
      .eq("statut", "actif")
      .ilike("categorie", c)
      .maybeSingle();
    if (data) {
      setAlerte(`Catégorie déjà occupée par ${data.prenom} ${data.nom} (membre actif).`);
    }
  }
  return { alerte, check, reset: () => setAlerte(null) };
}

function ChampsInvite({
  form, setForm, alerte, onCategorie,
}: {
  form: typeof CHAMPS_VIDES;
  setForm: (f: typeof CHAMPS_VIDES) => void;
  alerte: string | null;
  onCategorie: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Prénom *</Label>
          <Input value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Nom *</Label>
          <Input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Email *</Label>
        <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Téléphone</Label>
        <Input value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Entreprise</Label>
        <Input value={form.entreprise} onChange={(e) => setForm({ ...form, entreprise: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Catégorie</Label>
        <Input
          value={form.categorie}
          onChange={(e) => { setForm({ ...form, categorie: e.target.value }); onCategorie(e.target.value); }}
        />
        {alerte && (
          <p className="text-xs text-amber-600 flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {alerte}
          </p>
        )}
      </div>
    </div>
  );
}

function AddInviteDialog({ membresActifs }: { membresActifs: MembreActif[] }) {
  const qc = useQueryClient();
  const { data: profil } = useProfile();
  const gestionnaire = estGestionnaire(profil?.role);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(CHAMPS_VIDES);
  const [parrainId, setParrainId] = useState<string | null>(null);
  const { alerte, check, reset } = useCategorieAlerte();

  // Parrain par défaut : l'utilisateur courant (dès que le profil est chargé).
  useEffect(() => {
    if (profil?.id) setParrainId((prev) => prev ?? profil.id);
  }, [profil?.id]);

  const mutation = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("invites").insert({
        prenom: form.prenom.trim(),
        nom: form.nom.trim(),
        email: form.email.trim(),
        telephone: form.telephone.trim() || null,
        entreprise: form.entreprise.trim() || null,
        categorie: form.categorie.trim() || null,
        cree_par: (gestionnaire ? parrainId : profil?.id) ?? auth.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invité ajouté.");
      qc.invalidateQueries({ queryKey: ["invites"] });
      setForm(CHAMPS_VIDES);
      setParrainId(profil?.id ?? null);
      reset();
      setOpen(false);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const valide = form.prenom.trim() && form.nom.trim() && form.email.trim();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-[#006875] hover:bg-[#00525c]">
          <Plus className="h-4 w-4" /> Ajouter un invité
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nouvel invité</DialogTitle>
          <DialogDescription>Renseignez les coordonnées de l'invité.</DialogDescription>
        </DialogHeader>
        <ChampsInvite form={form} setForm={setForm} alerte={alerte} onCategorie={check} />
        {gestionnaire && (
          <div className="space-y-1.5">
            <Label>Attribuer à un membre</Label>
            <Select value={parrainId ?? undefined} onValueChange={(v) => setParrainId(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir un membre…" />
              </SelectTrigger>
              <SelectContent>
                {membresActifs.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.prenom} {m.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <DialogFooter>
          <Button
            className="bg-[#006875] hover:bg-[#00525c]"
            disabled={!valide || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Ajout…" : "Ajouter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditInviteDialog({ invite }: { invite: Invite }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    prenom: invite.prenom,
    nom: invite.nom,
    email: invite.email,
    telephone: invite.telephone ?? "",
    entreprise: invite.entreprise ?? "",
    categorie: invite.categorie ?? "",
  });
  const { alerte, check, reset } = useCategorieAlerte();

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("invites")
        .update({
          prenom: form.prenom.trim(),
          nom: form.nom.trim(),
          email: form.email.trim(),
          telephone: form.telephone.trim() || null,
          entreprise: form.entreprise.trim() || null,
          categorie: form.categorie.trim() || null,
        })
        .eq("id", invite.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fiche modifiée.");
      qc.invalidateQueries({ queryKey: ["invites"] });
      reset();
      setOpen(false);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const valide = form.prenom.trim() && form.nom.trim() && form.email.trim();

  return (
    <Dialog open={open} onOpenChange={(o) => {
      setOpen(o);
      if (o) setForm({
        prenom: invite.prenom, nom: invite.nom, email: invite.email,
        telephone: invite.telephone ?? "", entreprise: invite.entreprise ?? "",
        categorie: invite.categorie ?? "",
      });
    }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <Pencil className="h-3.5 w-3.5" /> Modifier
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier la fiche</DialogTitle>
          <DialogDescription>{invite.prenom} {invite.nom}</DialogDescription>
        </DialogHeader>
        <ChampsInvite form={form} setForm={setForm} alerte={alerte} onCategorie={check} />
        <DialogFooter>
          <Button
            className="bg-[#006875] hover:bg-[#00525c]"
            disabled={!valide || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PresenceDialog({ invite, nb }: { invite: Invite; nb: number }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("invites_presences")
        .insert({ invite_id: invite.id, date_reunion: date });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Présence enregistrée.");
      qc.invalidateQueries({ queryKey: ["invites", "presences"] });
      setDate("");
      setOpen(false);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  if (nb >= 2) {
    return (
      <Button size="sm" variant="outline" disabled className="gap-1">
        <CalendarPlus className="h-3.5 w-3.5" /> Limite atteinte
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <CalendarPlus className="h-3.5 w-3.5" /> Présence
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enregistrer une présence</DialogTitle>
          <DialogDescription>
            {invite.prenom} {invite.nom} — {nb}/2 réunion{nb > 1 ? "s" : ""}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Date de la réunion</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <DialogFooter>
          <Button
            className="bg-[#006875] hover:bg-[#00525c]"
            disabled={!date || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConvertDialog({ invite }: { invite: Invite }) {
  const qc = useQueryClient();
  const convert = useServerFn(convertirInvite);
  const [open, setOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => convert({ data: { invite_id: invite.id } }),
    onSuccess: () => {
      toast.success("Invitation envoyée. L'invité va recevoir un email pour définir son mot de passe.");
      qc.invalidateQueries({ queryKey: ["invites"] });
      setOpen(false);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="sm" className="gap-1 bg-[#F6A000] hover:bg-[#d98c00] text-white">
          <UserPlus className="h-3.5 w-3.5" /> Convertir
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Convertir en membre ?</AlertDialogTitle>
          <AlertDialogDescription>
            Un email d'invitation sera envoyé à {invite.email}. La fiche restera
            visible et passera en « Invitation acceptée » une fois le compte activé.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            className="bg-[#F6A000] hover:bg-[#d98c00]"
            disabled={mutation.isPending}
            onClick={(e) => { e.preventDefault(); mutation.mutate(); }}
          >
            {mutation.isPending ? "Envoi…" : "Envoyer l'invitation"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteInvite({ invite }: { invite: Invite }) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("invites").delete().eq("id", invite.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fiche supprimée.");
      qc.invalidateQueries({ queryKey: ["invites"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost" className="gap-1 text-muted-foreground hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer cette fiche ?</AlertDialogTitle>
          <AlertDialogDescription>
            {invite.prenom} {invite.nom} et ses présences seront définitivement supprimés.
            {invite.statut_conversion === "accepte" &&
              " Le compte membre déjà créé n'est pas affecté."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive hover:bg-destructive/90"
            onClick={() => mutation.mutate()}
          >
            Supprimer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}