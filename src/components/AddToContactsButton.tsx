import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Loader2, UserPlus } from "lucide-react";
import { telechargerVCard, type ContactVCard } from "@/lib/vcard";

/** Télécharge la fiche contact (.vcf) du membre pour l'ajouter au carnet d'adresses. */
export function AddToContactsButton({ contact }: { contact: ContactVCard }) {
  const [etat, setEtat] = useState<"idle" | "loading" | "done">("idle");

  const ajouter = async () => {
    setEtat("loading");
    try {
      await telechargerVCard(contact);
      setEtat("done");
      setTimeout(() => setEtat("idle"), 2000);
    } catch {
      setEtat("idle");
    }
  };

  return (
    <Button size="sm" variant="outline" onClick={ajouter} disabled={etat === "loading"}>
      {etat === "loading" ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : etat === "done" ? (
        <Check className="h-4 w-4 text-green-600" />
      ) : (
        <UserPlus className="h-4 w-4" />
      )}
      Ajouter à mes contacts
    </Button>
  );
}
