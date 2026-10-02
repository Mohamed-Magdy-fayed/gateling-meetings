/**
 * Card-scheme marks shown in the footer and at checkout (Paymob agreement
 * clause 3.2.2). One switch, one list, so they can be removed in one edit
 * if the payment service ends. The badges in `public/payment-brands/`
 * are drawn in-house in each scheme's brand colours; swap in the
 * official artwork from Visa's / Mastercard's brand centres any time
 * under the same file names.
 */
export const PAYMENT_BRANDS = {
  enabled: true,
  brands: [
    { id: "visa", name: "Visa", src: "/payment-brands/visa.svg" },
    {
      id: "mastercard",
      name: "Mastercard",
      src: "/payment-brands/mastercard.svg",
    },
  ],
} as const;
