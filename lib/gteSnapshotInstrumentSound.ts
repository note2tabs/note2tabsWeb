/** Backend transport IDs describe the editor format, not necessarily its sound.
 * Only prefer metadata for those neutral transport IDs; ordinary live snapshots
 * retain their explicit sound even if older metadata is still present. */
export function snapshotInstrumentSound(lane: Record<string, unknown>): unknown {
  const metadata = lane.chordEditor && typeof lane.chordEditor === "object" && !Array.isArray(lane.chordEditor)
    ? lane.chordEditor as Record<string, unknown> : undefined;
  const type = lane.instrumentType ?? metadata?.instrumentType;
  const transport = type === "notation" ? "gm:piano" : type === "guitar-tab" ? "acoustic" : undefined;
  return transport && lane.instrumentId === transport && typeof metadata?.instrumentSound === "string" && metadata.instrumentSound.trim()
    ? metadata.instrumentSound : lane.instrumentId;
}
