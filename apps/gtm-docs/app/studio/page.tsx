/**
 * /studio — local-first authoring (spec D2). A server component: loads the
 * registries and documents through the DocumentStore filesystem adapter and
 * hands them to the client editor. In production builds (no write API) the
 * editor mounts read-only with a "clone the repo to edit" affordance (D15).
 */

import path from 'node:path';
import type { Metadata } from 'next';

import { StudioApp } from '@/components/studio/studio-app';
import type {
  AppView,
  BoardDocJson,
  PresetView,
  StudioBootstrap,
  VocabView,
} from '@/components/studio/types';
import type { DocumentKind } from '@/lib/documents';
import { FilesystemDocumentStore } from '@/lib/documents/store';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Studio — paydirt gtm-docs',
  description:
    'Author GTM boards — flow lineage and data models — on a canvas. Local-first: saves land in content/ as reviewable JSON.',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value !== '') return value;
  }
  return undefined;
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function toAppView(doc: unknown): AppView | null {
  if (!isRecord(doc)) return null;
  const slug = asString(doc.slug);
  const title = asString(doc.title, doc.vendor);
  const category = asString(doc.category);
  if (slug === undefined || title === undefined || category === undefined) return null;
  const richRaw = doc.richProfiles ?? doc.richProfile;
  const richProfiles = Array.isArray(richRaw)
    ? asStringList(richRaw)
    : asString(richRaw) !== undefined
      ? [asString(richRaw) as string]
      : [];
  return {
    slug,
    title,
    vendor: asString(doc.vendor, title) as string,
    category,
    ...(asString(doc.brandColor, doc.brand_color) !== undefined
      ? { brandColor: asString(doc.brandColor, doc.brand_color) }
      : {}),
    ...(asString(doc.logo) !== undefined ? { logo: asString(doc.logo) } : {}),
    richProfiles,
  };
}

function toPresetView(doc: unknown): PresetView | null {
  if (!isRecord(doc)) return null;
  const slug = asString(doc.slug);
  const title = asString(doc.title);
  if (slug === undefined || title === undefined) return null;
  const fields = Array.isArray(doc.fields)
    ? doc.fields.flatMap((field): PresetView['fields'] => {
        if (!isRecord(field) || typeof field.name !== 'string' || typeof field.type !== 'string') {
          return [];
        }
        return [
          {
            name: field.name,
            type: field.type as PresetView['fields'][number]['type'],
            key: field.key === true,
            unique: field.unique === true,
            pii: field.pii === true,
            ...(asString(field.description) !== undefined
              ? { description: asString(field.description) }
              : {}),
            ...(asStringList(field.enumValues).length > 0
              ? { enumValues: asStringList(field.enumValues) }
              : {}),
          },
        ];
      })
    : [];
  return {
    slug,
    title,
    name: asString(doc.name, title) as string,
    source: asString(doc.source, doc.sourceVendor, doc.vendor) as string,
    fields,
  };
}

function emptyVocab(): VocabView {
  return { motions: [], mechanisms: [], appCategories: [] };
}

async function loadBootstrap(): Promise<StudioBootstrap> {
  const store = new FilesystemDocumentStore(path.join(process.cwd(), 'content'));

  const safeList = async (kind: DocumentKind): Promise<unknown[]> => {
    try {
      return await store.list(kind);
    } catch {
      return [];
    }
  };

  const [boardDocs, appDocs, presetDocs, vocabDocs] = await Promise.all([
    safeList('board'),
    safeList('app'),
    safeList('preset'),
    safeList('vocab'),
  ]);

  const boards: BoardDocJson[] = boardDocs.filter(
    (doc): doc is BoardDocJson => isRecord(doc) && doc.kind === 'board' && typeof doc.slug === 'string',
  );
  const apps = appDocs
    .map(toAppView)
    .filter((app): app is AppView => app !== null)
    .sort((a, b) => a.vendor.localeCompare(b.vendor));
  const presets = presetDocs
    .map(toPresetView)
    .filter((preset): preset is PresetView => preset !== null);

  const vocab = emptyVocab();
  for (const doc of vocabDocs) {
    if (!isRecord(doc)) continue;
    const slug = asString(doc.slug);
    const values = asStringList(doc.values);
    if (slug === 'motions') vocab.motions = values;
    else if (slug === 'mechanisms') vocab.mechanisms = values;
    else if (slug === 'app-categories') vocab.appCategories = values;
  }

  let exampleBoardJson: string | null = null;
  try {
    const example = await store.get('board', 'icp-pipeline');
    if (example !== null && isRecord(example)) {
      exampleBoardJson = JSON.stringify(example);
    }
  } catch {
    exampleBoardJson = null;
  }

  return {
    writable: process.env.NODE_ENV === 'development',
    boards,
    apps,
    presets,
    vocab,
    exampleBoardJson,
  };
}

export default async function StudioPage() {
  const bootstrap = await loadBootstrap();
  return <StudioApp bootstrap={bootstrap} />;
}
