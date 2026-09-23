'use client';

/**
 * Paste-to-model — paste raw JSON (an API response, a Clay table export) or
 * CSV; entities, field types, and PII are inferred (pure `inference.ts`) and
 * staged for review — rename, fix types, toggle PII — before committing them
 * as model entities on the board. A pasted *document* routes to import.
 */

import { useMemo, useState } from 'react';
import { ClipboardPaste, ShieldAlert } from 'lucide-react';

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
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import { FIELD_TYPES } from '../data-model/types';
import type { DataEntity, DataField } from '../data-model/types';

import { inferFromPaste } from './inference';

export interface PasteToModelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCommit: (entities: DataEntity[]) => void;
  onImportDocument: (doc: unknown) => void;
  /** Radix focus-return hook — refocuses the control that opened the dialog. */
  onCloseAutoFocus?: (event: Event) => void;
}

type Stage =
  | { phase: 'input' }
  | { phase: 'review'; entities: DataEntity[] };

export function PasteToModel({ open, onOpenChange, onCloseAutoFocus, onCommit, onImportDocument }: PasteToModelProps) {
  const [text, setText] = useState('');
  const [stage, setStage] = useState<Stage>({ phase: 'input' });
  const [error, setError] = useState<string | null>(null);

  const inferredCount = useMemo(
    () => (stage.phase === 'review' ? stage.entities.length : 0),
    [stage],
  );

  function reset(): void {
    setText('');
    setStage({ phase: 'input' });
    setError(null);
  }

  function handleInfer(): void {
    setError(null);
    const result = inferFromPaste(text);
    if (result.kind === 'error') {
      setError(result.message);
      return;
    }
    if (result.kind === 'document') {
      onImportDocument(result.document);
      onOpenChange(false);
      reset();
      return;
    }
    setStage({ phase: 'review', entities: result.entities });
  }

  function setEntity(index: number, patch: Partial<DataEntity>): void {
    setStage((current) => {
      if (current.phase !== 'review') return current;
      return {
        phase: 'review',
        entities: current.entities.map((entity, i) => (i === index ? { ...entity, ...patch } : entity)),
      };
    });
  }

  function setField(entityIndex: number, fieldIndex: number, patch: Partial<DataField>): void {
    setStage((current) => {
      if (current.phase !== 'review') return current;
      return {
        phase: 'review',
        entities: current.entities.map((entity, i) =>
          i === entityIndex
            ? {
                ...entity,
                fields: entity.fields.map((field, j) =>
                  j === fieldIndex ? { ...field, ...patch } : field,
                ),
              }
            : entity,
        ),
      };
    });
  }

  function removeEntity(index: number): void {
    setStage((current) => {
      if (current.phase !== 'review') return current;
      return { phase: 'review', entities: current.entities.filter((_, i) => i !== index) };
    });
  }

  function commit(): void {
    if (stage.phase !== 'review') return;
    const cleaned = stage.entities
      .map((entity) => ({
        ...entity,
        name: entity.name.trim() === '' ? 'Entity' : entity.name.trim(),
        fields: entity.fields.filter((field) => field.name.trim() !== ''),
      }))
      .filter((entity) => entity.fields.length > 0);
    if (cleaned.length > 0) onCommit(cleaned);
    onOpenChange(false);
    reset();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) reset(); }}>
      <DialogContent className="sm:max-w-2xl" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardPaste className="size-4 text-primary" aria-hidden="true" />
            Paste to model
          </DialogTitle>
          <DialogDescription>
            Paste an API response, array of records, or CSV (comma or tab separated). Types and PII
            are inferred for review before anything lands on the board.
          </DialogDescription>
        </DialogHeader>

        {stage.phase === 'input' ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="paste-input">Raw JSON or CSV</Label>
              <Textarea
                id="paste-input"
                className="min-h-48 font-mono text-xs"
                placeholder={'[\n  { "domain": "acme.com", "icp_score": 87, "email": "vp@acme.com" }\n]\n\n— or paste CSV with a header row —\n\n— or paste a whole document ($schema + kind) to import it'}
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
            </div>
            {error !== null && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={text.trim() === ''} onClick={handleInfer}>
                Infer entities
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Review the {inferredCount} inferred entit{inferredCount === 1 ? 'y' : 'ies'} — rename,
              fix types, toggle PII — then add {inferredCount === 1 ? 'it' : 'them'} to the board.
            </p>
            <ScrollArea className="max-h-80 rounded-md">
              <div className="divide-y divide-border p-3">
                {stage.entities.map((entity, entityIndex) => (
                  <div key={entityIndex} className="space-y-2 py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-2">
                      <Input
                        className="h-8 flex-1 text-sm font-medium"
                        aria-label={`Entity ${entityIndex + 1} name`}
                        value={entity.name}
                        onChange={(event) => setEntity(entityIndex, { name: event.target.value })}
                      />
                      <Badge variant="secondary" className="text-[10px]">
                        {entity.fields.length} fields
                      </Badge>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-destructive"
                        aria-label={`Remove ${entity.name}`}
                        onClick={() => removeEntity(entityIndex)}
                      >
                        ×
                      </Button>
                    </div>
                    <div className="space-y-1">
                      {entity.fields.map((field, fieldIndex) => (
                        <div key={fieldIndex} className="flex items-center gap-1.5">
                          <Input
                            className="h-7 flex-1 text-xs"
                            aria-label={`Field ${field.name || fieldIndex + 1} name`}
                            value={field.name}
                            onChange={(event) => setField(entityIndex, fieldIndex, { name: event.target.value })}
                          />
                          <Select
                            value={field.type}
                            onValueChange={(value) =>
                              setField(entityIndex, fieldIndex, { type: value as DataField['type'] })
                            }
                          >
                            <SelectTrigger
                              className="h-7 w-24 text-xs"
                              aria-label={`Field ${field.name || fieldIndex + 1} type`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {FIELD_TYPES.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {type}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {field.pii === true ? (
                            <Badge className="gap-1 border-amber-500/60 bg-amber-500/15 text-[10px] text-amber-700 hover:bg-amber-500/25 dark:text-amber-300">
                              <ShieldAlert className="size-2.5" aria-hidden="true" />
                              PII
                            </Badge>
                          ) : (
                            <span className="w-9 shrink-0" aria-hidden="true" />
                          )}
                          {field.key === true && (
                            <Badge variant="outline" className="text-[10px]">
                              key
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setStage({ phase: 'input' })}>
                Back
              </Button>
              <Button type="button" disabled={stage.entities.length === 0} onClick={commit}>
                Add {stage.entities.length} entit{stage.entities.length === 1 ? 'y' : 'ies'} to board
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
