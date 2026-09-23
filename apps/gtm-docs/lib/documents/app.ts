/**
 * The `app` document (spec D5/D11/D13): one registry entry in the open app
 * vocabulary — vendor, category, optional brand colour/logo, optional rich
 * node profiles. New apps arrive one JSON file at a time; unregistered apps
 * still render as generic nodes.
 */

import { z } from 'zod';

import { envelopeSchema } from './envelope';

/**
 * The seeded category set. The content-walk gate additionally checks category
 * membership against the `app-categories` vocab document, so extending the
 * set means updating both (extend the list AND this enum — kept in lockstep
 * by lib/documents/content.test.ts).
 */
export const APP_CATEGORIES = [
  'marketing',
  'sales',
  'support',
  'success',
  'data',
  'enrichment',
  'ops',
] as const;

export type AppCategory = (typeof APP_CATEGORIES)[number];

export const appSchema = envelopeSchema('app').extend({
  /** Display name, e.g. "HubSpot". */
  vendor: z.string().min(1),
  category: z.enum(APP_CATEGORIES),
  /** Brand colour — hex as DATA inside the document, never in component CSS. */
  brandColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, { error: 'brandColor must be a #rrggbb hex string' })
    .optional(),
  /** Vendor domain (e.g. hubspot.com) — renders the logo via logo.dev (D13). */
  domain: z
    .string()
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i, {
      error: 'domain must be a plain hostname like hubspot.com',
    })
    .optional(),
  /** Logo file under content/apps/assets/ (filename, not a path). */
  logo: z.string().regex(/^[a-z0-9][a-z0-9._-]*\.(png|svg|webp|jpe?g)$/i, {
    error: 'logo must be an asset filename (png/svg/webp/jpg) under content/apps/assets/',
  }).optional(),
  /** Rich node profile ids (clay → clay-table, clay-workflow …). */
  richProfiles: z.array(z.string().min(1)).default([]),
});

export type AppDocument = z.infer<typeof appSchema>;

export function parseApp(input: unknown): AppDocument {
  return appSchema.parse(input);
}
