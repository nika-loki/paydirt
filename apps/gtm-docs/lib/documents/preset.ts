/**
 * The `preset` document (spec D5): one canned object schema for the studio
 * palette — fields with types and PII hints plus the source vendor. Field
 * shape mirrors `DataField` from `components/data-model/types.ts`; the
 * `satisfies` on FIELD_TYPE_VALUES makes drift a compile error.
 */

import { z } from 'zod';

import { FIELD_TYPES } from '../../components/data-model/types';

import { envelopeSchema, PRESET_SLUG_PATTERN, type DocumentEnvelopeOf } from './envelope';

/** The model kit's field types, mirrored for the zod enum (parity-checked). */
const FIELD_TYPE_VALUES = [
  'id',
  'string',
  'email',
  'phone',
  'url',
  'number',
  'boolean',
  'date',
  'datetime',
  'enum',
  'array',
  'object',
] as const satisfies readonly (typeof FIELD_TYPES)[number][];

const presetFieldSchema = z.object({
  name: z.string().min(1),
  type: z.enum(FIELD_TYPE_VALUES),
  key: z.boolean().optional(),
  unique: z.boolean().optional(),
  pii: z.boolean().optional(),
  description: z.string().optional(),
  enumValues: z.array(z.string().min(1)).optional(),
});

export const presetSchema = envelopeSchema('preset').extend({
  /** Slug is exactly `<vendor>.<object>`, both lowercase kebab-case. */
  slug: z.string().regex(PRESET_SLUG_PATTERN, {
    error: 'preset slug must be <vendor>.<object> — two lowercase kebab-case parts joined by one dot',
  }),
  /** Owning vendor, display form ("HubSpot"). */
  source: z.string().min(1),
  fields: z.array(presetFieldSchema).min(1),
});

export type PresetDocument = z.infer<typeof presetSchema>;

export function parsePreset(input: unknown): PresetDocument {
  return presetSchema.parse(input);
}
