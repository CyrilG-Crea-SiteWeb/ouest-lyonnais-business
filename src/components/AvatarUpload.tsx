// src/components/AvatarUpload.tsx
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2 } from "lucide-react";

type AvatarUploadProps = {
  /** URL actuelle (membres.photo_url) */
  value: string;
  /** id auth du membre connecté (= profile.id) */
  membreId: string;
  /** initiales pour le fallback de l'avatar */
  initiales?: string;
  /** remonte la nouvelle URL (upload signé ou lien collé) */
  onChange: (url: string) => void;
  /**
   * Optionnel : remplace l'upload client direct. Utilisé côté admin pour
   * téléverser la photo d'un autre membre via une server function (service role),
   * l'upload direct étant bloqué par les règles RLS du bucket privé. Doit
   * renvoyer l'URL (signée) de l'image téléversée.
   */
  uploadFile?: (file: File) => Promise<string>;
};

// URL signée valable 1 an (en secondes).
const DUREE_URL = 60 * 60 * 24 * 365;

export function AvatarUpload({
  value,
  membreId,
  initiales,
  onChange,
  uploadFile,
}: AvatarUploadProps) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErreur(null);

    if (!file.type.startsWith("image/")) {
      setErreur("Le fichier doit être une image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErreur("Image trop lourde (5 Mo maximum).");
      return;
    }

    setEnCours(true);
    try {
      if (uploadFile) {
        // Upload délégué (ex. admin téléversant pour un autre membre).
        onChange(await uploadFile(file));
      } else {
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const chemin = `${membreId}/avatar.${ext}`;

        const { error: upErr } = await supabase.storage
          .from("avatars")
          .upload(chemin, file, { upsert: true });
        if (upErr) throw upErr;

        // Bucket privé -> URL signée.
        const { data, error: signErr } = await supabase.storage
          .from("avatars")
          .createSignedUrl(chemin, DUREE_URL);
        if (signErr) throw signErr;

        onChange(data.signedUrl);
      }
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Échec de l'upload.");
    } finally {
      setEnCours(false);
      // permet de re-sélectionner le même fichier ensuite
      e.target.value = "";
    }
  }

  return (
    <div className="space-y-4">
      {/* Aperçu */}
      <div className="flex items-center gap-4">
        <Avatar className="h-20 w-20">
          <AvatarImage src={value || undefined} alt="Photo de profil" />
          <AvatarFallback>{initiales || "?"}</AvatarFallback>
        </Avatar>
        {enCours && (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Envoi en cours…
          </span>
        )}
      </div>

      {/* Upload fichier */}
      <div className="space-y-1.5">
        <Label htmlFor="photo_file">Téléverser une photo</Label>
        <Input
          id="photo_file"
          type="file"
          accept="image/*"
          onChange={handleFile}
          disabled={enCours}
        />
        <p className="text-xs text-muted-foreground">
          Image carrée recommandée (400 × 400 px, jusqu'à 800 × 800 px pour plus de netteté). JPG ou
          PNG, 5 Mo maximum. La photo est recadrée en cercle.
        </p>
        {erreur && <p className="text-xs text-destructive">{erreur}</p>}
      </div>

      {/* OU lien */}
      <div className="space-y-1.5">
        <Label htmlFor="photo_url">…ou coller un lien</Label>
        <Input
          id="photo_url"
          type="url"
          placeholder="https://…"
          defaultValue={value}
          onBlur={(e) => onChange(e.target.value.trim())}
        />
      </div>
    </div>
  );
}
