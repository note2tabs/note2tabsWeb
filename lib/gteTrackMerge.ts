type MergeableTrack = {
  id: string;
  name?: string;
};

export type TrackMergePlan = {
  laneIds: string[];
  name: string;
  targetIndex: number;
};

export function buildTrackMergePlan(
  tracks: MergeableTrack[],
  selectedLaneIds: string[]
): TrackMergePlan | null {
  const selectedIds = new Set(selectedLaneIds);
  const selectedTracks = tracks.filter((track) => selectedIds.has(track.id));
  if (selectedTracks.length < 2) return null;

  return {
    laneIds: selectedTracks.map((track) => track.id),
    name: selectedTracks.map((track) => track.name?.trim() || "Untitled track").join(" + "),
    targetIndex: tracks.findIndex((track) => track.id === selectedTracks[0].id),
  };
}
