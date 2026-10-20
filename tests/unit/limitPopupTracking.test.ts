import { expect, it } from "vitest";
import { limitPopupTracking } from "../../lib/limitPopupTracking";
it.each([
 ["file_size_limit", {plan:"FREE",fileBytes:60_000_000}, "file_size"],
 ["pro_file_size_limit", {plan:"PREMIUM",fileBytes:350_000_000}, "file_size"],
 ["youtube_duration_limit", {plan:"PREMIUM",clipSeconds:660}, "youtube_length"],
 ["file_duration_limit", {plan:"FREE",clipSeconds:90}, "file_length"],
 ["heavy_model_locked", {plan:"FREE"}, "model_access"],
 ["credits_exhausted", {plan:"FREE",remaining:0}, "credits_exhausted"],
 ["credits_exhausted", {plan:"PREMIUM",remaining:3,required:8}, "insufficient_credits"],
 ["credits_low", {plan:"FREE",remaining:3}, "credits_low"],
])("classifies %s with its actual context", (reason,context,expected)=>{
 expect(limitPopupTracking(reason as string,context as any)).toMatchObject({limit_type:expected,popup_type:"transcription_limit",limit_reason:reason});
});
it("records numeric limits without filenames or source URLs",()=>{
 expect(limitPopupTracking("pro_file_size_limit",{plan:"PREMIUM",fileBytes:350*1024*1024})).toMatchObject({file_size_bytes:350*1024*1024,upload_limit_bytes:200*1024*1024,current_plan:"premium"});
});
