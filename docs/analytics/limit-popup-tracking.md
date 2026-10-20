# Transcription limit popup tracking

Existing premium_prompt lifecycle events now carry popup_type=transcription_limit,
popup_version=priced_limit_v2 and an explicit limit_type:
file_size, youtube_length, file_length, model_access, credits_exhausted,
insufficient_credits, credits_low.

Break down premium_prompt_viewed by limit_type for actual visible impressions;
use unique people for reach. Shown/rendered/eligible describe separate lifecycle
stages and must not be summed as impressions. Unchanged rerenders do not repeat
the shown event; reopened dialogs and new blocked attempts are new impressions.

Clicks carry cta=start_checkout, confirm_pro_upgrade, review_upgrade or compare_plans.
Dismissals carry dismiss_method=escape or back_to_transcriber.
current_plan and target_plan distinguish Free→Premium, Free→Pro and Premium→Pro.
Numeric credit, upload and duration context is included; filenames/YouTube URLs are not.
Existing premium_funnel_id remains available to join the journey to billing events.
Preview actions do not emit analytics. This instrumentation affects new events only.
