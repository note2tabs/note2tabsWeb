import {afterEach,expect,it,vi} from "vitest";
import {createMocks} from "node-mocks-http";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {getTrackInstrumentOptions} from "../../lib/gteInstrumentManifest";
import {DRUM1_SAMPLE_URLS} from "../../lib/gteDrumPlayback";
import {withLocalizedPilot,withLocalizedStaticPage} from "../../lib/i18n/pilot";
import {hasGteSnapshotPayload,snapshotPreferencesChanged} from "../../lib/gteSnapshotPayload";
import {config} from "../../proxy";
import proxy from "../../proxy";
import {NextRequest} from "next/server";
import {publicDocumentGeoCookies,geoCookieScript} from "../../lib/i18n/publicGeoCookies";
import {runInNewContext} from "node:vm";

afterEach(()=>vi.unstubAllEnvs());
function context(path:string,country?:string) {
  const {req,res}=createMocks({method:"GET",headers:country ? {"x-vercel-ip-country":country} : {cookie:"n2t_currency=SEK"}});
  return {req,res,resolvedUrl:path,params:{},query:{}} as any;
}
it.each([["US","USD"],["SE","SEK"],["DE","EUR"],["BR","BRL"]])('caches public pages separately by country without changing initial %s currency',async(country,currency)=>{
  const ctx=context('/es/about',country);
  const result=await withLocalizedPilot('es')(ctx) as any;
  expect(result.props.initialDisplayCurrency).toBe(currency);
  expect(ctx.res.getHeader('Vary')).toContain('X-Vercel-IP-Country');
  expect(ctx.res.getHeader('Cache-Control')).toContain('s-maxage=3600');
});
it('preserves regional USD offers and keeps cookie-derived prices private',async()=>{
  vi.stubEnv('LATAM_PRICING_ENABLED','true');
  for(const plan of ['PREMIUM','PRO'])for(const period of ['MONTHLY','YEARLY'])vi.stubEnv(`STRIPE_MARKET_LATAM_${plan}_${period}`,'price_test');
  const ctx=context('/es/pricing','AR'), result=await withLocalizedPilot('es')(ctx) as any;
  expect(result.props).toMatchObject({initialDisplayCurrency:'USD',initialPricingMarket:'latam'});
  const unknown=context('/es/pricing'),fallback=await withLocalizedPilot('es')(unknown) as any;
  expect(fallback.props.initialDisplayCurrency).toBe('SEK');expect(unknown.res.getHeader('Cache-Control')).toBeUndefined();
});
it('never caches authenticated loaders, private routes, preview content, or explicit private responses',async()=>{
  const loader=vi.fn(async()=>({props:{session:{user:'private'}}}));
  const ctx=context('/es/about','US');await withLocalizedPilot('es',loader)(ctx);
  expect(ctx.res.getHeader('Cache-Control')).toBeUndefined();
  for(const change of ['private-route','preview','authorization','set-cookie','private-header']) {
    const c=context(change==='private-route'?'/es/settings':'/es/about','US');
    if(change==='preview')c.preview=true;
    if(change==='authorization')c.req.headers.authorization='Bearer test';
    if(change==='set-cookie')c.res.setHeader('Set-Cookie','private=1');
    if(change==='private-header')c.res.setHeader('Cache-Control','private, no-store');
    await withLocalizedPilot('es')(c);
    expect(String(c.res.getHeader('Cache-Control'))).not.toContain('s-maxage');
  }
});
it('preserves static-loader results and existing Vary dimensions',async()=>{
  const ctx=context('/es/features/test','US');ctx.res.setHeader('Vary','Accept-Encoding');
  const result=await withLocalizedStaticPage('es',async()=>({props:{heading:'unchanged'}}))(ctx) as any;
  expect(result.props.heading).toBe('unchanged');expect(ctx.res.getHeader('Vary')).toBe('Accept-Encoding, X-Vercel-IP-Country');
});
it('versions all instrument and drum samples by their exact unchanged bytes',()=>{
  const urls=[...getTrackInstrumentOptions().flatMap(option=>option.samples.map(sample=>sample.url)),...Object.values(DRUM1_SAMPLE_URLS)];
  for(const url of urls) {
    const parsed=new URL(url,'https://www.note2tabs.com');
    const bytes=readFileSync('public'+decodeURIComponent(parsed.pathname));
    expect(parsed.searchParams.get('v')).toBe(createHash('sha256').update(bytes).digest('hex').slice(0,12));
  }
});
it('recognizes acknowledgements and avoids rewriting unrelated preferences',()=>{
  expect(hasGteSnapshotPayload({ok:true,version:2})).toBe(false);
  expect(hasGteSnapshotPayload({snapshot:{notes:[]}})).toBe(true);
  const lane={id:'one',notes:[1],instrumentId:'acoustic',playbackVolume:0.8,drumLoops:[]};
  expect(snapshotPreferencesChanged({...lane,notes:[2]},lane,['instrumentId'])).toBe(false);
  expect(snapshotPreferencesChanged({...lane,instrumentId:'jazz'},lane,['instrumentId'])).toBe(true);
  expect(snapshotPreferencesChanged(lane,undefined,['instrumentId'])).toBe(true);
  expect(snapshotPreferencesChanged({editors:[]},{editors:[lane]},['instrumentId'])).toBe(true);
});
it('excludes no-op API middleware routes but preserves diagnostics on product APIs',()=>{
  const matcher=new RegExp('^'+config.matcher[0]+'$');
  for(const path of ['/api/auth/session','/api/analytics/ingest','/api/gte/telemetry'])expect(matcher.test(path)).toBe(false);
  for(const path of ['/api/jobs/job-1','/api/gte/editors/one/snapshot','/api/transcribe'])expect(matcher.test(path)).toBe(true);
});
it('installs the same geo cookies before hydration without Set-Cookie on cacheable HTML',async()=>{
  for(const country of ['US','CA','SE','BR','AR']) {
    const headers={accept:'text/html','x-vercel-ip-country':country,cookie:'n2t_locale_chosen=1; n2t_locale=es'};
    const response=await proxy(new NextRequest('https://www.note2tabs.com/es/about',{headers}));
    expect(response.headers.get('Set-Cookie')).toBeNull();
    const assignments:string[]=[];
    runInNewContext(geoCookieScript(publicDocumentGeoCookies('/es/about','GET',headers)!),{document:{set cookie(value:string){assignments.push(value);}}});
    const dataResponse=await proxy(new NextRequest('https://www.note2tabs.com/es/about',{headers:{...headers,'x-nextjs-data':'1'}}));
    for(const name of ['n2t_currency','n2t_tax_note','n2t_pricing_market']) {
      const value=dataResponse.cookies.get(name)!.value;
      expect(assignments.some(cookie=>cookie.startsWith(`${name}=${value};`))).toBe(true);
    }
    expect(publicDocumentGeoCookies('/es/about','GET',{...headers,'x-nextjs-data':'1'})).toBeNull();
  }
});
