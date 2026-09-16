import type { Organization } from "@/drizzle/schema";

/**
 * A paid plan that is still running. Keyed on `planSource`, not on the
 * provider's subscription id: the id may arrive a little after the payment
 * (or never, for a provider that only reports it out of band), and the
 * org must not be offered a second checkout meanwhile. A cancelled one
 * counts as over (charging has stopped; the org keeps its plan until the
 * paid-for period ends and may start a new subscription meanwhile).
 */
export function hasLiveSubscription(
  org: Pick<Organization, "planSource" | "billingSubscriptionStatus">,
): boolean {
  return (
    org.planSource === "subscription" &&
    org.billingSubscriptionStatus !== "canceled"
  );
}

/** Seats and cancellation need the provider's subscription id as well. */
export function canManageSubscription(
  org: Pick<
    Organization,
    "planSource" | "billingSubscriptionStatus" | "billingSubscriptionId"
  >,
): boolean {
  return hasLiveSubscription(org) && org.billingSubscriptionId != null;
}
