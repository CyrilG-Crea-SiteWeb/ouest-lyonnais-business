import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, hasRole } from "@/hooks/use-profile";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Mail, Phone, Plus, Pencil, Trash2, Search, Shield } from "lucide-react";
import { inviteMembre, updateMembre, updateMembreRoleStatut, deleteMembre } from "@/lib/membres.functions";

export const Route = createFileRoute("/_authenticated/membres")({
  head: () => ({ meta: [{ title: "Membres — OLB" }] }),
  component: MembresPage,
});

type Membre = {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  photo_url: string | null;
  entreprise: string | null;
  categorie: string | null;
  telephone: string | null;
  role: "admin" | "bureau" | "membre";
  statut: "actif" | "inactif";
};

function MembresPage() {
  const { data: profile } = useProfile();
  const isBureau = hasRole(profile?.role, "bureau");
  const isAdmin = hasRole(profile?.role, "admin");
  const [search, setSearch] = useState("");

  const { data: membres = [], isLoading } = useQuery({
    queryKey: ["membres", "list"],
    queryFn: async (): Promise<Membre[]> => {
      const { data, error } = await supabase
        .from("membres")
        .select("id, nom, prenom, email, photo_url, entreprise, categorie, telephone, role, statut")
        .order("nom", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Membre[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return membres;
    return membres.filter((m) =>
      [m.nom, m.prenom, m.entreprise, m.categorie].filter(Boolean).join(" ").toLowerCase().includes(q),
    );
  }, [membres, search]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Membres</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {membres.length} membre{membres.length > 1 ? "s" : ""}
          </p>
        </div>
        {isBureau && <InviteDialog />}
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
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Aucun membre trouvé.</CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m) => (
            <MembreCard key={m.id} membre={m} canEdit={isBureau} canAdmin={isAdmin} />
          ))}
        </div>
      )}
    </div>
  );
}

function MembreCard({ membre, canEdit, canAdmin }: { membre: Membre; canEdit: boolean; canAdmin: boolean }) {
  const initiales = `${membre.prenom?.[0] ?? ""}${membre.nom?.[0] ?? ""}`.toUpperCase();
  const inactif = membre.statut === "inactif";
  return (
    <Card className={inactif ? "opacity-60" : ""}>
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <Avatar className="h-14 w-14">
            <AvatarImage src={membre.photo_url ?? undefined} alt={`${membre.prenom} ${membre.nom}`} />
            <AvatarFallback>{initiales || "?"}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold truncate">{membre.prenom} {membre.nom}</p>
              {membre.role !== "membre" && (
                <Badge variant="secondary" className="capitalize text-[10px]">
                  <Shield className="h-3 w-3 mr-1" />{membre.role}
                </Badge>
              )}
              {inactif && <Badge variant="outline" className="text-[10px]">inactif</Badge>}
            </div>
            {membre.entreprise && <p className="text-sm text-foreground truncate">{membre.entreprise}</p>}
            {membre.categorie && <p className="text-xs text-muted-foreground truncate">{membre.categorie}</p>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button asChild size="sm" variant="outline" className="flex-1 min-w-0">
            <a href={`mailto:${membre.email}`}>
              <Mail className="h-4 w-4" /> <span className="truncate">Contact</span>
            </a>
          </Button>
          {membre.telephone && (
            <Button asChild size="sm" variant="outline">
              <a href={`tel:${membre.telephone}`}><Phone className="h-4 w-4" /></a>
            </Button>
          )}
          {canEdit && <EditDialog membre={membre} canAdmin={canAdmin} />}
          {canAdmin && <DeleteButton membre={membre} />}
        </div>
      </CardContent>
    </Card>
  );
}

function InviteDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", prenom: "", nom: "", entreprise: "", categorie: "", telephone: "" });
  const invite = useServerFn(inviteMembre);
  const mutation = useMutation({
    mutationFn: (data: typeof form) => invite({ data }),
    onSuccess: () => {
      toast.success("Invitation envoyée par email.");
      qc.invalidateQueries({ queryKey: ["membres", "list"] });
      setOpen(false);
      setForm({ email: "", prenom: "", nom: "", entreprise: "", categorie: "", telephone: "" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur lors de l'invitation"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4" /> Ajouter un membre</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Inviter un nouveau membre</DialogTitle>
          <DialogDescription>Un email d'invitation lui sera envoyé pour créer son mot de passe.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }}
          className="space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prénom" value={form.prenom} onChange={(v) => setForm({ ...form, prenom: v })} required />
            <Field label="Nom" value={form.nom} onChange={(v) => setForm({ ...form, nom: v })} required />
          </div>
          <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required />
          <Field label="Entreprise" value={form.entreprise} onChange={(v) => setForm({ ...form, entreprise: v })} />
          <Field label="Catégorie professionnelle" value={form.categorie} onChange={(v) => setForm({ ...form, categorie: v })} />
          <Field label="Téléphone" type="tel" value={form.telephone} onChange={(v) => setForm({ ...form, telephone: v })} />
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Envoi…" : "Envoyer l'invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ membre, canAdmin }: { membre: Membre; canAdmin: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    prenom: membre.prenom, nom: membre.nom,
    entreprise: membre.entreprise ?? "", categorie: membre.categorie ?? "",
    telephone: membre.telephone ?? "", photo_url: membre.photo_url ?? "",
  });
  const [role, setRole] = useState<Membre["role"]>(membre.role);
  const [statut, setStatut] = useState<Membre["statut"]>(membre.statut);

  useEffect(() => {
    if (open) {
      setForm({
        prenom: membre.prenom, nom: membre.nom,
        entreprise: membre.entreprise ?? "", categorie: membre.categorie ?? "",
        telephone: membre.telephone ?? "", photo_url: membre.photo_url ?? "",
      });
      setRole(membre.role);
      setStatut(membre.statut);
    }
  }, [open, membre]);

  const update = useServerFn(updateMembre);
  const updateRS = useServerFn(updateMembreRoleStatut);

  const mutation = useMutation({
    mutationFn: async () => {
      await update({ data: {
        id: membre.id,
        prenom: form.prenom, nom: form.nom,
        entreprise: form.entreprise || null,
        categorie: form.categorie || null,
        telephone: form.telephone || null,
        photo_url: form.photo_url || null,
      } });
      if (canAdmin && (role !== membre.role || statut !== membre.statut)) {
        await updateRS({ data: { id: membre.id, role, statut } });
      }
    },
    onSuccess: () => {
      toast.success("Membre mis à jour");
      qc.invalidateQueries({ queryKey: ["membres", "list"] });
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Pencil className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier {membre.prenom} {membre.nom}</DialogTitle>
          <DialogDescription>{membre.email}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
          className="space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prénom" value={form.prenom} onChange={(v) => setForm({ ...form, prenom: v })} required />
            <Field label="Nom" value={form.nom} onChange={(v) => setForm({ ...form, nom: v })} required />
          </div>
          <Field label="Photo (URL)" value={form.photo_url} onChange={(v) => setForm({ ...form, photo_url: v })} />
          <Field label="Entreprise" value={form.entreprise} onChange={(v) => setForm({ ...form, entreprise: v })} />
          <Field label="Catégorie" value={form.categorie} onChange={(v) => setForm({ ...form, categorie: v })} />
          <Field label="Téléphone" type="tel" value={form.telephone} onChange={(v) => setForm({ ...form, telephone: v })} />

          {canAdmin && (
            <div className="grid grid-cols-2 gap-3 pt-2 border-t">
              <div className="space-y-1.5">
                <Label>Rôle</Label>
                <Select value={role} onValueChange={(v) => setRole(v as Membre["role"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="membre">Membre</SelectItem>
                    <SelectItem value="bureau">Bureau</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Statut</Label>
                <Select value={statut} onValueChange={(v) => setStatut(v as Membre["statut"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="actif">Actif</SelectItem>
                    <SelectItem value="inactif">Inactif</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteButton({ membre }: { membre: Membre }) {
  const qc = useQueryClient();
  const del = useServerFn(deleteMembre);
  const mutation = useMutation({
    mutationFn: () => del({ data: { id: membre.id } }),
    onSuccess: () => {
      toast.success("Membre supprimé");
      qc.invalidateQueries({ queryKey: ["membres", "list"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" className="text-destructive hover:text-destructive">
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer {membre.prenom} {membre.nom} ?</AlertDialogTitle>
          <AlertDialogDescription>
            Cette action est irréversible. Le compte et toutes les données associées seront supprimés.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => mutation.mutate()}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Supprimer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Field({
  label, value, onChange, type = "text", required,
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}{required && " *"}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} />
    </div>
  );
}
