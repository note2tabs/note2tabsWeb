/** Opt-in ONLY. Excluded from the normal Vitest include. Never auto-retry SMTP. */
import { it, expect, vi } from "vitest";
import { loadEnvConfig } from "@next/env";
import { writeFileSync } from "node:fs";
import nodemailer from "nodemailer9";
import { buildTranscriptionCompleteEmail } from "../../lib/transcriptionCompleteEmail";
import { sendTransactionalEmail } from "../../lib/email";

it.skipIf(process.env.EMAIL_LANGUAGE_SMOKE_SEND !== "yes")("sends ONE French template through the real SMTP provider", async () => {
 const to = process.env.EMAIL_LANGUAGE_SMOKE_TO;
 const envDir = process.env.EMAIL_LANGUAGE_SMOKE_ENV_DIR;
 if (!to || !envDir) throw new Error("Explicit recipient and environment directory are required");
 loadEnvConfig(envDir, false, {info:()=>{},error:()=>{}});
 process.env.NEXT_PUBLIC_APP_URL="https://www.note2tabs.com";
 const create = nodemailer.createTransport.bind(nodemailer);
 let receipt:Record<string,unknown>|null=null;
 // Observe the REAL transport response; this does not mock SMTP or delivery.
 const spy=vi.spyOn(nodemailer,"createTransport").mockImplementation(((options:any)=>{
  const transport=create(options);const send=transport.sendMail.bind(transport);
  transport.sendMail=(async (mail:any)=>{
   expect(mail.headers["Content-Language"]).toBe("fr");
   expect(mail.subject).toBe("[TEST] Votre transcription Note2Tabs est prête");
   const result=await send(mail);
   receipt={accepted:result.accepted?.includes(to),rejectedCount:result.rejected?.length || 0,messageId:result.messageId,responseCode:result.response?.split(" ")[0],locale:"fr",template:"transcription_complete",at:new Date().toISOString()};
   writeFileSync("/tmp/n2t-french-email-smoke-receipt.json",JSON.stringify(receipt,null,2),{mode:0o600});
   return result;
  }) as any;
  return transport;
 }) as any);
 try {
  const email=buildTranscriptionCompleteEmail({locale:"fr",jobId:"language-delivery-test",sourceLabel:"TEST D’ENVOI — aucune nouvelle transcription"});
  const notice="Ceci est un test d’envoi en français demandé par vous. Aucune nouvelle transcription n’a été effectuée et aucun crédit n’a été utilisé.";
  // A test has no real job: direct the sample action to the recipient’s home.
  email.html=email.html.replaceAll(email.editorUrl,"https://www.note2tabs.com/fr/home");
  email.text=email.text.replaceAll(email.editorUrl,"https://www.note2tabs.com/fr/home");
  const html=email.html.replace(/(<body[^>]*>)/i,`$1<p style="padding:16px;font-family:Arial,sans-serif">${notice}</p>`);
  expect(await sendTransactionalEmail({to,subject:`[TEST] ${email.subject}`,html,text:`${notice}\n\n${email.text}`,
   language:{kind:"customer",template:"transcription_complete",locale:"fr",test:true},analyticsCategory:"language_delivery_test"})).toBe(true);
  expect(receipt).toMatchObject({accepted:true,rejectedCount:0,responseCode:"250",locale:"fr"});
 } finally {spy.mockRestore();}
},60000);
