/**
 * Offline unit tests for the JSON document model (plan piece 4):
 * envelope validation, kind dispatch for all five kinds, version gating,
 * and the deterministic serializer.
 *
 * Pure functions only — no network, no React, no fs (the store has its own
 * suite). Assertions are on compact fixtures; no snapshots.
 */

import { describe, expect, it } from 'vitest';

import { validateDocument } from './index';
import { stringifyDocument } from './serialize';

/** The serializer's declared input type — keeps the fixtures type-honest. */
type Serializable = Parameters<typeof stringifyDocument>[0];

// --- fixtures --------------------------------------------------------------------

const vocabDoc = {
  $schema: 'https://paydirt.dev/schemas/vocab-v1.json',
  kind: 'vocab',
  version: 1,
  slug: 'motions',
  title: 'Motions',
  values: ['new-business', 'upsell', 'cross-sell', 'renewal', 'retention'],
};

const appDoc = {
  $schema: 'https://paydirt.dev/schemas/app-v1.json',
  kind: 'app',
  version: 1,
  slug: 'hubspot',
  title: 'HubSpot',
  vendor: 'HubSpot',
  category: 'marketing',
};

const presetDoc = {
  $schema: 'https://paydirt.dev/schemas/preset-v1.json',
  kind: 'preset',
  version: 1,
  slug: 'hubspot.contact',
  title: 'HubSpot Contact',
  source: 'HubSpot',
  fields: [
    { name: 'hs_object_id', type: 'id', key: true },
    { name: 'email', type: 'email', unique: true, pii: true },
    { name: 'lifecycle_stage', type: 'enum', enumValues: ['lead', 'mql'] },
  ],
};

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
      position: { x: 0, y: 0 },
      data: { app: 'snowflake', name: 'Product usage', externalRef: null },
    },
  ],
  edges: [
    {
      id: 'e1',
      source: 'n1',
      target: 'n1',
      data: { mechanism: 'api-pull', cadence: 'nightly', credential: 'SNOWFLAKE_RO_KEY' },
    },
  ],
};

// --- envelope --------------------------------------------------------------------

describe('document envelope', () => {
  it('accepts a valid vocab document and dispatches by kind', () => {
    const doc = validateDocument(vocabDoc);
    expect(doc.kind).toBe('vocab');
    expect(doc.slug).toBe('motions');
    expect(doc.title).toBe('Motions');
    expect(doc.version).toBe(1);
  });

  it('rejects an unknown kind', () => {
    const bogus = { ...vocabDoc, kind: 'flowchart' };
    expect(() => validateDocument(bogus)).toThrowError(/kind/i);
  });

  it('rejects a $schema that is not the paydirt document schema URL', () => {
    const bogus = { ...vocabDoc, $schema: 'https://example.com/whatever.json' };
    expect(() => validateDocument(bogus)).toThrowError();
  });

  it('rejects a $schema that does not match the document kind', () => {
    const mismatched = { ...appDoc, $schema: 'https://paydirt.dev/schemas/board-v1.json' };
    expect(() => validateDocument(mismatched)).toThrowError();
  });

  it('rejects version 2 with a clear version/migration error (the version gate)', () => {
    const future = { ...vocabDoc, version: 2 };
    expect(() => validateDocument(future)).toThrowError(/version|migration/i);
  });

  it('rejects a string version "1" — the gate is type-checked, not stringly', () => {
    const stringly = { ...vocabDoc, version: '1' };
    expect(() => validateDocument(stringly)).toThrowError(/version|migration/i);
  });

  it('rejects slugs that are not lowercase slug format (uppercase, spaces, traversal)', () => {
    expect(() => validateDocument({ ...vocabDoc, slug: 'Motions' })).toThrowError(/slug/i);
    expect(() => validateDocument({ ...vocabDoc, slug: 'revenue motions' })).toThrowError(/slug/i);
    expect(() => validateDocument({ ...vocabDoc, slug: '../../etc/passwd' })).toThrowError(/slug/i);
  });

  it('requires a title', () => {
    const untitled = { ...vocabDoc, title: '' };
    expect(() => validateDocument(untitled)).toThrowError();
  });
});

// --- kind dispatch -----------------------------------------------------------------

describe('kind dispatch', () => {
  it('validates a board document (envelope + payload composed)', () => {
    const doc = validateDocument(boardDoc);
    expect(doc.kind).toBe('board');
    expect(doc.slug).toBe('roundtrip');
  });

  it('validates an app document', () => {
    const doc = validateDocument(appDoc);
    expect(doc.kind).toBe('app');
  });

  it('validates a preset document', () => {
    const doc = validateDocument(presetDoc);
    expect(doc.kind).toBe('preset');
  });

  it('validates a system-record document (schema exists in Phase 1, content in Phase 2)', () => {
    const doc = validateDocument({
      $schema: 'https://paydirt.dev/schemas/system-record-v1.json',
      kind: 'system-record',
      version: 1,
      slug: 'hubspot-clay-sync',
      title: 'HubSpot ↔ Clay sync',
      summary: 'Nightly sync of ICP-scored accounts into HubSpot.',
      trigger: 'nightly schedule',
      outcome: 'accounts enriched in HubSpot',
      boards: ['icp-pipeline'],
      governance: {
        blastRadius: 'HubSpot contacts',
        credentials: ['HUBSPOT_PRIVATE_APP_TOKEN'],
        deployRecipe: 'content/docs/build/deploy.mdx',
      },
    });
    expect(doc.kind).toBe('system-record');
  });
});

// --- per-kind schemas ----------------------------------------------------------------

describe('vocab schema', () => {
  it('accepts the seeded shapes and rejects non-string values', () => {
    expect(() => validateDocument(vocabDoc)).not.toThrow();

    const numeric = { ...vocabDoc, values: ['new-business', 42] };
    expect(() => validateDocument(numeric)).toThrowError();
  });
});

describe('app schema', () => {
  it('accepts every seeded category', () => {
    const categories = [
      'marketing',
      'sales',
      'support',
      'success',
      'data',
      'enrichment',
      'ops',
    ];
    for (const category of categories) {
      expect(() => validateDocument({ ...appDoc, category })).not.toThrow();
    }
  });

  it('rejects a category outside the seeded set', () => {
    const bogus = { ...appDoc, category: 'not-a-category' };
    expect(() => validateDocument(bogus)).toThrowError();
  });
});

describe('preset schema', () => {
  it('accepts the <vendor>.<object> slug format', () => {
    expect(() => validateDocument(presetDoc)).not.toThrow();
    expect(() =>
      validateDocument({ ...presetDoc, slug: 'salesforce.lead' }),
    ).not.toThrow();
  });

  it('rejects slug formats that are not <vendor>.<object>', () => {
    expect(() => validateDocument({ ...presetDoc, slug: 'hubspot-contact' })).toThrowError();
    expect(() => validateDocument({ ...presetDoc, slug: 'Hubspot.Contact' })).toThrowError();
    expect(() =>
      validateDocument({ ...presetDoc, slug: 'hubspot/contact' }),
    ).toThrowError();
  });

  it('mirrors the DataField shape: field types come from FIELD_TYPES', () => {
    expect(() =>
      validateDocument({
        ...presetDoc,
        fields: [{ name: 'weird', type: 'not-a-field-type' }],
      }),
    ).toThrowError();
  });

  it('preserves the key/unique/pii field flags through validation', () => {
    const doc = validateDocument(presetDoc);
    if (doc.kind !== 'preset') throw new Error('expected a preset document');
    const email = doc.fields.find((field) => field.name === 'email');
    expect(email?.pii).toBe(true);
    expect(email?.unique).toBe(true);
    const id = doc.fields.find((field) => field.name === 'hs_object_id');
    expect(id?.key).toBe(true);
  });
});

// --- deterministic serialization (D5) ---------------------------------------------------

describe('stringifyDocument', () => {
  it('produces byte-identical output across key-shuffled inputs', () => {
    const ordered = {
      $schema: 'https://paydirt.dev/schemas/preset-v1.json',
      kind: 'preset',
      version: 1,
      slug: 'clay.row',
      title: 'Clay Row',
      source: 'Clay',
      fields: [
        { name: 'domain', type: 'string', unique: true },
        { name: 'icp_score', type: 'number', pii: false },
      ],
    };
    const shuffled = {
      fields: [
        { pii: false, type: 'number', name: 'icp_score' },
        { unique: true, type: 'string', name: 'domain' },
      ],
      source: 'Clay',
      title: 'Clay Row',
      slug: 'clay.row',
      version: 1,
      kind: 'preset',
      $schema: 'https://paydirt.dev/schemas/preset-v1.json',
    };

    expect(stringifyDocument(shuffled as Serializable)).toBe(
      stringifyDocument(ordered as Serializable),
    );
  });

  it('sorts keys recursively, indents with two spaces, and ends with a newline', () => {
    const out = stringifyDocument(vocabDoc as Serializable);

    // Exact bytes for a small document: sorted keys, 2-space indent, trailing newline.
    expect(out).toBe(
      [
        '{',
        '  "$schema": "https://paydirt.dev/schemas/vocab-v1.json",',
        '  "kind": "vocab",',
        '  "slug": "motions",',
        '  "title": "Motions",',
        '  "values": [',
        '    "new-business",',
        '    "upsell",',
        '    "cross-sell",',
        '    "renewal",',
        '    "retention"',
        '  ],',
        '  "version": 1',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('sorts keys inside nested objects (field flags, edge data)', () => {
    const out = stringifyDocument(boardDoc as Serializable);

    const dataStart = out.indexOf('"data"');
    expect(dataStart).toBeGreaterThan(-1);
    // Within the node data object: app < externalRef < name (sorted).
    expect(out.indexOf('"app"', dataStart)).toBeLessThan(
      out.indexOf('"externalRef"', dataStart),
    );
    expect(out.indexOf('"externalRef"', dataStart)).toBeLessThan(
      out.indexOf('"name"', dataStart),
    );
  });

  it('is idempotent: parse → stringify reproduces the same bytes', () => {
    const once = stringifyDocument(boardDoc as Serializable);
    const twice = stringifyDocument(JSON.parse(once) as Serializable);
    expect(twice).toBe(once);
  });
});
