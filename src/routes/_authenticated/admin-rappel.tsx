import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, hasRole } from "@/hooks/use-profile";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin-rappel")({
  component: AdminRappel,
});

type RappelConfig = {
  actif: boolean;
  jour_semaine: number;
  heure: number;
  message: string;
  cibler_sans_saisie: boolean;
};

const JOURS = [
  { v: 1, label: "Lundi" },
  { v: 2, label: "Mardi" },
  { v: 3, label: "Mercredi" },
  { v: 4, label: "Jeudi" },
  { v: 5, label: "Vendredi" },
  { v: 6, label: "Samedi" },
  { v: 7, label: "Dimanche" },
];

function AdminRappel() {
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const [form, setForm] = useState<RappelConfig | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["rappel-config"],
    queryFn: async (): Promise<RappelConfig> => {
      const { data, error } = await supabase
        .from("rappel_config")
        .select("actif, jour_semaine, heure, message, cibler_sans_saisie")
        .eq("id", 1)
        .single();
      if (error) throw error;
      return data as RappelConfig;
    },
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const enregistrer = useMutation({
    mutationFn: async (cfg: RappelConfig) => {
      const { error } = await supabase.from("rappel_config").update(cfg).eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rappel mis à jour");
      qc.invalidateQueries({ queryKey: ["rappel-config"] });
    },
    onError: (e) => toast.error("Erreur : " + e.message),
  });

  if (!hasRole(profile?.role, "admin")) {
    return <p className="p-6">Accès réservé à l'administrateur.</p>;
  }
  if (isLoading || !form) return <p className="p-6">Chargement…</p>;

  return (
    <div className="max-w-xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold text-[#00424A]">Rappel hebdomadaire des contributions</h1>

      <div className="rounded-2xl shadow p-5 space-y-5 bg-white">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={form.actif}
            onChange={(e) => setForm({ ...form, actif: e.target.checked })}
          />
          <span className="font-medium">Rappel activé</span>
        </label>

        <div className="flex gap-4">
          <label className="flex-1">
            <span className="block text-sm mb-1">Jour</span>
            <select
              className="w-full border rounded-lg p-2"
              value={form.jour_semaine}
              onChange={(e) => setForm({ ...form, jour_semaine: Number(e.target.value) })}
            >
              {JOURS.map((j) => (
                <option key={j.v} value={j.v}>
                  {j.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex-1">
            <span className="block text-sm mb-1">Heure</span>
            <select
              className="w-full border rounded-lg p-2"
              value={form.heure}
              onChange={(e) => setForm({ ...form, heure: Number(e.target.value) })}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}h00
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="block text-sm mb-1">Message de la notification</span>
          <textarea
            className="w-full border rounded-lg p-2 min-h-[80px]"
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
          />
        </label>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={form.cibler_sans_saisie}
            onChange={(e) => setForm({ ...form, cibler_sans_saisie: e.target.checked })}
          />
          <span>
            N'envoyer qu'aux membres sans saisie cette semaine
            <span className="block text-xs text-gray-500">
              Décoché : envoi à tous les membres actifs.
            </span>
          </span>
        </label>

        <button
          className="w-full rounded-xl py-3 font-semibold text-white"
          style={{ backgroundColor: "#006875" }}
          disabled={enregistrer.isPending}
          onClick={() => enregistrer.mutate(form)}
        >
          {enregistrer.isPending ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>

      <p className="text-xs text-gray-500">
        Le rappel part automatiquement le jour et à l'heure choisis (fuseau Europe/Paris). Au clic,
        le membre est redirigé vers la page Recommandations.
      </p>
    </div>
  );
}
