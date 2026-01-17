import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/apiClient";
import type {
  ChordAlternativesResponse,
  EditorSnapshot,
  NoteOptimalsResponse,
  SnapshotResponse,
} from "../lib/editorTypes";

type EditorWorkspaceProps = {
  editorId: string;
};

export default function EditorWorkspace({ editorId }: EditorWorkspaceProps) {
  const [snapshot, setSnapshot] = useState<EditorSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [selectedNoteIds, setSelectedNoteIds] = useState<number[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<number | null>(null);
  const [activeChordId, setActiveChordId] = useState<number | null>(null);
  const [optimals, setOptimals] = useState<NoteOptimalsResponse | null>(null);
  const [alternatives, setAlternatives] = useState<ChordAlternativesResponse | null>(null);
  const [noteForm, setNoteForm] = useState({ string: 0, fret: 0, startTime: 0, length: 1 });
  const [editNoteForm, setEditNoteForm] = useState({ string: 0, fret: 0, startTime: 0, length: 1 });
  const [editChordForm, setEditChordForm] = useState({ startTime: 0, length: 1 });
  const [cutInsertTime, setCutInsertTime] = useState(1);
  const [cutBoundaryIndex, setCutBoundaryIndex] = useState(0);
  const [cutBoundaryTime, setCutBoundaryTime] = useState(1);

  const notes = useMemo(() => snapshot?.notes || [], [snapshot]);
  const chords = useMemo(() => snapshot?.chords || [], [snapshot]);
  const cutSegments = useMemo(() => snapshot?.cutPositionsWithCoords || [], [snapshot]);

  const loadSnapshot = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<EditorSnapshot>(`/api/backend/v1/editors/${editorId}`, {
        method: "GET",
        retries: 1,
      });
      setSnapshot(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load editor.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSnapshot();
  }, [editorId]);

  useEffect(() => {
    if (!saving) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saving]);

  useEffect(() => {
    if (!activeNoteId) return;
    const note = notes.find((n) => n.id === activeNoteId);
    if (note) {
      setEditNoteForm({
        string: note.tab[0],
        fret: note.tab[1],
        startTime: note.startTime,
        length: note.length,
      });
    }
  }, [activeNoteId, notes]);

  useEffect(() => {
    setOptimals(null);
  }, [activeNoteId]);

  useEffect(() => {
    if (!activeChordId) return;
    const chord = chords.find((c) => c.id === activeChordId);
    if (chord) {
      setEditChordForm({ startTime: chord.startTime, length: chord.length });
    }
  }, [activeChordId, chords]);

  useEffect(() => {
    setAlternatives(null);
  }, [activeChordId]);

  const runMutation = async (fn: () => Promise<SnapshotResponse>) => {
    setSaving(true);
    setStatus("Saving...");
    setError(null);
    try {
      const data = await fn();
      setSnapshot(data.snapshot);
      setStatus("Saved");
      setTimeout(() => setStatus(null), 1500);
      return true;
    } catch (err: any) {
      setError(err?.message || "Update failed.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleAddNote = async () => {
    await runMutation(() =>
      apiFetch<SnapshotResponse>(`/api/backend/v1/editors/${editorId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tab: [Number(noteForm.string), Number(noteForm.fret)],
          startTime: Number(noteForm.startTime),
          length: Number(noteForm.length),
        }),
      })
    );
  };

  const handleDeleteNote = async (noteId: number) => {
    const ok = await runMutation(() =>
      apiFetch<SnapshotResponse>(`/api/backend/v1/editors/${editorId}/notes/${noteId}`, {
        method: "DELETE",
      })
    );
    if (ok) {
      setSelectedNoteIds((prev) => prev.filter((id) => id !== noteId));
      if (activeNoteId === noteId) {
        setActiveNoteId(null);
      }
    }
  };

  const handleUpdateNote = async () => {
    if (activeNoteId === null) return;
    const ok = await runMutation(() =>
      apiFetch<SnapshotResponse>(`/api/backend/v1/editors/${editorId}/notes/${activeNoteId}/assign_tab`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tab: [Number(editNoteForm.string), Number(editNoteForm.fret)] }),
      })
    );
    if (!ok) return;
    const okStart = await runMutation(() =>
      apiFetch<SnapshotResponse>(`/api/backend/v1/editors/${editorId}/notes/${activeNoteId}/set_start_time`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startTime: Number(editNoteForm.startTime) }),
      })
    );
    if (!okStart) return;
    await runMutation(() =>
      apiFetch<SnapshotResponse>(`/api/backend/v1/editors/${editorId}/notes/${activeNoteId}/set_length`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ length: Number(editNoteForm.length) }),
      })
    );
  };

  const handleFetchOptimals = async () => {
    if (!activeNoteId) return;
    setError(null);
    try {
      const data = await apiFetch<NoteOptimalsResponse>(
        `/api/backend/v1/editors/${editorId}/notes/${activeNoteId}/optimals`,
        { method: "GET", retries: 1 }
      );
      setOptimals(data);
    } catch (err: any) {
      setError(err?.message || "Failed to fetch optimals.");
    }
  };

  const handleAssignOptimal = async (tab: [number, number]) => {
    if (!activeNoteId) return;
    await runMutation(() =>
      apiFetch<SnapshotResponse>(`/api/backend/v1/editors/${editorId}/notes/${activeNoteId}/assign_tab`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tab }),
      })
    );
  };

  const handleAssignOptimals = async () => {
    if (!selectedNoteIds.length) return;
    await runMutation(() =>
      apiFetch<SnapshotResponse>(`/api/backend/v1/editors/${editorId}/optimals/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteIds: selectedNoteIds }),
      })
    );
  };

  const handleMakeChord = async () => {
    if (selectedNoteIds.length < 2) {
      setError("Select at least two notes to create a chord.");
      return;
    }
    await runMutation(() =>
      apiFetch<SnapshotResponse>(`/api/backend/v1/editors/${editorId}/chords`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteIds: selectedNoteIds }),
      })
    );
    setSelectedNoteIds([]);
  };

  const handleDisbandChord = async (chordId: number) => {
    await runMutation(() =>
      apiFetch<SnapshotResponse>(`/api/backend/v1/editors/${editorId}/chords/${chordId}/disband`, {
        method: "POST",
      })
    );
  };

  const handleDeleteChord = async (chordId: number) => {
    const ok = await runMutation(() =>
      apiFetch<SnapshotResponse>(`/api/backend/v1/editors/${editorId}/chords/${chordId}`, {
        method: "DELETE",
      })
    );
    if (ok && activeChordId === chordId) {
      setActiveChordId(null);
    }
  };

  const handleUpdateChord = async () => {
    if (activeChordId === null) return;
    const ok = await runMutation(() =>
      apiFetch<SnapshotResponse>(`/api/backend/v1/editors/${editorId}/chords/${activeChordId}/set_start_time`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startTime: Number(editChordForm.startTime) }),
      })
    );
    if (!ok) return;
    await runMutation(() =>
      apiFetch<SnapshotResponse>(`/api/backend/v1/editors/${editorId}/chords/${activeChordId}/set_length`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ length: Number(editChordForm.length) }),
      })
    );
  };

  const handleFetchAlternatives = async () => {
    if (!activeChordId) return;
    setError(null);
    try {
      const data = await apiFetch<ChordAlternativesResponse>(
        `/api/backend/v1/editors/${editorId}/chords/${activeChordId}/alternatives`,
        { method: "GET", retries: 1 }
      );
      setAlternatives(data);
    } catch (err: any) {
      setError(err?.message || "Failed to fetch alternatives.");
    }
  };

  const handleApplyAlternative = async (tabs: [number, number][]) => {
    if (!activeChordId) return;
    await runMutation(() =>
      apiFetch<SnapshotResponse>(`/api/backend/v1/editors/${editorId}/chords/${activeChordId}/tabs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabs }),
      })
    );
  };

  const handleGenerateCuts = async () => {
    await runMutation(() =>
      apiFetch<SnapshotResponse>(`/api/backend/v1/editors/${editorId}/cuts/generate`, {
        method: "POST",
      })
    );
  };

  const handleInsertCut = async () => {
    await runMutation(() =>
      apiFetch<SnapshotResponse>(`/api/backend/v1/editors/${editorId}/cuts/insert_at`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ time: Number(cutInsertTime) }),
      })
    );
  };

  const handleShiftBoundary = async () => {
    await runMutation(() =>
      apiFetch<SnapshotResponse>(`/api/backend/v1/editors/${editorId}/cuts/shift_boundary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boundaryIndex: Number(cutBoundaryIndex), newTime: Number(cutBoundaryTime) }),
      })
    );
  };

  const handleDeleteBoundary = async () => {
    await runMutation(() =>
      apiFetch<SnapshotResponse>(`/api/backend/v1/editors/${editorId}/cuts/delete_boundary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boundaryIndex: Number(cutBoundaryIndex) }),
      })
    );
  };

  const toggleNoteSelection = (noteId: number) => {
    setSelectedNoteIds((prev) =>
      prev.includes(noteId) ? prev.filter((id) => id !== noteId) : [...prev, noteId]
    );
    setActiveNoteId(noteId);
  };

  const renderCoord = (coord: [number, number]) => `S${coord[0]} F${coord[1]}`;

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 text-slate-200">
        Loading editor…
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-6 text-red-200">
        {error || "Editor not found."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-400">Editor ID</p>
            <p className="text-lg font-semibold">{snapshot.id}</p>
            <p className="text-xs text-slate-500">Version {snapshot.version}</p>
          </div>
          <button
            type="button"
            onClick={loadSnapshot}
            className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-800"
          >
            Refresh
          </button>
        </div>
        {status && <p className="mt-3 text-xs text-emerald-300">{status}</p>}
        {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4">
          <h2 className="text-lg font-semibold">Add note</h2>
          <div className="grid gap-3 md:grid-cols-4">
            {[
              { label: "String", key: "string" },
              { label: "Fret", key: "fret" },
              { label: "Start", key: "startTime" },
              { label: "Length", key: "length" },
            ].map((field) => (
              <label key={field.key} className="text-xs text-slate-300">
                {field.label}
                <input
                  type="number"
                  value={(noteForm as any)[field.key]}
                  onChange={(e) =>
                    setNoteForm((prev) => ({ ...prev, [field.key]: Number(e.target.value) }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-sm"
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={handleAddNote}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
          >
            Add note
          </button>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4">
          <h2 className="text-lg font-semibold">Cut segments</h2>
          <div className="space-y-2 text-xs text-slate-300">
            {cutSegments.map((seg, idx) => (
              <div key={`${seg[0][0]}-${idx}`} className="flex items-center justify-between">
                <span>
                  {idx}. {seg[0][0]} → {seg[0][1]} · {renderCoord(seg[1])}
                </span>
              </div>
            ))}
            {cutSegments.length === 0 && <p>No cut segments yet.</p>}
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              onClick={handleGenerateCuts}
              disabled={saving}
              className="rounded-lg border border-slate-700 px-3 py-2 text-slate-100 hover:bg-slate-800"
            >
              Auto-generate
            </button>
            <label className="flex items-center gap-2">
              Insert at
              <input
                type="number"
                value={cutInsertTime}
                onChange={(e) => setCutInsertTime(Number(e.target.value))}
                className="w-20 rounded border border-slate-700 bg-slate-800 px-2 py-1"
              />
            </label>
            <button
              type="button"
              onClick={handleInsertCut}
              disabled={saving}
              className="rounded-lg bg-slate-700 px-3 py-2 text-slate-100 hover:bg-slate-600"
            >
              Insert cut
            </button>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <label className="flex items-center gap-2">
              Boundary index
              <input
                type="number"
                value={cutBoundaryIndex}
                onChange={(e) => setCutBoundaryIndex(Number(e.target.value))}
                className="w-16 rounded border border-slate-700 bg-slate-800 px-2 py-1"
              />
            </label>
            <label className="flex items-center gap-2">
              New time
              <input
                type="number"
                value={cutBoundaryTime}
                onChange={(e) => setCutBoundaryTime(Number(e.target.value))}
                className="w-20 rounded border border-slate-700 bg-slate-800 px-2 py-1"
              />
            </label>
            <button
              type="button"
              onClick={handleShiftBoundary}
              disabled={saving}
              className="rounded-lg bg-slate-700 px-3 py-2 text-slate-100 hover:bg-slate-600"
            >
              Shift boundary
            </button>
            <button
              type="button"
              onClick={handleDeleteBoundary}
              disabled={saving}
              className="rounded-lg border border-red-500/60 px-3 py-2 text-red-200 hover:bg-red-500/10"
            >
              Delete boundary
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Notes</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleAssignOptimals}
              disabled={saving || selectedNoteIds.length === 0}
              className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-800 disabled:opacity-50"
            >
              Assign optimals
            </button>
            <button
              type="button"
              onClick={handleMakeChord}
              disabled={saving || selectedNoteIds.length < 2}
              className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              Make chord
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-slate-200">
            <thead className="text-slate-400">
              <tr>
                <th className="py-2 text-left">Select</th>
                <th className="py-2 text-left">ID</th>
                <th className="py-2 text-left">Tab</th>
                <th className="py-2 text-left">Start</th>
                <th className="py-2 text-left">Length</th>
                <th className="py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {notes.map((note) => (
                <tr key={note.id} className="border-t border-slate-800">
                  <td className="py-2">
                    <input
                      type="checkbox"
                      checked={selectedNoteIds.includes(note.id)}
                      onChange={() => toggleNoteSelection(note.id)}
                    />
                  </td>
                  <td className="py-2">{note.id}</td>
                  <td className="py-2">{renderCoord(note.tab)}</td>
                  <td className="py-2">{note.startTime}</td>
                  <td className="py-2">{note.length}</td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => handleDeleteNote(note.id)}
                      className="text-red-300 hover:text-red-200"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {notes.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-3 text-slate-400">
                    No notes yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {activeNoteId && (
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
            <h3 className="text-sm font-semibold">Edit note {activeNoteId}</h3>
            <div className="grid gap-3 md:grid-cols-4">
              {[
                { label: "String", key: "string" },
                { label: "Fret", key: "fret" },
                { label: "Start", key: "startTime" },
                { label: "Length", key: "length" },
              ].map((field) => (
                <label key={field.key} className="text-xs text-slate-300">
                  {field.label}
                  <input
                    type="number"
                    value={(editNoteForm as any)[field.key]}
                    onChange={(e) =>
                      setEditNoteForm((prev) => ({ ...prev, [field.key]: Number(e.target.value) }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-sm"
                  />
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleUpdateNote}
                disabled={saving}
                className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
              >
                Save note
              </button>
              <button
                type="button"
                onClick={handleFetchOptimals}
                disabled={saving}
                className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-800"
              >
                Fetch alternates
              </button>
            </div>
            {optimals && (
              <div className="grid gap-3 md:grid-cols-2 text-xs text-slate-300">
                <div>
                  <p className="font-semibold text-slate-200">Playable</p>
                  <div className="flex flex-wrap gap-2">
                    {optimals.possibleTabs.map((tab, idx) => (
                      <button
                        key={`p-${idx}`}
                        type="button"
                        onClick={() => handleAssignOptimal(tab)}
                        className="rounded border border-slate-700 px-2 py-1 hover:bg-slate-800"
                      >
                        {renderCoord(tab)}
                      </button>
                    ))}
                    {optimals.possibleTabs.length === 0 && <span>None</span>}
                  </div>
                </div>
                <div>
                  <p className="font-semibold text-red-300">Blocked</p>
                  <div className="flex flex-wrap gap-2">
                    {optimals.blockedTabs.map((tab, idx) => (
                      <span key={`b-${idx}`} className="rounded border border-red-500/50 px-2 py-1 text-red-200">
                        {renderCoord(tab)}
                      </span>
                    ))}
                    {optimals.blockedTabs.length === 0 && <span>None</span>}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4">
        <h2 className="text-lg font-semibold">Chords</h2>
        <div className="space-y-2">
          {chords.map((chord) => (
            <div
              key={chord.id}
              className={`rounded-lg border p-3 text-xs ${
                chord.id === activeChordId ? "border-blue-500/70 bg-slate-950/60" : "border-slate-800"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setActiveChordId(chord.id)}
                  className="text-left font-semibold text-slate-100"
                >
                  Chord {chord.id}
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleDisbandChord(chord.id)}
                    className="text-slate-200 hover:text-slate-100"
                  >
                    Disband
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteChord(chord.id)}
                    className="text-red-300 hover:text-red-200"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <p className="mt-1 text-slate-400">
                Start {chord.startTime} · Length {chord.length}
              </p>
              <p className="mt-1 text-slate-300">
                Tabs: {chord.currentTabs.map(renderCoord).join(", ")}
              </p>
            </div>
          ))}
          {chords.length === 0 && <p className="text-xs text-slate-400">No chords yet.</p>}
        </div>

        {activeChordId && (
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
            <h3 className="text-sm font-semibold">Edit chord {activeChordId}</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs text-slate-300">
                Start
                <input
                  type="number"
                  value={editChordForm.startTime}
                  onChange={(e) => setEditChordForm((prev) => ({ ...prev, startTime: Number(e.target.value) }))}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs text-slate-300">
                Length
                <input
                  type="number"
                  value={editChordForm.length}
                  onChange={(e) => setEditChordForm((prev) => ({ ...prev, length: Number(e.target.value) }))}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-sm"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleUpdateChord}
                disabled={saving}
                className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
              >
                Save chord
              </button>
              <button
                type="button"
                onClick={handleFetchAlternatives}
                disabled={saving}
                className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-800"
              >
                Fetch alternates
              </button>
            </div>
            {alternatives && (
              <div className="flex flex-wrap gap-2 text-xs text-slate-300">
                {alternatives.alternatives.slice(0, 8).map((tabs, idx) => (
                  <button
                    key={`alt-${idx}`}
                    type="button"
                    onClick={() => handleApplyAlternative(tabs)}
                    className="rounded border border-slate-700 px-2 py-1 hover:bg-slate-800"
                  >
                    {tabs.map(renderCoord).join(" ")}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
