import { useState } from "react";
import { HelpCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type HelpButtonProps = {
  title: string;
  children: React.ReactNode;
  /** Texte lu par les lecteurs d'écran (le bouton n'a pas de label visible) */
  ariaLabel?: string;
};

export function HelpButton({ title, children, ariaLabel = "Aide" }: HelpButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#1F676F] transition-colors hover:bg-[#1F676F]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <HelpCircle className="h-5 w-5" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#00424A]">{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}