/**
 * The right-hand detail panel: everything the map knows about the selected
 * node or edge — all data, the edge list (flows in and out), motion, and
 * externalRef presence. Edge rows are clickable (cross-navigation); credential
 * values never exist anywhere, only names.
 *
 * Deliberately imports no React Flow modules: it renders eagerly beside the
 * lazily-loaded canvas, so it must stay out of the canvas chunk.
 */

import type { ReactNode } from 'react';

import { useAppRegistry } from './contexts';
import type { BoardPayload, FlowNode, ModelNode } from './schema';
import type { Selection } from './view-types';
import { humanizeTerm } from './util';

export interface DetailPanelProps {
  board: BoardPayload;
  selection: Selection;
  onSelect: (selection: Selection) => void;
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b border-fd-border/60 px-4 py-3 last:border-0">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-fd-muted-foreground">
        {label}
      </p>
      <div className="text-[13px] leading-relaxed text-fd-foreground">{children}</div>
    </div>
  );
}

function Value({ children }: { children: ReactNode }) {
  return <p className="text-[13px] leading-relaxed text-fd-foreground">{children}</p>;
}

function EmptyValue({ children }: { children: ReactNode }) {
  return <p className="text-[13px] leading-relaxed text-fd-muted-foreground">{children}</p>;
}

function ListValue({ items }: { items: string[] }) {
  return (
    <p className="font-mono text-[12px] leading-relaxed text-fd-foreground">{items.join(', ')}</p>
  );
}

function PanelHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="border-b border-fd-border bg-fd-accent/50 px-4 py-3">
      <p className="truncate text-sm font-semibold text-fd-foreground">{title}</p>
      <p className="mt-0.5 text-[11px] text-fd-muted-foreground">{subtitle}</p>
    </div>
  );
}

function typeName(node: FlowNode): string {
  const archetype = humanizeTerm(node.archetype);
  return node.profile ? `${humanizeTerm(node.profile)} · ${archetype}` : archetype;
}

function FlowEdgeRow({
  direction,
  counterpart,
  mechanism,
  cadence,
  onEdgeClick,
  edgeId,
}: {
  direction: 'in' | 'out';
  counterpart: string;
  mechanism: string;
  cadence?: string;
  edgeId: string;
  onEdgeClick: (selection: Selection) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onEdgeClick({ kind: 'edge', id: edgeId })}
      className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-[12px] text-fd-foreground hover:bg-fd-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-fd-ring"
    >
      <span aria-hidden="true" className="shrink-0 text-fd-muted-foreground">
        {direction === 'in' ? '←' : '→'}
      </span>
      <span className="truncate">
        {counterpart}
        <span className="text-fd-muted-foreground"> · {humanizeTerm(mechanism)}</span>
        {cadence ? <span className="text-fd-muted-foreground"> · {cadence}</span> : null}
      </span>
    </button>
  );
}

function ExternalRefValue({ externalRef }: { externalRef: { system: string; id: string } | null }) {
  if (!externalRef) {
    return <EmptyValue>Not linked to a live system yet (sync arrives in a later phase).</EmptyValue>;
  }
  return (
    <Value>
      Linked to <span className="font-medium">{humanizeTerm(externalRef.system)}</span>
      <span className="font-mono text-[12px] text-fd-muted-foreground"> · {externalRef.id}</span>
    </Value>
  );
}

function nodeLabel(board: BoardPayload, id: string): string {
  const node = board.nodes.find((candidate) => candidate.id === id);
  return node ? node.data.name : id;
}

export function DetailPanel({ board, selection, onSelect }: DetailPanelProps) {
  const registry = useAppRegistry();

  if (selection === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-8 text-center">
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-fd-muted-foreground"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="4.5" />
          <circle cx="12" cy="12" r="0.5" fill="currentColor" />
        </svg>
        <p className="text-[13px] font-medium text-fd-foreground">Select a card to inspect it</p>
        <p className="text-[11px] leading-relaxed text-fd-muted-foreground">
          Click any card or connection on the board to see everything the map knows about it — its
          data, the flows in and out, and whether it is linked to a live system.
        </p>
      </div>
    );
  }

  if (selection.kind === 'edge') {
    const edge = board.edges.find((candidate) => candidate.id === selection.id);
    if (!edge) return null;
    const from = nodeLabel(board, edge.source);
    const to = nodeLabel(board, edge.target);

    if ('mechanism' in edge.data) {
      return (
        <div>
          <PanelHeader title={`${from} → ${to}`} subtitle="Flow" />
          <Section label="Mechanism">
            <Value>{humanizeTerm(edge.data.mechanism)}</Value>
          </Section>
          {edge.data.cadence ? (
            <Section label="Cadence">
              <Value>{edge.data.cadence}</Value>
            </Section>
          ) : null}
          {edge.data.payload ? (
            <Section label="Payload">
              <Value>{edge.data.payload}</Value>
            </Section>
          ) : null}
          <Section label="Credential">
            {edge.data.credential ? (
              <p>
                <span className="rounded bg-fd-accent px-1.5 py-0.5 font-mono text-[12px] text-fd-foreground">
                  {edge.data.credential}
                </span>
                <span className="mt-1 block text-[11px] text-fd-muted-foreground">
                  Environment-variable name only — values are never stored or shown.
                </span>
              </p>
            ) : (
              <EmptyValue>No credential named for this connection.</EmptyValue>
            )}
          </Section>
        </div>
      );
    }

    return (
      <div>
        <PanelHeader title={`${from} → ${to}`} subtitle="Relation" />
        <Section label="Meaning">
          <Value>{edge.data.label ?? 'relates to'}</Value>
        </Section>
        <Section label="Cardinality">
          <Value>{edge.data.cardinality.replace(/-/g, ' ')}</Value>
        </Section>
      </div>
    );
  }

  const node = board.nodes.find((candidate) => candidate.id === selection.id);
  if (!node) return null;

  if (board.boardType === 'flow') {
    const flowNode = node as FlowNode;
    const data = flowNode.data;
    const app = data.app;
    const appInfo = app !== undefined ? registry[app] : undefined;
    const incoming = board.edges.filter((edge) => edge.target === node.id);
    const outgoing = board.edges.filter((edge) => edge.source === node.id);

    return (
      <div>
        <PanelHeader title={data.name} subtitle={typeName(flowNode)} />
        {app !== undefined ? (
          <Section label="App">
            <Value>
              {appInfo ? appInfo.vendor : humanizeTerm(app)}
              {appInfo?.category ? (
                <span className="text-fd-muted-foreground"> · {humanizeTerm(appInfo.category)}</span>
              ) : null}
              {!appInfo ? <span className="text-fd-muted-foreground"> · unregistered</span> : null}
            </Value>
          </Section>
        ) : null}
        {data.motion ? (
          <Section label="Motion">
            <Value>{humanizeTerm(data.motion)}</Value>
          </Section>
        ) : null}
        {data.object ? (
          <Section label="Object">
            <Value>{data.object}</Value>
          </Section>
        ) : null}
        {data.view ? (
          <Section label="View">
            <Value>{data.view}</Value>
          </Section>
        ) : null}
        {data.columns && data.columns.length > 0 ? (
          <Section label={`Columns (${data.columns.length})`}>
            <ListValue items={data.columns} />
          </Section>
        ) : null}
        {data.triggers && data.triggers.length > 0 ? (
          <Section label={`Triggers (${data.triggers.length})`}>
            <ListValue items={data.triggers} />
          </Section>
        ) : null}
        {data.actions && data.actions.length > 0 ? (
          <Section label={`Actions (${data.actions.length})`}>
            <ListValue items={data.actions} />
          </Section>
        ) : null}
        {(data.datasets ?? data.objects)?.length ? (
          <Section label={`Datasets (${(data.datasets ?? data.objects)?.length ?? 0})`}>
            <ListValue items={(data.datasets ?? data.objects) ?? []} />
          </Section>
        ) : null}
        {data.notes ? (
          <Section label="Notes">
            <Value>{data.notes}</Value>
          </Section>
        ) : null}
        <Section label="External ref">
          <ExternalRefValue externalRef={data.externalRef} />
        </Section>
        <Section label={`Data flows (in ${incoming.length} · out ${outgoing.length})`}>
          {incoming.length === 0 && outgoing.length === 0 ? (
            <EmptyValue>No connections yet.</EmptyValue>
          ) : (
            <div className="flex flex-col gap-0.5">
              {incoming.map((edge) => (
                <FlowEdgeRow
                  key={edge.id}
                  edgeId={edge.id}
                  direction="in"
                  counterpart={nodeLabel(board, edge.source)}
                  mechanism={edge.data.mechanism}
                  cadence={edge.data.cadence}
                  onEdgeClick={onSelect}
                />
              ))}
              {outgoing.map((edge) => (
                <FlowEdgeRow
                  key={edge.id}
                  edgeId={edge.id}
                  direction="out"
                  counterpart={nodeLabel(board, edge.target)}
                  mechanism={edge.data.mechanism}
                  cadence={edge.data.cadence}
                  onEdgeClick={onSelect}
                />
              ))}
            </div>
          )}
        </Section>
      </div>
    );
  }

  const entity = node as ModelNode;
  const data = entity.data;
  const incoming = board.edges.filter((edge) => edge.target === node.id);
  const outgoing = board.edges.filter((edge) => edge.source === node.id);

  return (
    <div>
      <PanelHeader title={data.name} subtitle="Entity" />
      {data.source ? (
        <Section label="Owning system">
          <Value>{data.source}</Value>
        </Section>
      ) : null}
      {data.description ? (
        <Section label="Description">
          <Value>{data.description}</Value>
        </Section>
      ) : null}
      <Section label={`Fields (${data.fields.length})`}>
        {data.fields.length === 0 ? (
          <EmptyValue>No fields recorded.</EmptyValue>
        ) : (
          <ul className="flex flex-col gap-1">
            {data.fields.map((field) => (
              <li key={field.name} className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-[12px] text-fd-foreground">{field.name}</span>
                <span className="flex shrink-0 items-baseline gap-1.5 text-[11px] text-fd-muted-foreground">
                  {field.type}
                  {field.key ? <span className="font-medium text-fd-primary">key</span> : null}
                  {field.unique ? <span>unique</span> : null}
                  {field.pii ? (
                    <span className="font-medium text-amber-600 dark:text-amber-400">PII</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section label={`Relations (in ${incoming.length} · out ${outgoing.length})`}>
        {incoming.length === 0 && outgoing.length === 0 ? (
          <EmptyValue>No relations yet.</EmptyValue>
        ) : (
          <div className="flex flex-col gap-0.5">
            {incoming.map((edge) => (
              <FlowEdgeRow
                key={edge.id}
                edgeId={edge.id}
                direction="in"
                counterpart={nodeLabel(board, edge.source)}
                mechanism={edge.data.label ?? 'relates to'}
                cadence={edge.data.cardinality.replace(/-/g, ' ')}
                onEdgeClick={onSelect}
              />
            ))}
            {outgoing.map((edge) => (
              <FlowEdgeRow
                key={edge.id}
                edgeId={edge.id}
                direction="out"
                counterpart={nodeLabel(board, edge.target)}
                mechanism={edge.data.label ?? 'relates to'}
                cadence={edge.data.cardinality.replace(/-/g, ' ')}
                onEdgeClick={onSelect}
              />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
