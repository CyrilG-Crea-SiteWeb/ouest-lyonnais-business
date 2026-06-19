import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Mail, Phone, Building2, Tag, Plus, Trash2, Search, CalendarPlus,
  UserPlus, AlertTriangle,
} from "lucide-react";
import { convertirInvite } from "@/lib/invites.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/_authenticated/invites")({
  head: () => ({ meta: [{ title: "Invités — OLB" }] }),
  // Garde d'accès : Comité / Bureau / Admin uniquement
  beforeLoad: async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw redirect({ to: "/auth" });
    const { data: m } = await supabase
      .from("membres")
      .select("role")
      .eq("id", auth.user.id)
      .maybeSingle();
    const role = m?.role;
    if (role !== "comite_membres" && role !== "bureau" && role !== "admin") {
      throw redirect({ to: "/" });
    }
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
};

type Presence = { id: number; invite_id: number; date_reunion: string };

function InvitesPage() {
  const [search, setSearch] = useState("");

  const { data: invites = [], isLoading } = useQuery({
    queryKey: ["invites", "list"],
    queryFn: async (): Promise<Invite[]> => {
      const { data, error } = await supabase
        .from("invites")
        .select("id, nom, prenom, email, telephone, entreprise, categorie, notes, statut_conversion")
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

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Invités</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {invites.length} invité{invites.length > 1 ? "s" : ""} · 2 réunions gratuites maximum
          </p>
        </div>
        <AddInviteDialog />
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
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Aucun invité.</CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((inv) => (
            <InviteCard
              key={inv.id}
              invite={inv}
              presences={presencesParInvite.get(inv.id) ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function InviteCard({ invite, presences }: { invite: Invite; presences: Presence[] }) {
  const nb = presences.length;
  const complet = nb >= 2;
  const converti = invite.statut_conversion === "converti";

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
          {converti ? (
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

        {presences.length > 0 && (
          <div className="text-xs text-muted-foreground">
            Présences :{" "}
            {presences
              .map((p) => new Date(p.date_reunion).toLocaleDateString("fr-FR"))
              .join(", ")}
          </div>
        )}

        {!converti && (
          <div className="flex flex-wrap gap-2 pt-1">
            <PresenceDialog invite={invite} nb={nb} />
            <ConvertDialog invite={invite} />
            <DeleteInvite invite={invite} />
          </div>
        )}
        {converti && (
          <p className="text-xs text-muted-foreground pt-1">
            En attente d'activation du compte par l'invité.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AddInviteDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    prenom: "", nom: "", email: "", telephone: "", entreprise: "", categorie: "",
  });
  const [alerteCategorie, setAlerteCategorie] = useState<string | null>(null);

  async function checkCategorie(cat: string) {
    setForm((f) => ({ ...f, categorie: cat }));
    setAlerteCategorie(null);
    const c = cat.trim();
    if (!c) return;
    const { data } = await supabase
      .from("membres")
      .select("prenom, nom")
      .eq("statut", "actif")
      .ilike("categorie", c)
      .maybeSingle();
    if (data) {
      setAlerteCategorie(`Catégorie déjà occupée par ${data.prenom} ${data.nom} (membre actif).`);
    }
  }

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
        cree_par: auth.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invité ajouté.");
      qc.invalidateQueries({ queryKey: ["invites"] });
      setForm({ prenom: "", nom: "", email: "", telephone: "", entreprise: "", categorie: "" });
      setAlerteCategorie(null);
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
            <Input value={form.categorie} onChange={(e) => checkCategorie(e.target.value)} />
            {alerteCategorie && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {alerteCategorie}
              </p>
            )}
          </div>
        </div>
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
            Un email d'invitation sera envoyé à {invite.email}. La fiche invité sera
            conservée jusqu'à ce que le compte soit activé, puis supprimée automatiquement.
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
      toast.success("Invité supprimé.");
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
          <AlertDialogTitle>Supprimer cet invité ?</AlertDialogTitle>
          <AlertDialogDescription>
            {invite.prenom} {invite.nom} et ses présences seront définitivement supprimés.
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