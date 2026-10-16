import { afterEach, describe, expect, it, vi } from "vitest";
import { trackBlockedTranscriptionSubmission } from "../../lib/transcriptionSubmission";
const capture = vi.hoisted(() => vi.fn());
vi.mock("../../lib/analytics", () => ({ ANALYTICS_EVENTS: {transcriptionSubmissionBlocked:"transcription_submission_blocked"}, sendEvent: capture }));
afterEach(() => capture.mockReset());
const context = {surface:"transcriber",mode:"FILE",model:"light",plan:"FREE",signedIn:true,sessionStatus:"authenticated",file:{size:99_403_543,type:"video/mp4",name:"private-recording.mp4"},clipStart:0,clipEnd:60} as const;
describe("blocked transcription telemetry", () => {
  it("captures the post-sign-in oversized-file dead end without filename or contents", () => {
    trackBlockedTranscriptionSubmission(context,"file_too_large","validation",{limit_bytes:50*1024*1024});
    expect(capture).toHaveBeenCalledWith("transcription_submission_blocked",expect.objectContaining({blocked_reason:"file_too_large",blocked_stage:"validation",is_expected_gate:true,surface:"transcriber",file_size_bytes:99_403_543,file_category:"video",limit_bytes:52_428_800,subscription_plan:"free",signed_in:true,clip_duration_sec:60,transcription_model_id:"msmodel_small"}));
    expect(JSON.stringify(capture.mock.calls)).not.toContain("private-recording");
  });
  it("uses pending input details during restoration rather than the preceding render", () => {
    trackBlockedTranscriptionSubmission({...context,mode:"YOUTUBE",file:null},"file_too_large","auth_resume",{mode:"FILE",file_size_bytes:99_403_543,clip_start_sec:12,clip_end_sec:42});
    expect(capture.mock.calls[0][1]).toMatchObject({mode:"FILE",has_file:true,file_size_bytes:99_403_543,clip_start_sec:12,clip_end_sec:42,clip_duration_sec:30});
  });
  it.each(["home_transcriber","transcriber"] as const)("distinguishes credit gates from request failures on %s", surface => {
    trackBlockedTranscriptionSubmission({...context,surface},"credits_exhausted","server",{http_status:403,request_id:"request-123"});
    expect(capture.mock.calls[0][1]).toMatchObject({blocked_reason:"credits_exhausted",is_expected_gate:true,http_status:403,request_id:"request-123"});
    trackBlockedTranscriptionSubmission({...context,surface},"request_failed","upload_presign");
    expect(capture.mock.calls[1][1]).toMatchObject({blocked_stage:"upload_presign",is_expected_gate:false});
  });
  it("does not attach a stale selected file to a YouTube attempt or emit invalid numbers", () => {
    trackBlockedTranscriptionSubmission({...context,mode:"YOUTUBE",clipStart:NaN,clipEnd:Infinity},"invalid_clip_range","validation");
    expect(capture.mock.calls[0][1]).toMatchObject({has_file:false,file_size_bytes:undefined,file_category:undefined,clip_start_sec:undefined,clip_end_sec:undefined,clip_duration_sec:undefined});
  });
  it("cannot break validation when analytics throws", () => {
    capture.mockImplementation(()=>{throw Error("analytics unavailable");});
    expect(()=>trackBlockedTranscriptionSubmission(context,"file_too_large","validation")).not.toThrow();
  });
  it("includes storage rejection diagnostics on the blocked submission", () => {
    trackBlockedTranscriptionSubmission(context, "request_failed", "upload_storage", {
      http_status: 403, storage_error_code: "signature_does_not_match", upload_failure_kind: "http",
      request_id: "storage-request-123", upload_attempt: 1, upload_elapsed_ms: 150, upload_browser_online: true,
    });
    expect(capture.mock.calls[0][1]).toMatchObject({
      is_expected_gate: false, blocked_stage: "upload_storage", http_status: 403,
      storage_error_code: "signature_does_not_match", upload_failure_kind: "http",
      request_id: "storage-request-123", upload_attempt: 1, upload_elapsed_ms: 150, upload_browser_online: true,
    });
  });
});
