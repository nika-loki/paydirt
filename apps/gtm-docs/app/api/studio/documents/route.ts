/**
 * Studio document API — dev-only (spec D2, security section).
 *
 * Every handler returns 404 unless NODE_ENV === 'development'. Writes go
 * through the DocumentStore filesystem adapter: paths are derived from
 * kind+slug via the store's slug rules (clients never supply paths, making the
 * `content/` allowlist structural), and writes are atomic (temp + rename).
 * This route touches the local filesystem only — no outbound HTTP, ever.
 */

import path from 'node:path';

import { NextResponse } from 'next/server';

import { isDocumentKind, validateDocument } from '@/lib/documents';
import { FilesystemDocumentStore } from '@/lib/documents/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function notDev(): boolean {
  return process.env.NODE_ENV !== 'development';
}

function store(): FilesystemDocumentStore {
  return new FilesystemDocumentStore(path.join(process.cwd(), 'content'));
}

// GET — list documents (optionally ?kind=board) as { kind, slug, title } summaries.
export async function GET(request: Request): Promise<NextResponse> {
  if (notDev()) return new NextResponse('Not Found', { status: 404 });

  const kind = new URL(request.url).searchParams.get('kind') ?? undefined;
  if (kind !== undefined && kind !== '' && !isDocumentKind(kind)) {
    return NextResponse.json(
      { error: `unknown document kind ${JSON.stringify(kind)}` },
      { status: 400 },
    );
  }
  let documents: unknown[];
  try {
    documents = await store().list(kind === '' ? undefined : kind);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list documents.' },
      { status: 500 },
    );
  }

  const summaries = documents
    .map((doc): { kind: string; slug: string; title: string } | null => {
      if (typeof doc !== 'object' || doc === null) return null;
      const record = doc as Record<string, unknown>;
      if (
        typeof record.kind !== 'string' ||
        typeof record.slug !== 'string' ||
        typeof record.title !== 'string'
      ) {
        return null;
      }
      return { kind: record.kind, slug: record.slug, title: record.title };
    })
    .filter((summary): summary is { kind: string; slug: string; title: string } => summary !== null);

  return NextResponse.json({ documents: summaries });
}

// PUT — save a document. Body IS the document JSON; validation happens here so
// nothing invalid ever reaches content/.
export async function PUT(request: Request): Promise<NextResponse> {
  if (notDev()) return new NextResponse('Not Found', { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body is not valid JSON.' }, { status: 400 });
  }

  let doc: ReturnType<typeof validateDocument>;
  try {
    doc = validateDocument(body);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Document failed validation.' },
      { status: 400 },
    );
  }

  const record = doc as Record<string, unknown>;
  const kind = typeof record.kind === 'string' ? record.kind : '';
  const slug = typeof record.slug === 'string' ? record.slug : '';

  try {
    await store().put(doc);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to write document.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, kind, slug });
}

// DELETE — remove a document. Requires { slug, kind, confirm: true }.
export async function DELETE(request: Request): Promise<NextResponse> {
  if (notDev()) return new NextResponse('Not Found', { status: 404 });

  let payload: Record<string, unknown> = {};
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      payload = parsed as Record<string, unknown>;
    }
  } catch {
    // Fall back to query parameters.
  }
  if (payload.confirm !== true) {
    const param = new URL(request.url).searchParams.get('confirm');
    if (param !== 'true') {
      return NextResponse.json(
        { error: 'Deletes require an explicit confirm: true token.' },
        { status: 400 },
      );
    }
  }

  const kind =
    typeof payload.kind === 'string' ? payload.kind : new URL(request.url).searchParams.get('kind') ?? '';
  const slug =
    typeof payload.slug === 'string' ? payload.slug : new URL(request.url).searchParams.get('slug') ?? '';
  if (kind === '' || slug === '') {
    return NextResponse.json({ error: 'Both kind and slug are required.' }, { status: 400 });
  }
  if (!isDocumentKind(kind)) {
    return NextResponse.json(
      { error: `unknown document kind ${JSON.stringify(kind)}` },
      { status: 400 },
    );
  }

  try {
    await store().delete(kind, slug);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete document.' },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
