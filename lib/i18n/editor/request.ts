import {getEditorCatalog} from "./catalogs";
import type { GetServerSideProps, GetServerSidePropsContext } from "next";
import { localeSwitchHref } from "../locale";
import {editorRequestLocale} from "./detection";
export {editorRequestLocale} from "./detection";

export function withEditorLocale<P extends Record<string,unknown>>(loader: GetServerSideProps<P>): GetServerSideProps<P> {
  return async (ctx:GetServerSidePropsContext)=>{
    const locale=editorRequestLocale(ctx.req);
    ctx.res.setHeader("X-Robots-Tag","noindex, follow");
    ctx.res.setHeader("Cache-Control","private, no-store");
    ctx.res.setHeader("Vary","Accept-Language, Cookie");
    const result=await loader(ctx);
    if("redirect" in result)return {...result,redirect:{...result.redirect,destination:localeSwitchHref(result.redirect.destination,locale)}};
    if(!("props" in result))return result;
    return {...result,props:{...await result.props,initialEditorLocale:locale,initialEditorMessages:await getEditorCatalog(locale)}};
  };
}
