import {expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {getTabMidi} from '../../lib/gteTuning';

const source=readFileSync('components/GteWorkspace.tsx','utf8');
const ast=ts.createSourceFile('workspace.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function evaluate(text:string,context:Record<string,any>) {
  return vm.runInNewContext(ts.transpileModule(`(${text})`,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,context);
}
function action(name:string,context:Record<string,any>) {
  let text='';const visit=(node:ts.Node)=>{if(ts.isFunctionDeclaration(node)&&node.name?.text===name)text=node.getText(ast);ts.forEachChild(node,visit);};visit(ast);
  if(!text)throw Error('Missing '+name);return evaluate(text,context);
}
function audioHarness() {
  const ctx={state:'running',currentTime:2},master={},instrument={id:'jazz'};
  const context:Record<string,any>={effectivePlaybackVolume:0.7,snapshot:{instrumentId:'jazz',tuning:{openStringMidi:[64,59,55,50,45,40]}},
    previewAudioRef:{current:ctx},previewGainRef:{current:master},ensurePreviewAudio:vi.fn(()=>({ctx,master})),
    resumeAudioContext:vi.fn(async()=>{}),prepareTrackInstrument:vi.fn(async()=>instrument),schedulePreparedTrackNote:vi.fn(),closeAudioContext:vi.fn(),setError:vi.fn()};
  context.getMidiFromTab=(tab:number[])=>getTabMidi(context.snapshot,tab);
  context.playPreviewPitches=action('playPreviewPitches',context);
  return {context,preview:action('playChordPreview',context)};
}
it('plays every current chord fingering simultaneously using one prepared instrument and preview context',async()=>{
  const h=audioHarness();
  const chord={currentTabs:[[0,0],[1,2],[2,2]],originalMidi:[1,2,3]};
  await h.preview(chord);
  const calls=h.context.schedulePreparedTrackNote.mock.calls.map((call:any[])=>call[0]);
  expect(calls.map((call:any)=>call.midi)).toEqual([64,61,57]);
  expect(calls.every((call:any)=>call.startTime===2.005&&call.duration===0.35&&call.destination===h.context.previewGainRef.current)).toBe(true);
  expect(calls[0].gain).toBeCloseTo(0.6/Math.sqrt(3));
  expect(h.context.prepareTrackInstrument).toHaveBeenCalledOnce();expect(h.context.prepareTrackInstrument).toHaveBeenCalledWith(h.context.previewAudioRef.current,'jazz');
  expect(chord.currentTabs).toEqual([[0,0],[1,2],[2,2]]);
});
it('respects tuning, silence, invalid/empty chords, and audio-context replacement during loading',async()=>{
  const h=audioHarness();h.context.effectivePlaybackVolume=0;
  await h.preview({currentTabs:[[0,3]]});expect(h.context.ensurePreviewAudio).not.toHaveBeenCalled();
  h.context.effectivePlaybackVolume=1;await h.preview({currentTabs:[]});expect(h.context.ensurePreviewAudio).not.toHaveBeenCalled();
  h.context.snapshot.tuning.openStringMidi=[62,57,53,48,43,38];
  await h.preview({currentTabs:[[0,3]]});expect(h.context.schedulePreparedTrackNote.mock.calls[0][0].midi).toBe(65);
  h.context.schedulePreparedTrackNote.mockClear();
  h.context.prepareTrackInstrument.mockImplementationOnce(async()=>{h.context.previewAudioRef.current={state:'running'};return {};});
  await h.preview({currentTabs:[[0,3]]});expect(h.context.schedulePreparedTrackNote).not.toHaveBeenCalled();
});
function clickHarness() {
  let handler='';const visit=(node:ts.Node)=>{
    if(ts.isJsxOpeningElement(node)&&node.attributes.properties.some(attr=>ts.isJsxAttribute(attr)&&attr.name.getText(ast)==='data-tool-select-chord')) {
      const attr=node.attributes.properties.find(attr=>ts.isJsxAttribute(attr)&&attr.name.getText(ast)==='onClick') as ts.JsxAttribute|undefined;
      if(attr?.initializer&&ts.isJsxExpression(attr.initializer)&&attr.initializer.expression)handler=attr.initializer.expression.getText(ast);
    }ts.forEachChild(node,visit);
  };visit(ast);
  const context:Record<string,any>={chord:{id:1,length:120},tab:[0,3],idx:0,editingChordId:null,mobileViewport:false,selectedChordIds:[1],touchHoldTriggeredRef:{current:false},multiDragMovedRef:{current:false},singleDragMovedRef:{current:false},chordNoteDragMovedRef:{current:false},playChordPreview:vi.fn(),openChordMenu:vi.fn(),openChordNoteMenu:vi.fn()};
  return {context,click:evaluate(handler,context)};
}
it('auditions a normal chord click while keeping the existing edit menu',()=>{
  const h=clickHarness();h.click({});expect(h.context.playChordPreview).toHaveBeenCalledWith(h.context.chord);expect(h.context.openChordMenu).toHaveBeenCalledOnce();
});
it.each(['touchHoldTriggeredRef','multiDragMovedRef','singleDragMovedRef'])('does not audition after %s',ref=>{
  const h=clickHarness();h.context[ref].current=true;h.click({});expect(h.context.playChordPreview).not.toHaveBeenCalled();expect(h.context.openChordMenu).not.toHaveBeenCalled();
});
it('retains chord-member editing without replaying the entire chord',()=>{
  const h=clickHarness();h.context.editingChordId=1;h.click({});expect(h.context.playChordPreview).not.toHaveBeenCalled();expect(h.context.openChordNoteMenu).toHaveBeenCalledOnce();
});
