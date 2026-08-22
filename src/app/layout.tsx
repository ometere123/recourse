import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { AppShell } from "@/components/app-shell";

/**
 * Three open-licensed faces, each doing one job:
 *
 *   Bricolage Grotesque   display. Slightly irregular, engraved rather than
 *                         corporate — a face for a title on a form.
 *   Public Sans           body. Literally the US federal design system's text
 *                         face, which is the register this product is quoting.
 *   Courier Prime         verbatim ONLY. In this system a monospace glyph means
 *                         "these are bytes somebody else published". It is a
 *                         provenance signal and it is never used for anything
 *                         the app itself wrote.
 */
export const metadata: Metadata = {
  title: {
    default: "Recourse: address screening you can appeal",
    template: "%s · Recourse",
  },
  description:
    "Screen an address or entity against published sanctions lists, inspect the matched designation fields, and appeal a judgment that got it wrong.",
};

export const viewport: Viewport = {
  themeColor: "#FAFAF8",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
