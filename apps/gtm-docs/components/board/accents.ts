/**
 * Archetype accent definitions — fd-token-first class strings with no
 * component dependencies, so non-canvas surfaces (legend, studio palette)
 * can use them without pulling React Flow into their chunk.
 *
 * Consumer keeps the paydirt gold (fd-primary) — it is the revenue payoff.
 * Amber stays reserved for PII (the sanctioned treatment pattern).
 */

import type { Archetype } from './schema';

export interface ArchetypeAccent {
  /** Icon chip box classes. */
  iconBox: string;
  /** Left colour bar on the card. */
  bar: string;
  /** Legend swatch dot. */
  dot: string;
}

export const ARCHETYPE_ACCENTS: Record<Archetype, ArchetypeAccent> = {
  source: {
    iconBox: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
    bar: 'bg-sky-500',
    dot: 'bg-sky-500',
  },
  processor: {
    iconBox: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
    bar: 'bg-violet-500',
    dot: 'bg-violet-500',
  },
  destination: {
    iconBox: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    bar: 'bg-emerald-500',
    dot: 'bg-emerald-500',
  },
  consumer: {
    iconBox: 'bg-fd-primary/10 text-fd-primary',
    bar: 'bg-fd-primary',
    dot: 'bg-fd-primary',
  },
};

export const NEUTRAL_ACCENT: ArchetypeAccent = {
  iconBox: 'bg-fd-accent text-fd-muted-foreground',
  bar: 'bg-fd-muted-foreground/50',
  dot: 'bg-fd-muted-foreground',
};

/**
 * Accent by node TYPE key (what React Flow hands renderers — node data does
 * not carry the archetype). Rich profiles inherit their canonical archetype's
 * accent; unknown keys get the neutral fallback so nothing ever renders broken.
 */
export function accentForType(type: string | undefined): ArchetypeAccent {
  switch (type) {
    case 'source':
    case 'warehouse':
      return ARCHETYPE_ACCENTS.source;
    case 'processor':
    case 'clay-table':
    case 'clay-workflow':
    case 'hubspot-automation':
      return ARCHETYPE_ACCENTS.processor;
    case 'destination':
      return ARCHETYPE_ACCENTS.destination;
    case 'consumer':
      return ARCHETYPE_ACCENTS.consumer;
    default:
      return NEUTRAL_ACCENT;
  }
}
