# Credit purchase design — October 20, 2026

Held on `codex/credit-topups-20261020`; not live.

Primary references:
- Lovable credit top-ups: https://docs.lovable.dev/introduction/credit-top-ups
- Lovable balance/usage: https://docs.lovable.dev/introduction/credits-and-usage
- Claude usage credits: https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans
- Codex pricing/extra usage: https://learn.chatgpt.com/docs/pricing

Lovable is the closest product pattern: purchase a specified credit amount, see the cost before purchase, add it to the existing balance without changing subscription. It exposes add-credits actions in billing and low-balance contexts. Its paid-only access, expiration and automatic top-ups are not our policy. Claude's usage settings emphasize balance, explicit purchases and spending controls. Codex documents extra credits to continue without a plan upgrade. None of these docs establishes conversion superiority or provides an empirical comparison of layouts. This implementation uses the documented behavior as inspiration; it does not claim to reproduce their authenticated UI.

The page offers three shortcuts (15/30/60), plus arbitrary valid quantities in 15-credit steps. Minimum stays 15; 45 remains available as custom. No higher default or invented “popular”/“best value” badge. Show exact USD prices on every shortcut and the purchase button. Current balance loads only for authenticated accounts and only from an actual successful credit API response; do not invent a balance. Preserve the chosen quantity through localized login. Keep one-time purchase, no expiry and unchanged plan entitlement visible with short wording.

The requested Stripe-confirmation footer sentence is removed. Payment-processing status still appears only on payment return, since delayed fulfillment must not be misrepresented as a successful credit grant. Quantity, amount, order ownership and fulfillment remain validated server-side; this redesign doesn't change Stripe/wallet logic. Auto recharge is not implemented.

Verification story: choose a preset/custom amount → server-validated one-time checkout → signed webhook wallet grant → owner-only status polling and balance refresh. This iteration verifies selection, quantity validation, auth handoff, duplicate clicks and error handling using mocked API boundaries plus real browser UI. Existing isolated PostgreSQL wallet tests cover the grant/debit/refund boundaries. A completed Stripe application test-mode purchase is still required before release; the local UI has no live payment credentials.
