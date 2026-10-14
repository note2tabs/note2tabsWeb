import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";
function load(env: Record<string,string>, script: string) {
 return spawnSync(process.execPath,["-e",script],{cwd:process.cwd(),env:{...process.env,POSTHOG_SOURCEMAPS:"false",POSTHOG_PERSONAL_API_KEY:"",...env},encoding:"utf8"});
}
it("keeps source maps disabled without an explicit configured upload",()=>{
 const result=load({},'const c=require("./next.config.js"); if(c.productionBrowserSourceMaps) process.exit(1);');expect(result.status).toBe(0);
});
it("fails clearly rather than publishing maps without upload credentials",()=>{
 const result=load({POSTHOG_SOURCEMAPS:"true"},'require("./next.config.js")');expect(result.status).not.toBe(0);expect(result.stderr).toContain("POSTHOG_PERSONAL_API_KEY");
});
it("wires the installed uploader into the production compiler without exposing its key",()=>{
 const result=load({POSTHOG_SOURCEMAPS:"true",POSTHOG_PERSONAL_API_KEY:"test-build-only-secret"},'(async()=>{const c=await require("./next.config.js")("phase-production-build",{defaultConfig:{}}); if(typeof c.compiler.runAfterProductionCompile!=="function" || !c.productionBrowserSourceMaps || JSON.stringify(c.env).includes("test-build-only-secret")) process.exit(1)})().catch(()=>process.exit(2));');expect(result.status,result.stderr).toBe(0);
});
