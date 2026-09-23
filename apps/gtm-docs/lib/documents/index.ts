/**
 * lib/documents — the JSON document model (spec D5) and its public surface.
 *
 * `validateDocument` dispatches by `kind` to the per-kind schemas; the
 * content-walk gate (lib/documents/content.test.ts, run by `pnpm --filter
 * gtm-docs validate` and `pnpm test`) validates every document under
 * content/ so malformed or schema-drifted documents fail CI. `validateAll`
 * is the same walk as a library call for external tooling.
 */

import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  DOCUMENT_KINDS,
  isDocumentKind,
  schemaUrl,
  type DocumentKind,
} from './envelope';
import { parseBoardDocument, type BoardDocument } from './board';
import { parseSystemRecord, systemRecordSchema, type SystemRecordDocument } from './system-record';
import { parsePreset, presetSchema, type PresetDocument } from './preset';
import { parseApp, appSchema, APP_CATEGORIES, type AppDocument } from './app';
import { parseVocab, vocabSchema, type VocabDocument } from './vocab';
import { stringifyDocument } from './serialize';

export { DOCUMENT_KINDS, isDocumentKind, schemaUrl, type DocumentKind };
export { SLUG_PATTERN, PRESET_SLUG_PATTERN, CREDENTIAL_NAME_PATTERN } from './envelope';
export { canonicalize, stringifyDocument } from './serialize';
export { systemRecordSchema };
export { presetSchema };
export { appSchema, APP_CATEGORIES };
export { vocabSchema };

/** Any validated document. */
export type Document =
  | BoardDocument
  | SystemRecordDocument
  | PresetDocument
  | AppDocument
  | VocabDocument;

const PARSERS: Record<DocumentKind, (input: unknown) => Document> = {
  board: parseBoardDocument,
  'system-record': parseSystemRecord,
  preset: parsePreset,
  app: parseApp,
  vocab: parseVocab,
};

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('a document must be a JSON object');
  }
  // The guard leaves the broad `object` type; JSON-parsed input here is
  // necessarily a plain record.
  return value as Record<string, unknown>;
}

/**
 * Validate an unknown value as a document, dispatching by `kind`. Throws the
 * first schema error (envelope, version gate, or payload) — invalid documents
 * fail builds and saves loudly (spec D5 "validated at build time").
 */
export function validateDocument(input: unknown): Document {
  const record = asRecord(input);
  const kind = record.kind;
  if (typeof kind !== 'string' || !isDocumentKind(kind)) {
    throw new Error(
      `unknown document kind ${JSON.stringify(kind)} — expected one of: ${DOCUMENT_KINDS.join(', ')}`,
    );
  }
  return PARSERS[kind](record);
}

/** One validated document plus the path it was read from. */
export interface ValidatedDocument {
  path: string;
  doc: Document;
}

/**
 * Walk EXACTLY the five kind directories under root — content/boards/,
 * content/apps/, content/presets/, content/vocab/, content/systems/ —
 * skipping dot-directory segments (e.g. .mimosa/), and validate every
 * *.json file. content/docs/ is never walked: its meta.json page-tree files
 * are not documents.
 */
export async function validateAll(root: string): Promise<ValidatedDocument[]> {
  const kindDirs: ReadonlyArray<[string, DocumentKind]> = [
    ['boards', 'board'],
    ['apps', 'app'],
    ['presets', 'preset'],
    ['vocab', 'vocab'],
    ['systems', 'system-record'],
  ];

  const found: ValidatedDocument[] = [];

  for (const [dir, kind] of kindDirs) {
    const abs = join(root, dir);
    if (!existsSync(abs)) continue; // e.g. systems/ has no Phase 1 content

    const queue: string[] = [abs];
    while (queue.length > 0) {
      const current = queue.shift() as string;
      const entries = await readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue; // dot dirs/files
        const entryPath = join(current, entry.name);
        if (entry.isDirectory()) {
          queue.push(entryPath);
          continue;
        }
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue;

        const raw = await readFile(entryPath, 'utf8');
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch (error) {
          throw new Error(
            `${entryPath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        found.push({ path: entryPath, doc: validateDocument(parsed) });
      }
    }
  }

  return found;
}
