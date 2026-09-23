/**
 * View-model types shared across the board client tree (canvas, detail panel,
 * board view). Import-only module — no runtime code.
 */

import type { BoardPayload } from './schema';

export type { BoardPayload };

/** What the detail panel shows: a node or an edge by id, or nothing. */
export type Selection = { kind: 'node' | 'edge'; id: string } | null;
