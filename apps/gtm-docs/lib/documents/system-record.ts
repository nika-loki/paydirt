/**
 * The `system-record` document (spec D5): the structured half of a GTM system
 * page — summary, trigger & outcome, board references, governance (blast
 * radius, credential NAMES, deploy-recipe link), build/run metadata.
 *
 * Phase 1 ships the schema only: no content, no editor (Phase 2 migrates the
 * existing MDX system pages onto this kind).
 */

import { z } from 'zod';

import { credentialNameSchema, envelopeSchema, type DocumentEnvelopeOf } from './envelope';

export const systemRecordSchema = envelopeSchema('system-record').extend({
  /** Markdown string — prose-in-JSON is edited with live preview (spec D5). */
  summary: z.string(),
  trigger: z.string().min(1),
  outcome: z.string().min(1),
  /** Slugs of `board` documents that map this system. */
  boards: z.array(z.string().min(1)).default([]),
  governance: z.object({
    /** Which systems feel it when this record misbehaves. */
    blastRadius: z.string().min(1),
    /** Env-var NAMES only — values never appear anywhere (repo rule). */
    credentials: z.array(credentialNameSchema).default([]),
    /** Link/path to the deploy recipe (build docs). */
    deployRecipe: z.string().min(1),
  }),
  /** Build-time setup steps (markdown strings). */
  build: z.array(z.string()).default([]),
  /** Run-time operational steps (markdown strings). */
  run: z.array(z.string()).default([]),
});

export type SystemRecordDocument = z.infer<typeof systemRecordSchema>;

export function parseSystemRecord(input: unknown): SystemRecordDocument {
  return systemRecordSchema.parse(input);
}
