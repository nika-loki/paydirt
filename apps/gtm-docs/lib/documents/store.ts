/**
 * The DocumentStore (spec D15): one interface (list/get/put/delete) over the
 * D5 document kinds. Phase 1 ships the filesystem adapter only — repo
 * `content/`, atomic writes, slug-derived paths (clients never supply paths,
 * so the content/ allowlist is structural). No outbound HTTP anywhere.
 */

import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

import type { Document, DocumentKind } from './index';
import { validateDocument } from './index';
import { isDocumentKind, SLUG_PATTERN } from './envelope';
import { stringifyDocument } from './serialize';

/** kind → directory under the store root. */
const KIND_DIRECTORIES: Record<DocumentKind, string> = {
  board: 'boards',
  'system-record': 'systems',
  preset: 'presets',
  app: 'apps',
  vocab: 'vocab',
};

/** kind → filename suffix (`boards/x.board.json`, `systems/x.doc.json`, …). */
const KIND_FILE_SUFFIX: Record<DocumentKind, string> = {
  board: '.board.json',
  'system-record': '.doc.json',
  preset: '.json',
  app: '.json',
  vocab: '.json',
};

function fileNameFor(kind: DocumentKind, slug: string): string {
  return `${slug}${KIND_FILE_SUFFIX[kind]}`;
}

/** Inverse of fileNameFor — null when the filename isn't this kind's shape. */
function slugFromFileName(kind: DocumentKind, fileName: string): string | null {
  const suffix = KIND_FILE_SUFFIX[kind];
  if (!fileName.endsWith(suffix)) return null;
  const slug = fileName.slice(0, -suffix.length);
  return SLUG_PATTERN.test(slug) ? slug : null;
}

/** Thrown by get/delete when the addressed document does not exist. */
export class DocumentNotFoundError extends Error {
  constructor(kind: DocumentKind, slug: string) {
    super(`no ${kind} document with slug "${slug}"`);
    this.name = 'DocumentNotFoundError';
  }
}

export interface DocumentStore {
  /** All documents, or one kind's, validated. */
  list(kind?: DocumentKind): Promise<Document[]>;
  /** One document, or null when missing. */
  get(kind: DocumentKind, slug: string): Promise<Document | null>;
  /** Validate-shape-then-write atomically; path derived from kind+slug. */
  put(doc: Document): Promise<void>;
  /** Remove one document (confirmation is the caller's business). */
  delete(kind: DocumentKind, slug: string): Promise<void>;
}

/**
 * Filesystem adapter rooted at a `content/` directory. Paths are derived from
 * kind+slug through the envelope slug pattern — hostile slugs are rejected
 * before anything reaches the filesystem.
 */
export class FilesystemDocumentStore implements DocumentStore {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  /** Derive the absolute path for kind+slug; hostile input never gets here. */
  private pathFor(kind: DocumentKind, slug: string): string {
    if (!isDocumentKind(kind)) {
      throw new Error(`unknown document kind: ${JSON.stringify(kind)}`);
    }
    if (!SLUG_PATTERN.test(slug)) {
      throw new Error(
        `invalid document slug ${JSON.stringify(slug)} — paths are derived from slugs, never client-supplied`,
      );
    }
    const target = resolve(join(this.root, KIND_DIRECTORIES[kind], fileNameFor(kind, slug)));
    // Defense in depth: the resolved path must stay under the store root.
    if (target !== this.root && !target.startsWith(`${this.root}${sep}`)) {
      throw new Error('derived path escaped the store root');
    }
    return target;
  }

  async list(kind?: DocumentKind): Promise<Document[]> {
    const kinds: DocumentKind[] = kind === undefined ? (Object.keys(KIND_DIRECTORIES) as DocumentKind[]) : [kind];
    const documents: Document[] = [];
    for (const k of kinds) {
      if (!isDocumentKind(k)) {
        throw new Error(`unknown document kind: ${JSON.stringify(k)}`);
      }
      const dir = join(this.root, KIND_DIRECTORIES[k]);
      for (const file of await this.walkJsonFiles(dir)) {
        const slug = slugFromFileName(k, file.relative);
        if (slug === null) continue;
        const doc = await this.get(k, slug);
        if (doc !== null) documents.push(doc);
      }
    }
    return documents;
  }

  async get(kind: DocumentKind, slug: string): Promise<Document | null> {
    const target = this.pathFor(kind, slug);
    let raw: string;
    try {
      raw = await readFile(target, 'utf8');
    } catch {
      return null; // missing (or unreadable) → absent, not an error
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(
        `${target} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return validateDocument(parsed);
  }

  async put(doc: Document): Promise<void> {
    // Re-derive kind/slug defensively; the slug pattern gates the write.
    const kind = doc.kind;
    const slug = doc.slug;
    const target = this.pathFor(kind, slug);
    const bytes = stringifyDocument(doc);

    await mkdir(dirname(target), { recursive: true });
    // Atomic write: temp file in the same directory, then rename over.
    const temp = `${target}.tmp-${process.pid.toString(36)}-${Date.now().toString(36)}`;
    await writeFile(temp, bytes, 'utf8');
    await rename(temp, target);
  }

  async delete(kind: DocumentKind, slug: string): Promise<void> {
    const target = this.pathFor(kind, slug);
    try {
      await rm(target, { force: false });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') throw new DocumentNotFoundError(kind, slug);
      throw error;
    }
  }

  /** Relative paths of *.json files under dir, skipping dot-directories. */
  private async walkJsonFiles(dir: string): Promise<{ relative: string }[]> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return []; // kind directory absent (e.g. systems/ in Phase 1)
    }
    const files: { relative: string }[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue; // dot dirs + dot files
      if (entry.isDirectory()) {
        const nested = await this.walkJsonFiles(join(dir, entry.name));
        files.push(...nested.map((f) => ({ relative: `${entry.name}/${f.relative}` })));
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        files.push({ relative: entry.name });
      }
    }
    return files;
  }
}
