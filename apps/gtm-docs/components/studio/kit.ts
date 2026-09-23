/**
 * Studio ⇄ board-kit seam — the single module that consumes the board engine
 * (`components/board`) and adapts it to the studio's shapes.
 *
 * Everything here is now typed directly against the landed kit API:
 *   - `nodeRegistry` / `resolveNodeEntry` from `components/board/registry`
 *     (re-exported through the kit index)
 *   - `boardPayloadSchema` from `components/board/schema`
 *   - `arrangeBoard` from `components/board/arrange` (the studio calls the
 *     kit helper directly — no duplicate elk wiring)
 *
 * The one adaptation this module owns: the kit's `FieldSpec.kind` becomes the
 * studio's `input` (avoiding a `kind` name collision in panel code), and the
 * registry is exposed as a list for palette grouping.
 */

import type { ComponentType } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { z } from 'zod';

import {
  nodeRegistry,
  resolveNodeEntry,
  type FieldSpec as KitFieldSpec,
  type FieldInputKind,
  type NodeRegistryEntry,
} from '@/components/board';

import { ARCHETYPES, ENTITY_PROFILE, RICH_PROFILES } from './types';
import type { Archetype } from './types';

export type FieldInput = FieldInputKind;

export interface FieldSpec {
  name: string;
  label: string;
  input: FieldInput;
  options?: string[];
  placeholder?: string;
  required?: boolean;
  help?: string;
}

export interface KitRegistryEntry {
  /** Registry key — the React Flow node type (`profile ?? archetype`). */
  type: string;
  label: string;
  description: string;
  /** Archetype bucket (undefined for the model-kit entity). */
  archetype?: Archetype;
  isEntity: boolean;
  /** Editor form spec for the property panel. */
  fields: FieldSpec[];
  /** The entry's zod schema — drives react-hook-form validation. */
  dataSchema?: z.ZodType<Record<string, unknown>>;
  /** The kit's node renderer, reused in edit mode (spec: same card, both modes). */
  Renderer?: ComponentType<NodeProps>;
}

function adaptField(spec: KitFieldSpec): FieldSpec {
  return {
    name: spec.name,
    label: spec.label,
    input: spec.kind,
    ...(spec.options !== undefined ? { options: spec.options } : {}),
    ...(spec.placeholder !== undefined ? { placeholder: spec.placeholder } : {}),
    ...(spec.required !== undefined ? { required: spec.required } : {}),
    ...(spec.help !== undefined ? { help: spec.help } : {}),
  };
}

function adaptEntry(entry: NodeRegistryEntry): KitRegistryEntry {
  const archetype =
    entry.archetype !== 'model' && (ARCHETYPES as readonly string[]).includes(entry.archetype)
      ? (entry.archetype as Archetype)
      : undefined;
  return {
    type: entry.type,
    label: entry.label,
    description: entry.description,
    ...(archetype !== undefined ? { archetype } : {}),
    isEntity: entry.archetype === 'model' || entry.type === ENTITY_PROFILE,
    fields: entry.fields.map(adaptField),
    dataSchema: entry.dataSchema,
    Renderer: entry.renderer,
  };
}

/** The adapted registry, keyed by type (mirrors the kit's `nodeRegistry`). */
export const kitByType: Map<string, KitRegistryEntry> = new Map(
  Object.values(nodeRegistry).map((entry) => [entry.type, adaptEntry(entry)]),
);

/** Registry lookup with the kit's fallback for unknown types. */
export function resolveStudioEntry(node: {
  profile?: string;
  archetype?: string;
}): KitRegistryEntry {
  return adaptEntry(resolveNodeEntry(node));
}

/** Flow-node entries (archetypes + rich profiles) for palette grouping. */
export function archetypeEntries(): KitRegistryEntry[] {
  return [...kitByType.values()].filter(
    (entry) => !entry.isEntity && entry.archetype !== undefined,
  );
}

/** Rich-profile entries (clay-table, …) — offered as their own palette group. */
export function profileEntries(): KitRegistryEntry[] {
  return [...kitByType.values()].filter(
    (entry) => !entry.isEntity && (RICH_PROFILES as readonly string[]).includes(entry.type),
  );
}

export function entityEntry(): KitRegistryEntry | undefined {
  return kitByType.get(ENTITY_PROFILE);
}
