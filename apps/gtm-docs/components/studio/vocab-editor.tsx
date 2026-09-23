'use client';

/**
 * Vocabulary editor (D13 — every vocabulary is owner-extensible). Add or
 * remove motions, mechanisms, and app categories; each set saves as its
 * `vocab` document through the same validated PUT path as every other
 * document. Removing a value boards still reference will fail the content
 * walk at gate time — the UI warns about it.
 */

import { useEffect, useState } from 'react';
import { Loader2, Plus, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';

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
import { Separator } from '@/components/ui/separator';

import { putDocument } from './api-client';
import type { VocabView } from './types';

export interface VocabEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vocab: VocabView;
  onSaved: (vocab: VocabView) => void;
  /** Radix focus-return hook — refocuses the control that opened the dialog. */
  onCloseAutoFocus?: (event: Event) => void;
}

type VocabSetKey = 'motions' | 'mechanisms' | 'appCategories';

const SETS: { key: VocabSetKey; slug: string; title: string; label: string; hint: string }[] = [
  {
    key: 'motions',
    slug: 'motions',
    title: 'Motions',
    label: 'Motions',
    hint: 'the revenue-cycle stage a consumer serves (new-business, upsell…)',
  },
  {
    key: 'mechanisms',
    slug: 'mechanisms',
    title: 'Mechanisms',
    label: 'Mechanisms',
    hint: 'how data moves on an edge (api-pull, webhook…)',
  },
  {
    key: 'appCategories',
    slug: 'app-categories',
    title: 'App categories',
    label: 'App categories',
    hint: 'how apps group in the palette (marketing, sales, data…)',
  },
];

export function VocabEditor({ open, onOpenChange, onCloseAutoFocus, vocab, onSaved }: VocabEditorProps) {
  const [draft, setDraft] = useState<VocabView>(vocab);
  const [inputs, setInputs] = useState<Record<VocabSetKey, string>>({
    motions: '',
    mechanisms: '',
    appCategories: '',
  });
  const [saving, setSaving] = useState(false);

  // Re-seed the draft whenever the dialog (re)opens with fresh server data.
  useEffect(() => {
    if (open) setDraft(vocab);
  }, [open, vocab]);

  /** Vocab terms are kebab-case (the vocab document schema enforces it). */
  function kebabize(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function addValue(key: VocabSetKey): void {
    const value = kebabize(inputs[key]);
    if (value === '') return;
    if (draft[key].includes(value)) {
      toast.info(`“${value}” is already in ${key}.`);
      return;
    }
    setDraft((current) => ({ ...current, [key]: [...current[key], value] }));
    setInputs((current) => ({ ...current, [key]: '' }));
  }

  function removeValue(key: VocabSetKey, value: string): void {
    setDraft((current) => ({ ...current, [key]: current[key].filter((item) => item !== value) }));
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    try {
      for (const set of SETS) {
        const before = vocab[set.key];
        const after = draft[set.key];
        if (before.join('\u0000') === after.join('\u0000')) continue;
        const doc: Record<string, unknown> = {
          $schema: 'https://paydirt.dev/schemas/vocab-v1.json',
          kind: 'vocab',
          version: 1,
          slug: set.slug,
          title: set.title,
          values: after,
        };
        const result = await putDocument(doc);
        if (!result.ok) {
          toast.error(`Could not save ${set.label.toLowerCase()}`, { description: result.message });
          setSaving(false);
          return;
        }
      }
      onSaved(draft);
      toast.success('Vocabularies saved', {
        description: 'Vocab documents updated under content/vocab/.',
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  const dirty = SETS.some((set) => vocab[set.key].join('\u0000') !== draft[set.key].join('\u0000'));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" aria-hidden="true" />
            Edit vocabularies
          </DialogTitle>
          <DialogDescription>
            Extend the seeded sets — extend the list, not the schema. Values in use by existing
            boards should not be removed (the build validates documents against these sets).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {SETS.map((set, index) => (
            <div key={set.key} className="space-y-2">
              {index > 0 && <Separator />}
              <div className="space-y-1.5">
                <Label>{set.label}</Label>
                <p className="text-[11px] text-muted-foreground">{set.hint}</p>
                <div className="flex gap-1.5">
                  <Input
                    className="h-8 text-sm"
                    placeholder={`Add to ${set.label.toLowerCase()}…`}
                    value={inputs[set.key]}
                    aria-label={`New ${set.label.toLowerCase()} value`}
                    onChange={(event) =>
                      setInputs((current) => ({ ...current, [set.key]: event.target.value }))
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addValue(set.key);
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={inputs[set.key].trim() === ''}
                    onClick={() => addValue(set.key)}
                  >
                    <Plus className="mr-1 size-3" aria-hidden="true" />
                    Add
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {draft[set.key].map((value) => (
                    <Badge key={value} variant="secondary" className="gap-1 font-normal">
                      {value}
                      <button
                        type="button"
                        aria-label={`Remove ${value}`}
                        className="rounded-full p-0.5 hover:bg-destructive/15 hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring"
                        onClick={() => removeValue(set.key, value)}
                      >
                        <X className="size-2.5" aria-hidden="true" />
                      </button>
                    </Badge>
                  ))}
                  {draft[set.key].length === 0 && (
                    <p className="text-xs text-muted-foreground">(empty)</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!dirty || saving} onClick={() => void handleSave()}>
            {saving ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
            Save vocabularies
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
