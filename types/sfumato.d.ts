declare module "sfumato" {
  export type GeneratorRange = {
    lo: number;
    hi: number;
  };

  export interface SoundfontSampleHeader {
    name: string;
    startLoop: number;
    endLoop: number;
    sampleRate: number;
    originalPitch: number;
    pitchCorrection: number;
    link: number;
    type: number;
  }

  export interface SoundfontSample {
    header: SoundfontSampleHeader;
    data: Int16Array;
  }

  export interface SoundfontZoneGenerators {
    sampleModes?: number;
    pan?: number;
    initialAttenuation?: number;
    overridingRootKey?: number;
    fineTune?: number;
    startloopAddrsOffset?: number;
    startloopAddrsCoarseOffset?: number;
    endloopAddrsOffset?: number;
    endloopAddrsCoarseOffset?: number;
    holdVolEnv?: number;
    attackVolEnv?: number;
    decayVolEnv?: number;
    sustainVolEnv?: number;
    releaseVolEnv?: number;
    [key: string]: number | GeneratorRange | undefined;
  }

  export interface SoundfontActiveZone {
    sample: SoundfontSample;
    mergedGenerators: SoundfontZoneGenerators;
  }

  export interface SoundfontPreset {
    header: {
      name: string;
      bank: number;
      preset: number;
    };
    zones: Array<unknown>;
    globalZone?: unknown;
  }

  export interface SoundfontBank {
    presets: Array<SoundfontPreset | undefined>;
  }

  export interface Soundfont {
    banks: Array<SoundfontBank | undefined>;
    presets: SoundfontPreset[];
  }

  export function loadSoundfont(url: string): Promise<Soundfont>;
  export function getActiveZones(preset: SoundfontPreset, midi: number): SoundfontActiveZone[];
}
