/**
 * Studio view types.
 *
 * The studio is app glue: these are the shapes the client editor works with,
 * derived from the pinned document contracts in the Phase 1 plan (spec D5/D8/
 * D11/D12). The canonical zod schemas live in `components/board/schema.ts`
 * (board payload) and `lib/documents/` (envelope + kinds) — the studio never
 * invents a bespoke document format; `board-doc.ts` converts between editor
 * state and the real envelope+payload JSON, and every save is validated by
 * `validateDocument` on the server before it touches `content/`.
 */

import type { Cardinality, DataEntity } from '../data-model/types';

export type BoardType = 'flow' | 'model';

export const ARCHETYPES = ['source', 'processor', 'destination', 'consumer'] as const;
export type Archetype = (typeof ARCHETYPES)[number];

/** The registry entry id used as the React Flow node type: profile ?? archetype. */
export type NodeKind = string;

/**
 * Flow-edge data — the "how" (spec D8). Credential is an env-var NAME, never a
 * value. Type aliases (not interfaces) so they satisfy React Flow's
 * `Record<string, unknown>` data constraint via the implicit index signature.
 */
export type FlowEdgeData = {
  mechanism: string;
  cadence?: string;
  payload?: string;
  credential?: string;
};

/** Model-board relation edge data (id-based relation edges in the payload). */
export type ModelEdgeData = {
  cardinality: Cardinality;
  label?: string;
};

export type EditorEdgeData = FlowEdgeData | ModelEdgeData;

/** The four rich profiles seeded in Phase 1 (plan piece 2). */
export const RICH_PROFILES = [
  'clay-table',
  'clay-workflow',
  'hubspot-automation',
  'warehouse',
] as const;

/** The model-kit node profile. */
export const ENTITY_PROFILE = 'entity';

// --- Registry views (defensive reads of `app` / `preset` / `vocab` documents) --

export interface AppView {
  slug: string;
  title: string;
  vendor: string;
  category: string;
  brandColor?: string;
  logo?: string;
  /** Rich profile ids this app has rich node profiles for (clay → clay-table…). */
  richProfiles: string[];
}

export interface PresetView {
  slug: string;
  title: string;
  /** Suggested entity name, e.g. "HubSpot Contact". */
  name: string;
  /** Owning system for the entity chip. */
  source: string;
  fields: DataEntity['fields'];
}

export interface VocabView {
  motions: string[];
  mechanisms: string[];
  appCategories: string[];
}

// --- Server bootstrap payload -------------------------------------------------

/** A raw board document (envelope + payload) as parsed JSON. */
export type BoardDocJson = Record<string, unknown>;

export interface StudioBootstrap {
  /** NODE_ENV === 'development' — the write API exists. */
  writable: boolean;
  boards: BoardDocJson[];
  apps: AppView[];
  presets: PresetView[];
  vocab: VocabView;
  /** Serialized flagship board document (`icp-pipeline`), when present on disk. */
  exampleBoardJson: string | null;
}

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

export type SelectionRef =
  | { kind: 'node'; id: string }
  | { kind: 'edge'; id: string }
  | null;
