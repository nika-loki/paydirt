'use client';

/**
 * Import / export — documents are copy-pasteable (spec D5, line 89: "the
 * studio accepts a pasted document of any kind… and exports single documents
 * or whole-knowledge-base bundles"). Export shows deterministic bytes (sorted
 * keys, 2-space indent) in a dialog with clipboard + download; import runs a
 * pasted document or `{ documents: […] }` bundle through validation.
 */

import { useMemo, useState } from 'react';
import { Check, Copy, Download, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

import { putDocument } from './api-client';
import { stableStringify } from './board-doc';
import type { AppView, BoardDocJson, PresetView, VocabView } from './types';

export interface ImportExportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  writable: boolean;
  boardDocument: BoardDocJson | null;
  /** Present on model boards: the `<DataModel …>` MDX snippet (composer parity). */
  dataModelMdx?: string;
  apps: AppView[];
  presets: PresetView[];
  vocab: VocabView;
  onBoardImported: (doc: BoardDocJson) => void;
  /** Radix focus-return hook — refocuses the control that opened the dialog. */
  onCloseAutoFocus?: (event: Event) => void;
}

export function ImportExport(props: ImportExportProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-2xl" onCloseAutoFocus={props.onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="size-4 text-primary" aria-hidden="true" />
            Import / export documents
          </DialogTitle>
          <DialogDescription>
            Every artefact is a self-contained JSON document — copy it, paste it, move it between
            repos. Deterministic bytes: sorted keys, 2-space indent, trailing newline.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="export">
          <TabsList>
            <TabsTrigger value="export">Export</TabsTrigger>
            <TabsTrigger value="import">Import</TabsTrigger>
          </TabsList>
          <TabsContent value="export">
            <ExportPanel {...props} />
          </TabsContent>
          <TabsContent value="import">
            <ImportPanel {...props} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function ExportPanel({
  boardDocument,
  dataModelMdx,
  apps,
  presets,
  vocab,
}: ImportExportProps) {
  const [mode, setMode] = useState<'board' | 'bundle'>('board');

  const text = useMemo(() => {
    if (mode === 'board') {
      return boardDocument !== null ? stableStringify(boardDocument) : '';
    }
    const documents: unknown[] = [
      ...([boardDocument].filter((doc): doc is BoardDocJson => doc !== null)),
      ...apps.map((app) => appDocFromView(app)),
      ...presets.map((preset) => presetDocFromView(preset)),
      vocabDoc('motions', 'Motions', vocab.motions),
      vocabDoc('mechanisms', 'Mechanisms', vocab.mechanisms),
      vocabDoc('app-categories', 'App categories', vocab.appCategories),
    ];
    return stableStringify({ documents });
  }, [mode, boardDocument, apps, presets, vocab]);

  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Clipboard unavailable', { description: 'Select the JSON and copy manually.' });
    }
  }

  function download(): void {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download =
      mode === 'board' && boardDocument !== null && typeof boardDocument.slug === 'string'
        ? `${boardDocument.slug}.board.json`
        : 'gtm-docs-bundle.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      {dataModelMdx !== undefined && (
        <div className="space-y-1.5 rounded-md border border-border bg-accent/40 p-2.5">
          <div className="flex items-center gap-2">
            <Label className="text-xs">DataModel MDX</Label>
            <span className="text-[11px] text-muted-foreground">
              paste into any docs page — board entities as a <code className="font-mono">&lt;DataModel … /&gt;</code> block
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="ml-auto h-7 text-xs"
              onClick={() => {
                void navigator.clipboard
                  .writeText(dataModelMdx)
                  .then(() => toast.success('DataModel MDX copied'))
                  .catch(() => toast.error('Clipboard unavailable'));
              }}
            >
              Copy MDX
            </Button>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Label className="text-xs">Scope</Label>
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant={mode === 'board' ? 'default' : 'outline'}
            className="h-7 text-xs"
            onClick={() => setMode('board')}
          >
            This board
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === 'bundle' ? 'default' : 'outline'}
            className="h-7 text-xs"
            onClick={() => setMode('bundle')}
          >
            Whole bundle (boards + apps + presets + vocab)
          </Button>
        </div>
      </div>
      <Textarea
        readOnly
        className="max-h-64 min-h-64 font-mono text-[11px]"
        aria-label="Exported document JSON"
        value={text}
        onFocus={(event) => event.target.select()}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" disabled={text === ''} onClick={() => void copy()}>
          {copied ? <Check className="mr-1 size-3.5" aria-hidden="true" /> : <Copy className="mr-1 size-3.5" aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={text === ''} onClick={download}>
          <Download className="mr-1 size-3.5" aria-hidden="true" />
          Download
        </Button>
      </div>
    </div>
  );
}

function ImportPanel({
  writable,
  onBoardImported,
  onOpenChange,
}: ImportExportProps) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleImport(): Promise<void> {
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setError('That is not valid JSON.');
      return;
    }

    const documents: unknown[] = [];
    if (Array.isArray(parsed)) {
      documents.push(...parsed);
    } else if (
      typeof parsed === 'object' &&
      parsed !== null &&
      Array.isArray((parsed as { documents?: unknown }).documents)
    ) {
      documents.push(...((parsed as { documents: unknown[] }).documents));
    } else {
      documents.push(parsed);
    }

    const boards: BoardDocJson[] = [];
    const others: Record<string, unknown>[] = [];
    for (const doc of documents) {
      if (typeof doc === 'object' && doc !== null && (doc as Record<string, unknown>).kind === 'board') {
        boards.push(doc as BoardDocJson);
      } else if (typeof doc === 'object' && doc !== null) {
        others.push(doc as Record<string, unknown>);
      }
    }

    setBusy(true);
    try {
      for (const doc of others) {
        const result = await putDocument(doc);
        if (!result.ok) {
          setError(result.message);
          return;
        }
      }
      if (others.length > 0) {
        toast.success(`${others.length} document${others.length === 1 ? '' : 's'} imported`);
      }
      if (boards.length > 0) {
        onBoardImported(boards[0]);
        toast.success(
          boards.length === 1
            ? 'Board loaded into the editor — Save writes it to content/boards/.'
            : `${boards.length} boards found — the first is loaded in the editor; import the rest again to switch.`,
        );
      }
      if (others.length === 0 && boards.length === 0) {
        setError('No documents found in the paste.');
        return;
      }
      setText('');
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="import-input">Paste a document or bundle</Label>
        <Textarea
          id="import-input"
          className="max-h-64 min-h-48 font-mono text-[11px]"
          placeholder={'A single document (with $schema + kind) or a bundle: { "documents": [ … ] }'}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      {error !== null && <p className="text-sm text-destructive">{error}</p>}
      <p className="text-[11px] text-muted-foreground">
        Boards open in the editor (Save writes them under <code className="font-mono">content/boards/</code>);
        every other kind is validated and written directly.
      </p>
      <div className="flex justify-end">
        <Button
          type="button"
          disabled={!writable || text.trim() === '' || busy}
          onClick={() => void handleImport()}
        >
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
          Import
        </Button>
      </div>
    </div>
  );
}

// --- view → document (for bundle export; the server is the write-path validator) --

function appDocFromView(app: AppView): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    $schema: 'https://paydirt.dev/schemas/app-v1.json',
    kind: 'app',
    version: 1,
    slug: app.slug,
    title: app.title,
    vendor: app.vendor,
    category: app.category,
  };
  if (app.brandColor !== undefined) doc.brandColor = app.brandColor;
  if (app.logo !== undefined) doc.logo = app.logo;
  if (app.richProfiles.length > 0) doc.richProfiles = app.richProfiles;
  return doc;
}

function presetDocFromView(preset: PresetView): Record<string, unknown> {
  return {
    $schema: 'https://paydirt.dev/schemas/preset-v1.json',
    kind: 'preset',
    version: 1,
    slug: preset.slug,
    title: preset.title,
    source: preset.source,
    fields: preset.fields,
  };
}

function vocabDoc(slug: string, title: string, values: string[]): Record<string, unknown> {
  return {
    $schema: 'https://paydirt.dev/schemas/vocab-v1.json',
    kind: 'vocab',
    version: 1,
    slug,
    title,
    values,
  };
}
