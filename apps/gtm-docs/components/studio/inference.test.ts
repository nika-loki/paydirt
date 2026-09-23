/**
 * Offline unit tests for paste-to-model inference (plan piece 4 / spec
 * "Paste-to-model"): JSON array-of-records, nested API-response shapes, CSV
 * (RFC-4180-style quoting + CRLF), field type inference, PII heuristics, and
 * whole-document detection (routes to the import pipeline, not entity
 * inference).
 *
 * inference.ts is pinned by the plan as pure functions with zero runtime
 * imports, so it runs under vitest with relative imports and no alias.
 */

import { describe, expect, it } from 'vitest';

import { inferFromPaste } from './inference';
import type { DataEntity } from '../data-model/types';

// --- result normalizers ------------------------------------------------------------
// inferFromPaste returns a PasteInference union: { kind: 'document' } |
// { kind: 'entities' } | { kind: 'error' }. These normalizers keep that
// envelope in one place so the assertions below talk about entities.

function entitiesOf(text: string): DataEntity[] {
  const result = inferFromPaste(text);
  if (result.kind !== 'entities') {
    throw new Error(
      `expected entity inference, got "${result.kind}": ${JSON.stringify(result).slice(0, 120)}`,
    );
  }
  return result.entities;
}

function isDocumentImport(text: string): boolean {
  return inferFromPaste(text).kind === 'document';
}

/** Field lookup helper: throws on unknown names so typos fail loudly. */
function fieldOf(entity: DataEntity, name: string) {
  const field = entity.fields.find((candidate) => candidate.name === name);
  if (field === undefined) throw new Error(`no field "${name}" on ${entity.name}`);
  return field;
}

/** Wrap records the way the landed inference expects: {"rows": […]} (the
 *  plan also pins bare top-level arrays — see the dedicated test below). */
function rows(records: Record<string, unknown>[]): string {
  return JSON.stringify({ rows: records });
}

// --- JSON inference ------------------------------------------------------------------

describe('JSON paste inference', () => {
  it('infers an entity from an array of records (the plan-pinned bare top-level array)', () => {
    // Plan line: "else JSON (array of records, or object with array-valued
    // keys)" — a bare top-level array is in-contract input.
    const entities = entitiesOf(
      JSON.stringify([
        { domain: 'acme.com', icp_score: 92, active: true },
        { domain: 'globex.com', icp_score: 17, active: false },
      ]),
    );

    expect(entities).toHaveLength(1);
    const [entity] = entities;
    if (entity === undefined) throw new Error('expected an entity');
    expect(entity.fields.map((field) => field.name).sort()).toEqual([
      'active',
      'domain',
      'icp_score',
    ]);
  });

  it('infers an entity from records under an array-valued key', () => {
    const entities = entitiesOf(
      rows([
        { domain: 'acme.com', icp_score: 92, active: true },
        { domain: 'globex.com', icp_score: 17, active: false },
      ]),
    );

    expect(entities).toHaveLength(1);
    const [entity] = entities;
    if (entity === undefined) throw new Error('expected an entity');
    expect(entity.fields.map((field) => field.name).sort()).toEqual([
      'active',
      'domain',
      'icp_score',
    ]);
  });

  it('walks a nested API response ({ data: { contacts: […] } }) to its record array', () => {
    const entities = entitiesOf(
      JSON.stringify({
        data: {
          contacts: [
            { email: 'a@example.com', first_name: 'Ada', company_domain: 'example.com' },
          ],
        },
      }),
    );

    expect(entities).toHaveLength(1);
    const [entity] = entities;
    if (entity === undefined) throw new Error('expected an entity');
    expect(entity.fields.map((field) => field.name)).toContain('email');
    expect(entity.fields.map((field) => field.name)).toContain('first_name');
  });

  it('infers one entity per array-valued key in a flat object', () => {
    const entities = entitiesOf(
      JSON.stringify({
        contacts: [{ email: 'a@example.com' }],
        accounts: [{ domain: 'example.com' }],
      }),
    );

    expect(entities).toHaveLength(2);
  });

  it('infers field types: number, boolean, email, url, date, string', () => {
    const entities = entitiesOf(
      rows([
        {
          id: 'c_1',
          score: 42,
          active: true,
          email: 'ada@example.com',
          site: 'https://example.com',
          created: '2026-01-02',
          note: 'hello',
        },
      ]),
    );
    const [entity] = entities;
    if (entity === undefined) throw new Error('expected an entity');

    expect(fieldOf(entity, 'score').type).toBe('number');
    expect(fieldOf(entity, 'active').type).toBe('boolean');
    expect(fieldOf(entity, 'email').type).toBe('email');
    expect(fieldOf(entity, 'site').type).toBe('url');
    expect(fieldOf(entity, 'created').type).toBe('date');
    expect(fieldOf(entity, 'note').type).toBe('string');
  });
});

// --- CSV inference ---------------------------------------------------------------------

describe('CSV paste inference', () => {
  it('uses the header row as field names and infers types from values', () => {
    const csv = ['domain,icp_score,active', 'acme.com,92,true', 'globex.com,17,false'].join('\n');
    const entities = entitiesOf(csv);

    expect(entities).toHaveLength(1);
    const [entity] = entities;
    if (entity === undefined) throw new Error('expected an entity');
    expect(entity.fields.map((field) => field.name)).toEqual(['domain', 'icp_score', 'active']);
    expect(fieldOf(entity, 'icp_score').type).toBe('number');
    expect(fieldOf(entity, 'active').type).toBe('boolean');
  });

  it('parses RFC-4180 quoting: quoted commas, escaped quotes, CRLF endings', () => {
    const csv =
      'name,notes\r\n' +
      '"Acme, Inc.","says ""hi"""\r\n' +
      '"Globex","plain note"\r\n';
    const entities = entitiesOf(csv);

    const [entity] = entities;
    if (entity === undefined) throw new Error('expected an entity');
    expect(entity.fields.map((field) => field.name)).toEqual(['name', 'notes']);
  });

  it('flags PII on email and phone columns in CSV too', () => {
    const csv = ['email,phone,company_domain', 'a@example.com,+15551234567,example.com'].join('\n');
    const [entity] = entitiesOf(csv);
    if (entity === undefined) throw new Error('expected an entity');

    expect(fieldOf(entity, 'email').pii).toBe(true);
    expect(fieldOf(entity, 'phone').pii).toBe(true);
    expect(fieldOf(entity, 'company_domain').pii).toBeFalsy();
  });
});

// --- PII heuristics ----------------------------------------------------------------------

describe('PII heuristics (field names)', () => {
  it('flags email, phone, first_name; leaves company_domain alone', () => {
    const [entity] = entitiesOf(
      rows([
        {
          email: 'a@example.com',
          phone: '+15551234567',
          first_name: 'Ada',
          company_domain: 'example.com',
        },
      ]),
    );
    if (entity === undefined) throw new Error('expected an entity');

    expect(fieldOf(entity, 'email').pii).toBe(true);
    expect(fieldOf(entity, 'phone').pii).toBe(true);
    expect(fieldOf(entity, 'first_name').pii).toBe(true);
    expect(fieldOf(entity, 'company_domain').pii).toBeFalsy();
  });

  it('flags the full PII name set: names, dob, ssn, address, ip', () => {
    const [entity] = entitiesOf(
      rows([
        {
          last_name: 'Lovelace',
          full_name: 'Ada Lovelace',
          dob: '1815-12-10',
          ssn: 'replace-me',
          address: '1 Main St',
          ip: '10.0.0.1',
        },
      ]),
    );
    if (entity === undefined) throw new Error('expected an entity');

    for (const name of ['last_name', 'full_name', 'dob', 'ssn', 'address', 'ip']) {
      expect(fieldOf(entity, name).pii, name).toBe(true);
    }
  });
});

// --- document detection ---------------------------------------------------------------------

describe('whole-document detection', () => {
  it('routes $schema+kind text to the import pipeline, not entity inference', () => {
    const document = JSON.stringify({
      $schema: 'https://paydirt.dev/schemas/vocab-v1.json',
      kind: 'vocab',
      version: 1,
      slug: 'motions',
      title: 'Motions',
      values: ['new-business'],
    });

    expect(isDocumentImport(document)).toBe(true);
    expect(() => entitiesOf(document)).toThrow(/entity/i);
  });

  it('JSON without an envelope still infers entities', () => {
    expect(() => entitiesOf(JSON.stringify({ rows: [{ a: 1 }] }))).not.toThrow();
  });
});
