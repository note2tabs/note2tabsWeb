import type { GetServerSideProps } from "next";
import { SessionContext } from "next-auth/react";
import PricingPage from "../pricing";
import TranscriberPage from "../transcriber";
import LimitUpgradePrompt from "../../components/LimitUpgradePrompt";
import { CreditUpgradePreviewContext } from "../../lib/useCreditUpgradeQuote";
import { creditUpgradePrice } from "../../lib/creditUpgradePricing";

export default function ProUpgradePreview({view,reason}:{view:string;reason:string}) {
  const credits = reason === "credits_low" ? 3 : 200;
  const quote = { id:"design-preview-only",currency:"usd",...creditUpgradePrice(599,1499,credits) };
  return <SessionContext.Provider value={{status:"authenticated",update:async()=>null,data:{user:{id:"design-preview-only",name:"Premium preview",email:"preview@example.test",role:"PREMIUM",subscriptionPlan:"PREMIUM"},expires:"2050-01-01T00:00:00Z"}}}>
    <CreditUpgradePreviewContext.Provider value={{quote,preview:true}}>
      <nav aria-label="Upgrade preview" className="upgrade-preview-nav">Design preview · Premium account · Payments disabled <a href="?view=pricing">Pricing</a><a href="?view=popup&reason=file_size_limit">File limit</a><a href="?view=popup&reason=youtube_duration_limit">YouTube limit</a><a href="?view=popup&reason=credits_low">Credits</a></nav>
      {view === "pricing" ? <PricingPage /> : <><TranscriberPage /><LimitUpgradePrompt key={reason} preview context={{plan:"PREMIUM",remaining:credits,required:reason==="credits_low"?8:undefined,fileBytes:reason==="file_size_limit"?350*1024*1024:undefined,clipSeconds:reason==="youtube_duration_limit"?660:undefined}} tracking={{source:"premium_prompt",reason:reason==="credits_low"?"credits_exhausted":reason,surface:"design_preview",trigger:reason}} /></>}
    </CreditUpgradePreviewContext.Provider>
  </SessionContext.Provider>;
}
export const getServerSideProps:GetServerSideProps=async({query})=>{
  if(process.env.NODE_ENV!=="development") return {notFound:true};
  return {props:{view:query.view==="popup"?"popup":"pricing",reason:["file_size_limit","youtube_duration_limit","credits_low"].includes(String(query.reason))?String(query.reason):"file_size_limit"}};
};
