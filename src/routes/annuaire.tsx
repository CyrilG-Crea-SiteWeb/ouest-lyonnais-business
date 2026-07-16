import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { OlbLogo } from "@/components/OlbLogo";
import { Mail, Phone, Globe, Search, Shield, Building2, Tag } from "lucide-react";

export const Route = createFileRoute("/annuaire")({
  head: () => ({
    meta: [
      { title: "Annuaire des membres — OLB" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AnnuairePage,
});

type MembrePublic = {
  id: string;
  nom: string;
  prenom: string;
  photo_url: string | null;
  entreprise: string | null;
  categorie: string | null;
  email: string | null;
  telephone: string | null;
  site_web: string | null;
  role: "admin" | "bureau" | "membre" | "comite_membres" | "comite_fetes";
};

// Libellés des rôles (identiques à la page Membres).
const ROLE_LABELS: Record<MembrePublic["role"], string> = {
  admin: "Admin",
  bureau: "Bureau",
  comite_fetes: "Comité des fêtes",
  comite_membres: "Comité membres",
  membre: "Membre",
};

function AnnuairePage() {
  const [search, setSearch] = useState("");

  const { data: membres = [], isLoading } = useQuery({
    queryKey: ["annuaire-public", "list"],
    queryFn: async (): Promise<MembrePublic[]> => {
      const { data, error } = await supabase
        .from("v_annuaire_public")
        .select(
          "id, nom, prenom, photo_url, entreprise, categorie, email, telephone, site_web, role",
        )
        .order("nom", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MembrePublic[];
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
            [m.nom, m.prenom, m.entreprise, m.categorie].filter(Boolean).join(" "),
          ).includes(q),
        );

    return [...list].sort(
      (a, b) =>
        a.prenom.localeCompare(b.prenom, "fr", { sensitivity: "base" }) ||
        a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }),
    );
  }, [membres, search]);

  return (
    <div className="min-h-screen w-full bg-background">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 space-y-6">
        <header className="flex flex-col items-center gap-3 text-center">
          <OlbLogo className="h-16" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">
              Annuaire des membres OLB
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {membres.length} membre{membres.length > 1 ? "s" : ""}
            </p>
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
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
            {filtered.map((m) => (
              <MembreCard key={m.id} membre={m} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MembreCard({ membre }: { membre: MembrePublic }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const initiales = `${membre.prenom?.[0] ?? ""}${membre.nom?.[0] ?? ""}`.toUpperCase();

  return (
    <>
      <Card
        className="rounded-2xl shadow-sm hover:shadow-md transition-shadow cursor-pointer"
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

      <MembreDetailDialog membre={membre} open={detailOpen} onOpenChange={setDetailOpen} />
    </>
  );
}

function MembreDetailDialog({
  membre,
  open,
  onOpenChange,
}: {
  membre: MembrePublic;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const initiales = `${membre.prenom?.[0] ?? ""}${membre.nom?.[0] ?? ""}`.toUpperCase();

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
          </div>
        </div>
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
