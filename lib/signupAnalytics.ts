import type { NextApiRequest } from "next";
import {createPostHogServerClient} from "./posthogServer";
import {parseRequestCookies,getConsentFromCookies} from "./analyticsV2/cookies";
import {parseAcquisitionAttribution,ANALYTICS_ATTRIBUTION_COOKIE} from "./acquisitionAttribution";
import {localeCohort} from "./i18n/locale";
import {requestLocale} from "./i18n/request";
import {recordEngagementEvents} from "./engagement/server";

/** Only actual account creation emits signup_completed. Browser intent and
 * returning OAuth logins must never manufacture another completed signup. */
export async function trackCreatedAccount(req: NextApiRequest, user: {id:string;createdAt:Date}, method:"email"|"google") {
  const cookies=parseRequestCookies(req);
  if(getConsentFromCookies(cookies)==="denied")return;
  const client=createPostHogServerClient();if(!client)return;
  const eventId=`signup:${user.id}`;
  const properties={method,event_source:"account_creation",...parseAcquisitionAttribution(cookies[ANALYTICS_ATTRIBUTION_COOKIE]),
    ...localeCohort(requestLocale(req),process.env.VERCEL ? String(req.headers["x-vercel-ip-country"]||"") : undefined),$insert_id:eventId};
  client.capture({distinctId:user.id,event:"signup_completed",timestamp:user.createdAt,disableGeoip:true,properties});
  try { await recordEngagementEvents(user.id,[{eventId,schemaVersion:2,name:"signup_completed",ts:user.createdAt,props:properties,rawOriginal:{}}]); }
  catch { console.warn("signup_engagement_signal_write_failed"); }
  await client.flush();
}
