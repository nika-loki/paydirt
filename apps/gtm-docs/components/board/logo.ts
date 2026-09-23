/**
 * logo.dev integration (spec D13): app documents carry a `domain`, and every
 * surface that shows an app chip renders the vendor logo from logo.dev.
 * The token is a PUBLIC client-embed key (pk_) — safe to commit and ship in
 * the client. A secret sk_ key must never be treated this way.
 */

export const LOGO_DEV_TOKEN = 'pk_QKi6yHcXQTCFQV_7X8RPYw';

/** Logo URL for a domain via logo.dev; undefined when no domain is set. */
export function logoDevUrl(domain: string | undefined): string | undefined {
  if (domain === undefined || domain.trim() === '') return undefined;
  return `https://img.logo.dev/${domain.trim()}?token=${LOGO_DEV_TOKEN}`;
}
