'use client';

/**
 * React contexts shared by the board canvas tree. Client-only — these modules
 * are imported exclusively from 'use client' components.
 */

import { createContext, useContext } from 'react';

import type { AppRegistry } from './app-registry';

const AppRegistryContext = createContext<AppRegistry>({});

/** Provided by BoardView; consumed by node renderers and the detail panel. */
export function useAppRegistry(): AppRegistry {
  return useContext(AppRegistryContext);
}

export interface CanvasSelectionState {
  /** Id of the currently selected node, or null — connected edges highlight. */
  selectedNodeId: string | null;
}

const CanvasSelectionContext = createContext<CanvasSelectionState>({ selectedNodeId: null });

/** Provided by the canvas; consumed by edge renderers to emphasise connections. */
export function useCanvasSelection(): CanvasSelectionState {
  return useContext(CanvasSelectionContext);
}

export { AppRegistryContext, CanvasSelectionContext };
