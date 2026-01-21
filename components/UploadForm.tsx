import { useRef, useState, useMemo, DragEvent, FormEvent, ChangeEvent } from "react";

type UploadFormProps = {
  onSubmit: (payload: { file?: File; youtubeUrl?: string }) => Promise<void>;
  loading?: boolean;
  serverError?: string | null;
};

const labelStyles =
  "block text-sm font-medium text-gray-700 mb-2";
const inputBase =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition";

export default function UploadForm({ onSubmit, loading = false, serverError }: UploadFormProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);

  const hasBoth = Boolean(selectedFile && youtubeUrl.trim());
  const isUrlValid = useMemo(() => youtubeUrl.trim().startsWith("http"), [youtubeUrl]);
  const canSubmit = !loading && !hasBoth && (Boolean(selectedFile) || isUrlValid);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setValidation(null);
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(true);
  };

  const onDragLeave = () => setDragActive(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (hasBoth) {
      setValidation("Please choose either an audio file OR a YouTube link, not both.");
      return;
    }
    if (!selectedFile && !isUrlValid) {
      setValidation("Add an audio file or a YouTube link to continue.");
      return;
    }
    setValidation(null);
    await onSubmit(
      selectedFile
        ? { file: selectedFile }
        : { youtubeUrl: youtubeUrl.trim() }
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className={labelStyles} htmlFor="fileInput">
          Audio file
        </label>
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`rounded-xl border border-dashed px-4 py-6 text-center transition ${
            dragActive ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-white"
          }`}
        >
          <p className="text-sm text-gray-700 font-semibold">Drag and drop an audio file</p>
          <p className="mt-2 text-xs text-gray-500">MP3, WAV, and common audio formats</p>
          <div className="mt-3 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => !loading && fileInputRef.current?.click()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              disabled={loading}
            >
              Choose audio file
            </button>
            {selectedFile && <span className="text-xs text-gray-600">{selectedFile.name}</span>}
          </div>
          <input
            id="fileInput"
            name="file"
            type="file"
            accept="audio/*"
            ref={fileInputRef}
            onChange={onFileChange}
            className="hidden"
            disabled={loading}
          />
        </div>
      </div>

      <div>
        <label className={labelStyles} htmlFor="youtubeUrl">
          YouTube link
        </label>
        <input
          id="youtubeUrl"
          name="youtubeUrl"
          type="text"
          placeholder="https://www.youtube.com/watch?v=..."
          value={youtubeUrl}
          onChange={(e) => {
            setYoutubeUrl(e.target.value);
            setValidation(null);
          }}
          className={inputBase}
          disabled={loading}
        />
      </div>

      {hasBoth && (
        <p className="text-sm text-red-600">
          Please choose either an audio file OR a YouTube link, not both.
        </p>
      )}
      {validation && <p className="text-sm text-red-600">{validation}</p>}
      {serverError && <p className="text-sm text-red-600">{serverError}</p>}

      <div className="space-y-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-xl bg-blue-600 px-4 py-3 text-base font-semibold text-white shadow-md transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
        >
          Convert to Tabs
        </button>
        {loading && <p className="text-center text-sm text-gray-600">Creating job...</p>}
      </div>
    </form>
  );
}
