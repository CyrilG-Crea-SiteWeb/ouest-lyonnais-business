import { useState, useRef, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { activerPush, permissionPush } from "@/lib/push";

type Notification = {
  id: number;
  type_contenu: "recommandation" | "sondage" | "evenement" | "demande" | "rappel" | "invite";
  contenu_id: number;
  titre: string;
  lu: boolean;
  created_at: string;
};

// Vers quelle route envoie un type de contenu donné.
function lienVers(n: Notification): string {
  switch (n.type_contenu) {
    case "demande":
      return `/demandes/${n.contenu_id}`;
    case "evenement":
      return `/evenements`;
    case "sondage":
      return `/sondages`;
    case "invite":
      return `/invites`;
    case "rappel":
    case "recommandation":
      return `/recommandations`;
    default:
      return `/`;
  }
}

export function NotificationsBell() {
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const key = ["notifications", profile?.id] as const;

  // Ferme le panneau au clic en dehors.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const q = useQuery({
    queryKey: key,
    enabled: !!profile,
    refetchInterval: 30_000, // rafraîchit toutes les 30 s
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("membre_id", profile!.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data as Notification[];
    },
  });

  const notifications = q.data ?? [];
  const nonLues = notifications.filter((n) => !n.lu).length;

  const marquerLue = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from("notifications")
        .update({ lu: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const toutMarquerLu = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ lu: true })
        .eq("membre_id", profile!.id)
        .eq("lu", false);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const supprimer = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  async function ouvrir(n: Notification) {
    if (!n.lu) await marquerLue.mutateAsync(n.id);
    setOpen(false);
    navigate({ to: lienVers(n) });
  }

  // On part d'une valeur neutre identique côté serveur et côté client,
  // puis on lit la vraie permission après le montage (évite le mismatch
  // d'hydratation React #418 : Notification n'existe pas au SSR).
  const [pushEtat, setPushEtat] = useState<NotificationPermission | "unsupported" | null>(null);

  useEffect(() => {
    setPushEtat(permissionPush());
  }, []);

  async function activerNotifsPush() {
    if (!profile) return;
    const res = await activerPush(profile.id);
    setPushEtat(permissionPush());
    if (!res.ok && res.raison) alert(res.raison);
  }

  if (!profile) return null;

  return (
    <div className="relative" ref={containerRef}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((o) => !o)}
        className="relative text-[#1F676F] hover:bg-[#1F676F]/10 hover:text-[#1F676F]"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {nonLues > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
            {nonLues > 9 ? "9+" : nonLues}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-md border bg-popover text-popover-foreground shadow-md">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            {nonLues > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={() => toutMarquerLu.mutate()}
              >
                Tout marquer comme lu
              </Button>
            )}
          </div>
          {pushEtat !== null && pushEtat !== "granted" && (
            <div className="border-b px-3 py-2">
              {pushEtat === "unsupported" ? (
                <p className="text-xs text-muted-foreground">
                  Notifications non disponibles sur cet appareil.
                </p>
              ) : pushEtat === "denied" ? (
                <p className="text-xs text-muted-foreground">
                  Notifications bloquées. Active-les dans les réglages du navigateur.
                </p>
              ) : (
                <Button
                  size="sm"
                  className="h-8 w-full bg-primary text-xs text-primary-foreground"
                  onClick={activerNotifsPush}
                >
                  Activer les notifications sur cet appareil
                </Button>
              )}
            </div>
          )}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                Aucune notification.
              </p>
            )}
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`flex items-stretch border-b transition-colors hover:bg-muted ${
                  n.lu ? "opacity-60" : ""
                }`}
              >
                <button
                  onClick={() => ouvrir(n)}
                  className="flex flex-1 flex-col items-start gap-0.5 px-3 py-2.5 text-left"
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {!n.lu && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
                    )}
                    {n.titre}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(n.created_at).toLocaleString("fr-FR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </button>
                <button
                  onClick={() => supprimer.mutate(n.id)}
                  disabled={supprimer.isPending}
                  aria-label="Supprimer la notification"
                  className="flex shrink-0 items-center px-3 text-muted-foreground transition-colors hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}