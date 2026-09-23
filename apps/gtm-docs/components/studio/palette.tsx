'use client';

/**
 * The left palette — a shadcn `Command` searching across archetypes × apps,
 * rich profiles, presets, and studio actions (spec: studio canvas surface).
 *
 * Picking an archetype×app entry drops a pre-filled node for that app; picking
 * a preset drops a pre-filled model entity; the "Add app…" action opens the
 * registry dialog so nothing in the palette is a closed list (D13).
 */

import { Boxes, ClipboardPaste, LayoutGrid, PackagePlus, Save, Sparkles, Store, Upload, Wand2, Waypoints } from 'lucide-react';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';

import type { KitRegistryEntry } from './kit';
import { archetypeEntries, entityEntry, profileEntries } from './kit';
import type { AppView, Archetype, PresetView } from './types';
import { ARCHETYPES } from './types';

const ARCHETYPE_GROUP_LABEL: Record<Archetype, string> = {
  source: 'Sources — data enters here',
  processor: 'Processors — transform & enrich',
  destination: 'Destinations — data lands to be acted on',
  consumer: 'Consumers — a revenue motion uses the output',
};

/**
 * cmdk's default filter (command-score) only matches search words in order, so
 * “snowflake source” scored zero against values like “source Snowflake …” and
 * the palette told the engineer to register an app that already exists. This
 * filter instead requires every whitespace-separated search token to appear in
 * the value (case-insensitive substring, any order). Ranking signal is kept:
 * earlier and longer token matches score higher; keywords (none used today)
 * are matched like cmdk's default — best score across value + keywords wins.
 * Empty searches never reach the filter (cmdk renders everything).
 */
const ANY_ORDER_FILTER = (value: string, search: string, keywords?: string[]): number => {
  const tokens = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 1;

  const scoreOf = (text: string): number => {
    const haystack = text.toLowerCase();
    let score = 0;
    for (const token of tokens) {
      const index = haystack.indexOf(token);
      if (index === -1) return 0;
      score += token.length / (index + 1);
    }
    return score;
  };

  let score = scoreOf(value);
  for (const keyword of keywords ?? []) {
    score = Math.max(score, scoreOf(keyword));
  }
  return score;
};

export interface PaletteProps {
  apps: AppView[];
  presets: PresetView[];
  isModelBoard: boolean;
  readOnly: boolean;
  onAddFlowNode: (archetype: Archetype, app?: AppView) => void;
  onAddProfileNode: (entry: KitRegistryEntry) => void;
  onAddEntityNode: (preset?: PresetView) => void;
  onPasteToModel: () => void;
  onAddApp: () => void;
  onEditVocab: () => void;
  onArrange: () => void;
  onSave: () => void;
  onImportExport: () => void;
  onNewBoard: () => void;
}

export function Palette(props: PaletteProps) {
  const { apps, presets, isModelBoard, readOnly } = props;
  const archetypes = archetypeEntries();
  const profiles = profileEntries();
  const entity = entityEntry();

  return (
    <Command data-studio-palette filter={ANY_ORDER_FILTER} className="h-full rounded-none border-0 bg-background text-foreground">
      <div className="border-b border-border px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Palette</p>
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Search nodes, apps, presets, actions
        </p>
      </div>
      <CommandInput placeholder="Search — e.g. “snowflake source”, “contact”…" className="border-b border-border" />
      <CommandList className="max-h-none flex-1">
        <CommandEmpty>No matches — add a missing app from “Registries”.</CommandEmpty>

        {!isModelBoard &&
          ARCHETYPES.map((archetype) => {
            const entry = archetypes.find((candidate) => candidate.archetype === archetype);
            if (entry === undefined) return null;
            const label = ARCHETYPE_GROUP_LABEL[archetype];
            return (
              <CommandGroup key={archetype} heading={label}>
                {apps.map((app) => (
                  <CommandItem
                    key={`${archetype}-${app.slug}`}
                    disabled={readOnly}
                    onSelect={() => props.onAddFlowNode(archetype, app)}
                    value={`${archetype} ${app.vendor} ${app.slug} ${app.category}`}
                  >
                    <Boxes className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="shrink-0">{entry.label}</span>
                    <span
                      className="min-w-0 flex-1 truncate text-muted-foreground"
                      title={`· ${app.vendor}`}
                    >
                      · {app.vendor}
                    </span>
                  </CommandItem>
                ))}
                <CommandItem
                  disabled={readOnly}
                  onSelect={() => props.onAddFlowNode(archetype)}
                  value={`${archetype} generic unregistered`}
                >
                  <Boxes className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="shrink-0">{entry.label}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">· generic</span>
                </CommandItem>
              </CommandGroup>
            );
          })}

        {!isModelBoard && profiles.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Rich profiles">
              {profiles.map((entry) => (
                <CommandItem
                  key={entry.type}
                  disabled={readOnly}
                  onSelect={() => props.onAddProfileNode(entry)}
                  value={`profile ${entry.type} ${entry.label}`}
                >
                  <Waypoints className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="shrink-0">{entry.label}</span>
                  {entry.archetype !== undefined && (
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      · starts as {entry.archetype}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Entities — model boards">
          {entity !== undefined && (
            <CommandItem
              disabled={readOnly || !isModelBoard}
              onSelect={() => props.onAddEntityNode()}
              value="entity blank model data"
            >
              <LayoutGrid className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="shrink-0">Entity</span>
              <span
                className="min-w-0 flex-1 truncate text-muted-foreground"
                title={isModelBoard ? '· blank' : '· switch to a model board'}
              >
                {isModelBoard ? '· blank' : '· switch to a model board'}
              </span>
            </CommandItem>
          )}
          {presets.map((preset) => (
            <CommandItem
              key={preset.slug}
              disabled={readOnly || !isModelBoard}
              onSelect={() => props.onAddEntityNode(preset)}
              value={`preset ${preset.slug} ${preset.name} ${preset.source}`}
            >
              <PackagePlus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="shrink-0">{preset.name}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                · {preset.fields.length} fields
              </span>
            </CommandItem>
          ))}
          <CommandItem
            disabled={readOnly || !isModelBoard}
            onSelect={() => props.onPasteToModel()}
            value="paste json csv infer entities fields pii"
          >
            <ClipboardPaste className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="shrink-0">Paste to model…</span>
            <span
              className="min-w-0 flex-1 truncate text-muted-foreground"
              title={isModelBoard ? '· JSON or CSV' : '· model boards'}
            >
              {isModelBoard ? '· JSON or CSV' : '· model boards'}
            </span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="Registries">
          <CommandItem disabled={readOnly} onSelect={() => props.onAddApp()} value="add app vendor registry attio logo">
            <Store className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="shrink-0">Add app…</span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">· vendor, category, logo</span>
          </CommandItem>
          <CommandItem disabled={readOnly} onSelect={() => props.onEditVocab()} value="vocab motions mechanisms categories edit">
            <Sparkles className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="shrink-0">Edit vocabularies</span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">· motions, mechanisms</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem disabled={readOnly} onSelect={() => props.onArrange()} value="arrange layout auto elk tidy">
            <Wand2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>Arrange board</span>
          </CommandItem>
          <CommandItem disabled={readOnly} onSelect={() => props.onSave()} value="save board document write file">
            <Save className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>Save board</span>
          </CommandItem>
          <CommandItem onSelect={() => props.onImportExport()} value="import export document json clipboard bundle">
            <Upload className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>Import / export…</span>
          </CommandItem>
          <CommandItem disabled={readOnly} onSelect={() => props.onNewBoard()} value="new board create flow model">
            <LayoutGrid className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>New board…</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
