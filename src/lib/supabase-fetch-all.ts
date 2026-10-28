/**
 * Helpers pour contourner la limite de 1 000 lignes par requête de l'API
 * Supabase (PostgREST) : pagination par `.range()` et découpage des `.in()`.
 */

/** Taille d'une page PostgREST (limite par défaut du projet). */
export const PAGE_SIZE = 1000;
/** Nombre d'ids max par `.in()` pour ne pas dépasser la longueur d'URL. */
export const IN_CHUNK_SIZE = 200;

type PageResult<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

/**
 * Récupère toutes les lignes d'une requête en paginant avec `.range()`.
 * `buildQuery(from, to)` doit reconstruire la requête à chaque appel et lui
 * appliquer `.range(from, to)` ; elle doit avoir un tri stable (ex. `id`) pour
 * que les pages ne se chevauchent pas.
 */
export async function fetchAll<T>(buildQuery: (from: number, to: number) => PageResult<T>) {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    all.push(...page);
    if (page.length < PAGE_SIZE) return all;
  }
}

/** Découpe un tableau en paquets de `size` éléments. */
export function chunk<T>(arr: T[], size = IN_CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Variante de `fetchAll` pour un filtre `.in(colonne, ids)` : les ids sont
 * découpés par paquets de 200, et chaque paquet est paginé.
 * `buildQuery(ids, from, to)` applique `.in(...)` sur `ids` puis `.range(from, to)`.
 */
export async function fetchAllIn<T, K>(
  ids: K[],
  buildQuery: (ids: K[], from: number, to: number) => PageResult<T>,
) {
  const all: T[] = [];
  for (const paquet of chunk(ids)) {
    all.push(...(await fetchAll<T>((from, to) => buildQuery(paquet, from, to))));
  }
  return all;
}
