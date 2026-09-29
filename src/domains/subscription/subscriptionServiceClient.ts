/**
 * Client-facing billing actions. Stripe is intentionally NOT integrated yet
 * (spec section 35) — these are placeholders with the exact shape a real
 * integration will need, so PaywallScreen/SubscriptionSection never have to
 * change when Stripe is wired up. To connect Stripe later:
 *
 *   1. Add a Supabase Edge Function (e.g. `create-checkout-session`) that
 *      creates a Stripe Checkout Session for the family and returns its URL.
 *   2. Replace the body of startCheckout() with a call to that function via
 *      `supabase.functions.invoke('create-checkout-session', { body: { plan } })`
 *      and redirect the browser to the returned URL.
 *   3. Add a Stripe webhook (another Edge Function) that updates
 *      `subscriptions.status/provider/provider_customer_id/provider_subscription_id`
 *      on `checkout.session.completed` / `customer.subscription.updated` events.
 *   4. openBillingPortal() should call a similar function that creates a
 *      Stripe Billing Portal session and redirects there.
 *
 * No Stripe keys are invented or hardcoded here.
 */

export class PaymentsNotConnectedError extends Error {
  constructor() {
    super('Payments are not connected yet. Use the Admin Panel to activate Premium for testing.')
    this.name = 'PaymentsNotConnectedError'
  }
}

export async function startCheckout(_plan: 'monthly' | 'yearly'): Promise<never> {
  throw new PaymentsNotConnectedError()
}

export async function openBillingPortal(): Promise<never> {
  throw new PaymentsNotConnectedError()
}
