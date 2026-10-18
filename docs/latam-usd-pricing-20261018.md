# Spanish-speaking American pricing — October 18, 2026

The earlier Latin American rollout was prepared on branch commit bd2a0b27 but never released. Current production selects price from currency alone, so Argentina and other USD-fallback markets receive standard US prices. This change adds a separate pricing market rather than changing the global USD amount.

Premium: USD2.99 monthly / USD29.99 yearly. Pro: USD7.49 monthly / USD74.99 yearly. Eligible geography: AR, BO, CL, CO, CR, CU, DO, EC, GT, HN, NI, PA, PE, PR, PY, SV, UY, VE. Eligibility is independent of chosen language. Mexico retains MXN89/899 Premium and MXN219/2199 Pro. Brazil retains its existing BRL prices. US, Canada, Spain and all other markets retain existing prices. Existing subscriptions are not repriced.

Trusted Vercel country selects the tier for new normal/school checkouts; caller cookies and body do not select it. The four immutable Stripe prices were verified live by ID, active state, USD amount, interval and product. Stripe parity validation checks the regional amount. Webhook matching includes all four regional price IDs. Subscription metadata preserves the tier during future upgrades/downgrades even if the buyer travels or new sales rollout is paused.

The edge sets n2t_pricing_market. Localized server-rendered pages receive the initial tier and currency. Static English pages apply the edge cookies after hydration, following the existing currency behavior. Cards, annual savings (rounded up as requested), billing FAQ and pricing structured data share the same tier-aware amounts. This does not introduce a new Spanish locale or modify tax collection. Country eligibility is an IP-based commercial offer, not proof of tax residence or support for payment methods in restricted jurisdictions.

Configuration (production and preview): LATAM_PRICING_ENABLED=true and STRIPE_MARKET_LATAM_{PREMIUM|PRO}_{MONTHLY|YEARLY}. Without complete config, new regional offers remain off. The existing active Stripe price IDs are price_1UQngg4WRmrnOGtcNEWubpVL, price_1UQngh4WRmrnOGtcQkIZYfuC, price_1UQngi4WRmrnOGtcn6RY8T3W and price_1UQngj4WRmrnOGtcZE3UraJ3 respectively.

Already-issued Checkout Sessions keep their original amounts; a new checkout uses the selected regional price. Do not rewrite or charge existing customer sessions as a production test.

Validation: 170 focused pricing/billing tests, TypeScript, live read-only Stripe price verification, local country-header rendering and browser checks of monthly/yearly cards. No live purchase, email or existing customer mutation performed for validation.
