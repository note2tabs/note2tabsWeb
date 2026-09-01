import { describe, expect, it } from "vitest";
import { classifyImportedInstrument } from "../../lib/gteInstrumentClassification";

describe("imported instrument classification", () => {
  it("classifies drums, bass, and guitar from MIDI metadata", () => {
    expect(classifyImportedInstrument({ percussion: true }).representation).toBe("drums");
    expect(classifyImportedInstrument({ midiProgram: 32 }).representation).toBe("bass");
    expect(classifyImportedInstrument({ midiProgram: 24 }).representation).toBe("guitar");
  });

  it("keeps other and unknown pitched instruments in notation", () => {
    expect(classifyImportedInstrument({ name: "Violin" }).representation).toBe("notation");
    expect(classifyImportedInstrument({}).representation).toBe("notation");
  });
});

