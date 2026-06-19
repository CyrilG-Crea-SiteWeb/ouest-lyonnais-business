import { Link } from "@tanstack/react-router";
import { useProfile } from "@/hooks/use-profile";
import { KeyRound, X } from "lucide-react";
import { useState } from "react";

/**
 * Bannière invitant l'utilisateur à définir son mot de passe.
 * S'affiche tant que mdp_defini est faux/null (cas typique d'un compte
 * créé par invitation : l'utilisateur est entré via un lien magique et
 * n'a pas encore choisi de mot de passe personnel).
 * Disparaît automatiquement une fois le mot de passe défini.
 */
export function DefinirMdpBanner() {
  const { data: profile } = useProfile();
  const [masque, setMasque] = useState(false);

  // Rien à afficher si pas de profil, mot de passe déjà défini, ou masqué pour la session
  if (!profile || profile.mdp_defini || masque) return null;

  return (
    <div className="mb-4 rounded-lg border border-[#F6A000]/40 bg-[#FFF7E8] px-4 py-3 flex items-start gap-3">
      <KeyRound className="h-5 w-5 text-[#F6A000] shrink-0 mt-0.5" />
      <div className="flex-1 text-sm">
        <p className="font-semibold text-[#00424A]">Définissez votre mot de passe</p>
        <p className="text-muted-foreground">
          Pour pouvoir vous reconnecter facilement sur tous vos appareils,
          choisissez un mot de passe personnel.
        </p>
        <Link
          to="/definir-mot-de-passe"
          className="inline-block mt-2 rounded-md bg-[#006875] px-3 py-1.5 text-white text-sm font-medium hover:bg-[#00525c] transition-colors"
        >
          Définir mon mot de passe
        </Link>
      </div>
      <button
        type="button"
        onClick={() => setMasque(true)}
        aria-label="Masquer"
        className="text-muted-foreground hover:text-foreground shrink-0"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}