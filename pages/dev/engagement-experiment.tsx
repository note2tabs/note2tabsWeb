import {useCallback,useState} from "react";
import type {GetServerSideProps} from "next";
import {SessionContext} from "next-auth/react";
import EngagementExperimentProvider from "../../components/EngagementExperimentProvider";
import {useEngagementExperiment,announceEngagementPlayback,ENGAGEMENT_PLAYBACK_ACTIVE_EVENT} from "../../lib/engagement/react";
import {type EngagementArm,ENGAGEMENT_EXPERIMENT_ARMS} from "../../lib/engagement/experimentConfig";
import {type AppLocale,ALL_LOCALES} from "../../lib/i18n/locale";

function Controls(){
 const {arm,allowLegacy,claimLegacy}=useEngagementExperiment();const [legacy,setLegacy]=useState(false);
 return <section className="card-outline stack"><h2>Assigned group: {arm || "loading"}</h2><p>Legacy prompts allowed: {String(allowLegacy)}</p>
 <div className="button-row" style={{flexWrap:'wrap'}}><button onClick={()=>window.dispatchEvent(new Event(ENGAGEMENT_PLAYBACK_ACTIVE_EVENT))}>Start playback</button>
 <button onClick={()=>announceEngagementPlayback("synthetic-editor")}>Stop playback</button>
 <button onClick={async()=>setLegacy(Boolean(await claimLegacy()))}>Try existing prompt</button></div>
 <label>Editor input <input aria-label="Editor input" placeholder="Keep editing to cancel the prompt" /></label>
 {legacy&&<p role="status">Existing prompt authorized</p>}</section>;
}
export default function EngagementExperimentPreview({arm,locale,blocked}:{arm:EngagementArm;locale:AppLocale;blocked:boolean}){
 const [log,setLog]=useState<string[]>([]);
 const request=useCallback(async(body:Record<string,unknown>)=>{
  setLog(rows=>[...rows,JSON.stringify(body)]);
  if(body.operation==='claim')return {mode:'active',arm,show:!blocked&&arm!=='control'&&(arm==='existing'?body.checkpoint==='legacy':body.checkpoint==='playback_pause'),contactId:'synthetic-contact'};
  return {mode:'active',arm};
 },[arm,blocked]);
 return <SessionContext.Provider value={{status:"authenticated",update:async()=>null,data:{user:{id:'synthetic-preview-account',name:'Synthetic test account'},expires:'2050-01-01T00:00:00.000Z'}}}>
 <EngagementExperimentProvider request={request}><main className="container stack" style={{padding:'36px 20px',maxWidth:'100%',minWidth:0,width:'100%',boxSizing:'border-box',overflowWrap:'anywhere'}}>
 <h1>Engagement experiment test</h1><p>Synthetic account and intercepted experiment responses. No email, billing or customer data. Server authorization and SQL are tested separately against local PostgreSQL.</p>
 <Controls/><p>Contextual timing: 1,200 ms after Stop playback. Typing, playback restart or navigation cancels it.</p>
 <pre aria-label="Experiment requests" style={{whiteSpace:'pre-wrap'}}>{log.join('\n')}</pre>
 </main></EngagementExperimentProvider></SessionContext.Provider>;
}
export const getServerSideProps:GetServerSideProps=async({query})=>{
 if(process.env.NODE_ENV!=='development')return {notFound:true};
 return {props:{arm:ENGAGEMENT_EXPERIMENT_ARMS.includes(query.arm as EngagementArm)?query.arm:'contextual',locale:ALL_LOCALES.includes(query.locale as AppLocale)?query.locale:'en',blocked:query.blocked==='1'}};
};
