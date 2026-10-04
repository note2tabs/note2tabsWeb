import { checkoutSelection, planPrice, priceUsd } from "../lib/pricingPresentation";
import { PLAN_CATALOG } from "../lib/subscriptionPlans";
export default function CheckoutPlanSummary({ destination, signup }: { destination: string; signup: boolean }) {
  const selection = checkoutSelection(destination);
  if (!selection) return null;
  return <aside className="checkout-plan-summary" aria-label="Selected plan">
    <strong>{PLAN_CATALOG[selection.plan].name} · {priceUsd(planPrice(selection.plan, selection.billing))}/{selection.billing === "yearly" ? "year" : "month"}</strong>
    <p>{signup ? "Create your account" : "Log in"} to continue to checkout.</p>
    <small>{priceUsd(planPrice(selection.plan, selection.billing))} billed when you subscribe. Payment method required. Cancel anytime.</small>
  </aside>;
}
