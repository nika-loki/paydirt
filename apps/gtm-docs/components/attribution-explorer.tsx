'use client';

import { useState } from 'react';

type ModelId = 'first-touch' | 'last-touch' | 'linear' | 'u-shaped';

/** Credit weight per touch position; weights sum to 1 for any count ≥ 1. */
type WeightFn = (count: number) => number[];

function firstTouchWeights(count: number): number[] {
  return Array.from({ length: count }, (_, position) => (position === 0 ? 1 : 0));
}

function lastTouchWeights(count: number): number[] {
  return Array.from({ length: count }, (_, position) => (position === count - 1 ? 1 : 0));
}

function linearWeights(count: number): number[] {
  return Array.from({ length: count }, () => 1 / count);
}

function uShapedWeights(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [1];
  // With two touches there is no middle to split the 20% across, so the
  // endpoints absorb it evenly (50/50) and the deal still sums to 100%.
  if (count === 2) return [0.5, 0.5];
  const middleEach = 0.2 / (count - 2);
  return Array.from({ length: count }, (_, position) =>
    position === 0 || position === count - 1 ? 0.4 : middleEach,
  );
}

interface AttributionModel {
  id: ModelId;
  label: string;
  description: string;
  weights: WeightFn;
}

const MODELS: readonly AttributionModel[] = [
  {
    id: 'first-touch',
    label: 'First-touch',
    description: 'All credit to the first touchpoint.',
    weights: firstTouchWeights,
  },
  {
    id: 'last-touch',
    label: 'Last-touch',
    description: 'All credit to the touchpoint right before the close.',
    weights: lastTouchWeights,
  },
  {
    id: 'linear',
    label: 'Linear',
    description: 'Credit split evenly across every touchpoint.',
    weights: linearWeights,
  },
  {
    id: 'u-shaped',
    label: 'U-shaped',
    description: '40% first, 40% last, 20% split across the middle touches.',
    weights: uShapedWeights,
  },
];

const DEFAULT_MODEL: ModelId = 'first-touch';

interface SampleDeal {
  name: string;
  /** Closed-won amount in USD. */
  amount: number;
  /** Touchpoint channels in funnel order, first → last. */
  channels: string[];
}

/** Fixed channel display order. */
const CHANNELS: readonly string[] = [
  'Blog',
  'LinkedIn Ad',
  'Webinar',
  'Demo Request',
  'Outbound Email',
];

/** Three deterministic sample deals; sequences deliberately differ. */
const DEALS: readonly SampleDeal[] = [
  {
    name: 'Acme renewal',
    amount: 24_000,
    channels: ['Blog', 'Webinar', 'Demo Request'],
  },
  {
    name: 'Globex expansion',
    amount: 48_000,
    channels: ['LinkedIn Ad', 'Outbound Email', 'Webinar', 'Demo Request'],
  },
  {
    name: 'Initech new seats',
    amount: 12_000,
    channels: ['Outbound Email', 'LinkedIn Ad', 'Demo Request'],
  },
];

/** USD credited to each touch of one deal under the given model. */
function creditedValues(model: AttributionModel, deal: SampleDeal): number[] {
  const weights = model.weights(deal.channels.length);
  // Round each position to cents so float weights (1/3, 0.4, …) never leak
  // fractional-cent dust into the displayed dollars.
  return deal.channels.map(
    (_, position) => Math.round(deal.amount * 100 * weights[position]) / 100,
  );
}

interface ChannelRow {
  channel: string;
  /** Occurrences across all deals — model-independent. */
  touches: number;
  /** USD credited under the current model. */
  credit: number;
}

function channelRows(model: AttributionModel): ChannelRow[] {
  return CHANNELS.map((channel) => {
    let touches = 0;
    let credit = 0;
    for (const deal of DEALS) {
      const values = creditedValues(model, deal);
      deal.channels.forEach((candidate, position) => {
        if (candidate === channel) {
          touches += 1;
          credit += values[position];
        }
      });
    }
    return { channel, touches, credit };
  });
}

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export interface AttributionExplorerProps {
  /** Optional figure caption rendered under the explorer. */
  caption?: string;
}

/**
 * Deterministic single-touch-vs-multi-touch playground: three sample deals,
 * four attribution models, and a per-channel credit redistribution. Pure
 * client-side state over inline constants — zero network, zero props
 * beyond an optional caption.
 */
export function AttributionExplorer({ caption }: AttributionExplorerProps) {
  const [modelId, setModelId] = useState<ModelId>(DEFAULT_MODEL);
  const model = MODELS.find((candidate) => candidate.id === modelId) ?? MODELS[0];
  const rows = channelRows(model);
  const maxCredit = Math.max(...rows.map((row) => row.credit));
  const totalTouches = rows.reduce((sum, row) => sum + row.touches, 0);
  const totalCredit = rows.reduce((sum, row) => sum + row.credit, 0);

  return (
    <figure className="not-prose my-6 overflow-hidden rounded-lg border border-fd-border bg-fd-card">
      <div className="space-y-2 border-b border-fd-border p-4">
        <div className="flex flex-wrap items-center gap-2" aria-label="Attribution model">
          {MODELS.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              aria-pressed={candidate.id === model.id}
              onClick={() => setModelId(candidate.id)}
              className={
                candidate.id === model.id
                  ? 'rounded-full border border-fd-primary bg-fd-accent px-3 py-1 text-xs font-medium text-fd-primary'
                  : 'rounded-full border border-fd-border px-3 py-1 text-xs font-medium text-fd-muted-foreground transition-colors hover:text-fd-foreground'
              }
            >
              {candidate.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-fd-muted-foreground">
          {model.description} Switching the model redistributes each deal&apos;s value
          across its touchpoints — the pipeline total never changes.
        </p>
      </div>

      <div className="space-y-3 border-b border-fd-border p-4">
        {DEALS.map((deal) => {
          const values = creditedValues(model, deal);
          return (
            <div key={deal.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="min-w-36 font-medium text-fd-foreground">{deal.name}</span>
              <span className="font-mono text-[13px] text-fd-muted-foreground">
                {usd.format(deal.amount)}
              </span>
              <span className="flex flex-wrap items-center gap-1">
                {deal.channels.map((channel, position) => (
                  <span key={`${deal.name}-${position}-${channel}`} className="flex items-center gap-1">
                    {position > 0 ? (
                      <span aria-hidden="true" className="text-xs text-fd-muted-foreground">
                        →
                      </span>
                    ) : null}
                    <span
                      className={
                        values[position] > 0
                          ? 'rounded-full border border-fd-primary bg-fd-accent px-2 py-0.5 text-xs text-fd-primary'
                          : 'rounded-full border border-fd-border px-2 py-0.5 text-xs text-fd-muted-foreground'
                      }
                    >
                      {channel}
                    </span>
                  </span>
                ))}
              </span>
            </div>
          );
        })}
      </div>

      <div className="space-y-2 border-b border-fd-border p-4">
        {rows.map((row) => {
          const width = maxCredit > 0 ? Math.round((row.credit / maxCredit) * 100) : 0;
          return (
            <div key={row.channel} className="flex items-center gap-3">
              <span className="w-28 shrink-0 truncate text-sm text-fd-foreground">
                {row.channel}
              </span>
              <div aria-hidden="true" className="h-4 flex-1 overflow-hidden rounded-full bg-fd-accent">
                <div
                  className="h-full rounded-full bg-fd-primary transition-[width] duration-300"
                  style={{ width: `${width}%` }}
                />
              </div>
              <span className="w-20 shrink-0 text-right font-mono text-[13px] text-fd-primary">
                {usd.format(row.credit)}
              </span>
            </div>
          );
        })}
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-fd-border text-left text-xs text-fd-muted-foreground">
            <th className="px-4 py-2 font-medium">Channel</th>
            <th className="px-4 py-2 font-medium">Touches</th>
            <th className="px-4 py-2 text-right font-medium">Credited value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.channel} className="border-b border-fd-border/60 last:border-0">
              <td className="px-4 py-2 text-fd-foreground">{row.channel}</td>
              <td className="px-4 py-2 text-fd-muted-foreground">{row.touches}</td>
              <td className="px-4 py-2 text-right font-mono text-[13px] text-fd-foreground">
                {usd.format(row.credit)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-fd-border text-xs">
            <td className="px-4 py-2 font-medium text-fd-foreground">Total</td>
            <td className="px-4 py-2 text-fd-muted-foreground">{totalTouches}</td>
            <td className="px-4 py-2 text-right font-mono text-[13px] font-medium text-fd-foreground">
              {usd.format(totalCredit)}
            </td>
          </tr>
        </tfoot>
      </table>

      {caption ? (
        <figcaption className="border-t border-fd-border px-4 py-2 text-xs text-fd-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
