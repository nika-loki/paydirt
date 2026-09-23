/**
 * Shared renderer primitives for board node cards: archetype accents, inline
 * icons (no icon dependency), the app chip, field-flag chips, and the card
 * shell every node renderer builds on.
 *
 * Styling is fd-token-first (docs surface, D14). The four archetype accents
 * use Tailwind palette utilities the same way the sanctioned amber PII
 * treatment does (`components/data-model.tsx` — utility classes with dark
 * variants, never hardcoded hex): consumer keeps the paydirt gold (fd-primary)
 * because it is the revenue payoff; amber stays reserved for PII.
 */

import { Handle, Position } from '@xyflow/react';
import type { ReactNode } from 'react';

import type { ArchetypeAccent } from '../accents';
import { cx, humanizeTerm } from '../util';
import { useAppRegistry } from '../contexts';

// --- icons (inline SVG, stroke = currentColor, 14px box) ----------------------

function SvgIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Source — data enters the motion here (down into a baseline). */
export function IconSource() {
  return (
    <SvgIcon>
      <path d="M12 3v12" />
      <path d="m8 11 4 4 4-4" />
      <path d="M4 19h16" />
    </SvgIcon>
  );
}

/** Processor — transforms, enriches, orchestrates (funnel). */
export function IconProcessor() {
  return (
    <SvgIcon>
      <path d="M3 4h18l-7 8v6l-4 2v-8L3 4Z" />
    </SvgIcon>
  );
}

/** Destination — data lands to be acted on (flag marks the landing spot). */
export function IconDestination() {
  return (
    <SvgIcon>
      <path d="M5 21V4" />
      <path d="M5 4h12l-3 4 3 4H5" />
    </SvgIcon>
  );
}

/** Consumer — a revenue motion uses the output (target). */
export function IconConsumer() {
  return (
    <SvgIcon>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.5" fill="currentColor" />
    </SvgIcon>
  );
}

/** Model-kit entity — a business object (table). */
export function IconEntity() {
  return (
    <SvgIcon>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M3 15h18" />
    </SvgIcon>
  );
}

/** Rich profile: warehouse (database). */
export function IconWarehouse() {
  return (
    <SvgIcon>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </SvgIcon>
  );
}

/** Rich profile: clay-workflow / hubspot-automation (bolt). */
export function IconAutomation() {
  return (
    <SvgIcon>
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
    </SvgIcon>
  );
}

/** Motion badge glyph (four-point star). */
export function IconMotion() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="currentColor"
      stroke="none"
      aria-hidden="true"
    >
      <path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2L12 3Z" />
    </svg>
  );
}

// --- archetype accents (defined in ../accents — dependency-free) ----------------

export { ARCHETYPE_ACCENTS, NEUTRAL_ACCENT, accentForType } from '../accents';
export type { ArchetypeAccent } from '../accents';
import { logoDevUrl } from '../logo';

// --- chips ----------------------------------------------------------------------

/**
 * App chip: vendor name (brand swatch/logo when the app document has one),
 * humanised slug for unregistered apps — generic-but-legal per D11.
 */
export function AppChip({ app }: { app: string | undefined }) {
  const registry = useAppRegistry();
  if (!app) return null;
  const info = registry[app];
  const vendor = info?.vendor ?? humanizeTerm(app);
  // Local root-relative logo file wins; otherwise the vendor domain renders
  // via logo.dev; otherwise the brand swatch (D13).
  const logoUrl =
    info?.logo !== undefined && info.logo.startsWith('/')
      ? info.logo
      : logoDevUrl(info?.domain);
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded bg-fd-accent px-1.5 py-0.5 text-[11px] font-medium text-fd-foreground">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- registry logos are arbitrary remote/local files, not the image pipeline
        <img src={logoUrl} alt="" className="h-3 w-3 shrink-0 rounded-[2px] object-contain" />
      ) : info?.brandColor ? (
        <span
          className="h-2 w-2 shrink-0 rounded-[2px]"
          style={{ backgroundColor: info.brandColor }}
        />
      ) : null}
      <span className="truncate">{vendor}</span>
    </span>
  );
}

/** Small mono chip used for columns / triggers / objects previews. */
export function DataChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded bg-fd-accent px-1.5 py-0.5 font-mono text-[11px] leading-4 text-fd-foreground">
      {children}
    </span>
  );
}

/** Motion badge — the revenue stage a consumer serves (D12). */
export function MotionBadge({ motion }: { motion: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-fd-primary/15 px-1.5 py-0.5 text-[11px] font-medium text-fd-primary">
      <IconMotion />
      {humanizeTerm(motion)}
    </span>
  );
}

// --- card shell ------------------------------------------------------------------

export interface CardShellProps {
  icon: ReactNode;
  accent: ArchetypeAccent;
  name: string;
  app?: string;
  selected?: boolean;
  /** One-line key data under the title (object, counts). */
  keyLine?: ReactNode;
  /** Preview chips (columns, triggers, …) — capped by callers. */
  chips?: ReactNode;
  /** Full-width footer strip (consumer motion bar, entity field list). */
  footer?: ReactNode;
  /** Extra body content (entity fields). */
  children?: ReactNode;
}

/**
 * The card every flow node builds on: archetype colour bar, icon, name, app
 * chip, key data. Legibility floor for 0.5× zoom: 13px semibold names, 11px
 * supporting text, strong token contrast.
 *
 * Includes source/target Handles so the studio editor can connect nodes; read
 * mode hides them via the canvas's `.board-canvas` styles.
 */
export function CardShell({
  icon,
  accent,
  name,
  app,
  selected = false,
  keyLine,
  chips,
  footer,
  children,
}: CardShellProps) {
  return (
    <div
      className={cx(
        'relative w-56 rounded-lg border bg-fd-card text-left shadow-sm transition-colors',
        selected
          ? 'border-fd-primary ring-2 ring-fd-primary/30'
          : 'border-fd-border hover:border-fd-primary/50',
      )}
    >
      <span className={cx('absolute inset-y-0 left-0 w-[3px] rounded-l-lg', accent.bar)} aria-hidden="true" />
      <div className="flex items-start gap-2 px-3 pb-2 pt-2.5">
        <span
          className={cx(
            'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
            accent.iconBox,
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-snug text-fd-foreground">{name}</p>
          <div className="mt-1 flex min-h-[18px] items-center">
            <AppChip app={app} />
          </div>
        </div>
      </div>
      {keyLine ? (
        <div className="px-3 pb-2 text-[11px] leading-snug text-fd-muted-foreground">{keyLine}</div>
      ) : null}
      {chips ? <div className="flex flex-wrap gap-1 px-3 pb-2.5">{chips}</div> : null}
      {children}
      {footer}
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-2 !border-fd-card !bg-fd-muted-foreground"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-2 !border-fd-card !bg-fd-muted-foreground"
      />
    </div>
  );
}
