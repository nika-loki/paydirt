'use client';

import { useState } from 'react';

/**
 * One rung of paydirt's three-environment ladder. Content mirrors the
 * environment table in the repo README — file NAMES only, never values.
 */
interface EnvStage {
  /** Environment name — it is also the GitHub environment carrying secrets. */
  name: string;
  /** Where secrets live — file names only, never values. */
  secretsFile: string;
  /** How real the credentials are at this rung. */
  credentialGrade: string;
  /** Human gate before runs execute. */
  gate: string;
  /** One-line blast-radius summary. */
  blastRadius: string;
  /** Who is allowed to trigger runs in this environment. */
  whoCanTrigger: string;
}

const STAGES: readonly EnvStage[] = [
  {
    name: 'development',
    secretsFile: '.env.development',
    credentialGrade: 'Vendor sandbox keys & fake data',
    gate: 'none',
    blastRadius: 'Vendor sandbox keys and fake data — nothing real is touched.',
    whoCanTrigger: 'Any collaborator',
  },
  {
    name: 'pilot',
    secretsFile: '.env.pilot',
    credentialGrade: 'Real but narrow: single workspace, rate-limited',
    gate: '1 required reviewer on main',
    blastRadius: 'Real credentials, small audience, dry-run default.',
    whoCanTrigger: 'Environment reviewers',
  },
  {
    name: 'production',
    secretsFile: '.env.production',
    credentialGrade: 'Real and full but rotated and reviewer-gated',
    gate: '2 required reviewers on main and v*',
    blastRadius: 'Real everything, live runs.',
    whoCanTrigger: 'Production reviewers',
  },
];

/** The detail card shows exactly these fields, in this order. */
const DETAIL_ROWS = [
  { label: 'Secrets file', key: 'secretsFile', mono: true },
  { label: 'Credential grade', key: 'credentialGrade', mono: false },
  { label: 'Gate', key: 'gate', mono: false },
  { label: 'Blast radius', key: 'blastRadius', mono: false },
  { label: 'Who can trigger runs', key: 'whoCanTrigger', mono: false },
] as const;

export interface EnvStepperProps {
  /** Optional figure caption rendered under the stepper. */
  caption?: string;
}

/**
 * Interactive development → pilot → production ladder. Clicking a stage
 * reveals its trust profile: secrets file name, credential grade, gate,
 * blast radius, and who can trigger runs. Deterministic content — the same
 * README environment table every render, on server and client alike.
 */
export function EnvStepper({ caption }: EnvStepperProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const stage = STAGES[selectedIndex];

  return (
    <figure className="not-prose my-6 overflow-hidden rounded-lg border border-fd-border bg-fd-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-fd-border p-4">
        {STAGES.map((candidate, index) => (
          <div key={candidate.name} className="flex items-center gap-2">
            {index > 0 ? (
              <span aria-hidden="true" className="text-sm text-fd-muted-foreground">
                →
              </span>
            ) : null}
            <button
              type="button"
              aria-pressed={index === selectedIndex}
              onClick={() => setSelectedIndex(index)}
              className={
                index === selectedIndex
                  ? 'flex items-center gap-2 rounded-lg border border-fd-primary bg-fd-accent px-3 py-2 text-sm font-medium text-fd-primary'
                  : 'flex items-center gap-2 rounded-lg border border-fd-border px-3 py-2 text-sm font-medium text-fd-muted-foreground transition-colors hover:border-fd-primary/60 hover:text-fd-foreground'
              }
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-current text-[11px] font-semibold">
                {index + 1}
              </span>
              {candidate.name}
            </button>
          </div>
        ))}
      </div>

      <div className="space-y-4 p-4">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-sm font-semibold text-fd-foreground">{stage.name}</p>
          <p className="text-xs text-fd-muted-foreground">
            Stage {selectedIndex + 1} of {STAGES.length}
          </p>
        </div>
        <dl className="space-y-3">
          {DETAIL_ROWS.map((row) => (
            <div key={row.key} className="grid gap-1 sm:grid-cols-[12rem_1fr] sm:gap-4">
              <dt className="text-xs font-medium tracking-wide text-fd-muted-foreground uppercase">
                {row.label}
              </dt>
              <dd
                className={
                  row.mono
                    ? 'font-mono text-[13px] text-fd-foreground'
                    : 'text-sm text-fd-foreground'
                }
              >
                {stage[row.key]}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {caption ? (
        <figcaption className="border-t border-fd-border px-4 py-2 text-xs text-fd-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
