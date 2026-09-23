'use client';

/**
 * The studio canvas — a React Flow editor (editable: drag nodes to author
 * positions, connect handles to draw edges, Delete removes the selection).
 *
 * Node cards and edge labels are the kit's own renderers (spec: the same card
 * in edit and read mode — `CardShell` ships the connection handles; the kit's
 * `flow-edge`/`relation-edge` render the business-language labels). The studio
 * wraps each card only with editor chrome: a delete affordance on selection.
 * The kit's app-registry and selection contexts are provided here so chips
 * and edge emphasis work identically to read mode.
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import type {
  Connection,
  EdgeChange,
  NodeChange,
  NodeProps,
  NodeTypes,
  OnSelectionChangeParams,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { Trash2 } from 'lucide-react';

import { edgeTypes as kitEdgeTypes, nodeTypes as kitNodeTypes } from '@/components/board/nodes';
import { AppRegistryContext, CanvasSelectionContext } from '@/components/board/contexts';
import type { AppRegistry } from '@/components/board/app-registry';
import { Button } from '@/components/ui/button';

import type { EditorEdge, EditorNode } from './board-doc';
import type { BoardType } from './types';

// --- delete affordance via context (avoids smuggling props through nodes) -------

interface EditorChrome {
  onDeleteNode: ((id: string) => void) | null;
}

const EditorChromeContext = createContext<EditorChrome>({ onDeleteNode: null });

// --- wrapped node with editor chrome -----------------------------------------------

function makeNodeType(type: string, KitRenderer: React.ComponentType<NodeProps>) {
  function EditorNodeShell(props: NodeProps) {
    const { data, selected, id } = props;
    const { onDeleteNode } = useContext(EditorChromeContext);
    return (
      <div className="relative">
        <KitRenderer {...props} />
        {onDeleteNode !== null && selected === true && (
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute -top-3 -right-3 z-10 size-6 shadow-sm"
            aria-label={`Delete ${typeof data.name === 'string' ? data.name : 'node'}`}
            onClick={(event) => {
              event.stopPropagation();
              onDeleteNode(id);
            }}
          >
            <Trash2 className="size-3" aria-hidden="true" />
          </Button>
        )}
      </div>
    );
  }
  EditorNodeShell.displayName = `EditorNode(${type})`;
  return EditorNodeShell;
}

// --- the studio token bridge ---------------------------------------------------------
//
// The kit's read-mode canvas bridges fd tokens into React Flow's --xy-* theme
// variables AND hides handles (`.board-canvas .react-flow__handle { display:
// none }`). The studio keeps the token bridge but shows handles — connecting
// nodes is the edit-mode point.

const STUDIO_CANVAS_CSS = `
.studio-canvas {
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
.studio-canvas .react-flow__background circle { fill: var(--color-fd-border); }
.studio-canvas .react-flow__controls-button svg { fill: var(--color-fd-muted-foreground); }
.studio-canvas .react-flow__node { cursor: grab; }
.studio-canvas .react-flow__node.dragging { cursor: grabbing; }
.studio-canvas .react-flow__node:focus-visible {
  outline: 2px solid var(--color-fd-ring);
  outline-offset: 2px;
  border-radius: 0.5rem;
}
.studio-canvas .react-flow__handle {
  width: 10px;
  height: 10px;
  border-width: 2px;
}
`;

// --- the canvas -----------------------------------------------------------------------

/** Viewport animations are JS-driven (d3-zoom), so CSS reduced-motion guards
 * can't stop them — collapse the duration for vestibular users instead. */
function viewportDuration(defaultMs: number): number {
  if (typeof window === 'undefined') return defaultMs;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : defaultMs;
}

export interface CanvasEditorProps {
  nodes: EditorNode[];
  edges: EditorEdge[];
  boardType: BoardType;
  apps: AppRegistry;
  readOnly: boolean;
  onNodesChange: (changes: NodeChange<EditorNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<EditorEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  onSelectionChange: (params: OnSelectionChangeParams) => void;
  onDeleteNode: (id: string) => void;
  /** Bump to refit the view (after Arrange / board switch). */
  fitViewSignal: number;
}

function CanvasInner({
  nodes,
  edges,
  boardType,
  apps,
  readOnly,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onSelectionChange,
  onDeleteNode,
  fitViewSignal,
}: CanvasEditorProps) {
  const { fitView, getViewport, setViewport } = useReactFlow();

  // Follow the docs theme (data-theme / .dark) the way the kit canvas does.
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const update = () =>
      setDark(
        document.documentElement.dataset.theme === 'dark' ||
          document.documentElement.classList.contains('dark'),
      );
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  const chrome = useMemo<EditorChrome>(
    () => ({ onDeleteNode: readOnly ? null : onDeleteNode }),
    [readOnly, onDeleteNode],
  );

  const nodeTypes = useMemo<NodeTypes>(() => {
    const types: Record<string, (props: NodeProps) => React.JSX.Element> = {};
    for (const [type, renderer] of Object.entries(kitNodeTypes)) {
      types[type] = makeNodeType(type, renderer);
    }
    return types;
  }, []);

  const displayEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        type: boardType === 'flow' ? 'flow-edge' : 'relation-edge',
      })),
    [edges, boardType],
  );

  useEffect(() => {
    if (fitViewSignal === 0) return;
    const timer = window.setTimeout(() => {
      void fitView({ padding: 0.2, duration: viewportDuration(250), maxZoom: 1 });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [fitViewSignal, fitView]);

  // --- keep palette drops visible -----------------------------------------------------
  //
  // React Flow only auto-fits once (on init), so later palette drops never
  // refit — the third grid column (x = 80 + 2×360) lands outside a typical
  // viewport and the author is left hunting for the Fit View button. When
  // exactly one node is added (a palette drop) and it lands outside the
  // visible rect, centre that axis via setViewport — pure math on the
  // authored position, so it runs synchronously. (A deferred fitView would
  // need the node measured, and the measurement change feeds back into the
  // `nodes` prop, re-running this effect and cancelling the timer before it
  // fires.) Bulk changes (board switch, paste-to-model, arrange) refit via
  // `fitViewSignal` instead.

  const knownNodeIdsRef = useRef<Set<string> | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const known = knownNodeIdsRef.current;
    knownNodeIdsRef.current = new Set(nodes.map((node) => node.id));
    // First run only seeds the set; a read-only studio never takes drops.
    if (known === null || readOnly) return;
    const added = nodes.filter((node) => !known.has(node.id));
    if (added.length !== 1) return;
    const node = added[0];
    const wrapper = wrapperRef.current;
    if (wrapper === null) return;

    // Card bounds: kit cards are w-56 (224px) plus handle overhang, and
    // `measured` is not populated on the render a node first appears in —
    // use a conservative footprint.
    const CARD_WIDTH = 240;
    const CARD_HEIGHT = 200;
    const left = node.position.x;
    const right = left + CARD_WIDTH;
    const top = node.position.y;
    const bottom = top + CARD_HEIGHT;

    const { x, y, zoom } = getViewport();
    const viewLeft = -x / zoom;
    const viewTop = -y / zoom;
    const viewRight = viewLeft + wrapper.clientWidth / zoom;
    const viewBottom = viewTop + wrapper.clientHeight / zoom;

    // Centre whichever axis is out of view; keep the author's zoom.
    let nextX = x;
    let nextY = y;
    if (right < viewLeft || left > viewRight) {
      nextX = wrapper.clientWidth / 2 - (left + CARD_WIDTH / 2) * zoom;
    }
    if (bottom < viewTop || top > viewBottom) {
      nextY = wrapper.clientHeight / 2 - (top + CARD_HEIGHT / 2) * zoom;
    }
    if (nextX === x && nextY === y) return;
    setViewport({ x: nextX, y: nextY, zoom }, { duration: viewportDuration(250) });
  }, [nodes, readOnly, getViewport, setViewport]);

  const selectedNodeId =
    nodes.find((node) => node.selected === true)?.id ?? null;

  return (
    <div
      ref={wrapperRef}
      className="studio-canvas h-full w-full"
      role="application"
      aria-label="Board editor — drag cards to position, drag between ports to connect, Delete removes the selection"
    >
      <style>{STUDIO_CANVAS_CSS}</style>
      <EditorChromeContext.Provider value={chrome}>
        <CanvasSelectionContext.Provider value={{ selectedNodeId }}>
          <AppRegistryContext.Provider value={apps}>
            <ReactFlow
              nodes={nodes}
              edges={displayEdges}
              nodeTypes={nodeTypes}
              edgeTypes={kitEdgeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onSelectionChange={onSelectionChange}
              onPaneClick={() => onSelectionChange({ nodes: [], edges: [] })}
              fitView
              fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
              minZoom={0.2}
              maxZoom={2}
              snapToGrid={!readOnly}
              snapGrid={[16, 16]}
              deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
              nodesDraggable={!readOnly}
              nodesConnectable={!readOnly}
              connectionLineType={ConnectionLineType.Bezier}
              connectionLineStyle={{ stroke: 'var(--color-fd-primary)', strokeWidth: 1.5 }}
              proOptions={{ hideAttribution: false }}
              colorMode={dark ? 'dark' : 'light'}
              className="bg-background"
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={16}
                size={1.2}
              />
              {/* Compact (sized via style — width/height props are not MiniMap
                  props, mirroring the read-mode board canvas) and hidden below
                  md so it never floats over the squeezed phone canvas. */}
              <MiniMap
                pannable
                zoomable
                style={{ width: 160, height: 100 }}
                className="hidden md:block"
              />
              <Controls showInteractive={false} position="bottom-left" />
            </ReactFlow>
          </AppRegistryContext.Provider>
        </CanvasSelectionContext.Provider>
      </EditorChromeContext.Provider>
    </div>
  );
}

export function CanvasEditor(props: CanvasEditorProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
