/**
 * Serializers for the DataModel kit: entities/relations → Mermaid `erDiagram`
 * source, and entities/relations → the MDX `<DataModel …>` snippet used by the
 * /model composer's "Copy MDX" output.
 */

import type {
  Cardinality,
  DataEntity,
  DataField,
  DataRelation,
  FieldType,
} from './types';

// Mermaid erDiagram attribute types must be single-word tokens.
const MERMAID_TYPES: Record<FieldType, string> = {
  id: 'string',
  string: 'string',
  email: 'string',
  phone: 'string',
  url: 'string',
  number: 'number',
  boolean: 'bool',
  date: 'date',
  datetime: 'datetime',
  enum: 'enum',
  array: 'list',
  object: 'json',
};

const CARDINALITY_SYNTAX: Record<Cardinality, string> = {
  'one-to-one': '||--||',
  'one-to-many': '||--o{',
  'many-to-many': '}o--o{',
};

/** Mermaid entity names may not contain spaces or most punctuation. */
function entityToken(name: string): string {
  const token = name.trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return token.length > 0 ? token : 'Entity';
}

function fieldComment(field: DataField): string | undefined {
  const parts: string[] = [];
  if (field.pii) parts.push('PII');
  if (field.type === 'enum' && field.enumValues && field.enumValues.length > 0) {
    parts.push(field.enumValues.join(' | '));
  }
  if (field.description) parts.push(field.description);
  if (parts.length === 0) return undefined;
  // Mermaid comments are double-quoted; strip quotes from content.
  return `"${parts.join(' · ').replace(/"/g, "'")}"`;
}

export function toERDiagram(entities: DataEntity[], relations: DataRelation[]): string {
  const lines: string[] = ['erDiagram'];

  for (const relation of relations) {
    const syntax = CARDINALITY_SYNTAX[relation.cardinality];
    const label = relation.label?.replace(/"/g, "'") ?? 'relates to';
    lines.push(
      `  ${entityToken(relation.from)} ${syntax} ${entityToken(relation.to)} : "${label}"`,
    );
  }

  for (const entity of entities) {
    lines.push(`  ${entityToken(entity.name)} {`);
    for (const field of entity.fields) {
      const comment = fieldComment(field);
      const flags = field.key ? ' PK' : field.unique ? ' UK' : '';
      lines.push(
        `    ${MERMAID_TYPES[field.type]} ${field.name}${flags}${comment ? ` ${comment}` : ''}`,
      );
    }
    lines.push('  }');
  }

  return lines.join('\n');
}

// --- MDX serialization (composer "Copy MDX" output) -------------------------

function escapeSingleQuoted(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function serializeValue(value: unknown, indent: number): string {
  const pad = ' '.repeat(indent);
  const inner = ' '.repeat(indent + 2);

  if (typeof value === 'string') return `'${escapeSingleQuoted(value)}'`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map((item) => `${inner}${serializeValue(item, indent + 2)}`);
    return `[\n${items.join(',\n')},\n${pad}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== undefined,
    );
    if (entries.length === 0) return '{}';
    const serialized = entries.map(
      ([key, v]) => `${inner}${key}: ${serializeValue(v, indent + 2)}`,
    );
    return `{\n${serialized.join(',\n')},\n${pad}}`;
  }
  return 'undefined';
}

export function toMDXSnippet(entities: DataEntity[], relations: DataRelation[]): string {
  const hasRelations = relations.length > 0;
  const entitiesProp = serializeValue(entities, 4);
  const relationsProp = hasRelations ? serializeValue(relations, 4) : undefined;

  let snippet = `<DataModel\n  entities=${entitiesProp}`;
  if (relationsProp) snippet += `\n  relations=${relationsProp}`;
  snippet += '\n/>';
  return snippet;
}
