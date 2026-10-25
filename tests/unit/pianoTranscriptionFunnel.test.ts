import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import type { CanvasSnapshot, EditorSnapshot } from "../../types/gte";
vi.mock("next-auth/react",()=>({useSession:()=>({data:null,status:"unauthenticated",update:vi.fn()})}));
vi.mock("next/head",()=>({default:({children}:{children:unknown})=>children}));
vi.mock("../../lib/i18n/react",()=>({
  useLocale:()=>({locale:"en",href:(s:string)=>s,t:(s:string)=>s}),
  useLocaleRouter:()=>({query:{},pathname:"/piano-transcription",asPath:"/piano-transcription",isReady:true,push:vi.fn(),replace:vi.fn()}),
}));
import PianoPage from "../../pages/piano-transcription";
import TranscriberPage from "../../pages/transcriber";
import { focusPianoTranscription, transcriptionEntryHref } from "../../lib/instrumentTranscriptionEntry";

const doc = (element: ReturnType<typeof createElement>) => new JSDOM(renderToStaticMarkup(element)).window.document;
describe("direct piano transcription landing",()=>{
  it("serves a real upload and YouTube form at the indexed piano URL",()=>{
    const d=doc(createElement(PianoPage));
    expect(d.querySelector('input[type=file]')).not.toBeNull();
    expect(d.querySelector('form button[type=submit]')?.textContent).toBe('Choose audio file');
    expect(d.querySelector('form')?.textContent).toContain('YouTube link');
    expect(d.querySelector('link[rel=canonical]')?.getAttribute('href')).toBe('https://www.note2tabs.com/piano-transcription');
    expect(d.querySelector('title')?.textContent).toContain('Music Notation');
    expect(d.querySelectorAll('h1')).toHaveLength(1);
    expect(d.querySelectorAll('main')).toHaveLength(1);
  });
  it("keeps piano SEO content, guides and FAQs below the shared form without a second guitar hero",()=>{
    const d=doc(createElement(PianoPage));
    expect(d.querySelector('main')?.textContent?.toLowerCase()).not.toContain('guitar');
    expect(d.querySelector('.search-landing-support')).not.toBeNull();
    expect(d.querySelectorAll('.search-instrument-guides a')).toHaveLength(6);
    expect(d.querySelector('.search-landing-next a')?.getAttribute('href')).toBe('#hero');
    expect(d.querySelector('.piano-editor-alternative')?.getAttribute('href')).toBe('/piano-sheet-music-editor');
    const schema=[...d.querySelectorAll('script[type="application/ld+json"]')].map(e=>JSON.parse(e.textContent||'{}'));
    expect(schema.some(item=>item['@type']==='FAQPage')).toBe(true);
  });
  it("preserves the default guitar transcriber hero and canonical",()=>{
    const d=doc(createElement(TranscriberPage));
    expect(d.querySelector('h1')?.textContent).toBe('Convert Any Song to Guitar Tabs');
    expect(d.querySelector('link[rel=canonical]')?.getAttribute('href')).toBe('https://www.note2tabs.com/transcribe');
    expect(d.querySelector('.search-landing-support')).toBeNull();
  });
  it("directs piano acquisition links to the immediate form, including YouTube mode",()=>{
    expect(transcriptionEntryHref('piano')).toBe('/piano-transcription');
    expect(transcriptionEntryHref('piano',true)).toBe('/piano-transcription?mode=youtube');
  });
  it("focuses an existing populated piano track without changing any notes or adding tracks",()=>{
    const guitar: EditorSnapshot={id:'guitar',instrumentId:'acoustic',notes:[{id:1,startTime:0,length:120,midiNum:64,tab:[0,0],optimals:[]}],chords:[],framesPerMessure:480,fps:240,totalFrames:960,cutPositionsWithCoords:[],optimalsByTime:{}};
    const piano: EditorSnapshot={...guitar,id:'piano',instrumentId:'gm:piano',notes:[{...guitar.notes[0],id:2,midiNum:60}]};
    const canvas: CanvasSnapshot={id:'test',editors:[guitar,piano],activeLaneId:'guitar'};
    const next=focusPianoTranscription(canvas);
    expect(next.activeLaneId).toBe('piano');
    expect(next.editors).toBe(canvas.editors);
    expect(canvas.activeLaneId).toBe('guitar');
    const noPiano={...canvas,editors:[guitar]} as CanvasSnapshot;
    expect(focusPianoTranscription(noPiano)).toBe(noPiano);
    const empty={...canvas,editors:[guitar,{...piano,notes:[]}]} as CanvasSnapshot;
    expect(focusPianoTranscription(empty)).toBe(empty);
  });
});
