# Exploratory iteration of action weights

The initial implementation tested a fixed ruleset and individual signals. It did not search combinations of weights. This follow-up does so, without training an AI model or changing live decisions.

## Method

For the same mature signup cohort as the first replay, compute binary features from events strictly before signup + six hours. Predict meaningful return between signup +24 hours and +seven days. Features: at least one successful transcription, practice, deliberate editing, saving, recent voluntary pricing, and at least two distinct successful jobs.

Enumerate all 4,095 nonzero combinations of six integer weights in {0,1,2,4}, and all positive integer score thresholds. For four audience budgets, choose the rule capturing the most returners on September 1–21 (1,316 users, 51 returners). Break ties in favor of fewer flagged users, then fewer nonzero weights, then smaller total weight. Require an audience of at least 20 and at least half the budget. Never break score ties using identity or future outcomes.

Then apply the unchanged weights and threshold to September 22–October 7 (964 users, 41 returners). Both periods were previously inspected, so this is exploratory temporal evaluation, not independent validation or evidence of intervention impact. No later-cohort outcomes are used inside candidate selection. Searching thousands of rules over only 51 earlier returners can overfit. There is no global optimum claim.

## Results on later users

Overall return rate: 41/964 = 4.25%.

| Earlier-cohort audience cap | Later users flagged | Returners caught | Return rate among flagged | Share of all returners caught |
|---|---:|---:|---:|---:|
| 5% | 55 | 6 | 10.91% | 14.63% |
| 10% | 74 | 7 | 9.46% | 17.07% |
| 20% | 180 | 13 | 7.22% | 31.71% |
| 40% | 451 | 26 | 5.76% | 63.41% |

The caps apply to earlier-cohort selection, not to later traffic: actual later flag rates are 5.7%, 7.7%, 18.7%, and 46.8%. A fixed threshold does not guarantee a fixed future contact budget. The production contact budget must remain a separate hard constraint. These flags are prediction research, not sendable reminder audiences: activity, permission, and timing gates still apply.

## Example weights, rather than a universal importance ranking

The 20%-budget candidate selected on the earlier cohort uses:

| First-six-hour feature | Points |
|---|---:|
| Practice | 4 |
| At least two successful jobs | 2 |
| Recent voluntary pricing visit | 2 |
| Deliberate editing | 1 |
| Saved project | 1 |
| One successful transcription | 0 additional points |

Threshold: 6 points. Features are capped binary indicators, not points per click. One success being worth zero additional points does not mean successful transcription has no value: it is widespread and adds little discrimination in this combination. Useful-product evidence remains a separate prerequisite for real messaging.

The 5%-budget candidate instead uses success=1, practice=2, edit=1, save=1, pricing=1, multiple successes=2, threshold=6. That improves precision while missing more returners. Which objective is preferable depends on the action's cost and fatigue risk. A free-credit or coupon policy cannot inherit a retention score without testing its economics separately.

The exact weights are not stable enough to call optimal: for the 20% budget, 316 weight/threshold combinations catch within one earlier-cohort returner of the selected candidate. Many weights can be rescaled or trade off correlated actions while selecting similar audiences. Do not interpret 4 versus 2 points as twice the causal impact.

## Simpler baseline matters

At least two successful jobs alone flags 71 later users and catches 7 returners (9.86%). The selected 10%-budget weighted rule flags 74 and also catches 7 (9.46%). That weighted candidate has not beaten the simpler rule on these observed later outcomes. Complexity is not automatically useful.

Exports and explicit external-file imports cannot receive empirically validated weights from this history because their new telemetry is absent. Foreground editor duration is also excluded: visible time is not attention. Technical failures, current checkout, paid entitlement, permission, and dismissals stay eligibility/recovery gates instead of positive or negative points that other actions can overpower.

## Purchase target

The extract contains only 12 people with tracked subscription events, not billing-reconciled new purchasers. In the mature signup cohort, five tracked subscriptions occur before six hours and zero occur between six hours and seven days. This fixed checkpoint therefore has no later paid positives to optimize against. Purchase timing needs event-level evaluation before checkout, already performed in the first replay; tuning many purchase weights against 12 outcomes would not establish reliable future performance.

## Recommendation

Keep the live/shadow action policy unchanged for now. Record the narrow and broader candidates as competing research policies, alongside the simple repeat-success baseline. Evaluate future data with frozen weights and prespecified budgets. Select the practical objective per action: more coverage for a low-cost useful reminder, stronger evidence and a strict budget for incentives. Randomized tests are required to measure additional returns, paid conversions, and contribution caused by each action.

Reproduce: `node scripts/engagement/weight-search.mjs /tmp/n2t-engagement-history-final.json docs/engagement/weight-search-2026-10-17.json`. The machine-readable report includes all selected weights, thresholds, earlier/later counts, near-optimal ranges, and single-feature comparisons. No raw person histories are committed.
