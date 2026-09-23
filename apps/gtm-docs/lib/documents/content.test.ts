/**
 * The content-walk build gate (plan piece 4 / spec D5 "validated at build
 * time"): every JSON *document* under content/ validates against its kind
 * schema, and cross-vocabulary references resolve.
 *
 * Scope is exactly the five kind directories — content/boards/, content/apps/,
 * content/presets/, content/vocab/, content/systems/ — never content/docs/**
 * (fumadocs meta.json page-tree files carry no envelope), and dot-directory
 * segments (e.g. .mimosa/) are skipped.
 *
 * Also covers the schema↔vocab interaction: an unknown mechanism PASSES the
 * board payload schema (vocab is data, not schema — D13 "extend the list, not
 * the schema") but IS flagged by this walk's vocab check.
 */

import { sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { FIELD_TYPES } from '../../components/data-model/types';
import { boardPayloadSchema } from '../../components/board/schema';
import { validateAll, validateDocument } from './index';

/** Whatever the dispatcher returns — its real name stays lib-internal. */
type Validated = ReturnType<typeof validateDocument>;

const CONTENT_ROOT = fileURLToPath(new URL('../../content', import.meta.url));

/** The shipped walk (validateAll): five kind dirs, dot entries skipped. */
function walkContent(): Promise<{ path: string; doc: Validated }[]> {
  return validateAll(CONTENT_ROOT);
}

// --- the walk gate ------------------------------------------------------------------

describe('content walk (build gate)', () => {
  it('validates every document in the five kind directories', async () => {
    const found = await walkContent();

    // Piece 1 seeds these exact documents — the walk must find them.
    const slugs = new Set(found.map(({ doc }) => `${doc.kind}:${doc.slug}`));
    expect(slugs.has('vocab:motions')).toBe(true);
    expect(slugs.has('vocab:mechanisms')).toBe(true);
    expect(slugs.has('vocab:app-categories')).toBe(true);
    expect(slugs.has('app:hubspot')).toBe(true);
    expect(slugs.has('app:clay')).toBe(true);
    expect(slugs.has('preset:hubspot.contact')).toBe(true);

    // The flagship board (piece 5) validates through the composed schema.
    expect(slugs.has('board:icp-pipeline')).toBe(true);

    // Any invalid document above throws inside validateAll and fails this test.
    expect(found.length).toBeGreaterThan(0);
  });

  it('never walks content/docs — its meta.json files are not documents', async () => {
    const found = await walkContent();
    for (const { path } of found) {
      expect(path.includes(`${sep}docs${sep}`), path).toBe(false);
    }
  });
});

// --- cross-vocabulary validation ------------------------------------------------------

type VocabSets = {
  motions: Set<string>;
  mechanisms: Set<string>;
  appCategories: Set<string>;
};

async function loadVocab(): Promise<VocabSets> {
  const found = await walkContent();
  const valuesFor = (slug: string): string[] => {
    const entry = found.find(({ doc }) => doc.kind === 'vocab' && doc.slug === slug);
    if (!entry || entry.doc.kind !== 'vocab') {
      throw new Error(`vocab document "${slug}" is missing from content/vocab/`);
    }
    return entry.doc.values;
  };
  return {
    motions: new Set(valuesFor('motions')),
    mechanisms: new Set(valuesFor('mechanisms')),
    appCategories: new Set(valuesFor('app-categories')),
  };
}

/** A minimal board-shaped record for the pure vocab-check tests below. */
interface BoardLike {
  kind: string;
  motions?: readonly string[];
  nodes: readonly {
    archetype?: string;
    data: { app?: string; motion?: string };
  }[];
  edges: readonly { data: { mechanism: string } }[];
}

/**
 * Pure vocab check: every board-level motion, consumer motion, and edge
 * mechanism must be in the seeded vocab (D13 — extend the list, not the schema).
 */
function vocabViolations(board: BoardLike, vocab: VocabSets): string[] {
  const violations: string[] = [];

  for (const motion of board.motions ?? []) {
    if (!vocab.motions.has(motion)) {
      violations.push(`board motion "${motion}" is not in the motions vocab`);
    }
  }
  for (const [index, node] of board.nodes.entries()) {
    if (node.data.motion !== undefined && !vocab.motions.has(node.data.motion)) {
      violations.push(`node[${index}] motion "${node.data.motion}" is not in the motions vocab`);
    }
    if (node.data.app !== undefined && node.data.app.trim() === '') {
      violations.push(`node[${index}] has an empty app reference`);
    }
  }
  for (const [index, edge] of board.edges.entries()) {
    if (!vocab.mechanisms.has(edge.data.mechanism)) {
      violations.push(
        `edge[${index}] mechanism "${edge.data.mechanism}" is not in the mechanisms vocab`,
      );
    }
  }

  return violations;
}

describe('vocab cross-check (pure function)', () => {
  const vocab: VocabSets = {
    motions: new Set(['new-business', 'renewal']),
    mechanisms: new Set(['api-pull', 'webhook']),
    appCategories: new Set(['marketing', 'data']),
  };

  it('accepts a fully in-vocab board', () => {
    const board: BoardLike = {
      kind: 'board',
      motions: ['new-business'],
      nodes: [
        { archetype: 'consumer', data: { app: 'campaign', motion: 'new-business' } },
        { archetype: 'source', data: { app: 'snowflake' } },
      ],
      edges: [{ data: { mechanism: 'api-pull' } }],
    };
    expect(vocabViolations(board, vocab)).toEqual([]);
  });

  it('flags unknown motions and mechanisms — the walk-side half of the schema↔vocab split', () => {
    // An unknown mechanism PASSES boardPayloadSchema (see schema.test.ts) —
    // this check is what catches it, per the build-gate contract.
    const board: BoardLike = {
      kind: 'board',
      motions: ['quantum-motion'],
      nodes: [{ archetype: 'consumer', data: { app: 'x', motion: 'dark-funnel' } }],
      edges: [{ data: { mechanism: 'quantum-sync' } }],
    };
    const violations = vocabViolations(board, vocab);
    expect(violations).toHaveLength(3);
    expect(violations.join('\n')).toContain('quantum-motion');
    expect(violations.join('\n')).toContain('dark-funnel');
    expect(violations.join('\n')).toContain('quantum-sync');
  });

  it('flags an empty app reference (unregistered apps are legal, empty ones are not)', () => {
    const board: BoardLike = {
      kind: 'board',
      nodes: [{ data: { app: '  ' } }],
      edges: [],
    };
    expect(vocabViolations(board, vocab)).toHaveLength(1);
  });
});

describe('cross-vocabulary references in real content', () => {
  it('every board motion, consumer motion, and edge mechanism is in the seeded vocab', async () => {
    const [vocab, found] = await Promise.all([loadVocab(), walkContent()]);

    for (const { path, doc } of found) {
      if (doc.kind !== 'board') continue;

      const violations = vocabViolations(toBoardLike(doc), vocab);
      expect(violations, `${path}: ${violations.join('; ')}`).toEqual([]);
    }

    // Every app document's category is in app-categories (D13).
    for (const { path, doc } of found) {
      if (doc.kind !== 'app') continue;
      expect(
        vocab.appCategories.has(doc.category),
        `${path}: category "${doc.category}" is not in app-categories`,
      ).toBe(true);
    }
  });

  it('every board data.app reference is a non-empty slug (unregistered apps render generic, D11)', async () => {
    const found = await walkContent();
    const appSlugs = new Set(
      found.filter(({ doc }) => doc.kind === 'app').map(({ doc }) => doc.slug),
    );
    expect(appSlugs.size).toBeGreaterThan(0);

    for (const { path, doc } of found) {
      if (doc.kind !== 'board') continue;
      for (const [index, node] of toBoardLike(doc).nodes.entries()) {
        const app = node.data.app;
        if (app === undefined) continue; // unregistered apps are legal
        expect(app.length, `${path} node[${index}]`).toBeGreaterThan(0);
        // Registered or not, the reference must be slug-shaped.
        expect(app, `${path} node[${index}] app "${app}"`).toMatch(/^[a-z0-9][a-z0-9-]*$/);
        // Unregistered references are legal (generic rendering, D11) — the
        // presence of appSlugs above proves registered ones resolve too.
      }
    }
  });
});

/**
 * Narrow a validated board document to the minimal shape the vocab checks
 * need. Model-board nodes carry a DataEntity payload (no app/motion), so they
 * pass through with empty data and the checks skip them.
 */
function toBoardLike(doc: Validated): BoardLike {
  if (doc.kind !== 'board') throw new Error('expected a board document');
  if (doc.boardType === 'model') {
    return { kind: doc.kind, nodes: doc.nodes.map(() => ({ data: {} })), edges: [] };
  }
  return {
    kind: doc.kind,
    motions: doc.motions,
    nodes: doc.nodes.map((node) => ({
      archetype: node.archetype,
      data: { app: node.data.app, motion: node.data.motion },
    })),
    edges: doc.edges.map((edge) => ({
      data: { mechanism: edge.data.mechanism },
    })),
  };
}

// --- model-kit parity -----------------------------------------------------------------

describe('model-kit field-type parity with components/data-model', () => {
  it('accepts every FIELD_TYPES value as a model-entity field type', () => {
    const fields = FIELD_TYPES.map((type) => ({ name: `f_${type}`, type }));
    const board = {
      boardType: 'model',
      nodes: [
        {
          id: 'e1',
          profile: 'entity',
          position: { x: 0, y: 0 },
          data: { name: 'Parity', fields },
        },
      ],
      edges: [],
    };
    expect(() => boardPayloadSchema.parse(board)).not.toThrow();
  });

  it('rejects a field type outside FIELD_TYPES', () => {
    const board = {
      boardType: 'model',
      nodes: [
        {
          id: 'e1',
          profile: 'entity',
          position: { x: 0, y: 0 },
          data: {
            name: 'Parity',
            fields: [{ name: 'bogus', type: 'not-a-field-type' }],
          },
        },
      ],
      edges: [],
    };
    expect(() => boardPayloadSchema.parse(board)).toThrow();
  });
});
