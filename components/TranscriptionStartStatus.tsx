type TranscriptionStartStatusProps = {
  status: string;
};

export default function TranscriptionStartStatus({ status }: TranscriptionStartStatusProps) {
  return (
    <div className="transcription-start-panel" role="status" aria-live="polite">
      <div className="transcription-start-header">
        <span className="transcription-start-dot" aria-hidden="true" />
        <span>Starting transcription</span>
      </div>
      <div className="transcription-start-stage">
        <span className="transcription-thinking-text">{status}</span>
      </div>
      <div className="transcription-start-progress" aria-hidden="true">
        <span />
      </div>
      <p>
        Everything is working. This can take a moment while we upload and prepare your audio, so keep this tab open.
      </p>
    </div>
  );
}
