import "./globals.css";
import { AppTabBar } from "@/components/AppTabBar";
import type { Metadata, Viewport } from "next";
import { themeScript } from "@/lib/theme";

export const metadata: Metadata = { title: "WSP", description: "Plan hangouts everyone can afford" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@600;700&family=Figtree:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <AppTabBar>{children}</AppTabBar>
      </body>
    </html>
  );
}
