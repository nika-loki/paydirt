/**
 * Board payload schema — the canonical zod contract for `board` documents
 * (spec D5/D11/D12, `docs/superpowers/specs/2026-09-23-gtm-system-map-design.md`).
 *
 * This module validates the PAYLOAD only (everything after the document
 * envelope). It deliberately knows nothing about envelopes — `lib/documents`
 * composes envelope + this schema, and `board.tsx` guards `kind === 'board'`
 * in one line before parsing. The kit must not import `lib/` or duplicate the
 * envelope schema (extraction rule for `packages/gtm-docs-kit`).
 *
 * Kit import discipline: relative imports only.
 */

import { z } from 'zod';

import { CARDINALITIES, FIELD_TYPES } from '../data-model/types';
import type {
  Cardinality,
  DataEntity,
  DataField,
  DataRelation,
  FieldType,
} from '../data-model/types';

// --- shared patterns ---------------------------------------------------------

/** Kebab-case document slug, e.g. `icp-pipeline`. No dots, no slashes. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** App reference: a slug-shaped key into the app registry (`clay`, `hubspot`). */
export const APP_REF_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Credential reference: an env-var NAME only, never a value (repo-wide hard
 * rule; spec D8). `SNOWFLAKE_RO_KEY` yes, `replace-me` secrets never.
 */
export const CREDENTIAL_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;

const slugSchema = z.string().regex(SLUG_PATTERN);
const appRefSchema = z.string().regex(APP_REF_PATTERN);

/** Positions are finite numbers — `Infinity`/`NaN` are rejected. */
export const positionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

/**
 * Reserved hook for Phase-2 sync connectors (spec D9): `{ system, id }` once a
 * live system claims the node, `null` until then. The shape is fixed now so
 * reconciliation never needs a migration.
 */
export const externalRefSchema = z.object({
  system: z.string().min(1),
  id: z.string().min(1),
});

// --- flow kit (lineage boards) ------------------------------------------------

export const ARCHETYPES = ['source', 'processor', 'destination', 'consumer'] as const;
export type Archetype = (typeof ARCHETYPES)[number];

/** Rich node profiles with specialised renderers + property panels (spec D11). */
export const RICH_PROFILES = [
  'clay-table',
  'clay-workflow',
  'hubspot-automation',
  'warehouse',
] as const;
export type RichProfile = (typeof RICH_PROFILES)[number];

/**
 * Flow node data. Base fields every archetype understands, plus the optional
 * rich-profile fields. `passthrough()` keeps unknown keys so future profiles
 * and community documents never lose data when an older build reads them.
 */
export const flowNodeDataSchema = z
  .object({
    /** Registry key of the app this node represents; unregistered is legal (D11). */
    app: appRefSchema.optional(),
    /** Business name shown on the card — required, always human-readable. */
    name: z.string().min(1),
    /** The business noun this node holds: object / segment / view / list. */
    object: z.string().optional(),
    /** Destination flavour of `object` — a saved view or list name. */
    view: z.string().optional(),
    notes: z.string().optional(),
    /** Revenue-cycle motion (consumers carry this; vocab `motions`, D12). */
    motion: z.string().min(1).optional(),
    /** clay-table */
    columns: z.array(z.string().min(1)).optional(),
    /** clay-workflow, hubspot-automation */
    triggers: z.array(z.string().min(1)).optional(),
    /** hubspot-automation */
    actions: z.array(z.string().min(1)).optional(),
    /** warehouse — `datasets` is canonical (matches seeded content); `objects` is an accepted alias. */
    datasets: z.array(z.string().min(1)).optional(),
    objects: z.array(z.string().min(1)).optional(),
    externalRef: externalRefSchema.nullable().default(null),
  })
  .passthrough();

export const flowNodeSchema = z.object({
  id: z.string().min(1),
  archetype: z.enum(ARCHETYPES),
  profile: z.enum(RICH_PROFILES).optional(),
  position: positionSchema,
  data: flowNodeDataSchema,
});

/** Edge data is the "how" (spec D8): mechanism, cadence, payload, credential name. */
export const flowEdgeDataSchema = z.object({
  /** Seeded, owner-extendable vocabulary (`api-pull`, `webhook`, …, D13). */
  mechanism: z.string().min(1),
  /** Free text, business language: "nightly", "on new row". */
  cadence: z.string().optional(),
  /** One-line payload summary. */
  payload: z.string().optional(),
  /** Env-var NAME only — pattern-enforced. */
  credential: z.string().regex(CREDENTIAL_NAME_PATTERN).optional(),
});

export const flowEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  data: flowEdgeDataSchema,
});

// --- model kit (entity/relation boards) ---------------------------------------

const FIELD_TYPE_KEYS = FIELD_TYPES as readonly [FieldType, ...FieldType[]];
const CARDINALITY_KEYS = CARDINALITIES as readonly [Cardinality, ...Cardinality[]];

/** Mirrors `DataField` from ../data-model/types (piece 4 asserts parity). */
export const fieldSchema = z.object({
  name: z.string().min(1),
  type: z.enum(FIELD_TYPE_KEYS),
  key: z.boolean().optional(),
  unique: z.boolean().optional(),
  pii: z.boolean().optional(),
  description: z.string().optional(),
  enumValues: z.array(z.string().min(1)).optional(),
});

/** Mirrors `DataEntity` from ../data-model/types. */
export const entityDataSchema = z.object({
  name: z.string().min(1),
  source: z.string().optional(),
  description: z.string().optional(),
  fields: z.array(fieldSchema).default([]),
});

export const modelNodeSchema = z.object({
  id: z.string().min(1),
  profile: z.literal('entity'),
  position: positionSchema,
  data: entityDataSchema,
});

/** Relation edge data (model boards use these instead of flow edge data). */
export const relationEdgeDataSchema = z.object({
  cardinality: z.enum(CARDINALITY_KEYS),
  label: z.string().optional(),
});

export const relationEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  data: relationEdgeDataSchema,
});

// --- boards --------------------------------------------------------------------

const flowBoardSchema = z.object({
  boardType: z.literal('flow'),
  /**
   * Board-level motions served (D12). Declared in the schema — zod's default
   * strip would silently drop the field otherwise, losing authored data on
   * every studio save/roundtrip.
   */
  motions: z.array(z.string().min(1)).optional(),
  nodes: z.array(flowNodeSchema),
  edges: z.array(flowEdgeSchema),
});

const modelBoardSchema = z.object({
  boardType: z.literal('model'),
  motions: z.array(z.string().min(1)).optional(),
  nodes: z.array(modelNodeSchema),
  edges: z.array(relationEdgeSchema),
});

/**
 * Graph integrity checks that need whole-document context: unique node ids
 * and no dangling edge endpoints. Runs at build time (board.tsx) and at save
 * time (studio) — a malformed board fails the way a failing test does.
 */
function refineGraph(board: FlowBoard | ModelBoard, ctx: z.RefinementCtx): void {
  const ids = new Set<string>();
  for (const node of board.nodes) {
    if (ids.has(node.id)) {
      ctx.addIssue({
        code: 'custom',
        message: `Duplicate node id "${node.id}" — node ids must be unique`,
      });
    }
    ids.add(node.id);
  }
  for (const edge of board.edges) {
    if (!ids.has(edge.source)) {
      ctx.addIssue({
        code: 'custom',
        message: `Edge "${edge.id}" references missing source node "${edge.source}"`,
      });
    }
    if (!ids.has(edge.target)) {
      ctx.addIssue({
        code: 'custom',
        message: `Edge "${edge.id}" references missing target node "${edge.target}"`,
      });
    }
  }
}

/**
 * The payload schema for `board` documents. Consumed by
 * `lib/documents/board.ts` (envelope + payload composition) and by `board.tsx`
 * (payload-only parse with a one-line kind guard). Envelope keys mixed into
 * the parsed object are stripped harmlessly.
 */
export const boardPayloadSchema = z
  .discriminatedUnion('boardType', [flowBoardSchema, modelBoardSchema])
  .superRefine(refineGraph);

// --- inferred types ------------------------------------------------------------

export type Position = z.infer<typeof positionSchema>;
export type ExternalRef = z.infer<typeof externalRefSchema>;
export type FlowNodeData = z.infer<typeof flowNodeDataSchema>;
export type FlowNode = z.infer<typeof flowNodeSchema>;
export type FlowEdgeData = z.infer<typeof flowEdgeDataSchema>;
export type FlowEdge = z.infer<typeof flowEdgeSchema>;
/** Inferred (not the `DataEntity` interface) so it stays Record-compatible. */
export type EntityData = z.infer<typeof entityDataSchema>;
export type ModelNode = z.infer<typeof modelNodeSchema>;
export type RelationEdgeData = z.infer<typeof relationEdgeDataSchema>;
export type RelationEdge = z.infer<typeof relationEdgeSchema>;
export type FlowBoard = z.infer<typeof flowBoardSchema>;
export type ModelBoard = z.infer<typeof modelBoardSchema>;
export type BoardPayload = FlowBoard | ModelBoard;

export function isFlowBoard(board: BoardPayload): board is FlowBoard {
  return board.boardType === 'flow';
}

/**
 * Derive `DataRelation[]` (name-based, dictionary-shaped) from a model board's
 * id-based relation edges — the field dictionary beneath the canvas uses this.
 */
export function deriveRelations(board: ModelBoard): DataRelation[] {
  const nameById = new Map(board.nodes.map((node) => [node.id, node.data.name]));
  return board.edges.map((edge) => ({
    from: nameById.get(edge.source) ?? edge.source,
    to: nameById.get(edge.target) ?? edge.target,
    cardinality: edge.data.cardinality,
    label: edge.data.label,
  }));
}

/** Re-exported so kit consumers need one import for the model-kit shapes. */
export type { Cardinality, DataEntity, DataField, DataRelation, FieldType };
