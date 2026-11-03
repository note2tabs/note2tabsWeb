import {expect,it} from 'vitest';
import {setNoteVibrato, playbackVibrato, vibratoSettings, VIBRATO_COVER_OPTIONS, vibratoBendOptions} from '../../lib/gteVibrato';
import {serializeNotationPayload,restoreNotationSnapshot} from '../../lib/gteNotationPersistence';
import {normalizeGuestSnapshot} from '../../lib/gteGuestDraft';
import {toolSelectionRule,toolAllowsSelection} from '../../lib/gteToolSelection';
import {buildPracticeTabLayout} from '../../lib/gtePracticeTabLayout';
import {buildPracticeTabEffects} from '../../lib/gtePracticeTabEffects';
import {buildEditorTabView} from '../../lib/gteEditorTabView';
import type {EditorSnapshot} from '../../types/gte';

function track(): EditorSnapshot {
  return {id:'tab',framesPerMessure:480,totalFrames:960,fps:240,notes:[
    {id:1,midiNum:64,tab:[0,0],startTime:0,length:600,optimals:[]},
    {id:2,midiNum:66,tab:[0,2],startTime:120,length:120,optimals:[]},
  ],chords:[],noteEffects:[{id:1,type:0,startNoteId:1,endNoteId:2,noteEffectLabel:'b'}],cutPositionsWithCoords:[],optimalsByTime:{}};
}
it('shows fractional dropdown choices while preserving stored numeric values and custom depths',()=>{
  expect(VIBRATO_COVER_OPTIONS.find(option=>option.value==='2')?.label).toBe('1/2');
  expect(VIBRATO_COVER_OPTIONS.find(option=>option.value==='32')?.label).toBe('1/32');
  expect(vibratoBendOptions(0.5).find(option=>option.value==='0.5')?.label).toBe('1/2');
  expect(vibratoBendOptions(0.4).find(option=>option.value==='0.4')?.label).toBe('2/5');
});
it('adds and removes independent vibrato without replacing a bend or changing pitches, fingerings or timing',()=>{
  const source=track(), before=structuredClone(source);
  setNoteVibrato(source,[1],true);
  expect(source.notes[0].vibrato).toBe(true); expect(source.notes[1].vibrato).toBeUndefined();
  expect(source.noteEffects).toEqual(before.noteEffects);
  setNoteVibrato(source,[1],false);
  expect(source.notes[0]).toEqual({...before.notes[0],vibrato:false});
});
it('survives APIs that normalize unknown note fields, guest reloads, and removal saves',()=>{
  const source=track(); setNoteVibrato(source,[1],true);
  const wire=serializeNotationPayload(source) as EditorSnapshot;
  const server={...wire,notes:wire.notes.map(({vibrato:_,...note})=>note)};
  expect(restoreNotationSnapshot(server).notes[0].vibrato).toBe(true);
  expect(normalizeGuestSnapshot(server,'tab').notes[0].vibrato).toBe(true);
  const removed=restoreNotationSnapshot(server); setNoteVibrato(removed,[1],false);
  const saved=serializeNotationPayload(removed) as EditorSnapshot;
  const reloaded=restoreNotationSnapshot({...saved,notes:saved.notes.map(({vibrato:_,...note})=>note)});
  expect(reloaded.notes[0].vibrato).not.toBe(true);
  expect(reloaded.noteEffects).toEqual(source.noteEffects);
});
it('allows one or many standalone notes on any strings, including after tool activation',()=>{
  const source=track(); source.notes[1].tab=[2,11]; source.notes[1].startTime=0;
  expect(toolSelectionRule('vibrato',source,[],[]).valid).toBe(false);
  expect(toolSelectionRule('vibrato',source,[1],[]).valid).toBe(true);
  expect(toolSelectionRule('vibrato',source,[1,2],[]).valid).toBe(true);
  expect(toolAllowsSelection('vibrato','chord')).toBe(false);
});
it('uses a per-note marker in Tab view and a wave alongside bend notation in Practice',()=>{
  const source=track(); setNoteVibrato(source,[1],true);
  const tab=buildEditorTabView(source,{framesPerBar:480,beatsPerBar:4,scale:1,playheadFrame:0});
  expect(tab.placements.find(note=>note.key==='note-1')?.vibrato).toBe(true);
  const layout=buildPracticeTabLayout(source,350), effects=buildPracticeTabEffects(source,layout);
  expect(effects.some(effect=>effect.kind==='bend')).toBe(true);
  const waves=effects.filter(effect=>effect.kind==='vibrato');
  expect(waves.length).toBeGreaterThan(0);
  expect(waves.every(effect=>effect.path.includes('q')&&!/NaN|Infinity/.test(effect.path))).toBe(true);
  expect(effects.find(effect=>effect.kind==='bend')?.hiddenFretKey).toBe('n:2');
});
it.each([0,12])('anchors vibrato above fret %s rather than after its number',fret=>{
  const source=track(); source.notes[0].tab=[0,fret]; source.notes[0].vibrato=true;
  const layout=buildPracticeTabLayout(source,800), placement=layout.frets.find(note=>note.key==='n:1')!;
  const wave=buildPracticeTabEffects(source,layout).find(effect=>effect.kind==='vibrato')!;
  const start=Number(wave.path.match(/^M(-?[\d.]+)/)![1]);
  expect(start).toBeCloseTo(placement.x-String(fret).length*3.5);
  expect(start).toBeLessThan(placement.x);
});

it('defaults to the final half, half-semitone depth and six cycles per beat, following tempo and speed', () => {
  const note = {...track().notes[0], startTime: 0, length: 480, vibrato: true};
  expect(vibratoSettings(note)).toEqual({cover:2,bend:0.5,cyclesPerBeat:6});
  const normal = playbackVibrato([note],0,480,(a,b)=>(b-a)/240,120)[0];
  expect(normal).toEqual({start:1,end:2,phase:0,frequency:12,cents:50});
  const fast = playbackVibrato([note],0,480,(a,b)=>(b-a)/480,120)[0];
  expect(fast.frequency).toBe(24); expect(fast.start).toBe(0.5);
});

it('clips at seeks and loop ends while retaining phase, and leaves unmarked notes unchanged', () => {
  const note = {...track().notes[0],startTime:0,length:480,vibrato:true};
  expect(playbackVibrato([note],300,420,(a,b)=>(b-a)/240,120)[0]).toEqual({start:0,end:0.5,phase:0.25,frequency:12,cents:50});
  expect(playbackVibrato([{...note,vibrato:false}],0,480,(a,b)=>(b-a)/240,120)).toEqual([]);
  expect(playbackVibrato([note],0,200,(a,b)=>(b-a)/240,120)).toEqual([]);
});

it('persists custom settings through a server that strips new note fields and guest normalization', () => {
  const source=track(); source.notes[0].vibrato=true;
  source.notes[0].vibratoSettings={cover:4,bend:0.4,cyclesPerBeat:2.5};
  const wire=serializeNotationPayload(source) as EditorSnapshot;
  const server={...wire,notes:wire.notes.map(({vibrato:_,vibratoSettings:__,...note})=>note)};
  expect(restoreNotationSnapshot(server).notes[0].vibratoSettings).toEqual(source.notes[0].vibratoSettings);
  expect(normalizeGuestSnapshot(source,'tab').notes[0].vibratoSettings).toEqual(source.notes[0].vibratoSettings);
  const result=playbackVibrato(restoreNotationSnapshot(server).notes,0,600,(a,b)=>(b-a)/240,120)[0];
  expect(result.start).toBe(450/240); expect(result.frequency).toBe(5); expect(result.cents).toBe(40);
});
