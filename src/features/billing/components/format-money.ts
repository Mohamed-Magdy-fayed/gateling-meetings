/**
 * `14900` + `EGP` → "EGP 149.00" / "١٤٩٫٠٠ ج.م.‏" depending on the locale.
 * Amounts are in the currency's smallest unit; EGP has two decimals.
 */
export function formatMoney(
  amountCents: number,
  currency: string,
  locale: string,
): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-EG", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
}
