import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({query:vi.fn(),update:vi.fn(),persist:vi.fn(),ack:vi.fn(),email:vi.fn(),capture:vi.fn(),flush:vi.fn()}));
vi.mock('../../lib/prisma',()=>({prisma:{$queryRaw:m.query,$executeRaw:m.update}}));
vi.mock('../../lib/jobResultDelivery',()=>({persistCompletedJob:m.persist,markBackendJobPersisted:m.ack,API_BASE:'https://backend.test',BACKEND_SECRET:'test-secret'}));
vi.mock('../../lib/transcriptionCompleteEmail',()=>({sendTranscriptionCompleteEmailOnce:m.email}));
vi.mock('../../lib/posthogServer',()=>({createPostHogServerClient:()=>({capture:m.capture,flush:m.flush})}));
import {deliverCompletedTranscriptions} from '../../lib/transcriptionResultDelivery';
const done={status:'done',workflowState:'finalized',transcriberTracks:[{segments:[{pitch_midi:60,start_time_s:0,end_time_s:1}]}]};
describe('browser-independent result delivery',()=>{
 beforeEach(()=>{vi.clearAllMocks();m.query.mockResolvedValue([{id:'job-1',userId:'owner-1',finishedAt:new Date()}]);m.update.mockResolvedValue(1);m.persist.mockResolvedValue('tab-1');m.ack.mockResolvedValue(undefined);m.email.mockResolvedValue(true);m.flush.mockResolvedValue(undefined);});
 afterEach(()=>vi.unstubAllGlobals());
 it('saves and notifies without a browser session or analytics consent',async()=>{
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify(done)));vi.stubGlobal('fetch',fetcher);
  expect(await deliverCompletedTranscriptions()).toEqual({delivered:1,failed:0});
  expect(fetcher).toHaveBeenCalledWith('https://backend.test/api/v1/jobs/job-1?include_output=true',expect.objectContaining({headers:expect.objectContaining({'X-User-Id':'owner-1','X-Backend-Secret':'test-secret'})}));
  expect(m.persist).toHaveBeenCalledWith('job-1','owner-1',done);
  expect(m.email).toHaveBeenCalledWith({userId:'owner-1',jobId:'job-1',tabJobId:'tab-1'});
 });
 it('finalizes review-ready output without starting another paid prediction',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({status:'done',workflowState:'review_ready'}))).mockResolvedValueOnce(new Response('{}')).mockResolvedValueOnce(new Response(JSON.stringify(done)));vi.stubGlobal('fetch',fetcher);
  expect(await deliverCompletedTranscriptions()).toEqual({delivered:1,failed:0});
  expect(fetcher.mock.calls.map(c=>c[0])).toEqual(['https://backend.test/api/v1/jobs/job-1?include_output=true','https://backend.test/api/v1/jobs/job-1/finalize','https://backend.test/api/v1/jobs/job-1?include_output=true']);
 });
 it('does not notify or acknowledge when storage fails; leaves a retry and safe alert',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify(done))));m.persist.mockRejectedValueOnce(new Error('private content'));
  expect(await deliverCompletedTranscriptions()).toEqual({delivered:0,failed:1});
  expect(m.email).not.toHaveBeenCalled();expect(m.ack).not.toHaveBeenCalled();expect(m.capture).toHaveBeenCalledOnce();expect(JSON.stringify(m.capture.mock.calls)).not.toContain('private content');
 });
 it('ignores a job already leased by another scheduler',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);m.update.mockResolvedValueOnce(0);
  expect(await deliverCompletedTranscriptions()).toEqual({delivered:0,failed:0});expect(fetcher).not.toHaveBeenCalled();
 });
 it('recovers history without emailing an old backlog',async()=>{
  m.query.mockResolvedValue([{id:'job-1',userId:'owner-1',finishedAt:new Date(Date.now()-48*60*60_000)}]);vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify(done))));
  expect(await deliverCompletedTranscriptions()).toEqual({delivered:1,failed:0});expect(m.email).not.toHaveBeenCalled();
 });
 it('retries email failures after persisting the result instead of marking delivery complete',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify(done))));m.email.mockRejectedValueOnce(new Error('SMTP unavailable'));
  expect(await deliverCompletedTranscriptions()).toEqual({delivered:0,failed:1});expect(m.persist).toHaveBeenCalledOnce();expect(m.capture).toHaveBeenCalledOnce();
 });
});

it('records backend status and delivery stage without the private response body',async()=>{
 m.query.mockResolvedValue([{id:'job',userId:'owner',finishedAt:new Date()}]);m.update.mockResolvedValue(1);m.capture.mockClear();m.flush.mockResolvedValue(undefined);
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('private backend content',{status:503})));
 expect(await deliverCompletedTranscriptions()).toEqual({delivered:0,failed:1});
 expect(m.capture).toHaveBeenCalledWith(expect.objectContaining({properties:expect.objectContaining({http_status:503,failure_stage:'result_fetch'})}));
 expect(JSON.stringify(m.capture.mock.calls)).not.toContain('private backend content');
 vi.unstubAllGlobals();
});
