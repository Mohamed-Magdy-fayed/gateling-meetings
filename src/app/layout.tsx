import type { Metadata, Viewport } from "next";
import {
  IBM_Plex_Sans_Arabic,
  Inter,
  JetBrains_Mono,
  Manrope,
} from "next/font/google";
import { headers } from "next/headers";
import { Providers } from "@/app/_providers";
import { baseUrl } from "@/data/env/server";
import { getLocaleCookie } from "@/features/core/i18n/server";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: "Gateling Meetings",
    template: "%s | Gateling Meetings",
  },
  description:
    "Video meetings you host yourself. A product of Gateling Solutions (gateling.com).",
  applicationName: "Gateling Meetings",
  authors: [{ name: "Gateling Solutions", url: "https://gateling.com" }],
  creator: "Gateling Solutions",
  publisher: "Gateling Solutions",
  openGraph: {
    siteName: "Gateling Meetings",
    type: "website",
  },
};

export const viewport: Viewport = {
  // The meeting room fills the screen edge-to-edge on phones with a notch.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fffaf6" },
    { media: "(prefers-color-scheme: dark)", color: "#221c16" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocaleCookie();
  const dir = locale === "ar" ? "rtl" : "ltr";
  // Set by src/proxy.ts. Next applies the nonce to its own framework and page
  // bundles by reading the CSP header directly, but anything this file renders
  // itself has to carry it explicitly or `script-src` blocks it.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${inter.variable} ${manrope.variable} ${plexArabic.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Providers locale={locale} nonce={nonce}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
