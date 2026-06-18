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
import { Mail, Phone, Globe, Plus, Pencil, Trash2, Search, Shield, Building2, Tag } from "lucide-react";
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
  site_web: string | null;
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
        .select("id, nom, prenom, email, photo_url, entreprise, categorie, telephone, site_web, role, statut")
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
        <div className="grid gap-3 grid-cols-3">
          {filtered.map((m) => (
            <MembreCard key={m.id} membre={m} canEdit={isBureau} canAdmin={isAdmin} />
          ))}
        </div>
      )}
    </div>
  );
}

function MembreCard({ membre, canEdit, canAdmin }: { membre: Membre; canEdit: boolean; canAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const initiales = `${membre.prenom?.[0] ?? ""}${membre.nom?.[0] ?? ""}`.toUpperCase();
  const inactif = membre.statut === "inactif";

  return (
    <>
      <Card
        className={`rounded-2xl shadow-sm hover:shadow-md transition-shadow cursor-pointer ${inactif ? "opacity-60" : ""}`}
        onClick={() => setOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <CardContent className="p-4 flex flex-col items-center gap-3 text-center">
          <Avatar className="h-20 w-20 rounded-2xl">
            <AvatarImage src={membre.photo_url ?? undefined} alt={`${membre.prenom} ${membre.nom}`} className="object-cover" />
            <AvatarFallback className="rounded-2xl">{initiales || "?"}</AvatarFallback>
          </Avatar>
          <p className="font-semibold text-sm leading-tight break-words">
            {membre.prenom} {membre.nom}
          </p>
        </CardContent>
      </Card>

      <MembreDetailDialog
        membre={membre}
        open={open}
        onOpenChange={setOpen}
        canEdit={canEdit}
        canAdmin={canAdmin}
      />
    </>
  );
}

function MembreDetailDialog({
  membre, open, onOpenChange, canEdit, canAdmin,
}: {
  membre: Membre;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  canEdit: boolean;
  canAdmin: boolean;
}) {
  const initiales = `${membre.prenom?.[0] ?? ""}${membre.nom?.[0] ?? ""}`.toUpperCase();
  const inactif = membre.statut === "inactif";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-col items-center gap-3 pt-2">
            <Avatar className="h-28 w-28 rounded-2xl">
              <AvatarImage src={membre.photo_url ?? undefined} alt={`${membre.prenom} ${membre.nom}`} className="object-cover" />
              <AvatarFallback className="rounded-2xl text-xl">{initiales || "?"}</AvatarFallback>
            </Avatar>
            <DialogTitle className="text-xl text-center">
              {membre.prenom} {membre.nom}
            </DialogTitle>
            <div className="flex gap-2 flex-wrap justify-center">
              {membre.role !== "membre" && (
                <Badge variant="secondary" className="capitalize">
                  <Shield className="h-3 w-3 mr-1" />{membre.role}
                </Badge>
              )}
              {inactif && <Badge variant="outline">inactif</Badge>}
            </div>
          </div>
          <DialogDescription className="sr-only">Détail du membre</DialogDescription>
        </DialogHeader>

        <div className="space-y-2 mt-2">
          {membre.entreprise && (
            <InfoRow icon={<Building2 className="h-4 w-4" />} label="Entreprise" value={membre.entreprise} />
          )}
          {membre.categorie && (
            <InfoRow icon={<Tag className="h-4 w-4" />} label="Catégorie" value={membre.categorie} />
          )}
          {membre.email && (
            <InfoRow
              icon={<Mail className="h-4 w-4" />}
              label="Email"
              value={
                <a href={`mailto:${membre.email}`} className="text-primary hover:underline break-all">
                  {membre.email}
                </a>
              }
            />
          )}
          {membre.telephone && (
            <InfoRow
              icon={<Phone className="h-4 w-4" />}
              label="Téléphone"
              value={
                <a href={`tel:${membre.telephone}`} className="text-primary hover:underline">
                  {membre.telephone}
                </a>
              }
            />
          )}
          {membre.site_web && (
            <InfoRow
              icon={<Globe className="h-4 w-4" />}
              label="Site internet"
              value={
                <a
                  href={membre.site_web}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline break-all"
                >
                  {membre.site_web}
                </a>
              }
            />
          )}
        </div>

        {(canEdit || canAdmin) && (
          <DialogFooter className="flex-row flex-wrap gap-2 sm:justify-end pt-4 border-t mt-4">
            {canEdit && <EditDialog membre={membre} canAdmin={canAdmin} />}
            {canAdmin && <DeleteButton membre={membre} onDeleted={() => onOpenChange(false)} />}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b last:border-0">
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="text-sm font-medium break-words">{value}</div>
      </div>
    </div>
  );
}

function InviteDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", prenom: "", nom: "", entreprise: "", categorie: "", telephone: "", site_web: "" });
  const invite = useServerFn(inviteMembre);
  const mutation = useMutation({
    mutationFn: (data: typeof form) => invite({ data }),
    onSuccess: () => {
      toast.success("Invitation envoyée par email.");
      qc.invalidateQueries({ queryKey: ["membres", "list"] });
      setOpen(false);
      setForm({ email: "", prenom: "", nom: "", entreprise: "", categorie: "", telephone: "", site_web: "" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur lors de l'invitation"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen} modal={false}>
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
          <Field label="Site internet" type="url" value={form.site_web} onChange={(v) => setForm({ ...form, site_web: v })} />
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
    telephone: membre.telephone ?? "", photo_url: membre.photo_url ?? "", site_web: membre.site_web ?? "",
  });
  const [role, setRole] = useState<Membre["role"]>(membre.role);
  const [statut, setStatut] = useState<Membre["statut"]>(membre.statut);

  useEffect(() => {
    if (open) {
      setForm({
        prenom: membre.prenom, nom: membre.nom,
        entreprise: membre.entreprise ?? "", categorie: membre.categorie ?? "",
        telephone: membre.telephone ?? "", photo_url: membre.photo_url ?? "", site_web: membre.site_web ?? "",
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
        site_web: form.site_web || null,
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
    <Dialog open={open} onOpenChange={setOpen} modal={false}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Pencil className="h-4 w-4" /> Modifier
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier {membre.prenom} {membre.nom}</DialogTitle>
          <DialogDescription>{membre.email}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prénom" value={form.prenom} onChange={(v) => setForm({ ...form, prenom: v })} required />
            <Field label="Nom" value={form.nom} onChange={(v) => setForm({ ...form, nom: v })} required />
          </div>
          <Field label="Photo (URL)" value={form.photo_url} onChange={(v) => setForm({ ...form, photo_url: v })} />
          <Field label="Entreprise" value={form.entreprise} onChange={(v) => setForm({ ...form, entreprise: v })} />
          <Field label="Catégorie" value={form.categorie} onChange={(v) => setForm({ ...form, categorie: v })} />
          <Field label="Téléphone" type="tel" value={form.telephone} onChange={(v) => setForm({ ...form, telephone: v })} />
          <Field label="Site internet" type="url" value={form.site_web} onChange={(v) => setForm({ ...form, site_web: v })} />

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
            <Button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeleteButton({ membre, onDeleted }: { membre: Membre; onDeleted?: () => void }) {
  const qc = useQueryClient();
  const del = useServerFn(deleteMembre);
  const mutation = useMutation({
    mutationFn: () => del({ data: { id: membre.id } }),
    onSuccess: () => {
      toast.success("Membre supprimé");
      qc.invalidateQueries({ queryKey: ["membres", "list"] });
      onDeleted?.();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" className="text-destructive hover:text-destructive">
          <Trash2 className="h-4 w-4" /> Supprimer
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
