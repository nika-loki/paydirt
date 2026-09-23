/**
 * elkjs auto-arrange — a deterministic, side-effect-free helper the studio
 * calls for INITIAL placement only (left-to-right flow). Read mode never
 * re-arranges authored positions: once the author nudges a card, that
 * position is stored forever (spec D4).
 *
 * Pure function contract: same nodes/edges in → same positions out; no DOM,
 * no React, no filesystem. Async only because ELK itself is.
 *
 * Import note: the elkjs main entry spawns a web worker via a `web-worker`
 * require that Turbopack cannot resolve (plan risk #5), so this uses the
 * worker-free bundled build — same API, layout runs on the calling thread.
 * Types ship alongside (`elk.bundled.d.ts`).
 */

import ELK from 'elkjs/lib/elk.bundled.js';

import { resolveNodeEntry } from './registry';

export interface ArrangeNode {
  id: string;
  /** Registry context for default sizing when width/height are omitted. */
  archetype?: string;
  profile?: string;
  width?: number;
  height?: number;
}

export interface ArrangeEdge {
  id: string;
  source: string;
  target: string;
}

export interface ArrangedPosition {
  id: string;
  position: { x: number; y: number };
}

const LAYOUT_OPTIONS: Record<string, string> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.spacing.nodeNode': '48',
  'elk.spacing.edgeNode': '32',
  'elk.layerSpacing': '90',
  'elk.padding': '[top=24,left=24,bottom=24,right=24]',
};

const FALLBACK_SIZE = { width: 224, height: 104 };

type Elk = InstanceType<typeof ELK>;
type ElkGraph = Parameters<Elk['layout']>[0];

let elkSingleton: Elk | null = null;

function getElk(): Elk {
  elkSingleton ??= new ELK();
  return elkSingleton;
}

/** Left-to-right layered layout. Missing sizes come from the node registry. */
export async function arrangeBoard(
  nodes: ArrangeNode[],
  edges: ArrangeEdge[],
): Promise<ArrangedPosition[]> {
  const children = nodes.map((node) => {
    const size =
      node.width !== undefined && node.height !== undefined
        ? { width: node.width, height: node.height }
        : resolveNodeEntry(node).defaultSize;
    return {
      id: node.id,
      width: node.width ?? size.width,
      height: node.height ?? size.height,
    };
  });

  const graph = {
    id: 'root',
    layoutOptions: LAYOUT_OPTIONS,
    children,
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  } as ElkGraph;

  const laidOut = await getElk().layout(graph);

  const positions: ArrangedPosition[] = [];
  for (const child of laidOut.children ?? []) {
    if (typeof child.x === 'number' && typeof child.y === 'number') {
      positions.push({ id: child.id, position: { x: child.x, y: child.y } });
    }
  }
  return positions;
}
