import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {createMocks} from 'node-mocks-http';
const m=vi.hoisted(()=>({session:vi.fn(),find:vi.fn(),update:vi.fn()}));
vi.mock('next-auth/next',()=>({getServerSession:m.session}));
vi.mock('../../pages/api/auth/[...nextauth]',()=>({authOptions:{}}));
vi.mock('../../lib/prisma',()=>({prisma:{tabJob:{findFirst:m.find,updateMany:m.update}}}));
import handler from '../../pages/api/jobs/[job_id]/editor';
describe('complete editor delivery link',()=>{
 beforeEach(()=>{vi.clearAllMocks();m.session.mockResolvedValue({user:{id:'owner'}});m.find.mockResolvedValue({id:'tab'});m.update.mockResolvedValue({count:1});});
 afterEach(()=>vi.unstubAllGlobals());
 async function call(){const {req,res}=createMocks({method:'POST',query:{job_id:'job'},body:{editorId:'editor'}});await handler(req as any,res as any);return res;}
 it('links an owned result only after backend verifies editor access',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}')));
  expect((await call()).statusCode).toBe(200);expect(m.find).toHaveBeenCalledWith({where:{backendJobId:'job',userId:'owner'},select:{id:true}});expect(m.update).toHaveBeenCalledWith({where:{id:'tab',userId:'owner'},data:{gteEditorId:'editor'}});
 });
 it('rejects another persons result before contacting backend',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);m.find.mockResolvedValue(null);expect((await call()).statusCode).toBe(404);expect(fetcher).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();
 });
 it('does not link an inaccessible editor',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:403})));expect((await call()).statusCode).toBe(404);expect(m.update).not.toHaveBeenCalled();
 });
 it('does not link during a temporary backend outage',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('Unavailable')));expect((await call()).statusCode).toBe(502);expect(m.update).not.toHaveBeenCalled();
 });
});
