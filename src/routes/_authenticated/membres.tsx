import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, hasRole } from "@/hooks/use-profile";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarUpload } from "@/components/AvatarUpload";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Mail,
  Phone,
  Globe,
  Plus,
  Pencil,
  Trash2,
  Search,
  Shield,
  Building2,
  Tag,
  Share2,
  Check,
  Info,
} from "lucide-react";
import {
  inviteMembre,
  updateMembre,
  updateMembreRoleStatut,
  deleteMembre,
  uploadMembreAvatar,
} from "@/lib/membres.functions";

/** Convertit un ArrayBuffer en base64 par tranches pour éviter de saturer la pile. */
function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

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
  autres_informations: string | null;
  role: "admin" | "bureau" | "membre" | "comite_membres" | "comite_fetes";
  statut: "actif" | "inactif";
};

// Libellés associés aux rôles.
const ROLE_LABELS: Record<Membre["role"], string> = {
  admin: "Admin",
  bureau: "Bureau",
  comite_fetes: "Comité des fêtes",
  comite_membres: "Comité membres",
  membre: "Membre",
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
        .select(
          "id, nom, prenom, email, photo_url, entreprise, categorie, telephone, site_web, autres_informations, role, statut",
        )
        .order("nom", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Membre[];
    },
  });

  const filtered = useMemo(() => {
    const normalize = (s: string) =>
      s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    const q = normalize(search.trim());
    const list = !q
      ? membres
      : membres.filter((m) =>
          normalize(
            [m.nom, m.prenom, m.entreprise, m.categorie, m.autres_informations]
              .filter(Boolean)
              .join(" "),
          ).includes(q),
        );

    return [...list].sort(
      (a, b) =>
        a.prenom.localeCompare(b.prenom, "fr", { sensitivity: "base" }) ||
        a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }),
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
        <div className="flex flex-wrap items-center gap-2">
          <ShareAnnuaireButton />
          {isBureau && <InviteDialog />}
        </div>
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
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Aucun membre trouvé.
          </CardContent>
        </Card>
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

/** Copie l'URL publique de l'annuaire dans le presse-papier. Visible par tous les membres connectés. */
function ShareAnnuaireButton() {
  const [copied, setCopied] = useState(false);

  const partager = async () => {
    try {
      const url = `${window.location.origin}/annuaire`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Impossible de copier le lien.");
    }
  };

  return (
    <Button variant="outline" onClick={partager} className="transition-colors">
      {copied ? (
        <>
          <Check className="h-4 w-4 text-green-600" /> Lien copié
        </>
      ) : (
        <>
          <Share2 className="h-4 w-4" /> Partager l'annuaire
        </>
      )}
    </Button>
  );
}

function MembreCard({
  membre,
  canEdit,
  canAdmin,
}: {
  membre: Membre;
  canEdit: boolean;
  canAdmin: boolean;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const initiales = `${membre.prenom?.[0] ?? ""}${membre.nom?.[0] ?? ""}`.toUpperCase();
  const inactif = membre.statut === "inactif";

  return (
    <>
      <Card
        className={`rounded-2xl shadow-sm hover:shadow-md transition-shadow cursor-pointer ${inactif ? "opacity-60" : ""}`}
        onClick={() => setDetailOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setDetailOpen(true);
          }
        }}
      >
        <CardContent className="p-4 flex flex-col items-center gap-3 text-center">
          <Avatar className="h-20 w-20 rounded-2xl">
            <AvatarImage
              src={membre.photo_url ?? undefined}
              alt={`${membre.prenom} ${membre.nom}`}
              className="object-cover"
            />
            <AvatarFallback className="rounded-2xl">{initiales || "?"}</AvatarFallback>
          </Avatar>
          <p className="font-semibold text-sm leading-tight break-words">
            {membre.prenom}
            <br />
            {membre.nom}
          </p>
          {membre.role !== "membre" && (
            <Badge variant="secondary" className="text-[10px]">
              <Shield className="h-3 w-3 mr-1" />
              {ROLE_LABELS[membre.role]}
            </Badge>
          )}
        </CardContent>
      </Card>

      <MembreDetailDialog
        membre={membre}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        canEdit={canEdit}
        canAdmin={canAdmin}
        onEdit={
          canEdit
            ? () => {
                setDetailOpen(false);
                setEditOpen(true);
              }
            : undefined
        }
      />

      {canEdit && (
        <EditDialog
          membre={membre}
          canAdmin={canAdmin}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}
    </>
  );
}

function MembreDetailDialog({
  membre,
  open,
  onOpenChange,
  canEdit,
  canAdmin,
  onEdit,
}: {
  membre: Membre;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  canEdit: boolean;
  canAdmin: boolean;
  onEdit?: () => void;
}) {
  const initiales = `${membre.prenom?.[0] ?? ""}${membre.nom?.[0] ?? ""}`.toUpperCase();
  const inactif = membre.statut === "inactif";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0" style={{ display: "flex" }}>
        <DialogHeader className="shrink-0 px-6 pt-6">
          <div className="flex flex-col items-center gap-3 pt-2">
            <Avatar className="h-28 w-28 rounded-2xl">
              <AvatarImage
                src={membre.photo_url ?? undefined}
                alt={`${membre.prenom} ${membre.nom}`}
                className="object-cover"
              />
              <AvatarFallback className="rounded-2xl text-xl">{initiales || "?"}</AvatarFallback>
            </Avatar>
            <DialogTitle className="text-xl text-center">
              {membre.prenom} {membre.nom}
            </DialogTitle>
            <div className="flex gap-2 flex-wrap justify-center">
              {membre.role !== "membre" && (
                <Badge variant="secondary">
                  <Shield className="h-3 w-3 mr-1" />
                  {ROLE_LABELS[membre.role]}
                </Badge>
              )}
              {inactif && <Badge variant="outline">inactif</Badge>}
            </div>
          </div>
          <DialogDescription className="sr-only">Détail du membre</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-2">
            {membre.entreprise && (
              <InfoRow
                icon={<Building2 className="h-4 w-4" />}
                label="Entreprise"
                value={membre.entreprise}
              />
            )}
            {membre.categorie && (
              <InfoRow
                icon={<Tag className="h-4 w-4" />}
                label="Catégorie"
                value={membre.categorie}
              />
            )}
            {membre.email && (
              <InfoRow
                icon={<Mail className="h-4 w-4" />}
                label="Email"
                value={
                  <a
                    href={`mailto:${membre.email}`}
                    className="text-primary hover:underline break-all"
                  >
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
            {membre.autres_informations && (
              <InfoRow
                icon={<Info className="h-4 w-4" />}
                label="Autres informations"
                value={<span className="whitespace-pre-line">{membre.autres_informations}</span>}
              />
            )}
          </div>
        </div>

        {(canEdit || canAdmin) && (
          <DialogFooter className="shrink-0 flex-row flex-wrap gap-2 border-t px-6 py-4 sm:justify-end">
            {canEdit && onEdit && (
              <Button size="sm" variant="outline" onClick={onEdit}>
                <Pencil className="h-4 w-4" /> Modifier
              </Button>
            )}
            {canAdmin && <DeleteButton membre={membre} onDeleted={() => onOpenChange(false)} />}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
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
  const [form, setForm] = useState({
    email: "",
    prenom: "",
    nom: "",
    entreprise: "",
    categorie: "",
    telephone: "",
    site_web: "",
  });
  const invite = useServerFn(inviteMembre);
  const mutation = useMutation({
    mutationFn: (data: typeof form) => invite({ data }),
    onSuccess: () => {
      toast.success("Invitation envoyée par email.");
      qc.invalidateQueries({ queryKey: ["membres", "list"] });
      setOpen(false);
      setForm({
        email: "",
        prenom: "",
        nom: "",
        entreprise: "",
        categorie: "",
        telephone: "",
        site_web: "",
      });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur lors de l'invitation"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen} modal={false}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> Ajouter un membre
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Inviter un nouveau membre</DialogTitle>
          <DialogDescription>
            Un email d'invitation lui sera envoyé pour créer son mot de passe.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(form);
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Prénom"
              value={form.prenom}
              onChange={(v) => setForm({ ...form, prenom: v })}
              required
            />
            <Field
              label="Nom"
              value={form.nom}
              onChange={(v) => setForm({ ...form, nom: v })}
              required
            />
          </div>
          <Field
            label="Email"
            type="email"
            value={form.email}
            onChange={(v) => setForm({ ...form, email: v })}
            required
          />
          <Field
            label="Entreprise"
            value={form.entreprise}
            onChange={(v) => setForm({ ...form, entreprise: v })}
          />
          <Field
            label="Catégorie professionnelle"
            value={form.categorie}
            onChange={(v) => setForm({ ...form, categorie: v })}
          />
          <Field
            label="Téléphone"
            type="tel"
            value={form.telephone}
            onChange={(v) => setForm({ ...form, telephone: v })}
          />
          <Field
            label="Site internet"
            type="url"
            value={form.site_web}
            onChange={(v) => setForm({ ...form, site_web: v })}
          />
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

function EditDialog({
  membre,
  canAdmin,
  open,
  onOpenChange,
}: {
  membre: Membre;
  canAdmin: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    prenom: membre.prenom,
    nom: membre.nom,
    entreprise: membre.entreprise ?? "",
    categorie: membre.categorie ?? "",
    telephone: membre.telephone ?? "",
    photo_url: membre.photo_url ?? "",
    site_web: membre.site_web ?? "",
    autres_informations: membre.autres_informations ?? "",
  });
  const [role, setRole] = useState<Membre["role"]>(membre.role);
  const [statut, setStatut] = useState<Membre["statut"]>(membre.statut);

  useEffect(() => {
    if (open) {
      setForm({
        prenom: membre.prenom,
        nom: membre.nom,
        entreprise: membre.entreprise ?? "",
        categorie: membre.categorie ?? "",
        telephone: membre.telephone ?? "",
        photo_url: membre.photo_url ?? "",
        site_web: membre.site_web ?? "",
        autres_informations: membre.autres_informations ?? "",
      });
      setRole(membre.role);
      setStatut(membre.statut);
    }
  }, [open, membre]);

  const update = useServerFn(updateMembre);
  const updateRS = useServerFn(updateMembreRoleStatut);
  const uploadAvatar = useServerFn(uploadMembreAvatar);

  // Upload délégué : l'upload client direct est bloqué par les RLS du bucket
  // pour le dossier d'un autre membre, on passe donc par la server function (service role).
  async function uploadAvatarFile(file: File): Promise<string> {
    const fileBase64 = arrayBufferToBase64(await file.arrayBuffer());
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const { url } = await uploadAvatar({
      data: { membreId: membre.id, fileBase64, contentType: file.type, ext },
    });
    return url;
  }

  const initiales = `${membre.prenom?.[0] ?? ""}${membre.nom?.[0] ?? ""}`.toUpperCase();

  const mutation = useMutation({
    mutationFn: async () => {
      await update({
        data: {
          id: membre.id,
          prenom: form.prenom,
          nom: form.nom,
          entreprise: form.entreprise || null,
          categorie: form.categorie || null,
          telephone: form.telephone || null,
          site_web: form.site_web || null,
          photo_url: form.photo_url || null,
          autres_informations: form.autres_informations.trim() || null,
        },
      });
      if (canAdmin && (role !== membre.role || statut !== membre.statut)) {
        await updateRS({ data: { id: membre.id, role, statut } });
      }
    },
    onSuccess: () => {
      toast.success("Membre mis à jour");
      qc.invalidateQueries({ queryKey: ["membres", "list"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0" style={{ display: "flex" }}>
        <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
          <DialogTitle>
            Modifier {membre.prenom} {membre.nom}
          </DialogTitle>
          <DialogDescription>{membre.email}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-2">
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Prénom"
              value={form.prenom}
              onChange={(v) => setForm({ ...form, prenom: v })}
              required
            />
            <Field
              label="Nom"
              value={form.nom}
              onChange={(v) => setForm({ ...form, nom: v })}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Photo de profil</Label>
            <AvatarUpload
              value={form.photo_url}
              membreId={membre.id}
              initiales={initiales}
              onChange={(v) => setForm({ ...form, photo_url: v })}
              uploadFile={uploadAvatarFile}
            />
          </div>
          <Field
            label="Entreprise"
            value={form.entreprise}
            onChange={(v) => setForm({ ...form, entreprise: v })}
          />
          <Field
            label="Catégorie"
            value={form.categorie}
            onChange={(v) => setForm({ ...form, categorie: v })}
          />
          <Field
            label="Téléphone"
            type="tel"
            value={form.telephone}
            onChange={(v) => setForm({ ...form, telephone: v })}
          />
          <Field
            label="Site internet"
            type="url"
            value={form.site_web}
            onChange={(v) => setForm({ ...form, site_web: v })}
          />
          <div className="space-y-1.5">
            <Label>Autres informations</Label>
            <Textarea
              value={form.autres_informations}
              onChange={(e) => setForm({ ...form, autres_informations: e.target.value })}
              rows={4}
              placeholder="Présentation, spécialités, recherches de contacts…"
            />
          </div>

          {canAdmin && (
            <div className="grid grid-cols-2 gap-3 pt-2 border-t">
              <div className="space-y-1.5">
                <Label>Rôle</Label>
                <Select value={role} onValueChange={(v) => setRole(v as Membre["role"])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="membre">Membre</SelectItem>
                    <SelectItem value="comite_membres">Comité membres</SelectItem>
                    <SelectItem value="comite_fetes">Comité des fêtes</SelectItem>
                    <SelectItem value="bureau">Bureau</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Statut</Label>
                <Select value={statut} onValueChange={(v) => setStatut(v as Membre["statut"])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="actif">Actif</SelectItem>
                    <SelectItem value="inactif">Inactif</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t px-6 py-4">
          <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
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
          <AlertDialogTitle>
            Supprimer {membre.prenom} {membre.nom} ?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Cette action est irréversible. Le compte et toutes les données associées seront
            supprimés.
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
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && " *"}
      </Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
    </div>
  );
}
