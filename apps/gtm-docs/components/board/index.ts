/**
 * Public exports of the board kit for the studio (`components/studio`) —
 * registry, schema, arrange helper. The read-mode `Board` component and the
 * server-only app-registry reader are deliberately NOT re-exported here:
 * they are imported directly (`./board/board`) by MDX glue only, and this
 * index must stay client-safe.
 */

export * from './schema';
export * from './registry';
export * from './arrange';
export type { Selection } from './view-types';

/**
 * Alias for the studio seam (`components/studio/kit.ts` imports `{ registry }`)
 * while kit-internal code uses the more precise `nodeRegistry` name.
 */
export { nodeRegistry as registry } from './registry';
