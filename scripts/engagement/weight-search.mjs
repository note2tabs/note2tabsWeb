// Exploratory hand-specified integer-rule search; no ML library or trained model.
import fs from 'node:fs';
import {buildEngagementSnapshot, isMeaningfulActivity, DAY} from '../../lib/engagement/policy.ts';
const fields=['successful_transcription','practice','deliberate_edit','saved_project','recent_voluntary_pricing','multiple_successes'];
const raw=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const rows=[];
for(const user of raw){
 const es=user.events.map(([at,name,id,job,project,session,source,reason,action])=>({at:Date.parse(at.replace(' ','T')+'Z'),name,id,job,project,session,source,reason,action})).sort((a,b)=>a.at-b.at);
 const t=es.find(e=>e.name==='signup_completed')?.at;
 if(t===undefined||t>=Date.parse('2026-10-08T00:00:00Z'))continue;
 const paid=es.find(e=>e.name==='subscription_started')?.at;if(paid!==undefined&&paid<t)continue;
 const s=buildEngagementSnapshot(es,t+6*3600000);
 rows.push({date:new Date(t).toISOString().slice(0,10),x:[s.successes>0,s.practices>0,s.edits>0,s.saved>0,s.pricingDays>0,s.successes>=2].map(Number),y:Number(es.some(e=>e.at>=t+DAY&&e.at<t+7*DAY&&isMeaningfulActivity(e.name)))});
}
const train=rows.filter(r=>r.date<'2026-09-22'),later=rows.filter(r=>r.date>='2026-09-22');
const pack=rs=>{const m=new Map();for(const r of rs){const k=r.x.join('');const v=m.get(k)||{x:r.x,n:0,y:0};v.n++;v.y+=r.y;m.set(k,v);}return [...m.values()];};
const bins=pack(train);const metrics=(rs,w,t)=>{const f=rs.filter(r=>r.x.reduce((s,v,i)=>s+v*w[i],0)>=t);const tp=f.reduce((s,r)=>s+r.y,0),p=rs.reduce((s,r)=>s+r.y,0);return {people:rs.length,returners:p,flagged:f.length,caught:tp,precision:f.length?tp/f.length:null,recall:p?tp/p:null,flagRate:f.length/rs.length};};
const output={method:'Prespecified six binary features, integer weights 0/1/2/4, all nonempty combinations and thresholds; choose using Sep 1-21 only, report Sep 22-Oct 7 separately. Previously inspected data: exploratory, not independent validation. No email/CTA effectiveness inference.',features:fields,candidates:4095,trainPeople:train.length,laterPeople:later.length,results:[]};
for(const budget of [.05,.10,.20,.40]){
 let best=null,valid=0;const near=[];
 for(let code=1;code<4096;code++){
  let c=code;const w=[];for(let j=0;j<6;j++){w.push([0,1,2,4][c%4]);c=Math.floor(c/4);}
  const scored=bins.map(b=>({...b,score:b.x.reduce((s,v,i)=>s+v*w[i],0)}));
  for(let t=1;t<=w.reduce((a,b)=>a+b,0);t++){
   let n=0,y=0;for(const b of scored)if(b.score>=t){n+=b.n;y+=b.y;}
   // No arbitrary ordering within score ties. Minimum audience avoids tiny winners.
   if(n<Math.max(20,Math.floor(train.length*budget*.5))||n>Math.floor(train.length*budget))continue;
   valid++;near.push({w,t,n,y});const complexity=w.filter(Boolean).length;
   if(!best||y>best.y||y===best.y&&(n<best.n||n===best.n&&(complexity<best.complexity||complexity===best.complexity&&w.reduce((a,b)=>a+b,0)<best.w.reduce((a,b)=>a+b,0))))best={w,t,n,y,complexity};
  }
 }
 const close=best?near.filter(m=>m.y>=best.y-1):[];
 output.results.push({budget,validCandidates:valid,nearOptimalCandidates:close.length,nearOptimalWeightRanges:fields.map((name,i)=>({name,min:close.length?Math.min(...close.map(m=>m.w[i])):null,max:close.length?Math.max(...close.map(m=>m.w[i])):null})),weights:best?.w,threshold:best?.t,train:best?metrics(train,best.w,best.t):null,later:best?metrics(later,best.w,best.t):null});
}
output.singleSignals=fields.map((name,i)=>({name,train:metrics(train,fields.map((_,j)=>Number(i===j)),1),later:metrics(later,fields.map((_,j)=>Number(i===j)),1)}));
fs.writeFileSync(process.argv[3],JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output,null,2));
