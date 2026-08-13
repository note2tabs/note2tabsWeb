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
  return (
    <div className="recording-options" role="group" aria-label="Audio options">
      <label className="recording-option">
        <input
          type="checkbox"
          checked={includesOtherInstruments}
          onChange={(event) => onIncludesOtherInstrumentsChange(event.target.checked)}
          disabled={disabled}
        />
        <span>Separate guitar from other instruments</span>
      </label>
      <label className="recording-option">
        <input
          type="checkbox"
          checked={multipleGuitars}
          onChange={(event) => onMultipleGuitarsChange(event.target.checked)}
          disabled={disabled}
        />
        <span>Multiple guitars</span>
      </label>
    </div>
  );
}
