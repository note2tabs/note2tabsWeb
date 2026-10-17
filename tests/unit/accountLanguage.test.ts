import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(()=>({read:vi.fn(),write:vi.fn()}));
vi.mock("../../lib/prisma",()=>({prisma:{$queryRaw:db.read,$executeRaw:db.write}}));
import {accountEmailLocale,saveAccountLanguage} from "../../lib/i18n/accountLanguage";
describe("stored account email language",()=>{
 beforeEach(()=>vi.resetAllMocks());
 it("uses the recipient preference over the request language",async()=>{
  db.read.mockResolvedValue([{locale:"pt-BR"}]);
  expect(await accountEmailLocale("recipient","en")).toBe("pt-BR");
  expect(db.read.mock.calls[0].slice(1)).toEqual(["recipient"]);
 });
 it("uses an available request language only when the account has no preference",async()=>{
  db.read.mockResolvedValue([]);expect(await accountEmailLocale("new","ja")).toBe("ja");
  expect(await accountEmailLocale("unknown")).toBe("en");
 });
 it("never overwrites an existing account preference during browser initialization",async()=>{
  await saveAccountLanguage("recipient","en",true);
  expect(db.write.mock.calls[0][0].join("?")).toContain("DO NOTHING");
  await saveAccountLanguage("recipient","pl",false);
  expect(db.write.mock.calls[1][0].join("?")).toContain("IS DISTINCT FROM");
 });
 it("does not consume an English fallback when the preference database is unavailable",async()=>{
  db.read.mockRejectedValue(new Error("offline"));await expect(accountEmailLocale("recipient")).rejects.toThrow("offline");
 });
});
