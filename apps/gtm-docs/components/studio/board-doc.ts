/**
 * Editor state ⇄ board document JSON.
 *
 * The editor state IS the document (spec D2): `toBoardDocument` produces the
 * exact envelope + payload shape from `lib/documents` (envelope) and
 * `components/board/schema` (payload) — never a bespoke format. Model-board
 * relation edges serialize as kit `DataRelation` (from/to are entity NAMES),
 * matching the existing DataModel serializer the model kit reuses.
 */

import type { Edge, Node } from '@xyflow/react';

import type { Cardinality, DataField } from '../data-model/types';
import { CARDINALITIES } from '../data-model/types';
import type { DataEntity, DataRelation } from '../data-model/types';
import { toMDXSnippet } from '../data-model/serialize';
import { boardPayloadSchema } from '../board/schema';
// Relative (not '@/…') because vitest resolves no alias and this module is a
// piece-4 test target (`board-doc.test.ts`).
import { stringifyDocument } from '../../lib/documents/serialize';

import type {
  Archetype,
  BoardDocJson,
  BoardType,
  EditorEdgeData,
  FlowEdgeData,
  ModelEdgeData,
} from './types';
import { ARCHETYPES, ENTITY_PROFILE } from './types';

export const BOARD_SCHEMA_URL = 'https://paydirt.dev/schemas/board-v1.json';

/** A flow node as it appears in the payload. */
export interface PayloadFlowNode {
  id: string;
  archetype: Archetype;
  profile?: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

/**
 * A React Flow node carrying the studio metadata (archetype/profile) beside
 * the payload data — `data` stays the raw payload node data so the kit's
 * renderers work unchanged in edit mode.
 */
export type EditorNode = Node<Record<string, unknown>> & {
  archetype?: Archetype;
  profile?: string;
};

/** Edge data is read/written through casts at the seams (flow vs relation). */
export type EditorEdge = Edge;

export interface EditorState {
  slug: string;
  title: string;
  boardType: BoardType;
  motions: string[];
  nodes: EditorNode[];
  edges: EditorEdge[];
}

// --- id generation ------------------------------------------------------------

/** Next free `n1…`/`e1…` id that collides with nothing already on the board. */
export function nextId(prefix: 'n' | 'e', taken: Iterable<string>): string {
  const used = new Set(taken);
  let i = 1;
  while (used.has(`${prefix}${i}`)) i += 1;
  return `${prefix}${i}`;
}

// --- helpers -------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asPosition(value: unknown): { x: number; y: number } {
  if (isRecord(value)) {
    const x = typeof value.x === 'number' && Number.isFinite(value.x) ? value.x : 0;
    const y = typeof value.y === 'number' && Number.isFinite(value.y) ? value.y : 0;
    return { x, y };
  }
  return { x: 0, y: 0 };
}

function asArchetype(value: unknown): Archetype {
  return ARCHETYPES.includes(value as Archetype) ? (value as Archetype) : 'processor';
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function asFields(value: unknown): DataField[] {
  if (!Array.isArray(value)) return [];
  const fields: DataField[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.name !== 'string' || typeof item.type !== 'string') continue;
    fields.push({
      name: item.name,
      type: item.type as DataField['type'],
      key: item.key === true,
      unique: item.unique === true,
      pii: item.pii === true,
      description: asString(item.description),
      enumValues: asStringList(item.enumValues),
    });
  }
  return fields;
}

/** '' → undefined so optional fields are omitted (deterministic serialization). */
function trimOptional(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** Clean node data for the payload: drop empty strings, keep lists/flags. */
function cleanData(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string' && value.trim() === '') continue;
    out[key] = value;
  }
  // D9: externalRef is reserved and null until a live system claims the node.
  if (out.externalRef === undefined) out.externalRef = null;
  return out;
}

// --- editor state → document ---------------------------------------------------

export function toBoardDocument(state: EditorState): BoardDocJson {
  if (state.boardType === 'flow') {
    const nodes = state.nodes.map<PayloadFlowNode>((node) => {
      const payload: PayloadFlowNode = {
        id: node.id,
        archetype: node.archetype ?? asArchetype(node.data.archetype),
        position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
        data: cleanData(node.data),
      };
      const profile = node.profile;
      if (profile !== undefined) payload.profile = profile;
      return payload;
    });
    const edges = state.edges.map((edge) => {
      const data = (edge.data ?? {}) as Partial<FlowEdgeData>;
      const payloadData: Record<string, unknown> = {
        mechanism: data.mechanism ?? '',
      };
      const cadence = trimOptional(data.cadence);
      const payload = trimOptional(data.payload);
      const credential = trimOptional(data.credential);
      if (cadence !== undefined) payloadData.cadence = cadence;
      if (payload !== undefined) payloadData.payload = payload;
      if (credential !== undefined) payloadData.credential = credential;
      return { id: edge.id, source: edge.source, target: edge.target, data: payloadData };
    });
    return envelope(state, { boardType: 'flow', nodes, edges });
  }

  // Model board: entity nodes + id-based relation edges (the kit's schema
  // pins relation edges as { id, source, target, data { cardinality, label } }).
  const nodes = state.nodes.map((node) => ({
    id: node.id,
    profile: ENTITY_PROFILE,
    position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
    data: node.data,
  }));
  const edges = state.edges.map((edge) => {
    const data = (edge.data ?? {}) as Partial<ModelEdgeData>;
    const relation: Record<string, unknown> = {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      data: { cardinality: data.cardinality ?? 'one-to-many' },
    };
    const label = trimOptional(data.label);
    if (label !== undefined) (relation.data as Record<string, unknown>).label = label;
    return relation;
  });
  return envelope(state, { boardType: 'model', nodes, edges });
}

function envelope(state: EditorState, payload: Record<string, unknown>): BoardDocJson {
  const doc: Record<string, unknown> = {
    $schema: BOARD_SCHEMA_URL,
    kind: 'board',
    version: 1,
    slug: state.slug,
    title: state.title.trim() === '' ? state.slug : state.title.trim(),
    ...payload,
  };
  if (state.boardType === 'flow' && state.motions.length > 0) {
    doc.motions = [...state.motions];
  }
  return doc;
}

// --- document → editor state ---------------------------------------------------

export class BoardDocError extends Error {}

/**
 * Parse a board document into editor state. The payload is validated with the
 * kit's canonical `boardPayloadSchema` so a malformed document never silently
 * loads.
 */
export function fromBoardDocument(doc: unknown): EditorState {
  if (!isRecord(doc)) throw new BoardDocError('Document is not a JSON object.');
  if (doc.kind !== 'board') throw new BoardDocError('Not a board document.');
  const slug = typeof doc.slug === 'string' ? doc.slug : '';
  if (slug === '') throw new BoardDocError('Board document is missing a slug.');

  const parsed = boardPayloadSchema.safeParse(doc);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const at = issue?.path?.length ? ` at ${issue.path.join('.')}` : '';
    throw new BoardDocError(`Invalid board payload${at}: ${issue?.message ?? 'unknown error'}`);
  }
  const payload = parsed.data as {
    boardType: BoardType;
    motions?: string[];
    nodes: unknown[];
    edges: unknown[];
  };

  const nodes: EditorNode[] = payload.nodes.map((raw) => {
    const node = raw as Record<string, unknown>;
    const profile = asString(node.profile);
    const archetype = profile === ENTITY_PROFILE ? undefined : asArchetype(node.archetype);
    return {
      id: typeof node.id === 'string' ? node.id : nextId('n', []),
      type: profile ?? archetype ?? 'processor',
      position: asPosition(node.position),
      data: isRecord(node.data) ? node.data : {},
      archetype,
      profile,
    };
  });

  const edges: EditorEdge[] = payload.edges.map((raw, index) => {
    const edge = raw as Record<string, unknown>;
    if (payload.boardType === 'flow') {
      const data = isRecord(edge.data) ? edge.data : {};
      const flowData: FlowEdgeData = {
        mechanism: typeof data.mechanism === 'string' ? data.mechanism : 'api-pull',
        cadence: asString(data.cadence),
        payload: asString(data.payload),
        credential: asString(data.credential),
      };
      return {
        id: typeof edge.id === 'string' ? edge.id : `e${index + 1}`,
        source: typeof edge.source === 'string' ? edge.source : '',
        target: typeof edge.target === 'string' ? edge.target : '',
        data: flowData,
      };
    }
    // Relation edge: id-based { source, target, data { cardinality, label } }.
    const data = isRecord(edge.data) ? edge.data : {};
    const cardinality = (
      ['one-to-one', 'one-to-many', 'many-to-many'] as const
    ).includes(data.cardinality as Cardinality)
      ? (data.cardinality as Cardinality)
      : 'one-to-many';
    const modelData: ModelEdgeData = { cardinality, label: asString(data.label) };
    return {
      id: typeof edge.id === 'string' ? edge.id : `e${index + 1}`,
      source: typeof edge.source === 'string' ? edge.source : '',
      target: typeof edge.target === 'string' ? edge.target : '',
      data: modelData,
    };
  });

  return {
    slug,
    title: typeof doc.title === 'string' ? doc.title : slug,
    boardType: payload.boardType,
    motions: asStringList(payload.motions),
    nodes,
    edges,
  };
}

/**
 * Serialize for export/display — the real deterministic serializer from
 * `lib/documents` (sorted keys + sorted object arrays, 2-space indent,
 * trailing newline). Re-exported so studio code has one import site.
 */
export { stringifyDocument as stableStringify };

// --- DataModel MDX export (composer parity) -------------------------------------

/**
 * Model board → `<DataModel …>` MDX via the kit serializer — the retired
 * /model composer's one indispensable feature, preserved as a studio export.
 * Null for flow boards.
 */
export function toDataModelMdx(state: EditorState): string | null {
  if (state.boardType !== 'model') return null;

  const entityNames = new Map<string, string>();
  for (const node of state.nodes) {
    const data: unknown = node.data;
    if (isRecord(data) && Array.isArray(data.fields)) {
      entityNames.set(node.id, asString(data.name) ?? node.id);
    }
  }

  const entities: DataEntity[] = [];
  for (const node of state.nodes) {
    const data: unknown = node.data;
    if (!isRecord(data) || !Array.isArray(data.fields)) continue;
    entities.push({
      name: entityNames.get(node.id) ?? node.id,
      fields: asFields(data.fields),
    });
  }

  const relations: DataRelation[] = [];
  for (const edge of state.edges) {
    const from = entityNames.get(edge.source);
    const to = entityNames.get(edge.target);
    if (from === undefined || to === undefined) continue;
    const data: unknown = edge.data;
    const raw = isRecord(data) ? data.cardinality : undefined;
    const cardinality = CARDINALITIES.includes(raw as Cardinality)
      ? (raw as Cardinality)
      : 'one-to-many';
    relations.push({
      from,
      to,
      cardinality,
      label: isRecord(data) ? asString(data.label) : undefined,
    });
  }

  return toMDXSnippet(entities, relations);
}
