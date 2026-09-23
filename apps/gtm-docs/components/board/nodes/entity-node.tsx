/**
 * Model-kit entity node: a business object with its fields, `key`/`unique`
 * chips, and the amber PII treatment (the sanctioned pattern from
 * `components/data-model.tsx:20` — Tailwind amber utilities, dark variants,
 * never hardcoded hex). The full field dictionary renders beneath the canvas
 * (`dictionary.tsx`); the card shows a capped preview.
 */

import type { NodeProps } from '@xyflow/react';

import type { DataField } from '../../data-model/types';
import type { EntityData } from '../schema';
import { cx } from '../util';
import { CardShell, IconEntity, accentForType } from './shared';

const FIELD_PREVIEW_LIMIT = 6;

function FieldFlags({ field }: { field: DataField }) {
  if (!field.key && !field.unique && !field.pii) return null;
  return (
    <span className="flex shrink-0 gap-1">
      {field.key ? (
        <span className="rounded bg-fd-primary/15 px-1 py-px text-[10px] font-medium text-fd-primary">
          key
        </span>
      ) : null}
      {field.unique ? (
        <span className="rounded bg-fd-accent px-1 py-px text-[10px] font-medium text-fd-muted-foreground">
          unique
        </span>
      ) : null}
      {field.pii ? (
        <span className="rounded bg-amber-500/15 px-1 py-px text-[10px] font-medium text-amber-600 dark:text-amber-400">
          PII
        </span>
      ) : null}
    </span>
  );
}

export function EntityNode(props: NodeProps) {
  const data = props.data as EntityData;
  const fields = data.fields ?? [];
  const preview = fields.slice(0, FIELD_PREVIEW_LIMIT);
  const overflow = fields.length - preview.length;

  return (
    <CardShell
      icon={<IconEntity />}
      accent={accentForType(props.type)}
      name={data.name}
      app={undefined}
      selected={props.selected}
      keyLine={data.source ? `in ${data.source}` : undefined}
      footer={
        fields.length > 0 ? (
          <div className="border-t border-fd-border/60 px-3 py-2">
            <ul className="flex flex-col gap-1">
              {preview.map((field) => (
                <li key={field.name} className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-[11px] leading-4 text-fd-foreground">
                    {field.name}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="text-[10px] text-fd-muted-foreground">{field.type}</span>
                    <FieldFlags field={field} />
                  </span>
                </li>
              ))}
            </ul>
            {overflow > 0 ? (
              <p className={cx('mt-1 text-[10px] text-fd-muted-foreground')}>
                +{overflow} more field{overflow === 1 ? '' : 's'} — see dictionary below
              </p>
            ) : null}
          </div>
        ) : undefined
      }
    />
  );
}
