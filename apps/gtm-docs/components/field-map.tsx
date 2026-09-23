export interface FieldMapping {
  source: string;
  /** Transform applied in flight, e.g. "lowercase + trim". Omit for pass-through. */
  transform?: string;
  destination: string;
  note?: string;
}

export interface FieldMapProps {
  /** e.g. "HubSpot Contact → Clay Row" */
  title?: string;
  mappings: FieldMapping[];
}

/**
 * Source → transform → destination field mapping table — the recurring
 * artifact of every GTM integration design record.
 */
export function FieldMap({ title, mappings }: FieldMapProps) {
  return (
    <div className="not-prose my-6 overflow-x-auto rounded-lg border border-fd-border">
      {title ? (
        <div className="border-b border-fd-border px-4 py-3 text-sm font-semibold text-fd-foreground">
          {title}
        </div>
      ) : null}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-fd-border text-left text-xs text-fd-muted-foreground">
            <th className="px-4 py-2 font-medium">Source field</th>
            <th className="px-4 py-2 font-medium">Transform</th>
            <th className="px-4 py-2 font-medium">Destination field</th>
            <th className="px-4 py-2 font-medium">Note</th>
          </tr>
        </thead>
        <tbody>
          {mappings.map((mapping, index) => (
            <tr key={`${mapping.source}-${index}`} className="border-b border-fd-border/60 last:border-0">
              <td className="px-4 py-2 font-mono text-[13px] text-fd-foreground">
                {mapping.source}
              </td>
              <td className="px-4 py-2 text-fd-muted-foreground">
                {mapping.transform ?? <span className="text-fd-muted-foreground/60">—</span>}
              </td>
              <td className="px-4 py-2 font-mono text-[13px] text-fd-foreground">
                {mapping.destination}
              </td>
              <td className="px-4 py-2 text-fd-muted-foreground">{mapping.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
