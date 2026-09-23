/**
 * Tiny display helpers shared across the board kit. Zero dependencies —
 * kit code stays extraction-ready for `packages/gtm-docs-kit`.
 */

/** Join truthy class names (a minimal `cn` without tailwind-merge). */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter((value): value is string => typeof value === 'string').join(' ');
}

/** Terms that read better fully capitalised when humanising kebab-case vocab. */
const ACRONYMS = new Set([
  'api',
  'b2b',
  'crm',
  'csv',
  'erp',
  'etl',
  'id',
  'saas',
  'sql',
  'ui',
  'url',
]);

/**
 * `api-pull` → `API pull`, `new-business` → `New business`, `webhook` →
 * `Webhook`. Edges, motion badges, and app chips all speak business language
 * (the read-mode UX bar), never raw kebab-case vocab keys.
 */
export function humanizeTerm(term: string): string {
  const words = term.split(/[-_\s]+/).filter((word) => word.length > 0);
  if (words.length === 0) return term;
  return words
    .map((word, index) => {
      if (ACRONYMS.has(word.toLowerCase())) return word.toUpperCase();
      if (index === 0) return word.charAt(0).toUpperCase() + word.slice(1);
      return word;
    })
    .join(' ');
}
