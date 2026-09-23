'use client';

/**
 * The right property panel — a zod-schema-driven react-hook-form per selected
 * node (the registry's `dataSchema` + `FieldSpec[]` drive it), an inline edge
 * editor (mechanism from the vocab, cadence, payload, credential NAME — never
 * a value), and the model-board entity fields editor with key/unique/pii
 * toggles. Changes apply live to the canvas.
 */

import { useEffect, useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useController, useFieldArray, type Resolver, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { Lock, Plus, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import { CARDINALITIES, FIELD_TYPES } from '../data-model/types';
import type { Cardinality, DataField } from '../data-model/types';

import type { EditorEdge, EditorNode } from './board-doc';
import type { KitRegistryEntry } from './kit';
import { kitByType } from './kit';
import type { AppView, Archetype, BoardType, EditorEdgeData, FlowEdgeData, VocabView } from './types';
import { ARCHETYPES, ENTITY_PROFILE, RICH_PROFILES } from './types';

const FALLBACK_MECHANISMS = ['api-pull', 'webhook', 'enrichment-run', 'native-sync', 'manual-export'];
const NONE_VALUE = '__none__';

// Mirrors the kit's pinned flow-edge contract (mechanism required; credential
// an env-var NAME). The server re-validates against the canonical schema.
const flowEdgeSchema = z.object({
  mechanism: z.string().min(1, 'Pick a mechanism.'),
  cadence: z.string().optional(),
  payload: z.string().optional(),
  credential: z
    .union([
      z.literal(''),
      z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'Env-var NAME only (e.g. HUBSPOT_PRIVATE_APP_TOKEN) — never a value.'),
    ])
    .optional(),
});

type FlowEdgeFormValues = z.infer<typeof flowEdgeSchema>;

export interface PropertyPanelProps {
  node: EditorNode | null;
  edge: EditorEdge | null;
  boardType: BoardType;
  apps: AppView[];
  vocab: VocabView;
  readOnly: boolean;
  onNodeDataChange: (id: string, data: Record<string, unknown>) => void;
  onNodeMetaChange: (id: string, meta: { archetype?: Archetype; profile?: string }) => void;
  onEdgeDataChange: (id: string, data: EditorEdgeData) => void;
  onDeleteNode: (id: string) => void;
  onDeleteEdge: (id: string) => void;
}

/**
 * The right property panel — a zod-schema-driven react-hook-form per selected
 * node (the registry's `dataSchema` + `FieldSpec[]` drive it), an inline edge
 * editor (mechanism from the vocab, cadence, payload, credential NAME — never
 * a value), and the model-board entity fields editor with key/unique/pii
 * toggles. Changes apply live to the canvas.
 *
 * `PropertyPanelBody` is the header + scrollable forms; `PropertyPanel` wraps
 * it in the static desktop column. Below lg the studio renders the body inside
 * a right-side Sheet instead (see studio-app.tsx), so the canvas keeps the
 * full width on phones and tablets.
 */

export function PropertyPanelBody(props: PropertyPanelProps) {
  const { node, edge, boardType, readOnly } = props;

  return (
    <>
      <div className="shrink-0 border-b border-border px-4 py-2.5">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Properties
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {node !== null ? (
          <NodeForm key={`${node.id}:${node.type}`} {...props} node={node} />
        ) : edge !== null ? (
          boardType === 'flow' ? (
            <FlowEdgeForm
              key={edge.id}
              edge={edge}
              vocab={props.vocab}
              readOnly={readOnly}
              onChange={props.onEdgeDataChange}
              onDelete={() => props.onDeleteEdge(edge.id)}
            />
          ) : (
            <ModelEdgeForm
              key={edge.id}
              edge={edge}
              readOnly={readOnly}
              onChange={props.onEdgeDataChange}
              onDelete={() => props.onDeleteEdge(edge.id)}
            />
          )
        ) : (
          <EmptyPanel boardType={boardType} />
        )}
      </div>
    </>
  );
}

export function PropertyPanel(props: PropertyPanelProps) {
  return (
    <aside className="hidden w-80 shrink-0 flex-col border-l border-border bg-background lg:flex">
      <PropertyPanelBody {...props} />
    </aside>
  );
}

// --- empty state -------------------------------------------------------------------

function EmptyPanel({ boardType }: { boardType: BoardType }) {
  return (
    <div className="space-y-3 text-sm text-muted-foreground">
      <p>Select a node or edge on the canvas to edit it.</p>
      <div className="space-y-1.5">
        <p className="font-medium text-foreground">
          {boardType === 'flow' ? 'Reading a flow board' : 'Reading a model board'}
        </p>
        {boardType === 'flow' ? (
          <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed">
            <li>
              <span className="text-foreground">Sources</span> — data enters the motion here
            </li>
            <li>
              <span className="text-foreground">Processors</span> — transform, enrich, orchestrate
            </li>
            <li>
              <span className="text-foreground">Destinations</span> — data lands to be acted on
            </li>
            <li>
              <span className="text-foreground">Consumers</span> — a revenue motion uses the output
            </li>
          </ul>
        ) : (
          <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed">
            <li>Entities carry fields with key / unique / PII flags</li>
            <li>Connect entities to record how they relate</li>
          </ul>
        )}
      </div>
    </div>
  );
}

// --- node form ------------------------------------------------------------------------

function NodeForm(props: PropertyPanelProps & { node: EditorNode }) {
  const { node, boardType, apps, vocab, readOnly, onNodeDataChange, onNodeMetaChange, onDeleteNode } = props;
  const entry: KitRegistryEntry | undefined = kitByType.get(node.type ?? '');
  const isEntity = node.profile === ENTITY_PROFILE;

  // zodResolver is typed for concrete schemas; the registry hands us generic
  // `z.ZodType<Record<string, unknown>>` — one boundary cast, documented here.
  const schemaResolver: Resolver<Record<string, unknown>> | undefined =
    entry?.dataSchema !== undefined
      ? (zodResolver(entry.dataSchema as unknown as Parameters<typeof zodResolver>[0]) as Resolver<
          Record<string, unknown>
        >)
      : undefined;

  const form = useForm<Record<string, unknown>>({
    defaultValues: node.data,
    mode: 'onChange',
    resolver: schemaResolver,
  });

  useEffect(() => {
    const subscription = form.watch(() => {
      onNodeDataChange(node.id, form.getValues() as Record<string, unknown>);
    });
    return () => subscription.unsubscribe();
  }, [form, node.id, onNodeDataChange]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {typeof node.data.name === 'string' && node.data.name !== ''
              ? node.data.name
              : 'Untitled node'}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {entry?.label ?? node.type} · {node.id}
          </p>
        </div>
        {!readOnly && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Delete node"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => onDeleteNode(node.id)}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      {!isEntity && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="node-archetype" className="text-xs">
              Archetype
            </Label>
            <Select
              disabled={readOnly}
              value={node.archetype ?? 'processor'}
              onValueChange={(value) =>
                onNodeMetaChange(node.id, { archetype: value as Archetype, profile: node.profile })}
            >
              <SelectTrigger id="node-archetype" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ARCHETYPES.map((archetype) => (
                  <SelectItem key={archetype} value={archetype}>
                    {archetype}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="node-profile" className="text-xs">
              Profile
            </Label>
            <Select
              disabled={readOnly}
              value={node.profile ?? NONE_VALUE}
              onValueChange={(value) =>
                onNodeMetaChange(node.id, {
                  archetype: node.archetype,
                  profile: value === NONE_VALUE ? undefined : value,
                })}
            >
              <SelectTrigger id="node-profile" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>none (generic)</SelectItem>
                {RICH_PROFILES.map((profile) => (
                  <SelectItem key={profile} value={profile}>
                    {kitByType.get(profile)?.label ?? profile}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <Separator />

      <SchemaFields
        form={form}
        fields={entry?.fields ?? defaultFieldSpecs(isEntity)}
        apps={apps}
        vocab={vocab}
        readOnly={readOnly}
      />

      {isEntity && (
        <>
          <Separator />
          <EntityFields form={form} readOnly={readOnly} />
        </>
      )}

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Lock className="size-3 shrink-0" aria-hidden="true" />
        externalRef: null — reserved for Phase-2 live sync
      </p>
    </div>
  );
}

function defaultFieldSpecs(isEntity: boolean): KitRegistryEntry['fields'] {
  if (isEntity) {
    return [
      { name: 'name', label: 'Entity name', input: 'text' },
      { name: 'source', label: 'Owning system', input: 'text' },
      { name: 'description', label: 'Description', input: 'textarea' },
    ];
  }
  return [
    { name: 'name', label: 'Name', input: 'text' },
    { name: 'app', label: 'App', input: 'app-ref' },
    { name: 'notes', label: 'Notes', input: 'textarea' },
  ];
}

// --- schema-driven fields ---------------------------------------------------------------

interface FieldRowProps {
  name: string;
  label: string;
  input: string;
  options?: string[];
  apps: AppView[];
  vocab: VocabView;
  form: UseFormReturn<Record<string, unknown>>;
  readOnly: boolean;
}

function FieldRow(props: FieldRowProps) {
  const { name, label, input, options, apps, vocab, form, readOnly } = props;
  const { field } = useController({ control: form.control, name: name as never });
  const error = (form.formState.errors as Record<string, { message?: string } | undefined>)[name]
    ?.message;
  const inputId = `field-${name}`;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={inputId} className="text-xs">
        {label}
      </Label>
      {input === 'textarea' ? (
        <Textarea
          id={inputId}
          disabled={readOnly}
          className="min-h-16 text-sm"
          value={(field.value as string | undefined) ?? ''}
          onChange={field.onChange}
          onBlur={field.onBlur}
        />
      ) : (
        <Input
          id={inputId}
          disabled={readOnly}
          className="h-8 text-sm"
          value={(field.value as string | undefined) ?? ''}
          onChange={field.onChange}
          onBlur={field.onBlur}
        />
      )}
      {error !== undefined && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** Select-backed field kinds (vocab / app-ref / option list). */
function SelectFieldRow(props: FieldRowProps) {
  const { name, label, input, options, apps, vocab, form, readOnly } = props;
  const { field } = useController({ control: form.control, name: name as never });
  const inputId = `field-${name}`;

  const choices = useMemo(() => {
    if (input === 'app-ref') {
      return apps.map((app) => ({ value: app.slug, label: app.vendor }));
    }
    if (input === 'motion') {
      const motions = vocab.motions.length > 0 ? vocab.motions : ['new-business'];
      return motions.map((motion) => ({ value: motion, label: motion }));
    }
    return (options ?? []).map((option) => ({ value: option, label: option }));
  }, [input, apps, vocab, options]);

  const currentValue =
    typeof field.value === 'string' && field.value !== '' ? field.value : NONE_VALUE;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={inputId} className="text-xs">
        {label}
      </Label>
      <Select
        disabled={readOnly}
        value={currentValue}
        onValueChange={(value) => field.onChange(value === NONE_VALUE ? undefined : value)}
      >
        <SelectTrigger id={inputId} className="h-8 w-full text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_VALUE}>— none —</SelectItem>
          {choices.map((choice) => (
            <SelectItem key={choice.value} value={choice.value}>
              {choice.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Columns editor — a list of strings (clay-table columns, triggers, objects). */
function ColumnsFieldRow(props: FieldRowProps) {
  const { name, label, form, readOnly } = props;
  const { field } = useController({ control: form.control, name: name as never });
  const raw: unknown = field.value;
  const values: string[] = Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === 'string')
    : [];

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="space-y-1.5">
        {values.map((value, index) => (
          <div key={`${name}-${index}`} className="flex items-center gap-1.5">
            <Input
              disabled={readOnly}
              className="h-8 text-sm"
              value={value}
              aria-label={`${label} ${index + 1}`}
              onChange={(event) => {
                const next = [...values];
                next[index] = event.target.value;
                field.onChange(next);
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={readOnly}
              className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
              aria-label={`Remove ${label} ${index + 1}`}
              onClick={() => field.onChange(values.filter((_, i) => i !== index))}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={readOnly}
        className="h-7 text-xs"
        onClick={() => field.onChange([...values, ''])}
      >
        <Plus className="mr-1 size-3" aria-hidden="true" />
        Add
      </Button>
    </div>
  );
}

function SchemaFields(props: {
  form: UseFormReturn<Record<string, unknown>>;
  fields: KitRegistryEntry['fields'];
  apps: AppView[];
  vocab: VocabView;
  readOnly: boolean;
}) {
  const specs = props.fields.length > 0 ? props.fields : defaultFieldSpecs(false);
  return (
    <div className="space-y-3">
      {specs.map((spec) => {
        if (spec.input === 'columns') {
          return <ColumnsFieldRow key={spec.name} {...props} name={spec.name} label={spec.label} input={spec.input} />;
        }
        if (spec.input === 'select' || spec.input === 'app-ref' || spec.input === 'motion') {
          return <SelectFieldRow key={spec.name} {...props} name={spec.name} label={spec.label} input={spec.input} options={spec.options} />;
        }
        return <FieldRow key={spec.name} {...props} name={spec.name} label={spec.label} input={spec.input} />;
      })}
    </div>
  );
}

// --- entity fields editor -----------------------------------------------------------------

function EntityFields({
  form,
  readOnly,
}: {
  form: UseFormReturn<Record<string, unknown>>;
  readOnly: boolean;
}) {
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'fields' as never });
  const rows = fields as unknown as Array<{ id: string }>;

  const valueAt = (index: number, key: keyof DataField): unknown => {
    const raw = (form.getValues('fields') as DataField[] | undefined)?.[index];
    return raw?.[key];
  };

  const setField = (index: number, patch: Partial<DataField>): void => {
    const current = (form.getValues('fields') as DataField[] | undefined) ?? [];
    const next = current.map((field, i) => (i === index ? { ...field, ...patch } : field));
    form.setValue('fields', next, { shouldDirty: true });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Fields</p>
        <Badge variant="secondary" className="text-[10px]">
          {fields.length}
        </Badge>
      </div>
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={row.id} className="rounded-md border border-border bg-card/50 p-2 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Input
                disabled={readOnly}
                className="h-7 flex-1 text-xs"
                placeholder="field name"
                aria-label={`Field ${index + 1} name`}
                value={typeof valueAt(index, 'name') === 'string' ? (valueAt(index, 'name') as string) : ''}
                onChange={(event) => setField(index, { name: event.target.value })}
              />
              <Select
                disabled={readOnly}
                value={typeof valueAt(index, 'type') === 'string' ? (valueAt(index, 'type') as string) : 'string'}
                onValueChange={(value) => setField(index, { type: value as DataField['type'] })}
              >
                <SelectTrigger className="h-7 w-28 text-xs" aria-label={`Field ${index + 1} type`}>
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
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={readOnly}
                className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                aria-label={`Remove field ${index + 1}`}
                onClick={() => remove(index)}
              >
                <Trash2 className="size-3" aria-hidden="true" />
              </Button>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <ToggleChip
                label="key"
                active={valueAt(index, 'key') === true}
                disabled={readOnly}
                onClick={() => setField(index, { key: valueAt(index, 'key') !== true })}
              />
              <ToggleChip
                label="unique"
                active={valueAt(index, 'unique') === true}
                disabled={readOnly}
                onClick={() => setField(index, { unique: valueAt(index, 'unique') !== true })}
              />
              <ToggleChip
                label="PII"
                amber
                active={valueAt(index, 'pii') === true}
                disabled={readOnly}
                onClick={() => setField(index, { pii: valueAt(index, 'pii') !== true })}
              />
            </div>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={readOnly}
        className="h-7 text-xs"
        onClick={() => append({ name: '', type: 'string' } as never)}
      >
        <Plus className="mr-1 size-3" aria-hidden="true" />
        Add field
      </Button>
    </div>
  );
}

function ToggleChip({
  label,
  active,
  amber,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  amber?: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full border px-2 py-0.5 font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        active && amber && 'border-amber-500/60 bg-amber-500/15 text-amber-700 dark:text-amber-300',
        active && !amber && 'border-primary/50 bg-primary/10 text-primary',
        !active && 'border-border text-muted-foreground',
        disabled && 'cursor-not-allowed opacity-50',
        !disabled && 'cursor-pointer hover:border-foreground/30',
      )}
    >
      {label}
    </button>
  );
}

// --- flow edge editor -----------------------------------------------------------------------

function FlowEdgeForm({
  edge,
  vocab,
  readOnly,
  onChange,
  onDelete,
}: {
  edge: EditorEdge;
  vocab: VocabView;
  readOnly: boolean;
  onChange: (id: string, data: EditorEdgeData) => void;
  onDelete: () => void;
}) {
  const initial = (edge.data ?? {}) as Partial<FlowEdgeData>;
  const form = useForm<FlowEdgeFormValues>({
    resolver: zodResolver(flowEdgeSchema),
    mode: 'onChange',
    defaultValues: {
      mechanism: initial.mechanism ?? '',
      cadence: initial.cadence ?? '',
      payload: initial.payload ?? '',
      credential: initial.credential ?? '',
    },
  });

  useEffect(() => {
    const subscription = form.watch((values) => {
      onChange(edge.id, {
        mechanism: values.mechanism ?? '',
        cadence: values.cadence?.trim() === '' ? undefined : values.cadence,
        payload: values.payload?.trim() === '' ? undefined : values.payload,
        credential: values.credential?.trim() === '' ? undefined : values.credential,
      });
    });
    return () => subscription.unsubscribe();
  }, [form, edge.id, onChange]);

  const mechanisms = vocab.mechanisms.length > 0 ? vocab.mechanisms : FALLBACK_MECHANISMS;
  const errors = form.formState.errors;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">Edge · how data moves</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {edge.source} → {edge.target}
          </p>
        </div>
        {!readOnly && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Delete edge"
            className="text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Mechanism</Label>
        <Select
          disabled={readOnly}
          value={form.watch('mechanism') || NONE_VALUE}
          onValueChange={(value) => form.setValue('mechanism', value === NONE_VALUE ? '' : value, { shouldValidate: true })}
        >
          <SelectTrigger className="h-8 w-full text-sm">
            <SelectValue placeholder="Pick a mechanism" />
          </SelectTrigger>
          <SelectContent>
            {mechanisms.map((mechanism) => (
              <SelectItem key={mechanism} value={mechanism}>
                {mechanism}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.mechanism?.message !== undefined && (
          <p className="text-xs text-destructive">{errors.mechanism.message}</p>
        )}
      </div>

      {(
        [
          { name: 'cadence', label: 'Cadence', placeholder: 'e.g. nightly, on new row' },
          { name: 'payload', label: 'Payload', placeholder: 'one-line summary, e.g. accounts + usage' },
          {
            name: 'credential',
            label: 'Credential name',
            placeholder: 'env-var NAME, e.g. SNOWFLAKE_RO_KEY',
          },
        ] as const
      ).map(({ name, label, placeholder }) => (
        <div className="space-y-1.5" key={name}>
          <Label htmlFor={`edge-${name}`} className="text-xs">
            {label}
          </Label>
          <Input
            id={`edge-${name}`}
            disabled={readOnly}
            className="h-8 font-mono text-xs"
            placeholder={placeholder}
            {...form.register(name)}
          />
          {errors[name]?.message !== undefined && (
            <p className="text-xs text-destructive">{errors[name].message}</p>
          )}
        </div>
      ))}
      <p className="text-[11px] text-muted-foreground">
        Credentials are env-var <span className="font-medium">names</span> only — a value is never
        stored, pasted, or printed.
      </p>
    </div>
  );
}

// --- model edge editor -------------------------------------------------------------------------

function ModelEdgeForm({
  edge,
  readOnly,
  onChange,
  onDelete,
}: {
  edge: EditorEdge;
  readOnly: boolean;
  onChange: (id: string, data: EditorEdgeData) => void;
  onDelete: () => void;
}) {
  const data = (edge.data ?? { cardinality: 'one-to-many' }) as {
    cardinality: Cardinality;
    label?: string;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">Relation</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {edge.source} → {edge.target}
          </p>
        </div>
        {!readOnly && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Delete relation"
            className="text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="relation-cardinality" className="text-xs">
          Cardinality
        </Label>
        <Select
          disabled={readOnly}
          value={data.cardinality}
          onValueChange={(value) => onChange(edge.id, { ...data, cardinality: value as Cardinality })}
        >
          <SelectTrigger id="relation-cardinality" className="h-8 w-full text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CARDINALITIES.map((cardinality) => (
              <SelectItem key={cardinality} value={cardinality}>
                {cardinality}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="relation-label" className="text-xs">
          Label
        </Label>
        <Input
          id="relation-label"
          disabled={readOnly}
          className="h-8 text-sm"
          placeholder="business meaning, e.g. syncs to, enriches"
          value={data.label ?? ''}
          onChange={(event) =>
            onChange(edge.id, {
              ...data,
              label: event.target.value.trim() === '' ? undefined : event.target.value,
            })
          }
        />
      </div>
    </div>
  );
}
