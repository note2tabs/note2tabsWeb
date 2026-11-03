import type {NextApiRequest,NextApiResponse} from 'next';
import {getServerSession} from 'next-auth/next';
import {authOptions} from '../../auth/[...nextauth]';
import {prisma} from '../../../../lib/prisma';

/** Link only after every track and post-import operation has completed. */
export default async function handler(req:NextApiRequest,res:NextApiResponse){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 const session=await getServerSession(req,res,authOptions);
 if(!session?.user?.id)return res.status(401).json({error:'Unauthorized'});
 const jobId=typeof req.query.job_id==='string'?req.query.job_id:'';
 const editorId=typeof req.body?.editorId==='string'?req.body.editorId:'';
 if(!jobId || !editorId || editorId.length>120)return res.status(400).json({error:'Invalid result link'});
 const tab=await prisma.tabJob.findFirst({where:{backendJobId:jobId,userId:session.user.id},select:{id:true}});
 if(!tab)return res.status(404).json({error:'Result not found'});
 const headers:Record<string,string>={'X-User-Id':session.user.id};
 const secret=process.env.BACKEND_SHARED_SECRET || process.env.NOTE2TABS_BACKEND_SECRET;
 if(secret)headers['X-Backend-Secret']=secret;
 try{
  const upstream=await fetch(`${process.env.BACKEND_API_BASE_URL || 'http://127.0.0.1:8000'}/gte/editors/${encodeURIComponent(editorId)}`,{headers,signal:AbortSignal.timeout(10_000)});
  if(!upstream.ok)return res.status(upstream.status===403 || upstream.status===404?404:502).json({error:'Editor is not available'});
  await prisma.tabJob.updateMany({where:{id:tab.id,userId:session.user.id},data:{gteEditorId:editorId}});
  return res.status(200).json({ok:true});
 }catch{return res.status(502).json({error:'Unable to confirm editor delivery'});}
}
