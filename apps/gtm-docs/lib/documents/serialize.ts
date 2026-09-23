/**
 * Deterministic serialization (spec D5): stable key order so git diffs stay
 * reviewable and a studio re-save is byte-identical unless content changed.
 *
 * Canonical form:
 * - object keys are sorted recursively (arrays keep their element order);
 * - arrays whose elements are ALL objects (nodes, edges, fields, …) are
 *   sorted by their canonical serialization, so key-shuffled documents
 *   serialize to identical bytes;
 * - 2-space indent, trailing newline.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Recursively canonicalize a JSON value (sorted keys, sorted object arrays). */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items: unknown[] = value.map(canonicalize);
    if (items.length > 0 && items.every(isPlainObject)) {
      return items
        .map((item) => ({ key: JSON.stringify(item), value: item }))
        .sort((a, b) => compareStrings(a.key, b.key))
        .map((entry) => entry.value);
    }
    return items;
  }
  if (isPlainObject(value)) {
    const record: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort(compareStrings)) {
      record[key] = canonicalize(value[key]);
    }
    return record;
  }
  return value;
}

/** Serialize a document to its canonical bytes (deterministic git diffs). */
export function stringifyDocument(doc: unknown): string {
  return `${JSON.stringify(canonicalize(doc), null, 2)}\n`;
}
