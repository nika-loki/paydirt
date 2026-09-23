/**
 * Offline unit tests for FilesystemDocumentStore (plan piece 4): roundtrip
 * against a real tmp directory, kind→directory mapping, atomic writes, and
 * derived-path safety (hostile slugs never reach the filesystem).
 *
 * Touches only os.tmpdir() — never the repo's content/, never the network.
 */

import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { validateDocument } from './index';
import { stringifyDocument } from './serialize';
import { FilesystemDocumentStore } from './store';

/** The serializer's declared input type — keeps fixtures type-honest. */
type Serializable = Parameters<typeof stringifyDocument>[0];

// --- fixtures --------------------------------------------------------------------

const boardDoc = {
  $schema: 'https://paydirt.dev/schemas/board-v1.json',
  kind: 'board',
  version: 1,
  slug: 'roundtrip',
  title: 'Roundtrip board',
  boardType: 'flow',
  motions: ['new-business'],
  nodes: [
    {
      id: 'n1',
      archetype: 'source',
      position: { x: 10, y: 20 },
      data: { app: 'snowflake', name: 'Product usage', externalRef: null },
    },
  ],
  edges: [],
};

const vocabDoc = {
  $schema: 'https://paydirt.dev/schemas/vocab-v1.json',
  kind: 'vocab',
  version: 1,
  slug: 'motions',
  title: 'Motions',
  values: ['new-business', 'renewal'],
};

const appDoc = {
  $schema: 'https://paydirt.dev/schemas/app-v1.json',
  kind: 'app',
  version: 1,
  slug: 'campaign',
  title: 'Campaign',
  vendor: 'Campaign',
  category: 'marketing',
};

const presetDoc = {
  $schema: 'https://paydirt.dev/schemas/preset-v1.json',
  kind: 'preset',
  version: 1,
  slug: 'clay.row',
  title: 'Clay Row',
  source: 'Clay',
  fields: [{ name: 'domain', type: 'string', unique: true }],
};

let root: string;
let store: FilesystemDocumentStore;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'paydirt-store-'));
  store = new FilesystemDocumentStore(root);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Recursive listing of relative paths under the tmp root. */
async function tree(dir: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      paths.push(...(await tree(join(dir, entry.name), rel)));
    } else {
      paths.push(rel);
    }
  }
  return paths.sort();
}

// --- roundtrip --------------------------------------------------------------------

describe('FilesystemDocumentStore roundtrip', () => {
  it('put → get returns a byte-identical document (serialize → parse)', async () => {
    await store.put(validateDocument(boardDoc));

    const got = await store.get('board', 'roundtrip');
    expect(stringifyDocument(got as Serializable)).toBe(
      stringifyDocument(boardDoc as Serializable),
    );
  });

  it('writes deterministic bytes to the kind directory with the kind file suffix', async () => {
    const bytes = await readFile(join(root, 'boards', 'roundtrip.board.json'), 'utf8');
    expect(bytes).toBe(stringifyDocument(boardDoc as Serializable));
  });

  it('maps each kind to its directory and file naming', async () => {
    await store.put(validateDocument(vocabDoc));
    await store.put(validateDocument(appDoc));
    await store.put(validateDocument(presetDoc));

    const paths = await tree(root);
    expect(paths).toContain('boards/roundtrip.board.json');
    expect(paths).toContain('vocab/motions.json');
    expect(paths).toContain('apps/campaign.json');
    expect(paths).toContain('presets/clay.row.json');
  });

  it('lists documents per kind', async () => {
    const boards = await store.list('board');
    const slugs = boards.map((doc) => doc.slug);
    expect(slugs).toContain('roundtrip');

    const vocabs = await store.list('vocab');
    expect(vocabs.map((doc) => doc.slug)).toContain('motions');
  });

  it('delete removes exactly the addressed document', async () => {
    await store.delete('vocab', 'motions');

    const paths = await tree(root);
    expect(paths).not.toContain('vocab/motions.json');
    expect(paths).toContain('boards/roundtrip.board.json');
  });
});

// --- atomic writes -----------------------------------------------------------------

describe('atomic writes', () => {
  it('leaves no temp files behind on a successful put', async () => {
    const before = await tree(root);
    await store.put(
      validateDocument({
        ...vocabDoc,
        slug: 'mechanisms',
        title: 'Mechanisms',
        values: ['api-pull', 'webhook'],
      }),
    );
    const after = await tree(root);

    // Exactly one new file, and no stray dot/temp entries anywhere.
    const added = after.filter((path) => !before.includes(path));
    expect(added).toEqual(['vocab/mechanisms.json']);
    expect(after.some((path) => path.includes('.tmp') || path.startsWith('.'))).toBe(false);
  });
});

// --- derived-path safety -------------------------------------------------------------

describe('derived-path safety', () => {
  const hostileSlugs = [
    '../../evil',
    '../escape',
    'a/b',
    '..',
    'boards/../../evil',
  ];

  it('rejects traversal-shaped slugs on put before anything reaches the filesystem', async () => {
    const before = await tree(root);

    for (const slug of hostileSlugs) {
      const hostile = { ...boardDoc, slug };
      await expect(
        store.put(hostile as Parameters<typeof store.put>[0]),
      ).rejects.toThrow();
    }

    // Nothing escaped the root, and nothing new landed anywhere.
    expect(await tree(root)).toEqual(before);
  });

  it('rejects traversal-shaped slugs on get and delete too', async () => {
    for (const slug of hostileSlugs) {
      await expect(store.get('board', slug)).rejects.toThrow();
      await expect(store.delete('board', slug)).rejects.toThrow();
    }
  });

  it('keeps every written path inside the store root', async () => {
    const paths = await tree(root);
    for (const path of paths) {
      expect(path.startsWith('boards/')).toBe(path.endsWith('.board.json'));
      expect(path.includes('..')).toBe(false);
      expect(path.startsWith('/')).toBe(false);
    }
  });
});
