/** Avoid preference-store queries for acknowledgement-only API responses. */
export function hasGteSnapshotPayload(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string,unknown>;
  return Array.isArray(record.editors) || Array.isArray(record.notes) ||
    Boolean(record.canvas && hasGteSnapshotPayload(record.canvas)) ||
    Boolean(record.snapshot && hasGteSnapshotPayload(record.snapshot));
}

/** A note edit need not rewrite settings that are unchanged from its confirmed base. */
export function snapshotPreferencesChanged(snapshot: unknown, base: unknown, fields: string[]): boolean {
  const project = (value: unknown) => {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string,unknown>;
    const lanes = Array.isArray(record.editors) ? record.editors : Array.isArray(record.notes) ? [record] : null;
    if (!lanes) return null;
    return lanes.map(lane => {
      if (!lane || typeof lane !== "object") return null;
      const row = lane as Record<string,unknown>;
      return [row.id, ...fields.map(field=>row[field])];
    }).sort((a,b)=>String(a?.[0]).localeCompare(String(b?.[0])));
  };
  const next = project(snapshot), previous = project(base);
  return !next || !previous || JSON.stringify(next) !== JSON.stringify(previous);
}
