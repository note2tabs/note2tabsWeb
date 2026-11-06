import {afterEach, expect,it,vi} from 'vitest';
afterEach(()=>vi.unstubAllGlobals());
it('treats unavailable tempo as pending, while keeping genuine invalid-data errors visible',async()=>{
 const postMessage=vi.fn(); const worker={postMessage,onmessage:undefined as any};vi.stubGlobal('self',worker);
 await import('../../workers/transcriptionPreview.worker');
 const raw={version:1,streamId:'tempo-test',revision:1,settledSeconds:0,processedSeconds:2,durationSeconds:25,complete:false,tempoAnalysis:null,tracks:[]};
 worker.onmessage({data:{request:'pending',payload:raw}});
 expect(postMessage).toHaveBeenLastCalledWith({request:'pending',waitingForTempo:true});
 worker.onmessage({data:{request:'ready',payload:{...raw,tempoAnalysis:{bpm:120}}}});
 expect(postMessage.mock.calls.at(-1)?.[0].error).toBeUndefined();
 expect(postMessage.mock.calls.at(-1)?.[0].canvas).toBeDefined();
 worker.onmessage({data:{request:'broken',payload:{...raw,version:99}}});
 expect(postMessage).toHaveBeenLastCalledWith({request:'broken',error:'Live editor update unavailable'});
});
