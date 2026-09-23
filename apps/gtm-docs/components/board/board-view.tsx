'use client';

/**
 * The client shell around the canvas: selection state, the legend, the
 * detail-panel overlay, and the model-board dictionary. The canvas itself is
 * `next/dynamic` with `ssr: false` so React Flow + elkjs cost nothing on docs
 * pages without boards — the loading placeholder matches the canvas height
 * so nothing shifts when the chunk lands.
 *
 * The detail panel renders as an overlay drawer that appears on selection:
 * a permanent side column used to claim ~a third of the figure, shrinking the
 * canvas and with it the initial fitView zoom until wide flows were illegible
 * at first paint. It also owns the AppRegistryContext so both the canvas node
 * renderers and the detail panel read the same registry (the panel renders
 * outside the canvas tree).
 */

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';

import type { AppRegistry } from './app-registry';
import { AppRegistryContext } from './contexts';
import { BoardDictionary } from './dictionary';
import { DetailPanel } from './detail-panel';
import { BoardLegend } from './legend';
import type { BoardPayload } from './view-types';
import type { Selection } from './view-types';

const BoardCanvas = dynamic(() => import('./canvas'), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-full w-full items-center justify-center"
      role="status"
      aria-label="Loading board"
    >
      <p className="animate-pulse text-sm text-fd-muted-foreground">Loading board…</p>
    </div>
  ),
});

export interface BoardViewProps {
  board: BoardPayload;
  apps: AppRegistry;
}

/** Close (✕) affordance for the detail drawer — inline SVG, fd tokens. */
function CloseDetailsButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Close details"
      className="rounded p-1 text-fd-muted-foreground hover:bg-fd-accent hover:text-fd-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-fd-ring"
    >
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </svg>
    </button>
  );
}

export function BoardView({ board, apps }: BoardViewProps) {
  const [selection, setSelection] = useState<Selection>(null);
  const onSelect = useCallback((next: Selection) => setSelection(next), []);

  // Escape dismisses the detail drawer, mirroring a pane click.
  useEffect(() => {
    if (selection === null) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setSelection(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selection]);

  if (board.nodes.length === 0) {
    return (
      <div className="flex h-[280px] flex-col items-center justify-center gap-2 bg-fd-card px-6 text-center">
        <p className="text-sm font-medium text-fd-foreground">This board has no cards yet</p>
        <p className="max-w-sm text-[11px] leading-relaxed text-fd-muted-foreground">
          Boards are authored in the studio at <span className="font-mono">/studio</span> — place
          cards on the canvas, connect them, and save. Docs pages render the saved layout exactly
          as authored.
        </p>
      </div>
    );
  }

  return (
    <AppRegistryContext.Provider value={apps}>
      <div className="overflow-hidden rounded-lg border border-fd-border bg-fd-card">
        <BoardLegend boardType={board.boardType} motions={board.motions} />
        <div className="relative h-[400px] w-full md:h-[500px]">
          <BoardCanvas board={board} selection={selection} onSelect={onSelect} />
          {selection === null ? (
            <p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded border border-fd-border bg-fd-card/90 px-2 py-1 text-[11px] text-fd-muted-foreground">
              Click any card — or press Enter on it — for details
            </p>
          ) : (
            <aside
              className="absolute inset-y-0 right-0 z-10 flex w-[85%] max-w-sm flex-col border-l border-fd-border bg-fd-card/95 shadow-lg backdrop-blur-sm sm:w-72 sm:max-w-none"
              aria-label="Board detail panel"
            >
              <div className="flex shrink-0 items-center justify-end border-b border-fd-border bg-fd-accent/50 px-2 py-1.5">
                <CloseDetailsButton onClick={() => setSelection(null)} />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <DetailPanel board={board} selection={selection} onSelect={onSelect} />
              </div>
            </aside>
          )}
        </div>
        {board.boardType === 'model' ? <BoardDictionary board={board} /> : null}
      </div>
    </AppRegistryContext.Provider>
  );
}
