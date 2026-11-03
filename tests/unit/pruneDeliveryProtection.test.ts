import {beforeEach,it,expect,vi} from 'vitest';
import {createMocks} from 'node-mocks-http';
const m=vi.hoisted(()=>({query:vi.fn(),remove:vi.fn(async(_args:unknown)=>({count:0})),preferences:vi.fn(async()=>({count:0}))}));
vi.mock('../../lib/prisma',()=>({prisma:{$queryRaw:m.query,jobs:{deleteMany:m.remove},gteActiveLane:{deleteMany:m.preferences},gteEditorInputSetting:{deleteMany:m.preferences},gteTrackPlaybackSetting:{deleteMany:m.preferences}}}));
import handler from '../../pages/api/cron/prune-jobs';
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('CRON_SECRET','test');});
it('retains completed but undelivered results even without analytics consent',async()=>{
 m.query.mockResolvedValueOnce([{id:'pending-analytics'}]).mockResolvedValueOnce([{id:'unsaved-root'}]);
 const {req,res}=createMocks({method:'POST',headers:{authorization:'Bearer test'}});await handler(req as any,res as any);
 expect(res.statusCode).toBe(200);expect(m.remove.mock.calls[0][0]).toMatchObject({where:{status:'succeeded',id:{notIn:['pending-analytics','unsaved-root']}}});
});
