import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { membreCorrespond, type MembreOption } from "@/lib/membres-recherche";

/**
 * Sélecteur de membre avec recherche (prénom, nom ou entreprise, sans tenir
 * compte des accents). Remplace un Select dont la liste devient longue à
 * parcourir avec une trentaine de membres.
 */
export function MembreCombobox({
  membres,
  value,
  onChange,
  placeholder = "Choisir un membre…",
}: {
  membres: MembreOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selection = membres.find((m) => m.id === value);
  const parId = new Map(membres.map((m) => [m.id, m]));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between bg-background font-normal hover:bg-background hover:text-foreground"
        >
          <span className={cn("truncate", !selection && "text-muted-foreground")}>
            {selection
              ? `${selection.prenom} ${selection.nom}${selection.entreprise ? ` — ${selection.entreprise}` : ""}`
              : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0" align="start">
        <Command
          // Filtre maison : insensible aux accents, tous les mots doivent correspondre.
          filter={(id, recherche) => {
            const m = parId.get(id);
            return m && membreCorrespond(m, recherche) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Rechercher un membre…" />
          <CommandList className="max-h-80">
            <CommandEmpty>Aucun membre trouvé.</CommandEmpty>
            {membres.map((m) => (
              <CommandItem
                key={m.id}
                value={m.id}
                onSelect={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn("mr-2 h-4 w-4", value === m.id ? "opacity-100" : "opacity-0")}
                />
                <span className="truncate">
                  {m.prenom} {m.nom}
                  {m.entreprise && <span className="text-muted-foreground"> — {m.entreprise}</span>}
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
