import {prisma} from "../prisma";
import {buildInactiveSignupReminderIdentifier,buildInactiveSignupExperimentToken} from "../inactiveSignupReminder";
import {buildTabReturnReminderIdentifier,buildTabReturnCooldownIdentifier,buildTabReturnMarkerToken,TAB_RETURN_REMINDER_COOLDOWN_DAYS} from "../tabReturnReminder";

type Marker={identifier:string;token:string;expires:Date};
export function legacyReminderMarkers(accountId:string, campaign:"signup"|"tab",editorId:string|null,now=new Date()):Marker[]{
 const expires=new Date(now.getTime()+3650*86400000);
 if(campaign==='signup')return [{identifier:buildInactiveSignupReminderIdentifier(accountId),token:buildInactiveSignupExperimentToken(accountId,'6h'),expires}];
 if(!editorId)throw new Error('A saved-tab reminder requires an editor');
 const token=buildTabReturnMarkerToken(accountId,editorId);
 return [{identifier:buildTabReturnReminderIdentifier(accountId,editorId),token,expires},{identifier:buildTabReturnCooldownIdentifier(accountId),token:`${token}:cooldown`,expires:new Date(now.getTime()+TAB_RETURN_REMINDER_COOLDOWN_DAYS*86400000)}];
}
class AlreadyClaimed extends Error{}
export async function claimLegacyReminderMarkers(markers:Marker[]){
 try{return await prisma.$transaction(async tx=>{
  for(const m of markers){
   const rows=await tx.$queryRaw<Array<{token:string}>>`INSERT INTO "VerificationToken" (identifier,token,expires) VALUES (${m.identifier},${m.token},${m.expires}) ON CONFLICT DO NOTHING RETURNING token`;
   if(!rows.length)throw new AlreadyClaimed();
  }
  return true;
 });}catch(error){if(error instanceof AlreadyClaimed)return false;throw error;}
}
/** Only call after a definite non-send; retain claims for uncertain SMTP outcomes. */
export async function releaseLegacyReminderMarkers(markers:Marker[]){
 await prisma.$transaction(async tx=>{for(const m of markers)await tx.$executeRaw`DELETE FROM "VerificationToken" WHERE identifier=${m.identifier} AND token=${m.token}`;});
}
