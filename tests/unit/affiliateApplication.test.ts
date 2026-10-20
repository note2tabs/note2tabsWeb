import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { buildAffiliateApplicationEmail, validateAffiliateApplication } from "../../lib/affiliateApplication";
const now = 10000;
const valid = {email:"creator@example.test",profile:"https://example.test/channel",audience:"250 subscribers",message:"I teach guitar and would share it in lessons.",company:"",startedAt:1000};
describe("affiliate application",()=>{
  it("accepts small audiences and makes audience size optional",()=>{
    expect(validateAffiliateApplication({...valid,audience:""},now).ok).toBe(true);
    expect(validateAffiliateApplication({...valid,audience:"3 students"},now).ok).toBe(true);
  });
  it.each(["email","profile","message"])("requires %s",key=>{
    expect(validateAffiliateApplication({...valid,[key]:""},now).ok).toBe(false);
  });
  it.each(["javascript:alert(1)","file:///etc/passwd","https://user:password@example.test"])("rejects unsafe profile links %s",profile=>{
    expect(validateAffiliateApplication({...valid,profile},now).ok).toBe(false);
  });
  it("rejects malformed addresses, oversized answers and spam signals",()=>{
    for(const body of [{...valid,email:"invalid"},{...valid,email:"a@example.test\r\nBcc:a@b.test"},{...valid,message:"x".repeat(2001)},{...valid,company:"spam"},{...valid,startedAt:9999},{...valid,startedAt:11000}])expect(validateAffiliateApplication(body,now).ok).toBe(false);
  });
  it("escapes applicant content and uses a fixed email subject",()=>{
    const email=buildAffiliateApplicationEmail({...valid,message:'<script>alert("x")</script>'});
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.text).toContain(valid.profile);
    expect(email.subject).toBe("Affiliate application — Note2Tabs");
  });
  it("has translated form labels, feedback and new errors in all ten languages",()=>{
    const keys=["Apply to become an affiliate","Applications are reviewed individually.","Audience size","Website or social profile","How would you share Note2Tabs?","Enter a valid website or social profile URL.","Email address","(optional)","Application sent","Sending application…","Submit application","We could not send your application. Please try again.","Please complete all required fields.","Please wait a moment and try again.","One or more answers are too long."];
    for(const locale of ["en","pt-BR","es","ja","ko","pl","ar","zh-Hans","fr","it"]){
      const catalog=JSON.parse(readFileSync(new URL(`../../lib/i18n/${locale}.json`,import.meta.url),"utf8"));
      for(const key of keys)expect(catalog[key],`${locale}: ${key}`).toBeTruthy();
    }
  });
});
