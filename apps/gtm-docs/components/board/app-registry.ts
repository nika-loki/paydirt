/**
 * Server-side app registry reader for read-mode `<Board>` embeds.
 *
 * Scans `content/apps/*.json` and projects each app document down to the
 * minimal chip shape the canvas needs (vendor, category, brand colour, logo).
 * The extraction is intentionally lenient — several accepted key spellings,
 * everything optional — so the kit never hard-couples to the app document's
 * full schema and a missing/invalid app doc degrades to a generic node chip
 * (spec D11: an unregistered app never blocks a flow).
 *
 * Server-only: imports `node:fs`. Never import from client modules (import
 * the `AppRegistry` TYPE only — type imports are erased).
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export interface AppChipInfo {
  /** Registry key — matches `data.app` on board nodes (`clay`, `hubspot`). */
  slug: string;
  /** Display name, e.g. "HubSpot". Falls back to the humanised slug. */
  vendor: string;
  category?: string;
  /**
   * Brand colour from the app document (data, not component CSS — the one
   * place hex is legal per D14). Rendered as a small swatch with inline style.
   */
  brandColor?: string;
  /**
   * Logo path. Only rendered when it is already a root-relative URL (starts
   * with `/`) — files under `content/` are not statically served, so registry
   * paths fall back to the swatch until a serving route exists.
   */
  logo?: string;
  /**
   * Vendor domain — renders the logo via logo.dev (D13) when no local logo
   * path applies. Public-embed token lives in components/board/logo.ts.
   */
  domain?: string;
}

export type AppRegistry = Record<string, AppChipInfo>;

/** Candidate roots: app-dir cwd (dev/build) and workspace-root cwd (fallback). */
const CONTENT_ROOTS = ['content', 'apps/gtm-docs/content'];

function pickString(doc: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = doc[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function projectAppDocument(slug: string, raw: unknown): AppChipInfo {
  const doc = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    slug,
    vendor: pickString(doc, ['vendor', 'name']) ?? slug,
    category: pickString(doc, ['category']),
    brandColor: pickString(doc, ['brandColor', 'brandColour', 'color', 'accent']),
    logo: pickString(doc, ['logo', 'logoPath', 'icon']),
    domain: pickString(doc, ['domain', 'website', 'url']),
  };
}

async function readRegistryFrom(root: string): Promise<AppRegistry | null> {
  const dir = path.join(process.cwd(), root, 'apps');
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return null;
  }
  const registry: AppRegistry = {};
  for (const entry of entries.sort()) {
    if (!entry.endsWith('.json')) continue;
    const slug = entry.slice(0, -'.json'.length);
    try {
      const raw: unknown = JSON.parse(await readFile(path.join(dir, entry), 'utf8'));
      registry[slug] = projectAppDocument(slug, raw);
    } catch {
      // A malformed app document must not break board rendering; the build's
      // document walk (lib/documents) is the gate that flags it.
    }
  }
  return registry;
}

/** Read the app registry from disk. Empty registry when `content/apps` is absent. */
export async function loadAppRegistry(): Promise<AppRegistry> {
  for (const root of CONTENT_ROOTS) {
    const registry = await readRegistryFrom(root);
    if (registry !== null) return registry;
  }
  return {};
}
