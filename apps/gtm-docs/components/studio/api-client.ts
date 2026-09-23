/**
 * Client wrappers for the dev-only studio write API (`app/api/studio/*`).
 *
 * Every call is same-origin; the studio never makes outbound HTTP. A 404 means
 * the write API is absent (deployed / non-dev build) — surfaced as a readable
 * message, never a crash.
 */

export interface ApiResult {
  ok: boolean;
  message: string;
}

async function toResult(response: Response): Promise<ApiResult> {
  if (response.ok) return { ok: true, message: '' };
  if (response.status === 404) {
    return {
      ok: false,
      message: 'The studio write API only exists in development builds (clone the repo and run pnpm dev).',
    };
  }
  let message = `Request failed (${response.status})`;
  try {
    const body = (await response.json()) as { error?: unknown; message?: unknown };
    if (typeof body.error === 'string') message = body.error;
    else if (typeof body.message === 'string') message = body.message;
  } catch {
    // Non-JSON error body — keep the status message.
  }
  return { ok: false, message };
}

/** Save a document (any kind). The server validates via `validateDocument`. */
export async function putDocument(doc: unknown): Promise<ApiResult> {
  const response = await fetch('/api/studio/documents', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(doc),
  });
  return toResult(response);
}

export interface DocumentSummary {
  kind: string;
  slug: string;
  title: string;
}

export async function listDocuments(): Promise<{ ok: boolean; message: string; documents: DocumentSummary[] }> {
  const response = await fetch('/api/studio/documents', { method: 'GET' });
  const result = await toResult(response);
  if (!result.ok) return { ...result, documents: [] };
  try {
    const body = (await response.json()) as { documents?: unknown };
    const documents = Array.isArray(body.documents)
      ? body.documents.filter(
          (item): item is DocumentSummary =>
            typeof item === 'object' &&
            item !== null &&
            typeof (item as DocumentSummary).kind === 'string' &&
            typeof (item as DocumentSummary).slug === 'string' &&
            typeof (item as DocumentSummary).title === 'string',
        )
      : [];
    return { ok: true, message: '', documents };
  } catch {
    return { ok: false, message: 'Malformed list response', documents: [] };
  }
}

/** Delete a document — requires an explicit confirm token. */
export async function deleteDocument(kind: string, slug: string): Promise<ApiResult> {
  const response = await fetch('/api/studio/documents', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, slug, confirm: true }),
  });
  return toResult(response);
}

/** Upload a logo asset; the server derives the filename and its path. */
export async function uploadAsset(
  file: File,
  vendor: string,
): Promise<{ ok: boolean; message: string; path?: string; filename?: string }> {
  const form = new FormData();
  form.append('file', file);
  form.append('vendor', vendor);
  const response = await fetch('/api/studio/assets', { method: 'POST', body: form });
  const result = await toResult(response);
  if (!result.ok) return result;
  try {
    const body = (await response.json()) as { path?: unknown; filename?: unknown };
    return {
      ok: true,
      message: '',
      path: typeof body.path === 'string' ? body.path : undefined,
      filename: typeof body.filename === 'string' ? body.filename : undefined,
    };
  } catch {
    return { ok: false, message: 'Malformed asset response' };
  }
}
