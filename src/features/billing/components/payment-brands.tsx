import { cn } from "@/lib/utils";
import { PAYMENT_BRANDS } from "../payment-brands";

/**
 * The accepted card schemes as their official marks. Renders nothing while
 * `PAYMENT_BRANDS.enabled` is off. Brand names are proper nouns, so the
 * `alt` text is the same in every language.
 */
export function PaymentBrands({ className }: { className?: string }) {
  if (!PAYMENT_BRANDS.enabled) return null;
  return (
    <ul className={cn("flex flex-wrap items-center gap-2", className)}>
      {PAYMENT_BRANDS.brands.map((brand) => (
        <li key={brand.id}>
          {/* biome-ignore lint/performance/noImgElement: static SVG marks, no optimisation needed */}
          <img
            src={brand.src}
            alt={brand.name}
            height={20}
            className="h-5 w-auto"
          />
        </li>
      ))}
    </ul>
  );
}
