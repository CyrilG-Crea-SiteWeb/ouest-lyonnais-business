/**
 * Helpers partagés pour le mode « Conférence hebdo ».
 *
 * Le titre stocké en base (`evenements.titre`) n'est qu'un placeholder :
 * le libellé affiché d'une conférence est TOUJOURS calculé côté UI à partir
 * de sa date et de ses intervenants, via `titreConference()`.
 * Réutilisé par la page Événements ET par le tableau de bord.
 */
export function titreConference(dateISO: string, intervenantsNoms: string[]): string {
  const date = new Date(dateISO).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const noms =
    intervenantsNoms.length > 0
      ? intervenantsNoms.join(", ")
      : "intervenant à définir";
  return `Conférence du ${date} — ${noms}`;
}
