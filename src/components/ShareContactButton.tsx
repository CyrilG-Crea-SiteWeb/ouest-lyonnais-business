import { useState } from "react";
import { toast } from "sonner";
import { Check, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Partage le lien public de l'annuaire qui ouvre directement la fiche de ce contact.
 * Sur mobile, ouvre le menu de partage natif (WhatsApp, SMS…) ; sinon copie le lien.
 */
export function ShareContactButton({
  slug,
  contact,
}: {
  slug: string;
  contact: { prenom: string; nom: string; entreprise: string | null };
}) {
  const [copied, setCopied] = useState(false);

  const partager = async () => {
    const url = `${window.location.origin}/annuaire?membre=${encodeURIComponent(slug)}`;
    const nomComplet = `${contact.prenom} ${contact.nom}`;
    const estMobile = window.matchMedia?.("(pointer: coarse)").matches;

    if (estMobile && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `${nomComplet} — OLB`,
          text: `Contact du réseau OLB : ${nomComplet}${contact.entreprise ? ` (${contact.entreprise})` : ""}`,
          url,
        });
        return;
      } catch (e) {
        // L'utilisateur a fermé le menu de partage : rien à faire.
        if (e instanceof DOMException && e.name === "AbortError") return;
        // Autre échec (partage indisponible…) : on retombe sur la copie du lien.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Impossible de copier le lien.");
    }
  };

  return (
    <Button size="sm" variant="outline" onClick={partager} className="transition-colors">
      {copied ? (
        <>
          <Check className="h-4 w-4 text-green-600" /> Lien copié
        </>
      ) : (
        <>
          <Share2 className="h-4 w-4" /> Partager ce contact
        </>
      )}
    </Button>
  );
}
