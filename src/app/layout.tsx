import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Department Brief | Garage",
  description:
    "A one-page, source-backed pre-call brief for fire department outreach: who runs it, what they run, money in motion, recent news, and the reason to call now.",
  robots: { index: false, follow: false },
};

/** Sets the document language and shared visual styles for every page. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className="scheme-light antialiased [font-synthesis:none] [text-rendering:optimizeLegibility]"
    >
      <body className="bg-background text-base leading-relaxed text-foreground selection:bg-brand/20">
        {children}
      </body>
    </html>
  );
}
