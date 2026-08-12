type TranscriptionRecordingDetailsProps = {
  includesOtherInstruments: boolean;
  multipleGuitars: boolean;
  onIncludesOtherInstrumentsChange: (value: boolean) => void;
  onMultipleGuitarsChange: (value: boolean) => void;
  disabled?: boolean;
};

export default function TranscriptionRecordingDetails({
  includesOtherInstruments,
  multipleGuitars,
  onIncludesOtherInstrumentsChange,
  onMultipleGuitarsChange,
  disabled = false,
}: TranscriptionRecordingDetailsProps) {
  const summary = [
    includesOtherInstruments ? "backing instruments" : "focused guitar",
    multipleGuitars ? "multiple guitars" : "one guitar",
  ].join(" · ");

  return (
    <details className="recording-details">
      <summary>
        <span>Recording details</span>
        <small>{summary}</small>
      </summary>
      <div className="recording-details__options">
        <label className="recording-details__option">
          <span>
            <strong>Other instruments are present</strong>
            <small>Isolate the guitar before transcription.</small>
          </span>
          <input
            type="checkbox"
            checked={includesOtherInstruments}
            onChange={(event) => onIncludesOtherInstrumentsChange(event.target.checked)}
            disabled={disabled}
          />
        </label>
        <label className="recording-details__option">
          <span>
            <strong>More than one guitar is present</strong>
            <small>Return separate guitar tracks when possible.</small>
          </span>
          <input
            type="checkbox"
            checked={multipleGuitars}
            onChange={(event) => onMultipleGuitarsChange(event.target.checked)}
            disabled={disabled}
          />
        </label>
      </div>
    </details>
  );
}

