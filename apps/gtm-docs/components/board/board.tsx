/**
 * `<Board src="slug" caption? />` — the MDX-facing read-mode component.
 *
 * Server component: reads `content/boards/<slug>.board.json` (slug-regex
 * validated AND resolved-path containment checked — the only input is the
 * MDX-authored slug, never a user-shaped path), guards `kind === 'board'`
 * in one line (the kit must not duplicate the envelope — `lib/documents`
 * owns envelope validation), then payload-validates with `boardPayloadSchema`.
 * An invalid board fails the prerender build the way a failing test does
 * (spec D5).
 *
 * Also loads the app registry (lenient projection) so cards can chip vendor
 * names / brand colours. Renders `<BoardView>` (client, code-split canvas)
 * and marks the mount with `data-board={src}` for smoke checks.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { loadAppRegistry } from './app-registry';
import { BoardView } from './board-view';
import { SLUG_PATTERN, boardPayloadSchema } from './schema';

/** Candidate roots: app-dir cwd (dev/build) and workspace-root cwd (fallback). */
const CONTENT_ROOTS = ['content', 'apps/gtm-docs/content'];

export interface BoardProps {
  /** Kebab-case slug of the board document (without the `.board.json` suffix). */
  src: string;
  caption?: string;
}

/** Slug → absolute board-file path, with containment enforced after resolution. */
function boardFilePath(root: string, slug: string): string {
  const boardsRoot = path.resolve(process.cwd(), root, 'boards');
  const target = path.resolve(boardsRoot, `${slug}.board.json`);
  if (target !== boardsRoot && !target.startsWith(boardsRoot + path.sep)) {
    throw new Error(`Resolved board path escapes the boards directory: ${slug}`);
  }
  return target;
}

async function readBoardFile(slug: string): Promise<string> {
  for (const root of CONTENT_ROOTS) {
    const filePath = boardFilePath(root, slug);
    try {
      return await readFile(filePath, 'utf8');
    } catch {
      // Try the next candidate root.
    }
  }
  throw new Error(
    `Board document not found for slug "${slug}" — expected content/boards/${slug}.board.json`,
  );
}

export async function Board({ src, caption }: BoardProps) {
  if (!SLUG_PATTERN.test(src)) {
    throw new Error(`Board src must be a kebab-case slug (a-z, 0-9, dashes) — received "${src}"`);
  }

  const raw = await readBoardFile(src);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Board document "${src}" is not valid JSON: ${String(error)}`);
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    (parsed as Record<string, unknown>)['kind'] !== 'board'
  ) {
    throw new Error(`Document "${src}" has kind !== 'board' — <Board> embeds board documents only`);
  }

  const board = boardPayloadSchema.parse(parsed);
  const apps = await loadAppRegistry();

  return (
    <figure data-board={src} className="not-prose my-6">
      <BoardView board={board} apps={apps} />
      {caption ? (
        <figcaption className="mt-2 text-xs text-fd-muted-foreground">{caption}</figcaption>
      ) : null}
    </figure>
  );
}
