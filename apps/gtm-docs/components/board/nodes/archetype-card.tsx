/**
 * Generic archetype card — the renderer for `source`, `processor`,
 * `destination`, and `consumer` nodes. Which archetype applies comes from the
 * React Flow node type key (node data intentionally carries no archetype).
 *
 * Consumers additionally render the motion bar (D12). Unregistered apps chip
 * generically (D11) — a flow is never blocked waiting for registry work.
 */

import type { NodeProps } from '@xyflow/react';

import type { FlowNodeData } from '../schema';
import { humanizeTerm } from '../util';
import {
  CardShell,
  IconConsumer,
  IconDestination,
  IconMotion,
  IconProcessor,
  IconSource,
  accentForType,
} from './shared';

const ICONS_BY_TYPE: Record<string, typeof IconSource> = {
  source: IconSource,
  processor: IconProcessor,
  destination: IconDestination,
  consumer: IconConsumer,
};

const FALLBACK_KEY_LINE: Record<string, string> = {
  source: 'Where data enters',
  processor: 'Transforms & enriches',
  destination: 'Where data lands',
  consumer: 'A revenue motion uses this',
};

export function ArchetypeCard(props: NodeProps) {
  const data = props.data as FlowNodeData;
  const type = props.type ?? 'processor';
  const Icon = ICONS_BY_TYPE[type] ?? IconProcessor;
  const accent = accentForType(type);
  const keyLine =
    data.object ?? (data.view !== undefined ? humanizeTerm(data.view) : FALLBACK_KEY_LINE[type]);

  return (
    <CardShell
      icon={<Icon />}
      accent={accent}
      name={data.name}
      app={data.app}
      selected={props.selected}
      keyLine={keyLine}
      footer={
        data.motion ? (
          <div className="flex items-center gap-1.5 rounded-b-lg border-t border-fd-border/60 bg-fd-primary/10 px-3 py-1.5 text-[11px] font-medium text-fd-primary">
            <IconMotion />
            {humanizeTerm(data.motion)}
          </div>
        ) : undefined
      }
    />
  );
}
