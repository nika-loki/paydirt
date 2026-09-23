/**
 * The board legend — business language, no jargon. A CXO reads the archetype
 * grammar in seconds: what each colour means, what amber marks, and which
 * revenue motions the board serves (board-level `motions`, D12).
 */

import { ARCHETYPES } from './schema';
import { ARCHETYPE_ACCENTS } from './accents';
import { cx, humanizeTerm } from './util';

const ARCHETYPE_LEGEND: Record<(typeof ARCHETYPES)[number], string> = {
  source: 'Source — data enters here',
  processor: 'Processor — transforms & enriches',
  destination: 'Destination — data lands here',
  consumer: 'Consumer — a revenue motion uses it',
};

export interface BoardLegendProps {
  boardType: 'flow' | 'model';
  /** Board-level motions served (D12) — shown as gold chips when present. */
  motions?: string[];
}

export function BoardLegend({ boardType, motions }: BoardLegendProps) {
  const items =
    boardType === 'flow'
      ? ARCHETYPES.map((archetype) => ({
          key: archetype,
          dot: ARCHETYPE_ACCENTS[archetype].dot,
          label: ARCHETYPE_LEGEND[archetype],
        }))
      : [
          {
            key: 'entity',
            dot: 'bg-fd-muted-foreground',
            label: 'Entity — a business object',
          },
          {
            key: 'pii',
            dot: 'bg-amber-500',
            label: 'PII — personal data (handle with care)',
          },
        ];

  return (
    <div className="flex flex-col gap-1.5 border-b border-fd-border bg-fd-background/40 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-label="Board legend">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-1.5 text-[11px] text-fd-muted-foreground">
            <span className={cx('h-2 w-2 shrink-0 rounded-full', item.dot)} aria-hidden="true" />
            {item.label}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        {motions && motions.length > 0 ? (
          <span className="flex items-center gap-1.5">
            <span className="text-[11px] text-fd-muted-foreground">Serves</span>
            {motions.map((motion) => (
              <span
                key={motion}
                className="rounded bg-fd-primary/15 px-1.5 py-0.5 text-[11px] font-medium text-fd-primary"
              >
                {humanizeTerm(motion)}
              </span>
            ))}
          </span>
        ) : null}
        <span className="hidden text-[11px] text-fd-muted-foreground/80 sm:inline">
          Click a card for details · scroll to zoom · drag to pan
        </span>
      </div>
    </div>
  );
}
