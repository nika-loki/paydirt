/**
 * Offline unit tests for the DataModel kit's serializers.
 *
 * Pure functions only — no network, no Mermaid rendering, fast. Assertions
 * are `toContain`/`toMatch`/`toBe`/`toEqual` on compact fixtures; no
 * snapshots of large strings and no dynamic evaluation.
 */

import { describe, expect, it } from 'vitest';

import { toERDiagram, toMDXSnippet } from './serialize';
import type { DataEntity, DataRelation } from './types';

// --- toERDiagram ---------------------------------------------------------------

describe('toERDiagram', () => {
  it('renders the three cardinalities with their exact connector syntax', () => {
    const entities: DataEntity[] = [
      { name: 'A', fields: [] },
      { name: 'B', fields: [] },
      { name: 'C', fields: [] },
    ];
    const relations: DataRelation[] = [
      { from: 'A', to: 'B', cardinality: 'one-to-one', label: 'one' },
      { from: 'A', to: 'C', cardinality: 'one-to-many', label: 'many' },
      { from: 'B', to: 'C', cardinality: 'many-to-many', label: 'lots' },
    ];

    const diagram = toERDiagram(entities, relations);

    expect(diagram).toContain('A ||--|| B : "one"');
    expect(diagram).toContain('A ||--o{ C : "many"');
    expect(diagram).toContain('B }o--o{ C : "lots"');
  });

  it('renders relation labels, defaulting to "relates to" and flipping inner double quotes', () => {
    const entities: DataEntity[] = [
      { name: 'A', fields: [] },
      { name: 'B', fields: [] },
    ];
    const diagram = toERDiagram(entities, [
      { from: 'A', to: 'B', cardinality: 'one-to-many' },
      { from: 'B', to: 'A', cardinality: 'one-to-one', label: 'syncs to' },
      { from: 'A', to: 'A', cardinality: 'many-to-many', label: 'says "hi"' },
    ]);

    expect(diagram).toContain('A ||--o{ B : "relates to"');
    expect(diagram).toContain('B ||--|| A : "syncs to"');
    expect(diagram).toContain('A }o--o{ A : "says \'hi\'"');
  });

  it('sanitizes entity names to safe Mermaid tokens', () => {
    const diagram = toERDiagram(
      [
        { name: 'HubSpot Contact', fields: [] },
        { name: '!!!', fields: [] },
        { name: ' Contact! ', fields: [] },
      ],
      [],
    );

    // Spaces/punctuation collapse to underscores.
    expect(diagram).toMatch(/^  HubSpot_Contact \{$/m);
    // A name with no safe characters falls back to `Entity`.
    expect(diagram).toMatch(/^  Entity \{$/m);
    // Leading/trailing separator runs are trimmed: " Contact! " → "Contact".
    expect(diagram).toMatch(/^  Contact \{$/m);
    // No entity header is emitted with leading or trailing underscore padding.
    expect(diagram).not.toMatch(/^  _|_ \{$/m);
  });

  it('marks key fields PK and unique fields UK, with key taking precedence', () => {
    const diagram = toERDiagram(
      [
        {
          name: 'Contact',
          fields: [
            { name: 'hs_object_id', type: 'id', key: true },
            { name: 'email', type: 'email', unique: true },
            { name: 'merge_key', type: 'string', key: true, unique: true },
          ],
        },
      ],
      [],
    );

    expect(diagram).toMatch(/^    string hs_object_id PK$/m);
    expect(diagram).toMatch(/^    string email UK$/m);
    // `key` wins when both flags are set.
    expect(diagram).toMatch(/^    string merge_key PK$/m);
    expect(diagram).not.toContain('merge_key UK');
  });

  it('gives PII fields a PII comment, joined with a description by " · "', () => {
    const diagram = toERDiagram(
      [
        {
          name: 'Contact',
          fields: [
            { name: 'phone', type: 'phone', pii: true },
            { name: 'mobile', type: 'phone', pii: true, description: 'mobile number' },
          ],
        },
      ],
      [],
    );

    expect(diagram).toMatch(/^    string phone "PII"$/m);
    expect(diagram).toContain('"PII · mobile number"');
  });

  it('lists enum values in the field comment joined with " | "', () => {
    const diagram = toERDiagram(
      [
        {
          name: 'Contact',
          fields: [
            { name: 'lifecycle_stage', type: 'enum', enumValues: ['lead', 'mql', 'sql'] },
          ],
        },
      ],
      [],
    );

    expect(diagram).toContain('"lead | mql | sql"');
  });

  it('still emits braces for an entity with no fields', () => {
    const diagram = toERDiagram([{ name: 'Empty', fields: [] }], []);

    expect(diagram).toMatch(/^  Empty \{$/m);
    expect(diagram).toMatch(/Empty \{\n  \}/);
  });
});

// --- toMDXSnippet ---------------------------------------------------------------

describe('toMDXSnippet', () => {
  const contact: DataEntity = {
    name: 'HubSpot Contact',
    source: 'HubSpot',
    fields: [
      { name: 'hs_object_id', type: 'id', key: true, description: 'HubSpot object id' },
      { name: 'email', type: 'email', unique: true, pii: true },
      { name: 'lifecycle_stage', type: 'enum', enumValues: ['lead', 'mql'] },
    ],
  };
  const clayRow: DataEntity = { name: 'Clay Row', fields: [] };
  const syncsTo: DataRelation[] = [
    { from: 'HubSpot Contact', to: 'Clay Row', cardinality: 'one-to-many', label: 'syncs to' },
  ];

  it('wraps the output in a <DataModel … /> element', () => {
    const snippet = toMDXSnippet([contact], []);

    expect(snippet.startsWith('<DataModel')).toBe(true);
    expect(snippet.endsWith('/>')).toBe(true);
    expect(snippet).toContain('entities=');
  });

  it('uses single quotes for strings and leaves booleans bare', () => {
    const snippet = toMDXSnippet([contact], []);

    expect(snippet).toContain("name: 'HubSpot Contact'");
    expect(snippet).toContain("type: 'enum'");
    expect(snippet).toContain('pii: true');
    expect(snippet).toContain('key: true');
    expect(snippet).not.toContain("pii: 'true'");
    expect(snippet).not.toContain('"HubSpot Contact"');
  });

  it('drops undefined-valued entries instead of serializing them', () => {
    const entity: DataEntity = {
      name: 'Row',
      // Explicitly undefined optional props must not appear in the snippet.
      source: undefined,
      description: undefined,
      fields: [{ name: 'note', type: 'string', description: undefined, pii: undefined }],
    };

    const snippet = toMDXSnippet([entity], []);

    expect(snippet).not.toContain('source');
    expect(snippet).not.toContain('description');
    expect(snippet).not.toContain('pii');
    expect(snippet).not.toContain('undefined');
  });

  it('omits the relations prop entirely when relations are empty', () => {
    const snippet = toMDXSnippet([contact], []);

    expect(snippet).not.toContain('relations=');
  });

  it('includes relations={…} with the cardinality when relations are present', () => {
    const snippet = toMDXSnippet([contact, clayRow], syncsTo);

    expect(snippet).toContain('relations=');
    expect(snippet).toContain("'one-to-many'");
    expect(snippet).toContain("'syncs to'");
  });

  it('serializes an empty fields array compactly', () => {
    const snippet = toMDXSnippet([clayRow], []);

    expect(snippet).toContain('fields: []');
  });

  it("escapes single quotes and backslashes in string values", () => {
    const entity: DataEntity = {
      name: "O'Brien's Team",
      fields: [{ name: 'path', type: 'string', description: 'back\\slash' }],
    };

    const snippet = toMDXSnippet([entity], []);

    expect(snippet).toContain("name: 'O\\'Brien\\'s Team'");
    expect(snippet).toContain("description: 'back\\\\slash'");
  });
});
