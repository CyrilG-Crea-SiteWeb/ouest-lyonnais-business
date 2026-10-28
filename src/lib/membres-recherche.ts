/** Recherche de membres par prénom, nom ou entreprise, insensible aux accents. */

export type MembreOption = { id: string; prenom: string; nom: string; entreprise: string | null };

/** Minuscules sans accents : « Éric » et « eric » se trouvent mutuellement. */
export const normaliser = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Vrai si tous les mots de la recherche figurent dans le prénom, le nom ou l'entreprise. */
export function membreCorrespond(m: MembreOption, recherche: string) {
  const texte = normaliser(`${m.prenom} ${m.nom} ${m.entreprise ?? ""}`);
  return normaliser(recherche)
    .split(/\s+/)
    .filter(Boolean)
    .every((mot) => texte.includes(mot));
}
