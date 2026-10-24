import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = { title: "WSP", description: "Plan hangouts everyone can afford" };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@600;700&family=Figtree:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <div className="mx-auto min-h-screen w-full max-w-[430px]">{children}</div>
      </body>
    </html>
  );
}
