/**
 * Crash-recovery draft in localStorage — never the source of truth.
 *
 * Keyed per board (`paydirt-studio-draft:board:<slug>`, the Phase 1 plan's
 * pinned key shape), written on every change, offered as a restore on mount,
 * and cleared after a successful save. All storage access is guarded: a
 * blocked localStorage (private mode, quota) degrades to "no draft".
 */

import type { EditorState } from './board-doc';
import { toBoardDocument } from './board-doc';

const KEY_PREFIX = 'paydirt-studio-draft:board:';

export interface CrashDraft {
  updatedAt: number;
  /** The serialized board document as it stood when the draft was written. */
  json: string;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function draftKey(slug: string): string {
  return `${KEY_PREFIX}${slug}`;
}

export function readDraft(slug: string): CrashDraft | null {
  const store = storage();
  if (store === null) return null;
  let raw: string | null = null;
  try {
    raw = store.getItem(draftKey(slug));
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>).updatedAt === 'number' &&
      typeof (parsed as Record<string, unknown>).json === 'string'
    ) {
      return { updatedAt: (parsed as Record<string, unknown>).updatedAt as number, json: (parsed as Record<string, unknown>).json as string };
    }
  } catch {
    return null;
  }
  return null;
}

export function writeDraft(state: EditorState): void {
  const store = storage();
  if (store === null) return;
  const draft: CrashDraft = { updatedAt: Date.now(), json: JSON.stringify(toBoardDocument(state)) };
  try {
    store.setItem(draftKey(state.slug), JSON.stringify(draft));
  } catch {
    // Quota or blocked storage — drafts are best-effort only.
  }
}

export function clearDraft(slug: string): void {
  const store = storage();
  if (store === null) return;
  try {
    store.removeItem(draftKey(slug));
  } catch {
    // Ignore.
  }
}
