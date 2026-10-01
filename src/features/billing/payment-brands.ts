/**
 * Card-scheme marks shown in the footer and at checkout (Paymob agreement
 * clause 3.2.2). One switch, one list, so they can be removed in one edit
 * if the payment service ends.
 *
 * Off until the official artwork is in place: download the current marks
 * from Visa's and Mastercard's brand centres (and Meeza's, if that
 * integration is enabled) into `public/payment-brands/` under the file
 * names below, then set `enabled: true`. Never redraw or recolour them.
 */
export const PAYMENT_BRANDS = {
  enabled: false,
  brands: [
    { id: "visa", name: "Visa", src: "/payment-brands/visa.svg" },
    {
      id: "mastercard",
      name: "Mastercard",
      src: "/payment-brands/mastercard.svg",
    },
  ],
} as const;
