import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {beginFrustrationAction,configureFrustrationSignals,monitorEditorEdit,monitorFrustrationPromise,resetFrustrationContext,noteFrustrationRetry} from '../../lib/frustrationSignals';
import {replaySessionSample} from '../../lib/replaySampling';
describe('bounded action-outcome frustration detection',()=>{
 const sink=vi.fn();
 beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(0);sink.mockClear();configureFrustrationSignals(sink);});
 afterEach(()=>{configureFrustrationSignals();vi.useRealTimers();vi.unstubAllGlobals();});
 it('flags three failed outcomes once, not successful rapid editing',()=>{
  for(let i=0;i<1000;i++)monitorEditorEdit(()=>1);
  expect(vi.getTimerCount()).toBe(0);expect(sink).not.toHaveBeenCalled();
  for(let i=0;i<8;i++)beginFrustrationAction('editor_save')('failed');
  expect(sink).toHaveBeenCalledTimes(1);expect(sink.mock.calls[0][0]).toMatchObject({action:'editor_save',attempts:3});
 });
 it('recognizes repeated attempts while one action is stalled, but not while it is still loading',()=>{
  const finish=beginFrustrationAction('editor_play',1000);noteFrustrationRetry('editor_play');noteFrustrationRetry('editor_play');
  expect(sink).not.toHaveBeenCalled();vi.advanceTimersByTime(1000);expect(sink).toHaveBeenCalledTimes(1);finish('success');
 });
 it('flags an acknowledged add-note attempt that produced no new note without throwing',()=>{
  for(let i=0;i<3;i++)expect(monitorEditorEdit(()=>({notes:[]}),value=>value.notes.length>0)).toEqual({notes:[]});
  expect(sink).toHaveBeenCalledTimes(1);
 });
 it('success breaks a failure streak; cancellation is not a failure',()=>{
  beginFrustrationAction('editor_play')('failed');beginFrustrationAction('editor_play')('failed');
  beginFrustrationAction('editor_play')('success');beginFrustrationAction('editor_play')('cancelled');beginFrustrationAction('editor_play')('failed');
  expect(sink).not.toHaveBeenCalled();
 });
 it('detects stalled repeated actions without double counting late failures',()=>{
  const finishes=Array.from({length:3},()=>beginFrustrationAction('editor_save',1000));
  vi.advanceTimersByTime(1000);expect(sink).toHaveBeenCalledTimes(1);
  finishes.forEach(finish=>finish('failed'));expect(sink).toHaveBeenCalledTimes(1);
 });
 it('clears timers on consent withdrawal and ignores old completions after re-enabling',()=>{
  const finish=beginFrustrationAction('editor_save');configureFrustrationSignals();expect(vi.getTimerCount()).toBe(0);
  configureFrustrationSignals(sink);finish('failed');finish('failed');finish('failed');expect(sink).not.toHaveBeenCalled();
 });
 it('does not attribute old actions to a new page',()=>{
  const finish=beginFrustrationAction('editor_save');resetFrustrationContext();finish('failed');
  expect(vi.getTimerCount()).toBe(0);expect(sink).not.toHaveBeenCalled();
 });
 it('caps in-flight work and suppresses background-tab timeout signals',()=>{
  vi.stubGlobal('document',{visibilityState:'hidden'});
  for(let i=0;i<1000;i++)beginFrustrationAction('editor_save');
  expect(vi.getTimerCount()).toBe(16);vi.advanceTimersByTime(30000);expect(sink).not.toHaveBeenCalled();
 });
 it('preserves results/errors even when analytics fails',async()=>{
  configureFrustrationSignals(()=>{throw Error('telemetry');});
  const error=Error('original');
  for(let i=0;i<3;i++)await expect(monitorFrustrationPromise('editor_import',async()=>{throw error;})).rejects.toBe(error);
  await expect(monitorFrustrationPromise('editor_import',async()=>42)).resolves.toBe(42);
 });
 it('keeps a stable 10% sample and fails closed without storage',()=>{
  const values=new Map<string,string>();const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
  expect(replaySessionSample(storage,.1,()=>.05)).toBe(true);expect(replaySessionSample(storage,.1,()=>.9)).toBe(true);
  expect(replaySessionSample({getItem:()=>{throw Error();},setItem:()=>{}},.1)).toBe(false);
 });
});
