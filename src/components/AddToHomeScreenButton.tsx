import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Plateforme = "ios" | "android" | "autre";

function detecterPlateforme(): Plateforme {
  if (typeof navigator === "undefined") return "autre";
  const ua = navigator.userAgent.toLowerCase();
  // iPad récent se présente parfois comme un Mac : on teste le tactile en plus
  const estIOS =
    /iphone|ipad|ipod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (estIOS) return "ios";
  if (/android/.test(ua)) return "android";
  return "autre";
}

function estEnModeStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // Cas Android / navigateurs modernes
  const viaMedia = window.matchMedia?.("(display-mode: standalone)").matches;
  // Cas iOS Safari (propriété non standard)
  const viaIOS = (window.navigator as any).standalone === true;
  return Boolean(viaMedia || viaIOS);
}

export function AddToHomeScreenButton() {
  // On rend null par défaut tant qu'on n'a pas évalué l'environnement,
  // pour éviter tout décalage d'hydratation côté TanStack Start (SSR).
  const [afficher, setAfficher] = useState(false);
  const [plateforme, setPlateforme] = useState<Plateforme>("autre");

  useEffect(() => {
    if (estEnModeStandalone()) {
      setAfficher(false);
      return;
    }
    setPlateforme(detecterPlateforme());
    setAfficher(true);
  }, []);

  if (!afficher) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Installer l'application sur l'écran d'accueil"
          className="inline-flex items-center gap-2 rounded-full border border-primary/30 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Smartphone className="h-4 w-4" />
          <span className="hidden sm:inline">Installer l'app</span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#00424A]">
            Ajouter l'application à votre écran d'accueil
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
          {plateforme === "ios" && (
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Ouvrez cette page dans <strong>Safari</strong> (l'installation
                ne fonctionne pas depuis Chrome sur iPhone).
              </li>
              <li>
                Touchez l'icône <strong>Partager</strong> (le carré avec une
                flèche vers le haut), en bas de l'écran.
              </li>
              <li>
                Faites défiler puis touchez{" "}
                <strong>« Sur l'écran d'accueil »</strong>.
              </li>
              <li>
                Touchez <strong>« Ajouter »</strong> en haut à droite. L'icône
                OLB apparaît sur votre écran d'accueil.
              </li>
            </ol>
          )}

          {plateforme === "android" && (
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Ouvrez le menu de <strong>Chrome</strong> : les trois points
                <strong> ⋮ </strong> en haut à droite.
              </li>
              <li>
                Touchez <strong>« Ajouter à l'écran d'accueil »</strong> (ou
                « Installer l'application »).
              </li>
              <li>
                Confirmez avec <strong>« Ajouter »</strong>. L'icône OLB
                apparaît sur votre écran d'accueil.
              </li>
            </ol>
          )}

          {plateforme === "autre" && (
            <div className="space-y-2">
              <p>
                Sur ordinateur, dans Chrome ou Edge, cliquez sur l'icône
                d'installation dans la barre d'adresse (à droite), puis sur
                <strong> « Installer »</strong>.
              </p>
              <p>
                Sur téléphone, ouvrez cette page dans le navigateur puis
                utilisez le menu pour « Ajouter à l'écran d'accueil ».
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}