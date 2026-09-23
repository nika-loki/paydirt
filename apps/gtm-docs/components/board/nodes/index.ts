/**
 * React Flow type maps — node type key → renderer, edge type key → renderer.
 * Keys are registry keys: the four archetypes, the four rich profiles, and
 * `entity` for model boards. Module-level constants so React Flow sees stable
 * references across renders.
 */

import type { ComponentType } from 'react';
import type { EdgeTypes, NodeProps, NodeTypes } from '@xyflow/react';

import { ArchetypeCard } from './archetype-card';
import { FlowEdge, RelationEdge } from './edges';
import { EntityNode } from './entity-node';
import {
  ClayTableCard,
  ClayWorkflowCard,
  HubSpotAutomationCard,
  WarehouseCard,
} from './profile-cards';

export type NodeRenderer = ComponentType<NodeProps>;

export const nodeTypes: NodeTypes = {
  source: ArchetypeCard,
  processor: ArchetypeCard,
  destination: ArchetypeCard,
  consumer: ArchetypeCard,
  'clay-table': ClayTableCard,
  'clay-workflow': ClayWorkflowCard,
  'hubspot-automation': HubSpotAutomationCard,
  warehouse: WarehouseCard,
  entity: EntityNode,
};

export const edgeTypes: EdgeTypes = {
  'flow-edge': FlowEdge,
  'relation-edge': RelationEdge,
};

/** Map a board node to its React Flow type key. */
export function nodeTypeKey(node: {
  profile?: string;
  archetype?: string;
}): string {
  if (node.profile !== undefined) return node.profile;
  return node.archetype ?? 'entity';
}
