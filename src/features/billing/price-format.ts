export type DisplayPrice = {
  /** Minor units as Paddle stores them ("300" = $3.00). */
  amount: number;
  currencyCode: string;
  /** "month" | "year" | …; null for a one-off price. */
  interval: string | null;
};

/** "$3" / "US$3.50" — whole units when the amount has no cents. */
export function formatDisplayPrice(
  price: DisplayPrice,
  locale: string,
): string {
  const units = price.amount / 100;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: price.currencyCode,
    minimumFractionDigits: Number.isInteger(units) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(units);
}
