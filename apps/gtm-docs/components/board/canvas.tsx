'use client';

/**
 * The read-mode React Flow canvas: read-only (nodes not draggable, never
 * connectable — authored positions render exactly as stored, D4), pan/zoom,
 * MiniMap, Controls (zoom in/out/fit), dotted background. Node clicks and
 * edge hovers/clicks drive the detail panel via the `onSelect` callback.
 *
 * The app registry context is provided one level up in `board-view.tsx` so
 * the detail panel (a sibling of this canvas) sees the same registry the
 * node renderers do. This module is loaded through `next/dynamic` from
 * `board-view.tsx` so React Flow costs nothing on docs pages without boards.
 * Default export is part of that contract.
 */

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { CanvasSelectionContext } from './contexts';
import { edgeTypes, nodeTypeKey, nodeTypes } from './nodes/index';
import type { BoardPayload, Selection } from './view-types';

export interface BoardCanvasProps {
  board: BoardPayload;
  selection: Selection;
  onSelect: (selection: Selection) => void;
}

/** MiniMap footprint (160×100, see below) plus its corner inset. */
const MINIMAP_RESERVE = 122;

/**
 * fitView centers the fitted content vertically, so the MiniMap (bottom-right)
 * can end up covering the bottom-right card. Nudge the viewport up so the
 * freed bottom band hosts the MiniMap; a no-op when the content fills the
 * canvas or the margins are too small to matter. Runs one frame after init,
 * when node layout (and the initial fit) has settled.
 */
function reserveMinimapBand(wrapper: HTMLElement, instance: ReactFlowInstance): void {
  const canvasRect = wrapper.getBoundingClientRect();
  let top = Infinity;
  let bottom = -Infinity;
  wrapper.querySelectorAll('.react-flow__node').forEach((node) => {
    const rect = node.getBoundingClientRect();
    top = Math.min(top, rect.top - canvasRect.top);
    bottom = Math.max(bottom, rect.bottom - canvasRect.top);
  });
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) return;

  const viewport = instance.getViewport();
  const free = canvasRect.height - (bottom - top);
  if (free <= MINIMAP_RESERVE + 16) return;

  const targetTop = free - MINIMAP_RESERVE;
  if (top <= targetTop) return;
  instance.setViewport({ ...viewport, y: viewport.y - (top - targetTop) });
}

function isDarkMode(): boolean {
  if (typeof document === 'undefined') return false;
  const root = document.documentElement;
  return root.dataset.theme === 'dark' || root.classList.contains('dark');
}

/**
 * Token bridge + read-mode overrides, scoped to the canvas wrapper class:
 * fd variables feed React Flow's `--xy-*` theme variables; connect handles
 * (studio-only affordances) hide; keyboard focus gets a visible ring;
 * background dots pick up the border token (SVG attr values can't use var()).
 *
 * Handles hide via opacity (NOT display:none): React Flow derives edge
 * endpoints from handle layout rects — display:none measures every handle
 * as 0×0 at the page origin, collapsing all edges onto one degenerate point
 * (invisible lines, labels stranded off-canvas).
 */
const CANVAS_CSS = `
.board-canvas {
  --xy-edge-stroke: var(--color-fd-muted-foreground);
  --xy-edge-stroke-selected: var(--color-fd-primary);
  --xy-edge-stroke-width: 1.5;
  --xy-handle-background-color: var(--color-fd-primary);
  --xy-handle-border-color: var(--color-fd-card);
  --xy-minimap-background-color: var(--color-fd-card);
  --xy-controls-button-background-color: var(--color-fd-card);
  --xy-controls-button-background-color-hover: var(--color-fd-accent);
  --xy-controls-button-border-color: var(--color-fd-border);
  --xy-attribution-background-color: transparent;
}
.board-canvas .react-flow__background circle { fill: var(--color-fd-border); }
.board-canvas .react-flow__controls-button svg { fill: var(--color-fd-muted-foreground); }
.board-canvas .react-flow__handle {
  opacity: 0;
  pointer-events: none;
}
.board-canvas .react-flow__node { cursor: pointer; }
.board-canvas .react-flow__node:focus-visible {
  outline: 2px solid var(--color-fd-ring);
  outline-offset: 2px;
  border-radius: 0.5rem;
}
.board-canvas .react-flow__pane { cursor: grab; }
`;

function BoardCanvasImpl({ board, selection, onSelect }: BoardCanvasProps) {
  // Follow the docs theme (data-theme / .dark) the way mermaid.tsx does.
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const update = () => setDark(isDarkMode());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  const selectedNodeId = selection?.kind === 'node' ? selection.id : null;
  const selectedEdgeId = selection?.kind === 'edge' ? selection.id : null;

  // Measured node dimensions, applied from React Flow's dimension changes.
  // Without this the controlled `nodes` prop never carries `measured`, and
  // consumers that read the user node objects (the MiniMap) render blank.
  //
  // 'select' changes are what React Flow dispatches when a focused node or
  // edge is activated with Enter/Space (`elementSelectionKeys` in
  // @xyflow/system) — applying them here (and in `onEdgesChange` below) is
  // what makes the detail panel reachable from the keyboard. Mouse clicks
  // already route through onNodeClick/onEdgeClick; both paths are idempotent.
  const [measured, setMeasured] = useState<Record<string, { width: number; height: number }>>({});
  const onNodesChange = useCallback(
    (changes: NodeChange<Node>[]) => {
      const dims: Record<string, { width: number; height: number }> = {};
      let hasDimensions = false;
      for (const change of changes) {
        if (change.type === 'dimensions' && change.dimensions !== undefined) {
          dims[change.id] = change.dimensions;
          hasDimensions = true;
        } else if (change.type === 'select') {
          if (change.selected) onSelect({ kind: 'node', id: change.id });
          else if (selectedNodeId === change.id) onSelect(null);
        }
      }
      if (hasDimensions) setMeasured((prev) => ({ ...prev, ...dims }));
    },
    [onSelect, selectedNodeId],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      for (const change of changes) {
        if (change.type !== 'select') continue;
        if (change.selected) onSelect({ kind: 'edge', id: change.id });
        else if (selectedEdgeId === change.id) onSelect(null);
      }
    },
    [onSelect, selectedEdgeId],
  );

  const nodes = useMemo<Node[]>(
    () =>
      board.nodes.map((node) => ({
        id: node.id,
        type: nodeTypeKey(node),
        position: node.position,
        data: node.data as Record<string, unknown>,
        selected: selection?.kind === 'node' && selection.id === node.id,
        ...(measured[node.id] !== undefined ? { measured: measured[node.id] } : {}),
      })),
    [board, selection, measured],
  );

  const edges = useMemo<Edge[]>(
    () =>
      board.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: board.boardType === 'flow' ? 'flow-edge' : 'relation-edge',
        data: edge.data as Record<string, unknown>,
        selected: selection?.kind === 'edge' && selection.id === edge.id,
      })),
    [board, selection],
  );

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const onInit = useCallback((instance: ReactFlowInstance) => {
    const wrapper = wrapperRef.current;
    if (wrapper === null) return;
    requestAnimationFrame(() => reserveMinimapBand(wrapper, instance));
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="board-canvas h-full w-full"
      role="application"
      aria-label="Board diagram — click a card, or press Enter while it is focused, for details; scroll to zoom, drag to pan"
    >
      <style>{CANVAS_CSS}</style>
      <CanvasSelectionContext.Provider value={{ selectedNodeId }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          panOnDrag
          zoomOnScroll
          zoomOnPinch
          minZoom={0.2}
          maxZoom={2}
          fitView
          fitViewOptions={{
            padding: { top: 0.05, left: 0.05, right: 0.05, bottom: 0.05 },
            maxZoom: 1,
          }}
          proOptions={{ hideAttribution: false }}
          colorMode={dark ? 'dark' : 'light'}
          onInit={onInit}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={(_, node) => onSelect({ kind: 'node', id: node.id })}
          onEdgeClick={(_, edge) => onSelect({ kind: 'edge', id: edge.id })}
          onEdgeMouseEnter={(_, edge) => onSelect({ kind: 'edge', id: edge.id })}
          onPaneClick={() => onSelect(null)}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.4} />
          {/* Compact (sized via style — width/height props are not MiniMap
              props) so the fitted board never slides underneath it. */}
          <MiniMap pannable zoomable style={{ width: 160, height: 100 }} />
          <Controls showInteractive={false} position="bottom-left" />
        </ReactFlow>
      </CanvasSelectionContext.Provider>
    </div>
  );
}

export default BoardCanvasImpl;
