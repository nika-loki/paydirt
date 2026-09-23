/**
 * DataModel kit types — GTM-tuned entity/field/relation schema.
 *
 * Written with zero app-specific imports so the kit can later move to
 * `packages/gtm-docs-kit` as-is.
 */

export type FieldType =
  | 'id'
  | 'string'
  | 'email'
  | 'phone'
  | 'url'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'enum'
  | 'array'
  | 'object';

export const FIELD_TYPES: readonly FieldType[] = [
  'id',
  'string',
  'email',
  'phone',
  'url',
  'number',
  'boolean',
  'date',
  'datetime',
  'enum',
  'array',
  'object',
] as const;

export interface DataField {
  name: string;
  type: FieldType;
  /** Identity / primary key of the object. */
  key?: boolean;
  unique?: boolean;
  /**
   * Personal data. Rendered with a distinct lock treatment in both the diagram
   * and the field dictionary — paydirt's trust model made visible in the data
   * model itself.
   */
  pii?: boolean;
  description?: string;
  /** Allowed values when `type` is `enum`. */
  enumValues?: string[];
}

export interface DataEntity {
  /** Display name, e.g. "HubSpot Contact". */
  name: string;
  /** Owning system, e.g. "HubSpot" — shown as a chip on the dictionary card. */
  source?: string;
  description?: string;
  fields: DataField[];
}

export type Cardinality = 'one-to-one' | 'one-to-many' | 'many-to-many';

export const CARDINALITIES: readonly Cardinality[] = [
  'one-to-one',
  'one-to-many',
  'many-to-many',
] as const;

export interface DataRelation {
  /** Entity `name` on the "one"/source side. */
  from: string;
  to: string;
  cardinality: Cardinality;
  /** Business meaning, e.g. "syncs to", "enriches", "creates". */
  label?: string;
}

export interface DataModelProps {
  entities: DataEntity[];
  relations?: DataRelation[];
  caption?: string;
}
