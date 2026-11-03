import { prisma } from "./prisma";
import { persistCompletedJob, markBackendJobPersisted, API_BASE, BACKEND_SECRET } from "./jobResultDelivery";
import { sendTranscriptionCompleteEmailOnce } from "./transcriptionCompleteEmail";
import { createPostHogServerClient } from "./posthogServer";

type PendingResult = { id: string; userId: string; finishedAt: Date | null };

async function backendResult(job: PendingResult) {
  const headers: Record<string,string> = {"X-User-Id":job.userId,"Content-Type":"application/json"};
  if (BACKEND_SECRET) headers["X-Backend-Secret"]=BACKEND_SECRET;
  const url=`${API_BASE}/api/v1/jobs/${encodeURIComponent(job.id)}`;
  const read=async()=>{
    const response=await fetch(`${url}?include_output=true`,{headers,signal:AbortSignal.timeout(12_000)});
    if(!response.ok)throw new Error("Result backend unavailable");
    return await response.json() as Record<string,unknown>;
  };
  let payload=await read();
  // This is the same finalization the job page performs. Never start another
  // prediction, deduct credits, or change the customer's selected instruments.
  if(payload.workflowState==='review_ready' || (payload.workflowState==='processing' && payload.status==='done')){
    const response=await fetch(`${url}/finalize`,{method:'POST',headers,body:'{}',signal:AbortSignal.timeout(20_000)});
    if(!response.ok)throw new Error("Result finalization unavailable");
    payload=await read();
  }
  if(!['done','completed','succeeded','success'].includes(String(payload.status)) || (payload.workflowState && payload.workflowState!=='finalized')){
    throw new Error("Result is not finalized");
  }
  return payload;
}

/** Runs from the existing five-minute scheduler; independent of browser/consent. */
export async function deliverCompletedTranscriptions() {
  const jobs=await prisma.$queryRaw<PendingResult[]>`
    SELECT j.id,j."userId",j."finishedAt" FROM jobs j
    JOIN "User" u ON u.id=j."userId"
    WHERE j.type='transcription_flow' AND j.status='succeeded'
      AND COALESCE(j.input->'resultDelivery'->>'completed','false')!='true'
      AND COALESCE(j.input->'resultDelivery'->>'retryAfter','') < NOW()::text
    ORDER BY COALESCE(j.input->'resultDelivery'->>'retryAfter','') ASC, j."createdAt" ASC LIMIT 5
  `;
  let delivered=0,failed=0;const deadline=Date.now()+120_000;
  for(const job of jobs){
    if(Date.now()>deadline)break;
    // A lease prevents concurrent scheduler invocations processing the same job.
    const claimed=await prisma.$executeRaw`
      UPDATE jobs SET input=jsonb_set(COALESCE(input,'{}'::jsonb),'{resultDelivery}',
        jsonb_build_object('completed',false,'retryAfter',(NOW()+INTERVAL '3 minutes')::text))
      WHERE id=${job.id} AND "userId"=${job.userId} AND status='succeeded'
        AND COALESCE(input->'resultDelivery'->>'completed','false')!='true'
        AND COALESCE(input->'resultDelivery'->>'retryAfter','') < NOW()::text
    `;
    if(!claimed)continue;
    try {
      const payload=await backendResult(job);
      const tabJobId=await persistCompletedJob(job.id,job.userId,payload);
      if(!tabJobId)throw new Error("Completed result has no importable content");
      await markBackendJobPersisted(job.id,job.userId,tabJobId);
      // Don't send a backlog of old completion notices during recovery.
      if(job.finishedAt && Date.now()-job.finishedAt.getTime()<24*60*60_000){
        await sendTranscriptionCompleteEmailOnce({userId:job.userId,jobId:job.id,tabJobId});
      }
      await prisma.$executeRaw`
        UPDATE jobs SET input=jsonb_set(COALESCE(input,'{}'::jsonb),'{resultDelivery}',
          jsonb_build_object('completed',true,'tabJobId',${tabJobId}))
        WHERE id=${job.id} AND "userId"=${job.userId}
      `;
      delivered++;
    }catch{
      failed++;
      await prisma.$executeRaw`
        UPDATE jobs SET input=jsonb_set(COALESCE(input,'{}'::jsonb),'{resultDelivery}',
          jsonb_build_object('completed',false,'retryAfter',(NOW()+INTERVAL '5 minutes')::text))
        WHERE id=${job.id} AND "userId"=${job.userId}
      `;
      const client=createPostHogServerClient();
      if(client){
        client.capture({distinctId:job.userId,event:'transcription_result_delivery_failed',properties:{job_id:job.id,failure_stage:'durable_result_delivery',error_code:'result_delivery_retry_pending',$insert_id:`result-delivery:${job.id}:${Math.floor(Date.now()/300000)}`}});
        await client.flush();
      }
    }
  }
  return {delivered,failed};
}
