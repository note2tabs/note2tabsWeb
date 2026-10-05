import { useState } from "react";
import SeoHead from "../../components/SeoHead";
import TranscriptionSignupDialog from "../../components/TranscriptionSignupDialog";

export default function TranscriptionSignupPreviewPage() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <SeoHead title="Transcription signup preview | Note2Tabs" description="Internal account-creation dialog preview." canonicalPath="/dev/transcription-signup" noindex />
      <main className="premium-prompt-dev">
        <header className="premium-prompt-dev__intro">
          <span>INTERNAL DESIGN PREVIEW</span>
          <h1>Seamless transcription signup</h1>
          <p>The transcription selection is preserved before this dialog appears.</p>
          {!open ? <button className="button-primary" type="button" onClick={() => setOpen(true)}>Open signup dialog</button> : null}
        </header>
      </main>
      <TranscriptionSignupDialog open={open} mode="YOUTUBE" returnTo="/dev/transcription-signup" onClose={() => setOpen(false)} onComplete={() => setOpen(false)} />
    </>
  );
}
