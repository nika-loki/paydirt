/**
 * Paste-to-model inference — pure functions, no React, zero runtime imports
 * (type-only from the DataModel kit) so this resolves under vitest without an
 * `@/` alias and is a stable test target.
 *
 * `inferFromPaste` accepts raw JSON (an API response or array of records) or
 * CSV (RFC-4180: quoted commas, escaped quotes, CRLF) and infers entities with
 * field types and PII heuristics; a pasted *document* (`$schema` + `kind`)
 * routes to the import pipeline instead.
 */

import type { DataEntity, DataField, FieldType } from '../data-model/types';

export type PasteInference =
  | { kind: 'document'; document: unknown }
  | { kind: 'entities'; entities: DataEntity[] }
  | { kind: 'error'; message: string };

// --- small guards --------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isScalar(value: unknown): boolean {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  );
}

// --- field-name heuristics (PII + special types) --------------------------------

const NAME_TOKEN_SEPARATOR = /[\s_\-.]+/;

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(NAME_TOKEN_SEPARATOR)
    .filter((token) => token.length > 0);
}

const EMAIL_NAME = /(^|_)(email|e[-_]?mail|mail_address|emailaddress)$|email/;
const PHONE_NAME = /phone|mobile|telephone|tel$|_tel\b|fax|contact_number/;
const URL_NAME = /(^|_)(url|uri|link|website|site)$/;
const ID_NAME = /^(id|.+_id|uuid|guid|external_id|_id)$/;

function isNamePii(name: string): boolean {
  if (EMAIL_NAME.test(name) || PHONE_NAME.test(name)) return true;
  if (/(^|_)(dob|date_of_birth|birthdate|birthday|ssn|social_security|tax_id)$/.test(name)) {
    return true;
  }
  if (/(^|_)(street|address|address_1|address_2|address1|address2|postal|zipcode|zip_code|zip)$/.test(name)) {
    return true;
  }
  const tokens = nameTokens(name);
  if (tokens.includes('ip') || tokens.includes('ipaddr') || tokens.includes('ipaddress')) return true;
  // first/last/full/middle/display name — "company_name"/"account_name" style
  // compound business names are deliberately NOT personal names.
  for (let i = 1; i < tokens.length; i += 1) {
    if (tokens[i] !== 'name') continue;
    const qualifier = tokens[i - 1];
    if (qualifier === 'first' || qualifier === 'last' || qualifier === 'full' || qualifier === 'middle' || qualifier === 'display') {
      return true;
    }
  }
  if (tokens.length === 1 && tokens[0] === 'name') return true;
  return false;
}

// --- value-based type inference ---------------------------------------------------

const EMAIL_VALUE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_VALUE = /^https?:\/\/\S+$/i;
const NUMBER_VALUE = /^-?\d+(\.\d+)?$/;
const DATE_VALUE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_VALUE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

function inferTypeFromValues(name: string, values: unknown[]): FieldType {
  const samples = values.filter((v) => v !== null && v !== undefined && v !== '').slice(0, 50);
  if (samples.length === 0) return 'string';

  const all = (predicate: (value: unknown) => boolean): boolean =>
    samples.every((value) => predicate(value));

  // Name-first for the formats whose names are unambiguous.
  if (ID_NAME.test(name.toLowerCase())) return 'id';
  if (EMAIL_NAME.test(name)) return 'email';
  if (PHONE_NAME.test(name)) return 'phone';
  if (URL_NAME.test(name) && all((v) => typeof v !== 'string' || URL_VALUE.test(v))) return 'url';

  if (all((v) => typeof v === 'boolean' || /^(true|false)$/i.test(String(v)))) return 'boolean';
  if (all((v) => typeof v === 'number' || NUMBER_VALUE.test(String(v)))) return 'number';
  if (all((v) => typeof v === 'string' && DATETIME_VALUE.test(v))) return 'datetime';
  if (all((v) => typeof v === 'string' && DATE_VALUE.test(v))) return 'date';
  if (all((v) => typeof v === 'string' && EMAIL_VALUE.test(v))) return 'email';
  if (all((v) => typeof v === 'string' && URL_VALUE.test(v))) return 'url';
  return 'string';
}

function inferField(name: string, values: unknown[]): DataField {
  const type = inferTypeFromValues(name, values);
  const field: DataField = { name, type };
  if (isNamePii(name)) field.pii = true;
  if (ID_NAME.test(name.toLowerCase())) {
    field.key = true;
    field.unique = true;
  } else if (type === 'email') {
    field.unique = true;
  }
  return field;
}

// --- records → entities --------------------------------------------------------

/** Column order = first appearance across records; values collected per column. */
export function entityFromRecords(name: string, records: Record<string, unknown>[]): DataEntity {
  const order: string[] = [];
  const columns = new Map<string, unknown[]>();
  const sample = records.slice(0, 100);
  for (const record of sample) {
    for (const [key, value] of Object.entries(record)) {
      if (!isScalar(value) && !Array.isArray(value)) continue;
      if (!columns.has(key)) {
        columns.set(key, []);
        order.push(key);
      }
      columns.get(key)?.push(value);
    }
  }
  const fields = order.map((key) => inferField(key, columns.get(key) ?? []));
  const description = `Inferred from pasted data (${records.length} record${records.length === 1 ? '' : 's'}).`;
  return { name, description, fields };
}

function titleize(segment: string): string {
  const cleaned = segment.replace(/[_-]+/g, ' ').trim();
  if (cleaned === '') return 'Record';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/** Walk a parsed JSON value collecting arrays of records (breadth-first, capped). */
function collectRecordArrays(value: unknown): { name: string; records: Record<string, unknown>[] }[] {
  const found: { name: string; records: Record<string, unknown>[] }[] = [];
  const queue: { value: unknown; path: string[] }[] = [{ value, path: [] }];
  const MAX_ENTITIES = 12;
  while (queue.length > 0 && found.length < MAX_ENTITIES) {
    const current = queue.shift();
    if (current === undefined) break;
    if (Array.isArray(current.value)) {
      if (
        current.value.length > 0 &&
        current.value.every((item) => isRecord(item)) &&
        current.path.length > 0
      ) {
        found.push({
          name: titleize(current.path[current.path.length - 1]),
          records: current.value as Record<string, unknown>[],
        });
        continue;
      }
      for (const item of current.value) queue.push({ value: item, path: current.path });
      continue;
    }
    if (isRecord(current.value)) {
      if (current.path.length >= 4) continue;
      for (const [key, child] of Object.entries(current.value)) {
        queue.push({ value: child, path: [...current.path, key] });
      }
    }
  }
  return found;
}

// --- CSV (RFC-4180) ---------------------------------------------------------------

/**
 * Minimal RFC-4180 parser: quoted fields, escaped quotes (`""`), embedded
 * commas/newlines inside quotes, CRLF and LF row endings.
 */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const firstLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'));
  const delim =
    delimiter ?? (firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ',');

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += ch;
        i += 1;
      }
      continue;
    }
    if (ch === '"' && field === '') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === delim) {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

function csvToRecords(text: string): Record<string, unknown>[] | null {
  const rows = parseCsv(text);
  if (rows.length < 2) return null;
  const header = rows[0].map((cell, index) => (cell.trim() === '' ? `column_${index + 1}` : cell.trim()));
  const records: Record<string, unknown>[] = [];
  for (const row of rows.slice(1)) {
    const record: Record<string, unknown> = {};
    let nonEmpty = 0;
    header.forEach((key, index) => {
      const value = (row[index] ?? '').trim();
      if (value !== '') nonEmpty += 1;
      record[key] = value;
    });
    if (nonEmpty > 0) records.push(record);
  }
  return records.length > 0 ? records : null;
}

// --- entry point --------------------------------------------------------------------

const MAX_ENTITIES = 12;

export function inferFromPaste(text: string): PasteInference {
  const trimmed = text.trim();
  if (trimmed === '') return { kind: 'error', message: 'Nothing to parse — paste JSON or CSV first.' };

  // Whole documents (spec D5) route to the import pipeline, not entity inference.
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // fall through to CSV attempt below
      parsed = undefined;
    }
    if (parsed !== undefined) {
      if (isRecord(parsed) && typeof parsed.$schema === 'string' && typeof parsed.kind === 'string') {
        return { kind: 'document', document: parsed };
      }
      if (Array.isArray(parsed)) {
        if (parsed.every((item) => isRecord(item) && '$schema' in item && 'kind' in item)) {
          return { kind: 'document', document: parsed[0] };
        }
        // A root array of records is the classic paste (an export, a batch).
        if (parsed.length > 0 && parsed.every((item) => isRecord(item))) {
          return {
            kind: 'entities',
            entities: [entityFromRecords('Records', parsed as Record<string, unknown>[])],
          };
        }
      }
      const arrays = collectRecordArrays(parsed);
      if (arrays.length > 0) {
        return {
          kind: 'entities',
          entities: arrays.slice(0, MAX_ENTITIES).map((a) => entityFromRecords(a.name, a.records)),
        };
      }
      if (isRecord(parsed)) {
        // A single flat record: treat it as one entity.
        const flat: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(parsed)) {
          if (isScalar(value)) flat[key] = value;
        }
        if (Object.keys(flat).length > 0) {
          return { kind: 'entities', entities: [entityFromRecords('Record', [flat])] };
        }
      }
      return { kind: 'error', message: 'No record arrays found in the pasted JSON.' };
    }
  }

  const records = csvToRecords(trimmed);
  if (records !== null) {
    return { kind: 'entities', entities: [entityFromRecords('Pasted table', records)] };
  }

  return {
    kind: 'error',
    message: 'Could not parse the paste as JSON or CSV — check the format and try again.',
  };
}
