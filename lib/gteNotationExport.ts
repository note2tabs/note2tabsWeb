import type { EditorSnapshot } from "../types/gte";
import { buildNotationScore, quantizeNotationEvents, SCORE_WHOLE } from "./gteNotationScore";
import { scoreEvents } from "./gteNotation";
const escape = (value: string) => value.replace(/[<>&"']/g, char => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[char]!));
/** MusicXML shares the exact same quantized voices/rests/ties as Sheets. Audio
 * timestamps remain untouched; native JSON remains the lossless project format. */
export function buildNotationMusicXml(snapshot: EditorSnapshot) {
  const score = buildNotationScore(snapshot), factor = score.barTicks / score.framesPerBar;
  const bounds = new Map(quantizeNotationEvents(scoreEvents(snapshot), factor, score.barTicks).flatMap(group => group.events.map(event => [event.key, { start: group.start, end: group.end }] as const)));
  const types: Record<number, string> = { 1: "whole", 2: "half", 4: "quarter", 8: "eighth", 16: "16th", 32: "32nd", 64: "64th", 128: "128th" };
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<score-partwise version="3.1">', `<work><work-title>${escape(snapshot.name ?? "Note2Tabs export")}</work-title></work>`,
    '<part-list><score-part id="P1"><part-name>Notation</part-name></score-part></part-list>', '<part id="P1">'];
  for (const measure of score.measures) {
    lines.push(`<measure number="${measure.index + 1}">`);
    if (measure.index === 0) lines.push(`<attributes><divisions>${SCORE_WHOLE / 4}</divisions><time><beats>${score.numerator}</beats><beat-type>${score.denominator}</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>`);
    let first = true;
    for (const staff of ["treble", "bass"] as const) for (const [voice, tokens] of measure.voices[staff].entries()) {
      if (!tokens.some(token => !token.hidden)) continue;
      if (!first) lines.push(`<backup><duration>${score.barTicks}</duration></backup>`);
      first = false;
      for (const token of tokens) {
        const pitches = token.rest ? [undefined] : token.pitches;
        pitches.forEach((pitch, index) => {
          lines.push("<note>");
          if (index > 0) lines.push("<chord/>");
          if (!pitch) lines.push("<rest/>");
          else {
            const match = pitch.key.match(/^([a-g])([#b]*)\/(-?\d+)$/)!;
            const alter = match[2].includes("#") ? match[2].length : -match[2].length;
            lines.push(`<pitch><step>${match[1].toUpperCase()}</step>${alter ? `<alter>${alter}</alter>` : ""}<octave>${match[3]}</octave></pitch>`);
          }
          lines.push(`<duration>${token.ticks}</duration>`);
          let tieIn = false, tieOut = false;
          if (pitch) {
            tieIn = pitch.sources.some(event => bounds.get(event.key)!.start < token.tick) || pitch.sources.some(event => bounds.get(event.key)!.start === token.tick && snapshot.notation?.ties?.some(link => link.to === event.key));
            tieOut = pitch.sources.some(event => bounds.get(event.key)!.end > token.tick + token.ticks) || pitch.sources.some(event => bounds.get(event.key)!.end === token.tick + token.ticks && snapshot.notation?.ties?.some(link => link.from === event.key));
            if (tieIn) lines.push('<tie type="stop"/>');
            if (tieOut) lines.push('<tie type="start"/>');
          }
          lines.push(`<voice>${voice + 1}</voice><type>${types[token.denominator] ?? "quarter"}</type>${token.dotted ? "<dot/>" : ""}`);
          if (token.tuplet) lines.push("<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>");
          lines.push(`<staff>${staff === "treble" ? 1 : 2}</staff>`);
          if (tieIn || tieOut) lines.push(`<notations>${tieIn ? '<tied type="stop"/>' : ""}${tieOut ? '<tied type="start"/>' : ""}</notations>`);
          lines.push("</note>");
        });
      }
    }
    lines.push("</measure>");
  }
  return [...lines, "</part></score-partwise>"].join("\n");
}
