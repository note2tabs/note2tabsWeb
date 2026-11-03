import {expect,it} from 'vitest';
import {setNoteVibrato} from '../../lib/gteVibrato';
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
