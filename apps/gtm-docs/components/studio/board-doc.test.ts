/**
 * Offline unit tests for editor-state ⇄ board-document mapping
 * (components/studio/board-doc.ts — spec D2 "editor state IS the document").
 *
 * Pure module: types + the canonical board payload schema only, no React —
 * so it runs under vitest with relative imports. Positions must survive the
 * roundtrip exactly (D4 authored layout is the artefact).
 */

import { describe, expect, it } from 'vitest';

import { boardPayloadSchema } from '../board/schema';
import {
  BoardDocError,
  fromBoardDocument,
  nextId,
  toBoardDocument,
} from './board-doc';
import type { EditorState } from './board-doc';

// --- fixtures --------------------------------------------------------------------

const flowState: EditorState = {
  slug: 'icp-test',
  title: 'ICP test board',
  boardType: 'flow',
  motions: ['new-business'],
  nodes: [
    {
      id: 'n1',
      type: 'source',
      position: { x: 40, y: 300 },
      archetype: 'source',
      data: { app: 'snowflake', name: 'Product analytics', notes: 'nightly signal' },
    },
    {
      id: 'n2',
      type: 'clay-table',
      position: { x: 460, y: 260 },
      archetype: 'processor',
      profile: 'clay-table',
      data: {
        app: 'clay',
        name: 'ICP signals',
        columns: ['domain', 'icp_score'],
        externalRef: null,
      },
    },
    {
      id: 'n3',
      type: 'consumer',
      position: { x: 880, y: 300 },
      archetype: 'consumer',
      data: { app: 'campaign', name: 'Q4 outbound', motion: 'new-business' },
    },
  ],
  edges: [
    {
      id: 'e1',
      source: 'n1',
      target: 'n2',
      data: {
        mechanism: 'api-pull',
        cadence: 'nightly',
        payload: 'accounts + usage',
        credential: 'SNOWFLAKE_RO_KEY',
      },
    },
    { id: 'e2', source: 'n2', target: 'n3', data: { mechanism: 'webhook' } },
  ],
};

const modelState: EditorState = {
  slug: 'model-test',
  title: 'Model test board',
  boardType: 'model',
  motions: [],
  nodes: [
    {
      id: 'n1',
      type: 'entity',
      position: { x: 0, y: 120 },
      profile: 'entity',
      data: {
        name: 'HubSpot Contact',
        source: 'HubSpot',
        fields: [
          { name: 'hs_object_id', type: 'id', key: true },
          { name: 'email', type: 'email', unique: true, pii: true },
        ],
      },
    },
    {
      id: 'n2',
      type: 'entity',
      position: { x: 420, y: 120 },
      profile: 'entity',
      data: { name: 'Clay Row', source: 'Clay', fields: [{ name: 'domain', type: 'string' }] },
    },
  ],
  edges: [
    {
      id: 'e1',
      source: 'n1',
      target: 'n2',
      data: { cardinality: 'one-to-many', label: 'syncs to' },
    },
  ],
};

// --- editor state → document -------------------------------------------------------

describe('toBoardDocument', () => {
  it('produces the envelope + payload shape (never a bespoke format)', () => {
    const doc = toBoardDocument(flowState) as Record<string, unknown>;

    expect(doc.$schema).toBe('https://paydirt.dev/schemas/board-v1.json');
    expect(doc.kind).toBe('board');
    expect(doc.version).toBe(1);
    expect(doc.slug).toBe('icp-test');
    expect(doc.title).toBe('ICP test board');
    expect(doc.boardType).toBe('flow');
    expect(doc.motions).toEqual(['new-business']);
  });

  it('maps flow nodes: archetype, authored position, cleaned data with externalRef defaulted to null (D9)', () => {
    const doc = toBoardDocument(flowState) as {
      nodes: { id: string; archetype: string; profile?: string; data: Record<string, unknown> }[];
    };

    expect(doc.nodes).toHaveLength(3);
    const [source, clay, consumer] = doc.nodes;
    if (source === undefined || clay === undefined || consumer === undefined) {
      throw new Error('expected three nodes');
    }

    expect(source.id).toBe('n1');
    expect(source.archetype).toBe('source');
    expect(source.data.externalRef).toBeNull(); // reserved, null until claimed

    expect(clay.profile).toBe('clay-table');
    expect(clay.data.columns).toEqual(['domain', 'icp_score']);

    expect(consumer.data.motion).toBe('new-business');
  });

  it('maps flow edges with the full "how" (D8): mechanism, cadence, payload, credential NAME', () => {
    const doc = toBoardDocument(flowState) as {
      edges: { id: string; source: string; target: string; data: Record<string, unknown> }[];
    };

    const [rich, minimal] = doc.edges;
    if (rich === undefined || minimal === undefined) throw new Error('expected two edges');

    expect(rich).toEqual({
      id: 'e1',
      source: 'n1',
      target: 'n2',
      data: {
        mechanism: 'api-pull',
        cadence: 'nightly',
        payload: 'accounts + usage',
        credential: 'SNOWFLAKE_RO_KEY',
      },
    });
    // Optional edge data is omitted, not written as empty strings.
    expect(minimal.data).toEqual({ mechanism: 'webhook' });
  });

  it('maps model boards: entity nodes + relation edges that validate against the canonical payload schema', () => {
    const doc = toBoardDocument(modelState);

    // The studio saves through validateDocument, which composes the kit's
    // canonical payload schema (piece 2 owns the payload contract) — so the
    // studio's output MUST parse under it, both board types.
    expect(() => boardPayloadSchema.parse(doc)).not.toThrow();

    const payload = boardPayloadSchema.parse(doc) as {
      boardType: string;
      nodes: { profile: string }[];
      edges: {
        id: string;
        source: string;
        target: string;
        data: { cardinality: string; label?: string };
      }[];
    };
    expect(payload.boardType).toBe('model');
    expect(payload.nodes.every((node) => node.profile === 'entity')).toBe(true);
    expect(payload.edges).toEqual([
      {
        id: 'e1',
        source: 'n1',
        target: 'n2',
        data: { cardinality: 'one-to-many', label: 'syncs to' },
      },
    ]);
  });

  it('maps flow boards that validate against the canonical payload schema too', () => {
    const doc = toBoardDocument(flowState);
    expect(() => boardPayloadSchema.parse(doc)).not.toThrow();
  });
});

// --- document → editor state ---------------------------------------------------------

describe('fromBoardDocument', () => {
  it('rejects non-board documents with BoardDocError', () => {
    expect(() => fromBoardDocument({ kind: 'vocab' })).toThrowError(BoardDocError);
    expect(() => fromBoardDocument('nonsense')).toThrowError(BoardDocError);
  });

  it('rejects a malformed board payload instead of silently loading it', () => {
    const bad = {
      ...toBoardDocument(flowState),
      nodes: [{ id: 'n1', archetype: 'wizard', position: { x: 0, y: 0 }, data: {} }],
    };
    expect(() => fromBoardDocument(bad)).toThrowError(BoardDocError);
  });

  it('reads a flow document into editor state (slug, title, motions, nodes, edges)', () => {
    const state = fromBoardDocument(toBoardDocument(flowState));

    expect(state.slug).toBe('icp-test');
    expect(state.title).toBe('ICP test board');
    expect(state.boardType).toBe('flow');
    expect(state.motions).toEqual(['new-business']);
    expect(state.nodes).toHaveLength(3);
    expect(state.edges).toHaveLength(2);
  });

  it('reads model relation edges back as id-based editor edges', () => {
    const state = fromBoardDocument(toBoardDocument(modelState));

    expect(state.edges).toHaveLength(1);
    const [relation] = state.edges;
    if (relation === undefined) throw new Error('expected a relation edge');
    expect(relation.source).toBe('n1'); // HubSpot Contact
    expect(relation.target).toBe('n2'); // Clay Row
    expect(relation.data).toEqual({ cardinality: 'one-to-many', label: 'syncs to' });
  });
});

// --- the roundtrip (D4: authored positions are the artefact) ---------------------------

describe('state ⇄ document roundtrip', () => {
  it('preserves authored positions exactly across both directions', () => {
    const state = fromBoardDocument(toBoardDocument(flowState));

    const positions = state.nodes.map((node) => node.position);
    expect(positions).toEqual([
      { x: 40, y: 300 },
      { x: 460, y: 260 },
      { x: 880, y: 300 },
    ]);
  });

  it('is stable: doc → state → doc is byte-stable (deterministic serialization)', () => {
    const doc1 = toBoardDocument(flowState);
    const doc2 = toBoardDocument(fromBoardDocument(doc1));
    expect(doc2).toEqual(doc1);
  });

  it('is stable for model boards too', () => {
    const doc1 = toBoardDocument(modelState);
    const doc2 = toBoardDocument(fromBoardDocument(doc1));
    expect(doc2).toEqual(doc1);
  });

  it('keeps PII/key/unique field flags intact through the model roundtrip', () => {
    const state = fromBoardDocument(toBoardDocument(modelState));
    const contact = state.nodes.find((node) => node.data['name'] === 'HubSpot Contact');
    if (contact === undefined) throw new Error('expected the contact entity');

    const fields = contact.data['fields'] as { name: string; pii?: boolean; key?: boolean; unique?: boolean }[];
    const byName = new Map(fields.map((field) => [field.name, field]));
    expect(byName.get('hs_object_id')?.key).toBe(true);
    expect(byName.get('email')?.unique).toBe(true);
    expect(byName.get('email')?.pii).toBe(true);
  });
});

// --- id generation ----------------------------------------------------------------------

describe('nextId', () => {
  it('returns the first free n#/e# id that collides with nothing', () => {
    expect(nextId('n', [])).toBe('n1');
    expect(nextId('n', ['n1'])).toBe('n2');
    expect(nextId('n', ['n1', 'n2', 'n4'])).toBe('n3');
    expect(nextId('e', ['e1', 'e2'])).toBe('e3');
  });
});
