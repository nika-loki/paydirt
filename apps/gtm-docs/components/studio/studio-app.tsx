'use client';

/**
 * The studio shell — header (board selector, new board, import/export, save
 * state, read-only banner), left palette, center canvas, right property
 * panel (spec "The studio", D2/D14).
 *
 * Editor state IS the document JSON: nodes/edges are the board payload, the
 * envelope comes from `board-doc.ts`, saves go through the dev-only API
 * (server-side `validateDocument` → DocumentStore → deterministic bytes in
 * content/), and localStorage holds only a crash-recovery draft.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
} from '@xyflow/react';
import type { Connection, EdgeChange, NodeChange, OnSelectionChangeParams } from '@xyflow/react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  BookOpen,
  Boxes,
  FileJson,
  Keyboard,
  Loader2,
  Lock,
  Map as MapIcon,
  Plus,
  Save,
  Undo2,
  Wand2,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Toaster } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';

import type { DataEntity } from '../data-model/types';

import { putDocument } from './api-client';
import {
  fromBoardDocument,
  nextId,
  stableStringify,
  toBoardDocument,
  toDataModelMdx,
  type EditorEdge,
  type EditorNode,
  type EditorState,
} from './board-doc';
import { CanvasEditor } from './canvas-editor';
import { clearDraft, readDraft, writeDraft, type CrashDraft } from './draft';
import { ImportExport } from './import-export';
import { Palette, type PaletteProps } from './palette';
import { PasteToModel } from './paste-to-model';
import { PropertyPanel, PropertyPanelBody } from './property-panel';
import { AddAppDialog } from './add-app-dialog';
import { VocabEditor } from './vocab-editor';
import { arrangeBoard } from '@/components/board';
import type { AppRegistry } from '@/components/board/app-registry';
import type {
  AppView,
  Archetype,
  BoardDocJson,
  EditorEdgeData,
  PresetView,
  SaveState,
  SelectionRef,
  StudioBootstrap,
} from './types';
import { ENTITY_PROFILE } from './types';

const NEW_BOARD_SLUG = '__new__';

/** lg breakpoint (1024px) — below it the palette/property panels become
 * overlay sheets. Defaults to true so SSR/desktop never flash the mobile
 * layout; phones swap after hydration. */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return isDesktop;
}

function parseBoardOrToast(doc: BoardDocJson): EditorState | null {
  try {
    return fromBoardDocument(doc);
  } catch (error) {
    toast.error('Could not load board', {
      description: error instanceof Error ? error.message : 'Invalid board document.',
    });
    return null;
  }
}

function emptyFlowBoard(): EditorState {
  return { slug: '', title: '', boardType: 'flow', motions: [], nodes: [], edges: [] };
}

export function StudioApp({ bootstrap }: { bootstrap: StudioBootstrap }) {
  const router = useRouter();
  const writable = bootstrap.writable;
  const readOnly = !writable;
  const isDesktop = useIsDesktop();

  const [apps, setApps] = useState<AppView[]>(bootstrap.apps);
  const [vocab, setVocab] = useState(bootstrap.vocab);
  useEffect(() => {
    setApps(bootstrap.apps);
    setVocab(bootstrap.vocab);
  }, [bootstrap]);

  const [state, setState] = useState<EditorState>(() => {
    const first = bootstrap.boards[0];
    if (first === undefined) return emptyFlowBoard();
    return parseBoardOrToast(first) ?? emptyFlowBoard();
  });
  const [selection, setSelection] = useState<SelectionRef>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [fitViewSignal, setFitViewSignal] = useState(0);
  const [arranging, setArranging] = useState(false);
  const [restoreDraft, setRestoreDraft] = useState<CrashDraft | null>(null);

  const savedDocRef = useRef<string>('');
  useEffect(() => {
    savedDocRef.current = state.slug === '' ? '' : stableStringify(toBoardDocument(state));
    const draft = state.slug === '' ? null : readDraft(state.slug);
    if (draft !== null && draft.json !== savedDocRef.current) setRestoreDraft(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- dialogs ------------------------------------------------------------------

  const [pasteOpen, setPasteOpen] = useState(false);
  const [addAppOpen, setAddAppOpen] = useState(false);
  const [vocabOpen, setVocabOpen] = useState(false);
  const [ioOpen, setIoOpen] = useState(false);
  const [newBoardOpen, setNewBoardOpen] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState<{ slug: string } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Radix only restores focus automatically for DialogTrigger-opened dialogs;
  // these are controlled (opened from buttons, palette items, the board
  // select), so remember the invoking element and refocus it on close.
  const invokerRef = useRef<HTMLElement | null>(null);
  const captureInvoker = useCallback(() => {
    invokerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, []);
  const openWith = useCallback(
    (open: (value: boolean) => void) => {
      captureInvoker();
      open(true);
    },
    [captureInvoker],
  );
  const restoreInvokerFocus = useCallback((event: Event) => {
    if (invokerRef.current !== null && invokerRef.current.isConnected) {
      event.preventDefault();
      invokerRef.current.focus();
    }
  }, []);

  const openPaste = useCallback(() => openWith(setPasteOpen), [openWith]);
  const openAddApp = useCallback(() => openWith(setAddAppOpen), [openWith]);
  const openVocab = useCallback(() => openWith(setVocabOpen), [openWith]);
  const openIo = useCallback(() => openWith(setIoOpen), [openWith]);
  const openNewBoard = useCallback(() => openWith(setNewBoardOpen), [openWith]);

  const openPasteGuarded = useCallback(() => {
    if (state.boardType !== 'model') {
      toast.info('Paste-to-model creates entities', {
        description: 'Switch to a model board (or create one) first.',
      });
      return;
    }
    openPaste();
  }, [state.boardType, openPaste]);

  // '?' opens the keyboard cheat sheet — except while typing in a field,
  // where '?' is content.
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (event.key !== '?') return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      captureInvoker();
      setShortcutsOpen(true);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [captureInvoker]);

  const markDirty = useCallback(() => setSaveState('dirty'), []);

  // --- crash-recovery draft --------------------------------------------------------

  useEffect(() => {
    if (saveState === 'saved' || state.slug === '') return;
    const timer = window.setTimeout(() => writeDraft(state), 400);
    return () => window.clearTimeout(timer);
  }, [state, saveState]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent): void => {
      if (saveState !== 'dirty') return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saveState]);

  // ⌘K / Ctrl+K focuses the palette search. Registered in the CAPTURE phase
  // with stopPropagation: the root layout's Fumadocs RootProvider also binds
  // ⌘K (docs search dialog) on window — bubble phase — and does not honour
  // defaultPrevented, so without this it would open over the studio and steal
  // focus from the palette. Docs pages keep their ⌘K; this handler lives and
  // dies with the studio route.
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if ((event.metaKey === true || event.ctrlKey === true) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        event.stopPropagation();
        const input = document.querySelector('[data-studio-palette] input');
        if (input instanceof HTMLElement) input.focus();
      }
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, []);

  // --- board loading ----------------------------------------------------------------

  const loadEditorState = useCallback(
    (next: EditorState, options: { checkDraft?: boolean } = {}) => {
      setState(next);
      setSelection(null);
      setSaveState('saved');
      savedDocRef.current = stableStringify(toBoardDocument(next));
      setFitViewSignal((signal) => signal + 1);
      if (options.checkDraft === true && next.slug !== '') {
        const draft = readDraft(next.slug);
        if (draft !== null && draft.json !== savedDocRef.current) {
          setRestoreDraft(draft);
          return;
        }
        if (draft !== null) clearDraft(next.slug);
      }
      setRestoreDraft(null);
    },
    [],
  );

  function switchBoard(slug: string): void {
    if (slug === state.slug) return;
    if (slug === NEW_BOARD_SLUG) {
      openNewBoard();
      return;
    }
    if (saveState === 'dirty') {
      captureInvoker();
      setPendingSwitch({ slug });
      return;
    }
    const doc = bootstrap.boards.find((board) => board.slug === slug);
    if (doc === undefined) return;
    const next = parseBoardOrToast(doc);
    if (next !== null) loadEditorState(next, { checkDraft: true });
  }

  function handlePendingSwitch(action: 'save' | 'discard' | 'cancel'): void {
    const pending = pendingSwitch;
    setPendingSwitch(null);
    if (pending === null || action === 'cancel') return;
    const doc = bootstrap.boards.find((board) => board.slug === pending.slug);
    if (doc === undefined) return;
    const next = parseBoardOrToast(doc);
    if (next === null) return;
    if (action === 'discard') {
      loadEditorState(next, { checkDraft: true });
      if (state.slug !== '') clearDraft(state.slug);
      return;
    }
    void (async () => {
      const saved = await save();
      if (saved) loadEditorState(next, { checkDraft: true });
    })();
  }

  // --- saving ------------------------------------------------------------------------

  async function save(): Promise<boolean> {
    if (!writable || state.slug === '') {
      if (state.slug === '') {
        toast.info('Create the board first (New board…) — Save then writes it to content/boards/.');
      }
      return false;
    }
    setSaveState('saving');
    const doc = toBoardDocument(state);
    const result = await putDocument(doc);
    if (!result.ok) {
      setSaveState('error');
      toast.error('Save failed', { description: result.message });
      return false;
    }
    setSaveState('saved');
    savedDocRef.current = stableStringify(doc);
    clearDraft(state.slug);
    toast.success('Board saved', {
      description: `content/boards/${state.slug}.board.json`,
    });
    router.refresh();
    return true;
  }

  // --- node/edge mutations -----------------------------------------------------------

  const onNodesChange = useCallback(
    (changes: NodeChange<EditorNode>[]) => {
      setState((prev) => ({ ...prev, nodes: applyNodeChanges(changes, prev.nodes) }));
      if (
        changes.some(
          (change) =>
            change.type === 'position' || change.type === 'add' || change.type === 'remove',
        )
      ) {
        markDirty();
      }
    },
    [markDirty],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<EditorEdge>[]) => {
      setState((prev) => ({ ...prev, edges: applyEdgeChanges(changes, prev.edges) }));
      if (changes.some((change) => change.type === 'add' || change.type === 'remove')) {
        markDirty();
      }
    },
    [markDirty],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setState((prev) => {
        const id = nextId(
          'e',
          prev.edges.map((edge) => edge.id),
        );
        const data =
          prev.boardType === 'flow'
            ? { mechanism: vocab.mechanisms[0] ?? 'api-pull' }
            : { cardinality: 'one-to-many' as const };
        return {
          ...prev,
          edges: addEdge({ id, source: connection.source, target: connection.target, data }, prev.edges),
        };
      });
      markDirty();
    },
    [markDirty, vocab.mechanisms],
  );

  const onSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    if (params.nodes.length > 0) setSelection({ kind: 'node', id: params.nodes[0].id });
    else if (params.edges.length > 0) setSelection({ kind: 'edge', id: params.edges[0].id });
    else setSelection(null);
  }, []);

  function nextPosition(index: number): { x: number; y: number } {
    return { x: 80 + (index % 3) * 360, y: 80 + Math.floor(index / 3) * 300 };
  }

  function appendNode(
    build: (
      id: string,
      position: { x: number; y: number },
    ) => {
      id: string;
      type: string;
      position: { x: number; y: number };
      data: Record<string, unknown>;
      archetype?: Archetype;
      profile?: string;
    },
  ): void {
    const id = nextId(
      'n',
      state.nodes.map((node) => node.id),
    );
    const node = build(id, nextPosition(state.nodes.length));
    setState((prev) => ({ ...prev, nodes: [...prev.nodes, node] }));
    markDirty();
    setSelection({ kind: 'node', id });
  }

  function handleAddFlowNode(archetype: Archetype, app?: AppView): void {
    appendNode((id, position) => ({
      id,
      type: archetype,
      position,
      data: {
        name: app !== undefined ? app.vendor : `New ${archetype}`,
        ...(app !== undefined ? { app: app.slug } : {}),
        ...(archetype === 'consumer' ? { motion: vocab.motions[0] ?? 'new-business' } : {}),
        externalRef: null,
      },
      archetype,
    }));
  }

  function handleAddProfileNode(entry: { type: string; label: string; archetype?: Archetype }): void {
    const appGuess = entry.type.startsWith('clay')
      ? 'clay'
      : entry.type.startsWith('hubspot')
        ? 'hubspot'
        : entry.type === 'warehouse'
          ? 'snowflake'
          : undefined;
    appendNode((id, position) => ({
      id,
      type: entry.type,
      position,
      data: {
        name: entry.label,
        ...(appGuess !== undefined ? { app: appGuess } : {}),
        externalRef: null,
      },
      archetype: entry.archetype ?? 'processor',
      profile: entry.type,
    }));
  }

  function handleAddEntityNode(preset?: PresetView): void {
    appendNode((id, position) => ({
      id,
      type: ENTITY_PROFILE,
      position,
      data:
        preset !== undefined
          ? {
              name: preset.name,
              source: preset.source,
              description: `From preset ${preset.slug}`,
              fields: preset.fields,
            }
          : { name: 'New entity', fields: [] },
      profile: ENTITY_PROFILE,
    }));
  }

  function handlePasteCommit(entities: DataEntity[]): void {
    setState((prev) => {
      const taken = prev.nodes.map((node) => node.id);
      const nodes = entities.map((entity, index) => {
        const id = nextId('n', taken);
        taken.push(id);
        return {
          id,
          type: ENTITY_PROFILE,
          position: nextPosition(prev.nodes.length + index),
          data: entity as unknown as Record<string, unknown>,
          profile: ENTITY_PROFILE,
        };
      });
      return { ...prev, nodes: [...prev.nodes, ...nodes] };
    });
    markDirty();
    toast.success(`${entities.length} entit${entities.length === 1 ? 'y' : 'ies'} added`);
  }

  function handleNodeDataChange(id: string, data: Record<string, unknown>): void {
    setState((prev) => ({
      ...prev,
      nodes: prev.nodes.map((node) => (node.id === id ? { ...node, data } : node)),
    }));
    markDirty();
  }

  function handleNodeMetaChange(
    id: string,
    meta: { archetype?: Archetype; profile?: string },
  ): void {
    setState((prev) => ({
      ...prev,
      nodes: prev.nodes.map((node) => {
        if (node.id !== id) return node;
        const archetype = meta.archetype ?? node.archetype;
        const profile = meta.profile;
        const type = profile ?? archetype ?? node.type;
        return { ...node, archetype, profile, type };
      }),
    }));
    markDirty();
  }

  function handleEdgeDataChange(id: string, data: EditorEdgeData): void {
    setState((prev) => ({
      ...prev,
      edges: prev.edges.map((edge) => (edge.id === id ? { ...edge, data } : edge)),
    }));
    markDirty();
  }

  function deleteNode(id: string): void {
    setState((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((node) => node.id !== id),
      edges: prev.edges.filter((edge) => edge.source !== id && edge.target !== id),
    }));
    setSelection(null);
    markDirty();
  }

  function deleteEdge(id: string): void {
    setState((prev) => ({ ...prev, edges: prev.edges.filter((edge) => edge.id !== id) }));
    setSelection(null);
    markDirty();
  }

  // --- arrange -------------------------------------------------------------------------

  async function arrange(): Promise<void> {
    if (arranging) return;
    setArranging(true);
    try {
      const positions = await arrangeBoard(
        state.nodes.map((node) => ({
          id: node.id,
          archetype: node.archetype,
          ...(node.profile !== undefined ? { profile: node.profile } : {}),
        })),
        state.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
      );
      const byId = new Map(positions.map((entry) => [entry.id, entry.position]));
      setState((prev) => ({
        ...prev,
        nodes: prev.nodes.map((node) => {
          const position = byId.get(node.id);
          return position === undefined ? node : { ...node, position };
        }),
      }));
      setFitViewSignal((signal) => signal + 1);
      markDirty();
      toast.success('Board arranged', {
        description: 'Tweak anything — your positions are stored exactly as authored.',
      });
    } catch {
      toast.error('Arrange failed', { description: 'The auto-layout could not run — node positions unchanged.' });
    } finally {
      setArranging(false);
    }
  }

  // --- derived ---------------------------------------------------------------------------

  const selectedNode = useMemo(
    () =>
      selection !== null && selection.kind === 'node'
        ? (state.nodes.find((node) => node.id === selection.id) ?? null)
        : null,
    [selection, state.nodes],
  );
  const selectedEdge = useMemo(
    () =>
      selection !== null && selection.kind === 'edge'
        ? (state.edges.find((edge) => edge.id === selection.id) ?? null)
        : null,
    [selection, state.edges],
  );

  const boardOptions = useMemo(() => {
    const options = bootstrap.boards
      .filter((board) => typeof board.slug === 'string')
      .map((board) => ({
        slug: board.slug as string,
        title: typeof board.title === 'string' ? board.title : (board.slug as string),
      }));
    if (state.slug !== '' && !options.some((option) => option.slug === state.slug)) {
      options.push({ slug: state.slug, title: `${state.title || state.slug} (unsaved)` });
    }
    return options;
  }, [bootstrap.boards, state.slug, state.title]);

  const currentDocument = useMemo(
    () => (state.slug === '' ? null : toBoardDocument(state)),
    [state],
  );

  /** App documents → the kit's app-registry shape (chips on node cards). */
  const appRegistry = useMemo<AppRegistry>(
    () =>
      Object.fromEntries(
        apps.map((app) => [
          app.slug,
          {
            slug: app.slug,
            vendor: app.vendor,
            category: app.category,
            ...(app.brandColor !== undefined ? { brandColor: app.brandColor } : {}),
            ...(app.logo !== undefined ? { logo: app.logo } : {}),
          },
        ]),
      ),
    [apps],
  );

  // --- render ------------------------------------------------------------------------------

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <Toaster position="bottom-right" />

      <header className="shrink-0 border-b border-border">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <MapIcon className="size-4 text-primary" aria-hidden="true" />
            Studio
          </span>
          <Link
            href="/docs"
            className="flex items-center gap-1.5 rounded px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <BookOpen className="size-4" aria-hidden="true" />
            Docs
          </Link>
          <Separator orientation="vertical" className="!h-5 hidden sm:block" />

          {/* Below lg the palette column is hidden — this opens it as a Sheet. */}
          <Sheet open={paletteOpen} onOpenChange={setPaletteOpen}>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="lg:hidden"
                aria-label="Open palette"
              >
                <Boxes className="size-3.5" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 gap-0 p-0 sm:max-w-sm">
              <SheetHeader className="sr-only">
                <SheetTitle>Palette</SheetTitle>
                <SheetDescription>
                  Search nodes, apps, presets, and studio actions.
                </SheetDescription>
              </SheetHeader>
              <MobilePalette
                apps={apps}
                presets={bootstrap.presets}
                isModelBoard={state.boardType === 'model'}
                readOnly={readOnly}
                onAddFlowNode={handleAddFlowNode}
                onAddProfileNode={handleAddProfileNode}
                onAddEntityNode={handleAddEntityNode}
                onPasteToModel={openPasteGuarded}
                onAddApp={openAddApp}
                onEditVocab={openVocab}
                onArrange={() => void arrange()}
                onSave={() => void save()}
                onImportExport={openIo}
                onNewBoard={openNewBoard}
                onClose={() => setPaletteOpen(false)}
              />
            </SheetContent>
          </Sheet>

          <Select
            value={state.slug === '' ? NEW_BOARD_SLUG : state.slug}
            onValueChange={switchBoard}
          >
            <SelectTrigger className="w-40 max-w-full sm:w-64" aria-label="Board">
              <SelectValue placeholder="Boards" />
            </SelectTrigger>
            <SelectContent>
              {boardOptions.map((option) => (
                <SelectItem key={option.slug} value={option.slug}>
                  {option.title}
                </SelectItem>
              ))}
              <Separator />
              <SelectItem value={NEW_BOARD_SLUG}>
                <span className="flex items-center gap-1.5">
                  <Plus className="size-3" aria-hidden="true" /> New board…
                </span>
              </SelectItem>
            </SelectContent>
          </Select>

          {state.slug !== '' && (
            <Badge
              variant="outline"
              className="min-w-0 max-w-[12rem] truncate font-mono text-[10px]"
            >
              {state.slug}.board.json
            </Badge>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <SaveStateIndicator state={saveState} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Arrange"
              disabled={!writable}
              onClick={() => void arrange()}
            >
              {arranging ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Wand2 className="mr-1.5 size-3.5" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">Arrange</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Import / export"
              onClick={openIo}
            >
              <FileJson className="mr-1.5 size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Import / export</span>
            </Button>
            <Button
              type="button"
              size="sm"
              aria-label="Save"
              disabled={!writable || saveState === 'saving' || state.slug === ''}
              onClick={() => void save()}
            >
              <Save className="mr-1.5 size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Save</span>
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-border/60 px-4 py-2">
          <Input
            className="h-8 w-full min-w-0 flex-1 border-transparent bg-transparent px-2 text-sm font-medium hover:border-border focus-visible:border-border sm:w-72 sm:flex-none"
            aria-label="Board title"
            placeholder="Board title"
            value={state.title}
            disabled={readOnly}
            onChange={(event) => {
              setState((prev) => ({ ...prev, title: event.target.value }));
              markDirty();
            }}
          />
          <Badge variant="secondary" className="text-[10px]">
            {state.boardType} board
          </Badge>
          <span className="text-xs text-muted-foreground">
            {state.nodes.length} node{state.nodes.length === 1 ? '' : 's'} · {state.edges.length} edge
            {state.edges.length === 1 ? '' : 's'}
          </span>

          {state.boardType === 'flow' && vocab.motions.length > 0 && (
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">motions served:</span>
              {vocab.motions.map((motion) => {
                const active = state.motions.includes(motion);
                return (
                  <button
                    key={motion}
                    type="button"
                    disabled={readOnly}
                    aria-pressed={active}
                    onClick={() => {
                      setState((prev) => ({
                        ...prev,
                        motions: active
                          ? prev.motions.filter((item) => item !== motion)
                          : [...prev.motions, motion],
                      }));
                      markDirty();
                    }}
                    className={cn(
                      'min-h-9 whitespace-nowrap rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                      active
                        ? 'border-primary/50 bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground',
                      !readOnly && 'hover:border-foreground/30',
                      readOnly && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    {motion}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </header>

      {!writable && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted px-4 py-2 text-sm text-muted-foreground">
          <Lock className="size-4 shrink-0" aria-hidden="true" />
          Deployed instance — read-only. Clone the repo and run{' '}
          <code className="rounded bg-background px-1 py-0.5 font-mono text-xs">pnpm dev</code> to
          edit boards; writes land in <code className="font-mono text-xs">content/</code> as
          reviewable JSON.
        </div>
      )}

      {restoreDraft !== null && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-primary/5 px-4 py-2 text-sm">
          <Undo2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="text-foreground">
            Crash draft found for this board (
            {new Date(restoreDraft.updatedAt).toLocaleTimeString()}). Restore it?
          </span>
          <Button
            type="button"
            size="sm"
            className="ml-auto h-7"
            onClick={() => {
              try {
                const restored = fromBoardDocument(JSON.parse(restoreDraft.json) as BoardDocJson);
                setState(restored);
                setSaveState('dirty');
                toast.success('Draft restored', { description: 'Save to write it to content/.' });
              } catch {
                toast.error('Draft was unreadable — discarded.');
                clearDraft(state.slug);
              }
              setRestoreDraft(null);
            }}
          >
            Restore
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={() => {
              clearDraft(state.slug);
              setRestoreDraft(null);
            }}
          >
            Discard
          </Button>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        {/* Palette — static column on lg+, Sheet (header button) below. */}
        <aside className="hidden w-72 shrink-0 border-r border-border lg:block">
          <Palette
            key={`${state.slug}:${state.boardType}`}
            apps={apps}
            presets={bootstrap.presets}
            isModelBoard={state.boardType === 'model'}
            readOnly={readOnly}
            onAddFlowNode={handleAddFlowNode}
            onAddProfileNode={handleAddProfileNode}
            onAddEntityNode={handleAddEntityNode}
            onPasteToModel={openPasteGuarded}
            onAddApp={openAddApp}
            onEditVocab={openVocab}
            onArrange={() => void arrange()}
            onSave={() => void save()}
            onImportExport={openIo}
            onNewBoard={openNewBoard}
          />
        </aside>

        <main className="relative min-w-0 flex-1">
          <CanvasEditor
            nodes={state.nodes}
            edges={state.edges}
            boardType={state.boardType}
            apps={appRegistry}
            readOnly={readOnly}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            onDeleteNode={deleteNode}
            fitViewSignal={fitViewSignal}
          />
          {state.nodes.length === 0 && (
            <EmptyState
              writable={writable}
              hasExample={bootstrap.exampleBoardJson !== null}
              onLoadExample={() => {
                if (bootstrap.exampleBoardJson === null) return;
                try {
                  const doc = JSON.parse(bootstrap.exampleBoardJson) as BoardDocJson;
                  const next = fromBoardDocument(doc);
                  loadEditorState(next);
                  toast.success('Example board loaded', {
                    description: 'icp-pipeline — Snowflake → Clay → HubSpot → campaign.',
                  });
                } catch {
                  toast.error('The example board could not be parsed.');
                }
              }}
            />
          )}
        </main>

        {/* Property panel — static column on lg+ (its own classes hide it
            below); a right-side Sheet opens on selection below lg so the
            canvas keeps the full width on phones and tablets. */}
        <PropertyPanel
          node={selectedNode}
          edge={selectedEdge}
          boardType={state.boardType}
          apps={apps}
          vocab={vocab}
          readOnly={readOnly}
          onNodeDataChange={handleNodeDataChange}
          onNodeMetaChange={handleNodeMetaChange}
          onEdgeDataChange={handleEdgeDataChange}
          onDeleteNode={deleteNode}
          onDeleteEdge={deleteEdge}
        />
        {!isDesktop && (
          <Sheet
            open={selection !== null}
            onOpenChange={(open) => {
              if (!open) setSelection(null);
            }}
          >
            <SheetContent
              side="right"
              className="w-[85%] max-w-sm gap-0 p-0"
              aria-label="Properties"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Properties</SheetTitle>
                <SheetDescription>Edit the selected node or edge.</SheetDescription>
              </SheetHeader>
              <PropertyPanelBody
                node={selectedNode}
                edge={selectedEdge}
                boardType={state.boardType}
                apps={apps}
                vocab={vocab}
                readOnly={readOnly}
                onNodeDataChange={handleNodeDataChange}
                onNodeMetaChange={handleNodeMetaChange}
                onEdgeDataChange={handleEdgeDataChange}
                onDeleteNode={deleteNode}
                onDeleteEdge={deleteEdge}
              />
            </SheetContent>
          </Sheet>
        )}
      </div>

      <PasteToModel
        open={pasteOpen}
        onOpenChange={setPasteOpen}
        onCloseAutoFocus={restoreInvokerFocus}
        onCommit={handlePasteCommit}
        onImportDocument={(doc) => {
          try {
            const next = fromBoardDocument(doc);
            loadEditorState(next);
            toast.success('Board imported', { description: 'Save writes it under content/boards/.' });
          } catch (error) {
            toast.error('Import failed', {
              description: error instanceof Error ? error.message : 'Invalid board document.',
            });
          }
        }}
      />

      <AddAppDialog
        open={addAppOpen}
        onOpenChange={setAddAppOpen}
        onCloseAutoFocus={restoreInvokerFocus}
        categories={vocab.appCategories}
        onAdded={(app) => {
          setApps((prev) => [...prev.filter((item) => item.slug !== app.slug), app]);
          router.refresh();
        }}
      />

      <VocabEditor
        open={vocabOpen}
        onOpenChange={setVocabOpen}
        onCloseAutoFocus={restoreInvokerFocus}
        vocab={vocab}
        onSaved={(next) => {
          setVocab(next);
          router.refresh();
        }}
      />

      <ImportExport
        open={ioOpen}
        onOpenChange={setIoOpen}
        onCloseAutoFocus={restoreInvokerFocus}
        writable={writable}
        boardDocument={currentDocument}
        dataModelMdx={toDataModelMdx(state) ?? undefined}
        apps={apps}
        presets={bootstrap.presets}
        vocab={vocab}
        onBoardImported={(doc) => {
          const next = parseBoardOrToast(doc);
          if (next !== null) loadEditorState(next);
        }}
      />

      <NewBoardDialog
        open={newBoardOpen}
        onOpenChange={setNewBoardOpen}
        onCloseAutoFocus={restoreInvokerFocus}
        onCreate={(board) => {
          setNewBoardOpen(false);
          setState(board);
          setSelection(null);
          setSaveState('dirty');
          savedDocRef.current = '';
          setFitViewSignal((signal) => signal + 1);
        }}
      />

      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      <Dialog open={pendingSwitch !== null} onOpenChange={(open) => { if (!open) setPendingSwitch(null); }}>
        <DialogContent className="sm:max-w-sm" onCloseAutoFocus={restoreInvokerFocus}>
          <DialogHeader>
            <DialogTitle>Unsaved changes</DialogTitle>
            <DialogDescription>
              Save the current board before switching, or discard the changes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="ghost" onClick={() => handlePendingSwitch('cancel')}>
              Cancel
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => handlePendingSwitch('discard')}>
                Discard
              </Button>
              <Button type="button" onClick={() => handlePendingSwitch('save')}>
                <Save className="mr-1.5 size-3.5" aria-hidden="true" />
                Save &amp; switch
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- save-state indicator ---------------------------------------------------------------

function SaveStateIndicator({ state }: { state: SaveState }) {
  const config: Record<SaveState, { dot: string; label: string }> = {
    saved: { dot: 'bg-emerald-500', label: 'Saved' },
    dirty: { dot: 'bg-amber-500', label: 'Unsaved changes' },
    saving: { dot: 'bg-primary animate-pulse', label: 'Saving…' },
    error: { dot: 'bg-destructive', label: 'Save failed' },
  };
  const { dot, label } = config[state];
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
      <span className={cn('size-2 rounded-full', dot)} aria-hidden="true" />
      {label}
    </span>
  );
}

// --- empty state: the 3-step teach --------------------------------------------------------

function EmptyState({
  writable,
  hasExample,
  onLoadExample,
}: {
  writable: boolean;
  hasExample: boolean;
  onLoadExample: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
      <div className="pointer-events-auto max-w-md rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        {writable ? (
          <>
            <p className="text-sm font-semibold">Author your first board</p>
            <ol className="mt-3 space-y-2.5 text-sm text-muted-foreground">
              <li className="flex gap-2.5">
                <StepNumber step={1} />
                <span>
                  <span className="font-medium text-foreground">Pick a source.</span> Search the
                  palette (⌘K) — e.g. “snowflake source” — and the node lands on the canvas.
                </span>
              </li>
              <li className="flex gap-2.5">
                <StepNumber step={2} />
                <span>
                  <span className="font-medium text-foreground">Draw the flow.</span> Drag from a
                  node&apos;s right port to the next node, then click the edge to describe how data
                  moves (mechanism · cadence).
                </span>
              </li>
              <li className="flex gap-2.5">
                <StepNumber step={3} />
                <span>
                  <span className="font-medium text-foreground">Save.</span> The board lands in{' '}
                  <code className="font-mono text-xs">content/boards/</code> as deterministic,
                  reviewable JSON.
                </span>
              </li>
            </ol>
            {hasExample && (
              <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onLoadExample}>
                <FileJson className="mr-1.5 size-3.5" aria-hidden="true" />
                Load example board
              </Button>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No boards to show yet. Boards are authored locally — clone the repo, run{' '}
            <code className="font-mono text-xs">pnpm dev</code>, and open{' '}
            <code className="font-mono text-xs">/studio</code>.
          </p>
        )}
      </div>
    </div>
  );
}

function StepNumber({ step }: { step: number }) {
  return (
    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
      {step}
    </span>
  );
}

// --- mobile palette sheet ---------------------------------------------------------------

/** The palette inside the below-lg Sheet: every action closes the sheet so
 * dialogs and canvas drops never open underneath it. */
function MobilePalette({ onClose, ...props }: PaletteProps & { onClose: () => void }) {
  const withClose = (action: () => void) => () => {
    action();
    onClose();
  };
  return (
    <div className="min-h-0 flex-1">
      <Palette
        {...props}
        onAddFlowNode={(archetype, app) => {
          props.onAddFlowNode(archetype, app);
          onClose();
        }}
        onAddProfileNode={(entry) => {
          props.onAddProfileNode(entry);
          onClose();
        }}
        onAddEntityNode={(preset) => {
          props.onAddEntityNode(preset);
          onClose();
        }}
        onPasteToModel={withClose(props.onPasteToModel)}
        onAddApp={withClose(props.onAddApp)}
        onEditVocab={withClose(props.onEditVocab)}
        onArrange={withClose(props.onArrange)}
        onSave={withClose(props.onSave)}
        onImportExport={withClose(props.onImportExport)}
        onNewBoard={withClose(props.onNewBoard)}
      />
    </div>
  );
}

// --- keyboard cheat sheet -----------------------------------------------------------------

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['⌘K', 'Ctrl+K'], label: 'Focus the palette search' },
  { keys: ['?'], label: 'Open this cheat sheet' },
  { keys: ['Enter', 'Space'], label: 'Select the focused card or edge' },
  { keys: ['Delete', 'Backspace'], label: 'Remove the selected card or edge' },
  { keys: ['Escape'], label: 'Close dialogs / deselect' },
];

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
      {children}
    </kbd>
  );
}

function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="size-4 text-primary" aria-hidden="true" />
            Keyboard shortcuts
          </DialogTitle>
          <DialogDescription>
            The studio is fully keyboard-driveable — these work everywhere on the page.
          </DialogDescription>
        </DialogHeader>
        <dl className="space-y-2.5">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.label} className="flex items-center justify-between gap-4 text-sm">
              <dt className="text-muted-foreground">{shortcut.label}</dt>
              <dd className="flex shrink-0 gap-1.5">
                {shortcut.keys.map((key) => (
                  <Kbd key={key}>{key}</Kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}

// --- new board dialog ------------------------------------------------------------------------

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function NewBoardDialog({
  open,
  onOpenChange,
  onCloseAutoFocus,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
  onCreate: (board: EditorState) => void;
}) {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [boardType, setBoardType] = useState<'flow' | 'model'>('flow');

  useEffect(() => {
    if (open) {
      setTitle('');
      setSlug('');
      setBoardType('flow');
    }
  }, [open]);

  const effectiveSlug = slug.trim() !== '' ? slugify(slug) : slugify(title);
  const canCreate = effectiveSlug !== '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>New board</DialogTitle>
          <DialogDescription>
            {boardType === 'flow'
              ? 'Flow board — source → processor → destination → consumer lineage.'
              : 'Model board — entities, fields, and relations.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-board-title">Title</Label>
            <Input
              id="new-board-title"
              placeholder="e.g. Product-usage ICP pipeline"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-board-slug">Slug</Label>
            <Input
              id="new-board-slug"
              className="font-mono text-xs"
              placeholder={effectiveSlug !== '' ? effectiveSlug : 'icp-pipeline'}
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
            />
            {effectiveSlug !== '' && (
              <p className="text-[11px] text-muted-foreground">
                saves as content/boards/{effectiveSlug}.board.json
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={boardType} onValueChange={(value) => setBoardType(value as 'flow' | 'model')}>
              <SelectTrigger className="w-full" aria-label="Board type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="flow">Flow — lineage (primary)</SelectItem>
                <SelectItem value="model">Model — entities &amp; relations</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canCreate}
            onClick={() =>
              onCreate({
                slug: effectiveSlug,
                title: title.trim() === '' ? effectiveSlug : title.trim(),
                boardType,
                motions: [],
                nodes: [],
                edges: [],
              })
            }
          >
            <Plus className="mr-1.5 size-3.5" aria-hidden="true" />
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
