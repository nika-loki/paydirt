/**
 * Studio asset upload (logos) — dev-only (spec D2, security section).
 *
 * POST multipart: `file` + `vendor`. Defense in depth:
 *   - 404 unless NODE_ENV === 'development'
 *   - extension allowlist (png/svg/webp/jpg) + ~512 KB size cap
 *   - filename derived server-side (`<vendor-slug><ext>` — client never names
 *     the destination)
 *   - resolved-path check that the destination stays under content/
 * No outbound HTTP; local filesystem only.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 512 * 1024;
const EXT_ALLOWLIST = new Set(['png', 'svg', 'webp', 'jpg', 'jpeg']);

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function notDev(): boolean {
  return process.env.NODE_ENV !== 'development';
}

export async function POST(request: Request): Promise<NextResponse> {
  if (notDev()) return new NextResponse('Not Found', { status: 404 });

  const contentRoot = path.resolve(process.cwd(), 'content');

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart form data.' }, { status: 400 });
  }

  const file = form.get('file');
  const vendor = form.get('vendor');
  if (!(file instanceof File) || typeof vendor !== 'string' || vendor.trim() === '') {
    return NextResponse.json({ error: 'Fields `file` and `vendor` are required.' }, { status: 400 });
  }

  const slug = slugify(vendor);
  if (slug === '') {
    return NextResponse.json({ error: 'Vendor name has no usable slug.' }, { status: 400 });
  }

  if (file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Asset must be between 1 byte and ${MAX_BYTES} bytes (≈512 KB).` },
      { status: 400 },
    );
  }

  const originalName = file.name.toLowerCase();
  const ext = originalName.includes('.') ? originalName.split('.').pop() ?? '' : '';
  if (!EXT_ALLOWLIST.has(ext)) {
    return NextResponse.json(
      { error: `Extension .${ext || '(none)'} not allowed — use png, svg, webp, or jpg.` },
      { status: 400 },
    );
  }

  const normalizedExt = ext === 'jpeg' ? 'jpg' : ext;
  const assetsDir = path.join(contentRoot, 'apps', 'assets');
  const filename = `${slug}.${normalizedExt}`;
  const destination = path.resolve(assetsDir, filename);

  // Defense in depth: the resolved destination must stay inside content/.
  if (!destination.startsWith(contentRoot + path.sep)) {
    return NextResponse.json({ error: 'Resolved path escapes content/.' }, { status: 400 });
  }

  try {
    await mkdir(assetsDir, { recursive: true });
    const bytes = Buffer.from(await file.arrayBuffer());
    // Atomic write: temp file + rename, same as the document store.
    const temp = path.join(assetsDir, `.${filename}.tmp-${Date.now()}`);
    await writeFile(temp, bytes, { mode: 0o644 });
    await rename(temp, destination);
    // Belt and braces: the rename landed inside content/.
    const check = await readFile(destination);
    if (check.length !== bytes.length) {
      return NextResponse.json({ error: 'Asset write verification failed.' }, { status: 500 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to write asset.' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    path: `content/apps/assets/${filename}`,
    filename,
  });
}
