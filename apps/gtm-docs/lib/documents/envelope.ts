/**
 * The document envelope (spec D5): every structured artefact under `content/`
 * carries `$schema` + `kind` + `version` + `slug` + `title`, and payloads
 * never encode filesystem concerns — references are slugs only.
 *
 * `version` gates migrations: `1` is the only supported version, and anything
 * else fails with an explicit migration message rather than a silent misparse.
 */

import { z } from 'zod';

/** The five document kinds (spec D5 table). */
export const DOCUMENT_KINDS = [
  'board',
  'system-record',
  'preset',
  'app',
  'vocab',
] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export function isDocumentKind(value: string): value is DocumentKind {
  return (DOCUMENT_KINDS as readonly string[]).includes(value);
}

/**
 * Document slug: lowercase, digits, single `-`/`.` between segments. Allows
 * the dotted `<vendor>.<object>` form presets use; rejects slashes, spaces,
 * uppercase, leading separators — so traversal-shaped slugs (`../x`, `a/b`)
 * never survive to become paths.
 */
export const SLUG_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

/** Preset slugs are exactly `<vendor>.<object>`, both lowercase kebab-case. */
export const PRESET_SLUG_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Credential references are env-var NAMES (`SNOWFLAKE_RO_KEY`), never values. */
export const CREDENTIAL_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/** The published schema set (D5 self-describing documents). */
export function schemaUrl(kind: DocumentKind): string {
  return `https://paydirt.dev/schemas/${kind}-v1.json`;
}

export const slugSchema = z.string().regex(SLUG_PATTERN, {
  error:
    'slug must be lowercase with single hyphens or dots between segments — no spaces, slashes, or leading separators',
});

export const credentialNameSchema = z.string().regex(CREDENTIAL_NAME_PATTERN, {
  error: 'credential must be an env-var NAME (UPPER_SNAKE_CASE), never a value',
});

/**
 * The version gate: `1` is the only supported document version. A different
 * value (including a stringly `"1"`) fails with a migration message.
 */
const versionSchema = z.literal(1, {
  error:
    'document version must be exactly 1 — a different version means a future migration is required and this build cannot read it yet',
});

/** Envelope schema for one kind; `$schema` and `kind` must agree. */
export function envelopeSchema<K extends DocumentKind>(kind: K) {
  return z.object({
    $schema: z.literal(schemaUrl(kind)),
    kind: z.literal(kind),
    version: versionSchema,
    slug: slugSchema,
    title: z.string().min(1, { error: 'title is required' }),
  });
}

/** The envelope fields every document carries. */
export interface DocumentEnvelopeOf<K extends DocumentKind> {
  $schema: string;
  kind: K;
  version: 1;
  slug: string;
  title: string;
}
