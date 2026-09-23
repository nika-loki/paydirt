/**
 * The `vocab` document (spec D5/D13): one seeded, owner-extensible
 * vocabulary — `motions`, `mechanisms`, `app-categories`. Nodes, edges, and
 * app categories validate against these at build: extend the list, not the
 * schema.
 */

import { z } from 'zod';

import { envelopeSchema } from './envelope';

export const vocabSchema = envelopeSchema('vocab').extend({
  /** Kebab-case terms; order is authored (display order), not canonical. */
  values: z
    .array(z.string().regex(/^[a-z][a-z0-9-]*$/, {
      error: 'vocab terms must be kebab-case (lowercase letters, digits, hyphens)',
    }))
    .min(1),
});

export type VocabDocument = z.infer<typeof vocabSchema>;

export function parseVocab(input: unknown): VocabDocument {
  return vocabSchema.parse(input);
}
