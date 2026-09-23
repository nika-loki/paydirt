/**
 * Edge renderers.
 *
 * Flow edges carry the "how" (D8): the label shows mechanism + cadence in
 * business language (`API pull · nightly`) with the credential NAME small
 * beneath it — values never exist anywhere. Full data is one hover/click away
 * in the detail panel (the canvas selects the edge on hover).
 *
 * Relation edges (model boards) show the business label + cardinality.
 *
 * Arrowheads are drawn as polygons with `style` fills (not attributes) so the
 * fd CSS variables resolve — SVG presentation attributes don't support var().
 */

import {
  BaseEdge,
  EdgeLabelRenderer,
  Position,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';

import { useCanvasSelection } from '../contexts';
import type { FlowEdgeData, RelationEdgeData } from '../schema';
import { cx, humanizeTerm } from '../util';

const STROKE = 'var(--color-fd-muted-foreground)';
const STROKE_EMPHASIS = 'var(--color-fd-primary)';

/** Rotation so the arrow points into the node it enters. */
const ENTRY_ROTATION: Record<Position, number> = {
  [Position.Left]: 0,
  [Position.Right]: 180,
  [Position.Top]: 90,
  [Position.Bottom]: 270,
};

function ArrowHead({
  x,
  y,
  position,
  color,
}: {
  x: number;
  y: number;
  position: Position;
  color: string;
}) {
  const rotation = ENTRY_ROTATION[position] ?? 0;
  return (
    <polygon
      points={`${x},${y - 4} ${x},${y + 4} ${x - 7},${y}`}
      transform={`rotate(${rotation} ${x} ${y})`}
      style={{ fill: color }}
    />
  );
}

function FlowEdge(props: EdgeProps) {
  const data = props.data as FlowEdgeData;
  const { selectedNodeId } = useCanvasSelection();
  const connected =
    selectedNodeId !== null && (props.source === selectedNodeId || props.target === selectedNodeId);
  const emphasized = props.selected === true || connected;
  const stroke = emphasized ? STROKE_EMPHASIS : STROKE;
  const strokeWidth = emphasized ? 2 : 1.5;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  });

  const label = humanizeTerm(data.mechanism);
  const cadence = data.cadence?.trim();

  return (
    <>
      <BaseEdge
        id={props.id}
        path={edgePath}
        style={{ stroke, strokeWidth }}
        interactionWidth={props.interactionWidth}
      />
      <ArrowHead x={props.targetX} y={props.targetY} position={props.targetPosition} color={stroke} />
      <EdgeLabelRenderer>
        <div
          className={cx(
            'nodrag nopan pointer-events-none absolute flex flex-col items-center rounded border px-1.5 py-0.5',
            emphasized
              ? 'border-fd-primary/60 bg-fd-card'
              : 'border-fd-border bg-fd-card',
          )}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          <span
            className={cx(
              'text-[11px] font-medium leading-4',
              emphasized ? 'text-fd-primary' : 'text-fd-foreground',
            )}
          >
            {label}
            {cadence ? <span className="font-normal text-fd-muted-foreground"> · {cadence}</span> : null}
          </span>
          {data.credential ? (
            <span className="font-mono text-[10px] leading-3 text-fd-muted-foreground">
              {data.credential}
            </span>
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

function RelationEdge(props: EdgeProps) {
  const data = props.data as RelationEdgeData;
  const { selectedNodeId } = useCanvasSelection();
  const connected =
    selectedNodeId !== null && (props.source === selectedNodeId || props.target === selectedNodeId);
  const emphasized = props.selected === true || connected;
  const stroke = emphasized ? STROKE_EMPHASIS : STROKE;
  const strokeWidth = emphasized ? 2 : 1.5;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={props.id}
        path={edgePath}
        style={{ stroke, strokeWidth }}
        interactionWidth={props.interactionWidth}
      />
      <ArrowHead x={props.targetX} y={props.targetY} position={props.targetPosition} color={stroke} />
      <EdgeLabelRenderer>
        <div
          className={cx(
            'nodrag nopan pointer-events-none absolute flex flex-col items-center rounded border px-1.5 py-0.5',
            emphasized ? 'border-fd-primary/60 bg-fd-card' : 'border-fd-border bg-fd-card',
          )}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          <span className="text-[11px] font-medium leading-4 text-fd-foreground">
            {data.label ?? 'relates to'}
          </span>
          <span className="text-[10px] leading-3 text-fd-muted-foreground">
            {data.cardinality.replace(/-/g, ' ')}
          </span>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export { FlowEdge, RelationEdge };
