import {expect,it,vi} from 'vitest';
import {applyVibratoAutomation, schedulePreparedTrackNote, type PreparedTrackInstrument} from '../../lib/gteSamplePlayback';

const param=()=>({setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),setValueCurveAtTime:vi.fn()});
it('automates only the covered tail, ramps smoothly, and returns to the base pitch',()=>{
  const detune=param();
  applyVibratoAutomation(detune as unknown as AudioParam,10,2,[{start:1,end:2,phase:0,frequency:6,cents:25}]);
  const [curve,start,duration]=detune.setValueCurveAtTime.mock.calls[0] as [Float32Array,number,number];
  expect(start).toBe(10);expect(duration).toBe(2);
  expect([...curve.slice(0,241)].every(value=>value===0)).toBe(true);
  expect(Math.max(...curve)).toBeGreaterThan(24);expect(Math.max(...curve)).toBeLessThanOrEqual(25);
  expect(curve.at(-1)).toBe(0);expect(detune.setValueAtTime).toHaveBeenCalledWith(0,12);
});
it.each(['opus','synth'] as const)('combines vibrato with bends for %s and stops the source',kind=>{
  const detune=param(), rate=param(),frequency=param();
  const source={detune,playbackRate:rate,frequency,connect:vi.fn(),start:vi.fn(),stop:vi.fn(),buffer:null,loop:false};
  const amp={gain:param(),connect:vi.fn()};
  const ctx={createBufferSource:()=>source,createOscillator:()=>source,createGain:()=>amp};
  const instrument={kind,option:{id:'test',gain:1},samples:[{midi:60,buffer:{duration:1}}]} as unknown as PreparedTrackInstrument;
  schedulePreparedTrackNote({ctx:ctx as unknown as AudioContext,destination:{} as AudioNode,instrument,midi:60,gain:0.5,startTime:10,duration:2,bendSegments:[{holdSec:0.5,bendSec:0.2,targetCents:200}],vibrato:[{start:1,end:2,phase:0,frequency:6,cents:25}]});
  expect(detune.setValueCurveAtTime).toHaveBeenCalledOnce();
  expect((kind==='opus'?rate:frequency).linearRampToValueAtTime).toHaveBeenCalled();
  expect(source.stop).toHaveBeenCalled();
  if(kind==='opus')expect(source.loop).toBe(true);
});
it('does not schedule modulation for ordinary notes',()=>{
  const detune=param();applyVibratoAutomation(detune as unknown as AudioParam,0,2);
  expect(detune.setValueCurveAtTime).not.toHaveBeenCalled();
});
