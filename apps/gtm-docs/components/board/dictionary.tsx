/**
 * Model-board field dictionary — auto-derived beneath the canvas (the existing
 * DataModel kit behaviour). Markup mirrors `components/data-model.tsx`'s
 * dictionary tables: per-entity cards, key/unique chips, and the amber PII
 * treatment. That component also renders a Mermaid ER diagram, which the
 * canvas already supersedes — so the dictionary markup is reproduced here
 * against the shared types instead of importing it.
 */

import type { DataField } from '../data-model/types';
import { deriveRelations } from './schema';
import type { ModelBoard } from './schema';

function FieldFlags({ field }: { field: DataField }) {
  if (!field.key && !field.unique && !field.pii) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {field.key ? (
        <span className="rounded bg-fd-primary/15 px-1.5 py-0.5 text-[11px] font-medium text-fd-primary">
          key
        </span>
      ) : null}
      {field.unique ? (
        <span className="rounded bg-fd-accent px-1.5 py-0.5 text-[11px] font-medium text-fd-muted-foreground">
          unique
        </span>
      ) : null}
      {field.pii ? (
        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
          PII
        </span>
      ) : null}
    </span>
  );
}

function fieldSubtitle(field: DataField): string {
  const parts: string[] = [];
  if (field.type === 'enum' && field.enumValues?.length) parts.push(field.enumValues.join(' | '));
  if (field.description) parts.push(field.description);
  return parts.join(' — ');
}

export function BoardDictionary({ board }: { board: ModelBoard }) {
  const relations = deriveRelations(board);

  return (
    <section className="border-t border-fd-border" aria-label="Field dictionary">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
        <h4 className="text-sm font-semibold text-fd-foreground">Field dictionary</h4>
        <p className="text-[11px] text-fd-muted-foreground">
          Auto-derived from this board&apos;s entities
          {relations.length > 0 ? ` — ${relations.length} relation${relations.length === 1 ? '' : 's'}` : ''}
        </p>
      </div>
      <div className="flex flex-col gap-4 px-4 pb-4">
        {board.nodes.map((node) => {
          const entity = node.data;
          return (
            <div key={node.id} className="rounded-lg border border-fd-border">
              <div className="flex flex-wrap items-center gap-2 border-b border-fd-border px-4 py-3">
                <h5 className="text-sm font-semibold text-fd-foreground">{entity.name}</h5>
                {entity.source ? (
                  <span className="rounded bg-fd-accent px-2 py-0.5 text-[11px] font-medium text-fd-muted-foreground">
                    {entity.source}
                  </span>
                ) : null}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-fd-border text-left text-xs text-fd-muted-foreground">
                    <th className="px-4 py-2 font-medium">Field</th>
                    <th className="px-4 py-2 font-medium">Type</th>
                    <th className="px-4 py-2 font-medium">Flags</th>
                    <th className="px-4 py-2 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {entity.fields.map((field) => (
                    <tr key={field.name} className="border-b border-fd-border/60 last:border-0">
                      <td className="px-4 py-2 font-mono text-[13px] text-fd-foreground">
                        {field.name}
                      </td>
                      <td className="px-4 py-2 text-fd-muted-foreground">{field.type}</td>
                      <td className="px-4 py-2">
                        <FieldFlags field={field} />
                      </td>
                      <td className="px-4 py-2 text-fd-muted-foreground">
                        {fieldSubtitle(field)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </section>
  );
}
