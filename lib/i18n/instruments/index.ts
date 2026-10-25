import type { AppLocale } from "../locale";
import type { SeoLandingPageProps } from "../../../components/SeoLandingPage";
import type { InstrumentCopy } from "./types";
import fr from "./fr.json";
import it from "./it.json";
import es from "./es.json";
import pt from "./pt-BR.json";
import ja from "./ja.json";
import ko from "./ko.json";
import pl from "./pl.json";
import ar from "./ar.json";
import zh from "./zh-Hans.json";
export const instrumentCatalogs: Partial<Record<AppLocale, InstrumentCopy>> = {fr,it,es,"pt-BR":pt,ja,ko,pl,ar,"zh-Hans":zh};
export const translatedInstrumentPaths = ["/piano-transcription","/piano-sheet-music-editor","/drum-transcription","/drum-notation-editor","/ukulele-tab-editor","/ukulele-transcription","/instruments"] as const;
/** Authored localized editions. The established English content is never rewritten. */
export function localizeInstrumentPage(page: SeoLandingPageProps, locale: AppLocale): SeoLandingPageProps {
 const c = instrumentCatalogs[locale];
 const i = translatedInstrumentPaths.findIndex(path => path === page.canonicalPath);
 if (!c || i < 0 || i > 5) return {...page, hasTranslation: i >= 0};
 const editor = [1,3,4].includes(i);
 const start = editor ? 3 : 0;
 const instrumentIndex = i < 2 ? 0 : i < 4 ? 1 : 2;
 const paragraphs = i < 2 ? c.piano : i < 4 ? c.drums : c.ukulele;
 const steps = c.workflow.slice(start,start+3).map((title,index)=>({title,body:c.workflowBodies[start+index]}));
 if (i === 2) steps[1] = {title:c.drumReview[0],body:c.drumReview[1]};
 if (i === 3) steps[1] = {title:c.workflow[4],body:c.drumReview[2]};
 const detailParagraphs = i === 3 ? c.drumEditor : i === 4 ? [c.ukulele[0]] : [paragraphs[editor && i<2 ? 2 : 0]];
 const mainParagraphs = i < 2 ? [c.piano[1],c.piano[3]] : i === 4 ? c.ukuleleEditor : [paragraphs[1]];
 const questionAnswer = i === 4 ? c.ukulele[0] : i === 5 ? c.ukulele[1] : c.descriptions[i];
 const alternate = i === 0 ? 1 : i === 1 ? 0 : i === 2 ? 3 : i === 3 ? 2 : i === 4 ? 5 : 4;
 return {
  ...page, hasTranslation:true, title:c.titles[i], metaTitle:`${c.metaTitles[i]} | Note2Tabs`, description:c.descriptions[i],
  primaryCta:{...page.primaryCta,label:c.actions[i]},
  secondaryCta:page.secondaryCta ? {...page.secondaryCta,label:c.actions[alternate]} : undefined,
  preview: page.preview ? {...page.preview,exportLabel:page.preview.exportLabel?.replace("Project",c.project),label:c.titles[i],alt:c.imageAlts[instrumentIndex],caption:c.sections[2],sourceLabel:editor ? undefined : c.recordingLabels[instrumentIndex],resultLabel:editor ? undefined : c.resultLabels[instrumentIndex]} : undefined,
  steps,
  detail:{title:editor ? c.sections[3] : c.sections[1],paragraphs:detailParagraphs},
  contentSections:[{title:c.sections[2],paragraphs:mainParagraphs},
   {title:c.sections[4],paragraphs:[c.descriptions[alternate]],action:{label:c.actions[alternate],href:translatedInstrumentPaths[alternate]}}],
  faqs:[{question:c.questions[i],answer:questionAnswer},editor
   ? {question:c.questions[6],answer:c.workflowBodies[3]}
   : {question:c.questions[7],answer:c.exports[instrumentIndex]}],
  relatedLinks:[{label:c.actions[alternate],description:c.descriptions[alternate],href:translatedInstrumentPaths[alternate]},
   {label:c.sections[5],description:c.sections[5],href:"/pricing"}],
 };
}
