/**
 * Rich-profile node renderers (spec D11 launch set): clay-table (columns),
 * clay-workflow (triggers), hubspot-automation (triggers/actions), warehouse
 * (objects). Each specialises the shared card shell with its key data —
 * one line of counts plus a capped preview of chips, so a CXO can read the
 * board at a glance and the detail panel carries the rest.
 */

import type { NodeProps } from '@xyflow/react';

import type { FlowNodeData } from '../schema';
import {
  CardShell,
  DataChip,
  IconAutomation,
  IconEntity,
  IconWarehouse,
  accentForType,
} from './shared';

const PREVIEW_LIMIT = 3;

function previewChips(values: string[] | undefined) {
  if (!values || values.length === 0) return undefined;
  const preview = values.slice(0, PREVIEW_LIMIT).map((value, index) => (
    <DataChip key={`${value}-${index}`}>{value}</DataChip>
  ));
  const overflow = values.length - PREVIEW_LIMIT;
  if (overflow > 0) {
    preview.push(<DataChip key="overflow">+{overflow}</DataChip>);
  }
  return preview;
}

function countLine(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function ClayTableCard(props: NodeProps) {
  const data = props.data as FlowNodeData;
  const columns = data.columns ?? [];
  return (
    <CardShell
      icon={<IconEntity />}
      accent={accentForType(props.type)}
      name={data.name}
      app={data.app}
      selected={props.selected}
      keyLine={columns.length > 0 ? countLine(columns.length, 'column') : 'Clay table'}
      chips={previewChips(columns)}
    />
  );
}

export function ClayWorkflowCard(props: NodeProps) {
  const data = props.data as FlowNodeData;
  const triggers = data.triggers ?? [];
  return (
    <CardShell
      icon={<IconAutomation />}
      accent={accentForType(props.type)}
      name={data.name}
      app={data.app}
      selected={props.selected}
      keyLine={triggers.length > 0 ? countLine(triggers.length, 'trigger') : 'Clay workflow'}
      chips={previewChips(triggers)}
    />
  );
}

export function HubSpotAutomationCard(props: NodeProps) {
  const data = props.data as FlowNodeData;
  const triggers = data.triggers ?? [];
  const actions = data.actions ?? [];
  const keyLine =
    triggers.length === 0 && actions.length === 0
      ? 'Automation'
      : [
          triggers.length > 0 ? countLine(triggers.length, 'trigger') : null,
          actions.length > 0 ? countLine(actions.length, 'action') : null,
        ]
          .filter((part): part is string => part !== null)
          .join(' · ');
  return (
    <CardShell
      icon={<IconAutomation />}
      accent={accentForType(props.type)}
      name={data.name}
      app={data.app}
      selected={props.selected}
      keyLine={keyLine}
      chips={previewChips(triggers.length > 0 ? triggers : actions)}
    />
  );
}

export function WarehouseCard(props: NodeProps) {
  const data = props.data as FlowNodeData;
  const datasets = data.datasets ?? data.objects ?? [];
  return (
    <CardShell
      icon={<IconWarehouse />}
      accent={accentForType(props.type)}
      name={data.name}
      app={data.app}
      selected={props.selected}
      keyLine={datasets.length > 0 ? countLine(datasets.length, 'dataset') : 'Warehouse'}
      chips={previewChips(datasets)}
    />
  );
}
