/**
 * Which payment provider a billing row came from. Rows carry it so the
 * mirror, the audit trail and a checkout can be told apart when a second
 * provider is added; the org itself does not — one org has one live
 * subscription at a time, and the mirror row says where it lives.
 */
export const billingProviderValues = ["paymob"] as const;
export type BillingProviderId = (typeof billingProviderValues)[number];
