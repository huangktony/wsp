import "./globals.css";
import { AppTabBar } from "@/components/AppTabBar";
import type { Metadata, Viewport } from "next";
import { themeScript } from "@/lib/theme";
import { Splash, splashScript } from "@/components/Splash";
import { AppConfetti } from "@/components/AppConfetti";

export const metadata: Metadata = { title: "WSP", description: "Plan hangouts everyone can afford" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: splashScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@600;700&family=Figtree:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <div className="phone">
          <AppConfetti />
          <Splash />
          <div className="phone-screen mx-auto min-h-screen w-full max-w-[430px]">
            <AppTabBar>{children}</AppTabBar>
          </div>
        </div>
      </body>
    </html>
  );
}
