import SeoHead from "../../components/SeoHead";
import { PremiumHomeCalloutCard } from "../../components/PremiumHomeCallout";
import { PremiumPromptCard, type PromptReason } from "../../components/PremiumUpgradePrompt";
import PostValuePremiumPrompt from "../../components/PostValuePremiumPrompt";
import HeavyPreviewEditorPrompt from "../../components/HeavyPreviewEditorPrompt";
import PostLightModelPrompt from "../../components/PostLightModelPrompt";
import PremiumConversionCard from "../../components/PremiumConversionCard";
import type { ReactNode } from "react";

const noop = () => undefined;

const contextualStates: Array<{
  reason: PromptReason;
  label: string;
  timing: string;
}> = [
  {
    reason: "returning_user",
    label: "Returning free user",
    timing: "On a later-day visit, before work starts. Any pointer or keyboard activity defers it.",
  },
  {
    reason: "low_credits",
    label: "Low credits",
    timing: "Shown in the transcriber when three or fewer credits remain.",
  },
  {
    reason: "no_credits",
    label: "No credits",
    timing: "Shown when the user reaches zero credits and needs Premium to continue.",
  },
];

function EditorStage({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="premium-prompt-dev-editor">
      <header>
        <div><span>EDITOR PREVIEW</span><strong>{title}</strong></div>
        <div className="premium-prompt-dev-editor__actions"><button>Share tab</button><button>Back to editors</button></div>
      </header>
      <div className="premium-prompt-dev-editor__canvas" aria-hidden="true">
        <span>Bar 1</span>
        {[0, 1, 2, 3, 4, 5].map((line) => <i key={line} style={{ top: `${34 + line * 25}px` }} />)}
        <b style={{ left: "18%", top: "49px" }}>7</b><b style={{ left: "39%", top: "99px" }}>9</b><b style={{ left: "64%", top: "74px" }}>12</b>
      </div>
      {children}
    </section>
  );
}

export default function PremiumPromptsPreviewPage() {
  return (
    <>
      <SeoHead
        title="Premium prompt gallery | Note2Tabs"
        description="Internal preview of Premium conversion prompts."
        canonicalPath="/dev/premium-prompts"
        noindex
      />
      <main className="premium-prompt-dev">
        <header className="premium-prompt-dev__intro">
          <span>INTERNAL DESIGN PREVIEW</span>
          <h1>Premium conversion prompts</h1>
          <p>Every production state introduced by the progressive monetization update, shown without eligibility or cooldown requirements.</p>
        </header>

        <section className="premium-prompt-dev__section">
          <div className="premium-prompt-dev__section-heading">
            <div><span>01</span><h2>YouTube limit guidance</h2></div>
            <p>Appears only after a valid YouTube link is entered, where the 30-second free limit becomes relevant.</p>
          </div>
          <div className="premium-prompt-dev__transcriber">
            <div className="premium-prompt-dev__form">
              <label>YouTube link</label>
              <div><span>https://www.youtube.com/watch?v=example</span><button>Start transcription</button></div>
            </div>
            <div className="premium-home-callout-wrap premium-home-callout-wrap--preview">
              <PremiumHomeCalloutCard href="#preview" onClick={noop} />
            </div>
          </div>
        </section>

        <section className="premium-prompt-dev__section">
          <div className="premium-prompt-dev__section-heading">
            <div><span>02</span><h2>Contextual transcriber prompts</h2></div>
            <p>Reason-specific messages with independent cooldowns. They no longer appear simply because twelve seconds passed.</p>
          </div>
          <div className="premium-prompt-dev__grid">
            <article className="premium-prompt-dev__card">
              <div><h3>File size limit</h3><p>Appears immediately after a free user selects an audio file larger than 50 MB.</p></div>
              <PremiumConversionCard title="This file needs Premium" description="Free uploads are limited to 50 MB. Premium supports files up to 200 MB." actionLabel="See Premium" href="#preview" />
            </article>
            <article className="premium-prompt-dev__card">
              <div><h3>Pro file size limit</h3><p>Files over 200 MB point to Pro rather than sending the user into the wrong checkout.</p></div>
              <PremiumConversionCard title="This file needs Pro" description="This file is larger than Premium's 200 MB limit. Pro supports files up to 500 MB." actionLabel="See Pro" planLabel="Note2Tabs Pro" reassurance="$14.99 billed today · Cancel anytime" href="#preview" />
            </article>
            <article className="premium-prompt-dev__card">
              <div><h3>File duration limit</h3><p>Explains why only the first 60 seconds can be selected from a longer upload.</p></div>
              <PremiumConversionCard title="Transcribe more of this file" description="Free accounts can select up to 60 seconds. Premium unlocks full-length audio-file transcription." actionLabel="See longer options" href="#preview" />
            </article>
            <article className="premium-prompt-dev__card">
              <div><h3>Locked Heavy model</h3><p>Appears when a free user actively selects the locked Heavy model.</p></div>
              <PremiumConversionCard title="Use the Heavy model" description="The Heavy model is available with Premium or Pro for our highest transcription accuracy." actionLabel="See plans" href="#preview" />
            </article>
            {contextualStates.map((state) => (
              <article className="premium-prompt-dev__card" key={state.reason}>
                <div><h3>{state.label}</h3><p>{state.timing}</p></div>
                <PremiumPromptCard reason={state.reason} href="#preview" onDismiss={noop} onClick={noop} preview />
              </article>
            ))}
          </div>
        </section>

        <section className="premium-prompt-dev__section">
          <div className="premium-prompt-dev__section-heading">
            <div><span>03</span><h2>Editor prompts after value</h2></div>
            <p>These wait until playback finishes. The user sees and hears the result before Note2Tabs asks for another decision.</p>
          </div>
          <div className="premium-prompt-dev__editor-grid">
            <div><h3>General post-value offer</h3><p>For an engaged free user without a higher-priority model message.</p><EditorStage title="After meaningful use"><PostValuePremiumPrompt open editorId="preview" trigger="playback_completed" onClose={noop} onUpgrade={noop} /></EditorStage></div>
            <div><h3>Heavy preview completed</h3><p>Continued Heavy access, only after the preview result has been explored.</p><EditorStage title="After a Heavy preview"><HeavyPreviewEditorPrompt open onClose={noop} onUpgrade={noop} /></EditorStage></div>
            <div><h3>Light result · Heavy preview eligible</h3><p>The free preview takes priority over the general Premium offer.</p><EditorStage title="Heavy preview recommendation"><PostLightModelPrompt open recommendation="heavy_preview" onClose={noop} onTryAgain={noop} /></EditorStage></div>
            <div><h3>Light result · Medium recommendation</h3><p>Free users who cannot preview Heavy receive the more relevant model suggestion.</p><EditorStage title="Medium recommendation"><PostLightModelPrompt open recommendation="medium" onClose={noop} onTryAgain={noop} /></EditorStage></div>
          </div>
        </section>

        <section className="premium-prompt-dev__section premium-prompt-dev__rules">
          <div className="premium-prompt-dev__section-heading">
            <div><span>04</span><h2>Behavior and measurement</h2></div>
          </div>
          <div className="premium-prompt-dev__rules-grid">
            <div><strong>Priority</strong><p>Credit or feature limit → Heavy follow-up → Light recommendation → returning user → general post-value → contextual YouTube guidance.</p></div>
            <div><strong>No overlap</strong><p>Only one promotional editor surface renders at a time. Paid users and staff see none of them.</p></div>
            <div><strong>Dismissal</strong><p>Each reason has its own cooldown. Dismissing one offer no longer hides unrelated offers for fourteen days.</p></div>
            <div><strong>Analytics</strong><p>Eligibility, render, actual viewport exposure, deferral, click, and dismissal are tracked separately through pricing and checkout.</p></div>
          </div>
        </section>
      </main>
    </>
  );
}
