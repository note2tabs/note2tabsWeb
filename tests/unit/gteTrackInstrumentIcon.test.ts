import { expect, it } from "vitest";
import { trackInstrumentIconKind } from "../../lib/gteTrackInstrumentIcon";

it.each([
  [{ instrumentId: "electric" }, "guitar"],
  [{ instrumentId: "acoustic" }, "guitar"],
  [{ trackType: "drums", instrumentId: "electric" }, "drums"],
  [{ trackType: "bass", instrumentId: "electric" }, "bass"],
  [{ instrumentId: "bass_overdrive" }, "bass"],
  [{ instrumentId: "gm:piano" }, "piano"],
  [{ instrumentId: "gm:strings" }, "strings"],
  [{ instrumentId: "gm:synth-pad" }, "synth"],
  [{ instrumentId: "gm:instrument" }, "instrument"],
  [{}, "guitar"],
] as const)("uses the instrument icon for %j", (lane, expected) => {
  expect(trackInstrumentIconKind(lane)).toBe(expected);
});
