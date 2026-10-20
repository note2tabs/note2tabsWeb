import type Stripe from "stripe";
import { prisma } from "./prisma";
import { lockCreditWallet } from "./creditWallet";
import { creditTopUpQuote } from "./creditTopUpPricing";

export async function fulfillCreditTopUp(session: Stripe.Checkout.Session) {
  const id = session.metadata?.creditTopUpOrderId;
  if (!id) return false;
  if (session.mode !== "payment" || session.payment_status !== "paid")
    return true;
  const order = await prisma.creditTopUpOrder.findUnique({ where: { id } });
  if (!order) throw new Error("Unknown credit top-up order");
  const quote = creditTopUpQuote(order.credits);
  if (
    session.id !== order.checkoutSessionId ||
    session.client_reference_id !== order.userId ||
    session.currency !== order.currency ||
    session.amount_total !== order.amountCents ||
    order.amountCents !== quote.amountCents
  )
    throw new Error("Credit top-up payment mismatch");
  const intent =
    typeof session.payment_intent === "object" ? session.payment_intent : null;
  const charge =
    intent && typeof intent.latest_charge === "object"
      ? intent.latest_charge
      : null;
  const refunded = charge?.amount_refunded || 0;
  return prisma.$transaction(async (tx) => {
    // Wallet lock serializes concurrent deliveries, purchases, and backend charges.
    const user = await tx.user.findUniqueOrThrow({
      where: { id: order.userId },
    });
    const balance = await lockCreditWallet(tx, user, user.tokensRemaining);
    const current = await tx.creditTopUpOrder.findUniqueOrThrow({
      where: { id },
    });
    const refundedCents = Math.max(
      current.refundedCents,
      Math.min(order.amountCents, refunded),
    );
    const revokedCredits = Math.floor(
      (order.credits * refundedCents) / order.amountCents,
    );
    const delta =
      (current.fulfilled ? 0 : order.credits) -
      (revokedCredits - current.revokedCredits);
    const next = Math.max(0, balance + delta);
    await tx.$executeRaw`UPDATE user_credits SET credits=${next},"updatedAt"=NOW() WHERE "userId"=${user.id}`;
    await tx.user.update({
      where: { id: user.id },
      data: { tokensRemaining: next },
    });
    await tx.creditTopUpOrder.update({
      where: { id },
      data: {
        fulfilled: true,
        fulfilledAt: current.fulfilledAt || new Date(),
        paymentIntentId:
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : intent?.id,
        refundedCents,
        revokedCredits,
      },
    });
    return true;
  });
}
