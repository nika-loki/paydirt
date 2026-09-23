'use client';

/**
 * "Add app…" — register a missing application as an `app` document (D13: the
 * app registry is open; Attio is the canonical story). Vendor, category (from
 * the `app-categories` vocab), optional brand colour, optional logo upload
 * (multipart → `POST /api/studio/assets`, server derives the filename).
 */

import { useMemo, useRef, useState } from 'react';
import { Loader2, Store } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { uploadAsset } from './api-client';
import { putDocument } from './api-client';
import type { AppView } from './types';

export interface AddAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: string[];
  onAdded: (app: AppView) => void;
  /** Radix focus-return hook — refocuses the control that opened the dialog. */
  onCloseAutoFocus?: (event: Event) => void;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function AddAppDialog({ open, onOpenChange, onCloseAutoFocus, categories, onAdded }: AddAppDialogProps) {
  const [vendor, setVendor] = useState('');
  const [category, setCategory] = useState<string>('');
  const [brandColor, setBrandColor] = useState('');
  const [domain, setDomain] = useState('');
  const [logo, setLogo] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const slug = useMemo(() => slugify(vendor), [vendor]);
  const colorValid = brandColor.trim() === '' || HEX_COLOR.test(brandColor.trim());
  const canSave = vendor.trim() !== '' && category !== '' && colorValid && !saving;

  function reset(): void {
    setVendor('');
    setCategory('');
    setBrandColor('');
    setDomain('');
    setLogo(null);
    setSaving(false);
    if (fileInput.current !== null) fileInput.current.value = '';
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    try {
      let logoName: string | undefined;
      if (logo !== null) {
        const upload = await uploadAsset(logo, vendor.trim());
        if (!upload.ok) {
          toast.error('Logo upload failed', { description: upload.message });
          setSaving(false);
          return;
        }
        logoName = upload.filename;
      }
      const doc: Record<string, unknown> = {
        $schema: 'https://paydirt.dev/schemas/app-v1.json',
        kind: 'app',
        version: 1,
        slug,
        title: vendor.trim(),
        vendor: vendor.trim(),
        category,
        richProfiles: [],
      };
      const color = brandColor.trim();
      if (color !== '') doc.brandColor = color;
      if (logoName !== undefined) doc.logo = logoName;
      const host = domain.trim().toLowerCase();
      if (host !== '') doc.domain = host;

      const result = await putDocument(doc);
      if (!result.ok) {
        toast.error('Could not save the app document', { description: result.message });
        setSaving(false);
        return;
      }
      onAdded({
        slug,
        title: vendor.trim(),
        vendor: vendor.trim(),
        category,
        ...(color !== '' ? { brandColor: color } : {}),
        ...(logoName !== undefined ? { logo: logoName } : {}),
        ...(host !== '' ? { domain: host } : {}),
        richProfiles: [],
      });
      toast.success(`${vendor.trim()} added to the app registry`, {
        description: `content/apps/${slug}.json${logoName !== undefined ? ` + ${logoName}` : ''}`,
      });
      onOpenChange(false);
      reset();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) reset(); }}>
      <DialogContent className="sm:max-w-md" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="size-4 text-primary" aria-hidden="true" />
            Add app
          </DialogTitle>
          <DialogDescription>
            Register an application the palette doesn&apos;t know yet — it lands as an{' '}
            <code className="font-mono text-xs">content/apps/</code> document and shows up in the
            palette immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="app-vendor">Vendor</Label>
            <Input
              id="app-vendor"
              placeholder="e.g. Attio"
              value={vendor}
              onChange={(event) => setVendor(event.target.value)}
            />
            {slug !== '' && <p className="text-[11px] text-muted-foreground">slug · {slug}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="app-domain">Domain (optional)</Label>
            <Input
              id="app-domain"
              placeholder="e.g. attio.com — renders the logo automatically"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Pulls the vendor logo via logo.dev; no upload needed.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category || undefined} onValueChange={setCategory}>
              <SelectTrigger className="w-full" aria-label="App category">
                <SelectValue placeholder="Pick a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-[1fr_auto] items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="app-color">Brand colour (optional)</Label>
              <Input
                id="app-color"
                placeholder="#0f172a"
                className="font-mono text-xs"
                value={brandColor}
                onChange={(event) => setBrandColor(event.target.value)}
                aria-invalid={!colorValid}
              />
              {!colorValid && (
                <p className="text-xs text-destructive">Use a 6-digit hex colour, e.g. #0f172a.</p>
              )}
            </div>
            <span
              aria-hidden="true"
              className="mb-0.5 block size-9 rounded-md border border-border"
              style={colorValid && brandColor.trim() !== '' ? { backgroundColor: brandColor.trim() } : undefined}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="app-logo">Logo (optional, ≤ 512 KB — png/svg/webp/jpg)</Label>
            <Input
              id="app-logo"
              ref={fileInput}
              type="file"
              accept=".png,.svg,.webp,.jpg,.jpeg"
              onChange={(event) => setLogo(event.target.files?.[0] ?? null)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!canSave} onClick={() => void handleSave()}>
            {saving ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
            Save app
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
