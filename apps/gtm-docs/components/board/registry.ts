/**
 * The typed node registry (spec "The board engine"): each node type is a zod
 * schema (properties), an editor form spec (studio property panel), a renderer
 * (the card, used in edit AND read mode), and a default size (initial studio
 * dimensions + elk layout estimates).
 *
 * The studio (`components/studio`) renders `fields` via react-hook-form over
 * `dataSchema`; the `app-ref` and `motion` input kinds signal that options
 * come from live documents (app registry / motions vocab, D13) rather than a
 * static list.
 */

import { z } from 'zod';

import { ARCHETYPES, RICH_PROFILES, entityDataSchema, flowNodeDataSchema } from './schema';
import type { Archetype, RichProfile } from './schema';
import { nodeTypes, type NodeRenderer } from './nodes/index';

/** Input kinds the studio property panel knows how to render. */
export type FieldInputKind = 'text' | 'textarea' | 'select' | 'app-ref' | 'motion' | 'columns';

export interface FieldSpec {
  /** Key in the node's `data` object. */
  name: string;
  label: string;
  kind: FieldInputKind;
  /** Static options (select only — app-ref/motion options come from documents). */
  options?: string[];
  placeholder?: string;
  required?: boolean;
  help?: string;
}

export interface NodeSize {
  width: number;
  height: number;
}

export interface NodeRegistryEntry {
  /** Registry key — the React Flow node type. */
  type: string;
  label: string;
  description: string;
  /** Which archetype bucket the palette groups this under ('model' for entity). */
  archetype: Archetype | 'model';
  /** Validation + form source for this node type's data. */
  dataSchema: z.ZodType<Record<string, unknown>>;
  fields: FieldSpec[];
  renderer: NodeRenderer;
  defaultSize: NodeSize;
}

const APP_FIELD: FieldSpec = {
  name: 'app',
  label: 'App',
  kind: 'app-ref',
  help: 'Registry key of the app this node represents (unregistered keys render generically).',
};

const NOTES_FIELD: FieldSpec = { name: 'notes', label: 'Notes', kind: 'textarea' };

const GENERIC_SIZE: NodeSize = { width: 224, height: 104 };
const RICH_SIZE: NodeSize = { width: 240, height: 176 };
const ENTITY_SIZE: NodeSize = { width: 256, height: 224 };

interface GenericMeta {
  label: string;
  description: string;
  objectLabel: string;
}

const GENERIC_META: Record<Archetype, GenericMeta> = {
  source: {
    label: 'Source',
    description: 'Data enters the motion here — a warehouse, CRM, or event stream.',
    objectLabel: 'Object / segment',
  },
  processor: {
    label: 'Processor',
    description: 'Transforms, enriches, or orchestrates data on its way through.',
    objectLabel: 'Object',
  },
  destination: {
    label: 'Destination',
    description: 'Data lands here to be acted on — an object, view, or list.',
    objectLabel: 'Object / view / list',
  },
  consumer: {
    label: 'Consumer',
    description: 'A revenue motion uses the output — a campaign, report, or team.',
    objectLabel: 'Object',
  },
};

interface RichMeta {
  label: string;
  description: string;
  archetype: Archetype;
  listField: { name: string; label: string; required: boolean };
  extraField?: { name: string; label: string };
}

const RICH_META: Record<RichProfile, RichMeta> = {
  'clay-table': {
    label: 'Clay table',
    description: 'A Clay table with its columns.',
    archetype: 'processor',
    listField: { name: 'columns', label: 'Columns', required: true },
  },
  'clay-workflow': {
    label: 'Clay workflow',
    description: 'A Clay workflow and its triggers.',
    archetype: 'processor',
    listField: { name: 'triggers', label: 'Triggers', required: true },
  },
  'hubspot-automation': {
    label: 'HubSpot automation',
    description: 'A HubSpot automation with triggers and actions.',
    archetype: 'processor',
    listField: { name: 'triggers', label: 'Triggers', required: true },
    extraField: { name: 'actions', label: 'Actions' },
  },
  warehouse: {
    label: 'Warehouse',
    description: 'A warehouse source with the datasets it exposes.',
    archetype: 'source',
    listField: { name: 'datasets', label: 'Datasets', required: true },
  },
};

/** Requires the profile's signature list (e.g. clay-table without columns fails). */
function richDataSchema(profile: RichProfile): z.ZodType<Record<string, unknown>> {
  const meta = RICH_META[profile];
  if (!meta.listField.required) return flowNodeDataSchema;
  return flowNodeDataSchema.refine(
    (data) => data[meta.listField.name] !== undefined,
    { message: `${meta.listField.label} are required for a ${meta.label} node` },
  );
}

function buildEntries(): Array<NodeRegistryEntry> {
  const entries: Array<NodeRegistryEntry> = [];

  for (const archetype of ARCHETYPES) {
    const meta = GENERIC_META[archetype];
    entries.push({
      type: archetype,
      label: meta.label,
      description: meta.description,
      archetype,
      dataSchema: flowNodeDataSchema,
      fields: [
        APP_FIELD,
        { name: 'name', label: 'Name', kind: 'text', required: true },
        { name: 'object', label: meta.objectLabel, kind: 'text' },
        ...(archetype === 'consumer'
          ? [
              {
                name: 'motion',
                label: 'Motion',
                kind: 'motion',
                help: 'Revenue-cycle stage this consumer serves.',
              } satisfies FieldSpec,
            ]
          : []),
        NOTES_FIELD,
      ],
      renderer: nodeTypes[archetype],
      defaultSize: GENERIC_SIZE,
    });
  }

  for (const profile of RICH_PROFILES) {
    const meta = RICH_META[profile];
    entries.push({
      type: profile,
      label: meta.label,
      description: meta.description,
      archetype: meta.archetype,
      dataSchema: richDataSchema(profile),
      fields: [
        APP_FIELD,
        { name: 'name', label: 'Name', kind: 'text', required: true },
        { name: meta.listField.name, label: meta.listField.label, kind: 'columns' },
        ...(meta.extraField
          ? [{ name: meta.extraField.name, label: meta.extraField.label, kind: 'columns' } satisfies FieldSpec]
          : []),
        NOTES_FIELD,
      ],
      renderer: nodeTypes[profile],
      defaultSize: RICH_SIZE,
    });
  }

  entries.push({
    type: 'entity',
    label: 'Entity',
    description: 'A business object with typed fields (model boards). Use paste-to-model to infer fields.',
    archetype: 'model',
    dataSchema: entityDataSchema,
    fields: [
      { name: 'name', label: 'Name', kind: 'text', required: true },
      { name: 'source', label: 'Owning system', kind: 'text' },
      { name: 'description', label: 'Description', kind: 'textarea' },
    ],
    renderer: nodeTypes['entity'],
    defaultSize: ENTITY_SIZE,
  });

  return entries;
}

/** Registry key → entry. */
export const nodeRegistry: Record<string, NodeRegistryEntry> = Object.fromEntries(
  buildEntries().map((entry) => [entry.type, entry]),
);

const FALLBACK_ENTRY: NodeRegistryEntry = {
  type: 'processor',
  label: 'Node',
  description: 'Unknown node type — rendered generically.',
  archetype: 'processor',
  dataSchema: flowNodeDataSchema,
  fields: [APP_FIELD, { name: 'name', label: 'Name', kind: 'text', required: true }, NOTES_FIELD],
  renderer: nodeRegistry['processor'].renderer,
  defaultSize: GENERIC_SIZE,
};

/** Resolve a node's registry entry from its archetype + profile (profile wins). */
export function resolveNodeEntry(node: {
  profile?: string;
  archetype?: string;
}): NodeRegistryEntry {
  const key = node.profile ?? node.archetype;
  if (key !== undefined && nodeRegistry[key] !== undefined) return nodeRegistry[key];
  return FALLBACK_ENTRY;
}

export const REGISTRY_KEYS: string[] = Object.keys(nodeRegistry);
