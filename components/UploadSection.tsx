import { useMemo, useRef, useState, DragEvent, FormEvent } from "react";

type UploadSectionProps = {
  onResult: (segments: string[][], sourceLabel: string, audioUrl?: string) => void;
};

const BASE_URL = "http://127.0.0.1:8000";

const parseOptionalNumber = (value: string): number | null => {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export default function UploadSection({ onResult }: UploadSectionProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [startTime, setStartTime] = useState<number | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [separateGuitar, setSeparateGuitar] = useState(false);
  const [clipLocalFirst, setClipLocalFirst] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasFile = Boolean(selectedFile);
  const urlValid = youtubeUrl.trim().startsWith("http");
  const hasBoth = hasFile && urlValid;

  const canSubmit = useMemo(() => {
    if (processing) return false;
    if (hasBoth) return false;
    return hasFile || urlValid;
  }, [processing, hasBoth, hasFile, urlValid]);

  const resetError = () => setError(null);

  const handleFileChange = (file?: File | null) => {
    setSelectedFile(file ?? null);
    resetError();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (processing) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileChange(file);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!processing) setDragActive(true);
  };

  const handleDragLeave = () => setDragActive(false);

  const validateInputs = () => {
    if (hasBoth) {
      setError("Please choose either an audio file OR a YouTube link, not both.");
      return false;
    }
    if (!hasFile && !urlValid) {
      setError("Add an audio file or a YouTube link to continue.");
      return false;
    }
    if (urlValid || clipLocalFirst) {
      if (startTime !== null && startTime < 0) {
        setError("Start time must be 0 or greater.");
        return false;
      }
      if (duration !== null && duration <= 0) {
        setError("Duration must be greater than 0.");
        return false;
      }
    }
    return true;
  };

  const processAudio = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${BASE_URL}/process_audio/`, {
      method: "POST",
      body: formData
    });
    if (!response.ok) {
      throw new Error("Failed to process audio.");
    }
    const data = await response.json();
    const segments = Array.isArray(data?.result) ? (data.result as string[][]) : [];
    if (!segments.length) {
      throw new Error("No tabs returned.");
    }
    return segments;
  };

  const fetchFromYoutube = async () => {
    const formData = new FormData();
    formData.append("link", youtubeUrl.trim());
    if (startTime !== null) {
      formData.append("start_time", String(startTime));
    }
    if (duration !== null) {
      formData.append("duration", String(duration));
    }
    formData.append("separate_guitar", separateGuitar ? "true" : "false");

    const response = await fetch(`${BASE_URL}/yt_processor`, {
      method: "POST",
      body: formData
    });
    if (!response.ok) {
      throw new Error("Failed to process YouTube link.");
    }
    return response.blob();
  };

  const clipLocalFile = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    if (startTime !== null) {
      formData.append("start_time", String(startTime));
    }
    if (duration !== null) {
      formData.append("duration", String(duration));
    }
    formData.append("separate_guitar", separateGuitar ? "true" : "false");

    const response = await fetch(`${BASE_URL}/file_processor/`, {
      method: "POST",
      body: formData
    });
    if (!response.ok) {
      throw new Error("Failed to clip local file.");
    }
    return response.blob();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validateInputs()) return;
    resetError();
    setProcessing(true);

    try {
      if (urlValid) {
        const blob = await fetchFromYoutube();
        const fileFromYt = new File([blob], "yt_segment.wav", { type: "audio/wav" });
        const segments = await processAudio(fileFromYt);
        const audioUrl = URL.createObjectURL(blob);
        onResult(segments, youtubeUrl.trim(), audioUrl);
      } else if (selectedFile) {
        if (clipLocalFirst) {
          const clippedBlob = await clipLocalFile(selectedFile);
          const clippedFile = new File([clippedBlob], selectedFile.name || "clipped_audio.wav", {
            type: clippedBlob.type || "audio/wav"
          });
          const segments = await processAudio(clippedFile);
          const audioUrl = URL.createObjectURL(clippedBlob);
          onResult(segments, `${selectedFile.name} (clipped)`, audioUrl);
        } else {
          const segments = await processAudio(selectedFile);
          const audioUrl = URL.createObjectURL(selectedFile);
          onResult(segments, selectedFile.name, audioUrl);
        }
      }
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div
          className={`rounded-xl border-2 border-dashed p-4 transition ${
            dragActive
              ? "border-blue-500 bg-white"
              : "border-slate-200 bg-white"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Upload audio file</p>
              <p className="text-xs text-slate-600">MP3 or WAV - drag & drop supported</p>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-900 transition hover:border-blue-500 hover:text-blue-100 disabled:opacity-50"
              disabled={processing}
            >
              Choose file
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-600" aria-live="polite">
            {selectedFile ? selectedFile.name : "No file selected"}
          </p>
          <input
            ref={fileInputRef}
            id="fileInput"
            name="fileInput"
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
            disabled={processing}
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <label htmlFor="youtubeUrl" className="block text-sm font-semibold text-slate-900">
            YouTube link
          </label>
          <input
            id="youtubeUrl"
            name="youtubeUrl"
            type="text"
            placeholder="https://www.youtube.com/watch?v=..."
            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition"
            value={youtubeUrl}
            onChange={(e) => {
              setYoutubeUrl(e.target.value);
              resetError();
            }}
            disabled={processing}
          />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-600" htmlFor="startTime">
                Start time (seconds)
              </label>
              <input
                id="startTime"
                type="number"
                step="0.1"
                value={startTime ?? ""}
                onChange={(e) => setStartTime(parseOptionalNumber(e.target.value))}
                disabled={processing}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition"
              />
            </div>
            <div>
              <label className="text-xs text-slate-600" htmlFor="duration">
                Duration (seconds)
              </label>
              <input
                id="duration"
                type="number"
                step="0.1"
                value={duration ?? ""}
                onChange={(e) => setDuration(parseOptionalNumber(e.target.value))}
                disabled={processing}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition"
              />
            </div>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-200 bg-white text-blue-500 focus:ring-blue-500"
              checked={separateGuitar}
              onChange={(e) => setSeparateGuitar(e.target.checked)}
              disabled={processing}
            />
              Separate guitar (Demucs)
            </label>
          <label className="mt-2 flex items-center gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-200 bg-white text-blue-500 focus:ring-blue-500"
              checked={clipLocalFirst}
              onChange={(e) => setClipLocalFirst(e.target.checked)}
              disabled={processing}
            />
            Clip local file before transcription
          </label>
        </div>
      </div>

      {hasBoth && (
        <p className="text-sm text-amber-400">
          Please choose either an audio file OR a YouTube link, not both.
        </p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="space-y-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex w-full items-center justify-center rounded-xl bg-blue-500 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-blue-500/30 transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {processing ? "Processing..." : "Convert to Tabs"}
        </button>
        <p className="text-center text-xs text-slate-500">
          We never force the file picker when you paste URLs. Use one input at a time.
        </p>
      </div>
    </form>
  );
}
