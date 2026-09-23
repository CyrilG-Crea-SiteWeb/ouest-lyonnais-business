type MembreSlugSource = { id: string; prenom: string; nom: string };

/** "Jean-Pierre Dupré" → "jean-pierre-dupre". */
export function slugifierNom(prenom: string, nom: string): string {
  return `${prenom} ${nom}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Associe à chaque membre un identifiant lisible pour les liens de l'annuaire public
 * (`/annuaire?membre=jean-dupont`). En cas d'homonymes, un suffixe tiré de l'id
 * est ajouté pour les départager (`jean-dupont-3f9a1c`).
 *
 * Doit être appelé avec la même liste des deux côtés (membres actifs) pour que
 * les slugs générés sur la page Membres correspondent à ceux de l'annuaire.
 */
export function slugsAnnuaire(membres: MembreSlugSource[]): Map<string, string> {
  const occurrences = new Map<string, number>();
  for (const m of membres) {
    const base = slugifierNom(m.prenom, m.nom);
    occurrences.set(base, (occurrences.get(base) ?? 0) + 1);
  }

  const slugs = new Map<string, string>();
  for (const m of membres) {
    const base = slugifierNom(m.prenom, m.nom) || "membre";
    const doublon = (occurrences.get(slugifierNom(m.prenom, m.nom)) ?? 0) > 1;
    slugs.set(m.id, doublon ? `${base}-${m.id.replace(/-/g, "").slice(0, 6)}` : base);
  }
  return slugs;
}
