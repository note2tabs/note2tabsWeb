import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { stripeClient } from "../../../lib/stripe";
import { getStripePaidPlanConfig, getStripePaidPlanConfigs } from "../../../lib/stripePremium";
import { inspectPremiumCustomerState } from "../../../lib/stripePremiumOffer";
import { getFreshUserAccess } from "../../../lib/serverAuth";
import { getAppBaseUrl } from "../../../lib/urls";

const PAID_ROLES = new Set(["PREMIUM", "ADMIN", "MODERATOR", "MOD"]);
const redirect = (res: NextApiResponse, status: 302 | 303, location: string) => {
  res.statusCode = status;
  res.setHeader("Location", location);
  res.end();
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const baseUrl = getAppBaseUrl(req);
  const route = "/api/stripe/school-access-checkout";
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id || !session.user.email) {
    return redirect(res, 302, `/auth/login?next=${encodeURIComponent(route)}`);
  }
  const access = await getFreshUserAccess(session);
  if (!access?.role) return redirect(res, 302, "/auth/login");
  if (PAID_ROLES.has(access.role)) return redirect(res, 302, "/settings");

  const config = getStripePaidPlanConfig("PREMIUM", "monthly");
  const configs = Object.values(getStripePaidPlanConfigs()).filter(
    (value): value is NonNullable<typeof value> => Boolean(value)
  );
  if (!stripeClient || !config) return redirect(res, 302, "/pricing?checkout_error=unavailable");

  try {
    const customerState = await inspectPremiumCustomerState({
      stripe: stripeClient,
      email: session.user.email,
      config,
      configs,
    });
    if (customerState.manageableCustomer) return redirect(res, 302, "/settings");

    const existingCustomer = customerState.premiumCustomer || customerState.fallbackCustomer;
    const metadata = {
      userId: session.user.id,
      note2tabsPlan: "premium",
      note2tabsBillingInterval: "monthly",
      note2tabsPriceId: config.priceId,
      premiumTrialIncluded: "false",
      note2tabsSchoolCheckout: "true",
    };
    const checkout = await stripeClient.checkout.sessions.create({
      ...(existingCustomer ? { customer: existingCustomer.id } : { customer_email: session.user.email }),
      mode: "subscription",
      payment_method_collection: "if_required",
      line_items: [{ price: config.priceId, quantity: 1 }],
      allow_promotion_codes: true,
      subscription_data: { metadata },
      metadata,
      custom_text: {
        submit: { message: "Enter your school access code above. A valid card-free school code will not ask for payment details." },
      },
      success_url: `${baseUrl}/premium/welcome?next=%2Ftranscribe&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pricing`,
    });
    if (!checkout.url) throw new Error("Stripe returned no Checkout URL");
    return redirect(res, 303, checkout.url);
  } catch (error) {
    console.error("school access checkout creation failed", error);
    return redirect(res, 302, "/pricing?checkout_error=school_access");
  }
}
