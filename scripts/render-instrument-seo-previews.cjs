/* Original examples, engraved with the same VexFlow font as the product. */
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><div id="score"></div>');
global.window = dom.window; global.document = dom.window.document;
const { createCanvas, GlobalFonts, convertSVGTextToPath } = require('@napi-rs/canvas');
// Convert music glyphs to outlines: image previews must not rely on page fonts.
for (const [file, family] of [['bravura','Bravura'], ['academico','Academico']]) {
  const source=fs.readFileSync(`node_modules/vexflow/build/esm/src/fonts/${file}.js`,'utf8');
  const base64=source.match(/base64,([^']+)/)[1];
  if(!GlobalFonts.register(Buffer.from(base64,'base64'),family)) throw Error(`Could not load ${family}`);
}
dom.window.HTMLCanvasElement.prototype.getContext = function () { return createCanvas(790, 290).getContext('2d'); };
const V = require('vexflow/bravura');
const { Renderer, Stave, StaveNote, Voice, Formatter, StaveConnector, Beam } = V;
function render(file, title, height, draw) {
  const host=document.getElementById('score');host.innerHTML='';
  const renderer=new Renderer(host, Renderer.Backends.SVG);renderer.resize(790,height);
  const ctx=renderer.getContext();ctx.setFillStyle('#1a2923');ctx.setStrokeStyle('#1a2923');
  draw(ctx);
  const svg=host.querySelector('svg');svg.setAttribute('xmlns','http://www.w3.org/2000/svg');svg.setAttribute('viewBox',`0 0 790 ${height}`);svg.setAttribute('role','img');
  svg.insertAdjacentHTML('afterbegin',`<title>${title}</title><rect width="790" height="${height}" fill="#fffefb"/>`);
  fs.writeFileSync(`public/images/editor-previews/${file}.svg`,convertSVGTextToPath(svg.outerHTML)+'\n');
}
const voice = (notes) => new Voice({ num_beats:4, beat_value:4 }).addTickables(notes);
render('piano-score','An original two-bar piano phrase',290,ctx=>{
  for(let bar=0;bar<2;bar++) {
    const x=bar===0?32:410, width=bar===0?378:348;
    const treble=new Stave(x,30,width), bass=new Stave(x,160,width);
    if(!bar) {treble.addClef('treble').addTimeSignature('4/4');bass.addClef('bass').addTimeSignature('4/4');}
    treble.setContext(ctx).draw();bass.setContext(ctx).draw();
    new StaveConnector(treble,bass).setType(bar?StaveConnector.type.SINGLE_RIGHT:StaveConnector.type.BRACE).setContext(ctx).draw();
    const notes=(bar?['g/4','e/4','d/4','c/4']:['c/4','d/4','e/4','g/4']).map(key=>new StaveNote({keys:[key],duration:'q'}));
    const low=new StaveNote({keys:bar?['g/2','d/3','g/3']:['c/3','g/3','c/4'],duration:'w',clef:'bass'});
    const upperVoice=voice(notes),lowerVoice=voice([low]);
    new Formatter().joinVoices([upperVoice]).format([upperVoice],width-(bar?35:105));upperVoice.draw(ctx,treble);
    new Formatter().joinVoices([lowerVoice]).format([lowerVoice],width-(bar?35:105));lowerVoice.draw(ctx,bass);
  }
});
render('drum-score','An original two-bar drum groove',220,ctx=>{
  for(let bar=0;bar<2;bar++) {
    const stave=new Stave(bar?410:32,58,bar?348:378);
    if(!bar)stave.addClef('percussion').addTimeSignature('4/4');
    stave.setContext(ctx).draw();
    const hats=Array.from({length:8},()=>new StaveNote({keys:['g/5/x2'],duration:'8',stemDirection:1}));
    const drums=Array.from({length:4},(_,i)=>new StaveNote({keys:[i%2?'c/5':'f/4'],duration:'q',stemDirection:-1}));
    const top=voice(hats),bottom=voice(drums);
    new Formatter().joinVoices([top]).joinVoices([bottom]).format([top,bottom],bar?310:272);
    const beams=Beam.generateBeams(hats,{stemDirection:1});
    top.draw(ctx,stave);bottom.draw(ctx,stave);
    beams.forEach(b=>b.setContext(ctx).draw());
  }
});
const bass=fs.readFileSync('public/images/editor-previews/bass-transcription-tab.svg','utf8');
const ukulele=bass.replace('Two-bar bass tablature','An original two-bar ukulele phrase').replace('>G</text>','>A</text>').replace('>D</text>','>E</text>').replace('>A</text><text x="37" y="166">E</text>','>C</text><text x="37" y="166">G</text>');
fs.writeFileSync('public/images/editor-previews/ukulele-tab.svg',ukulele);
