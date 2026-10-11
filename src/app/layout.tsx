import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { AppHeader } from "@/components/app-header";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Headshot Outline",
  description: "Turn any photo into a clean head outline with facial line art — processed on your device, refined by an optional AI critic.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf5ff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0d1a" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        <Providers>
          <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-3 focus:text-primary-foreground">
            Skip to content
          </a>
          <AppHeader />
          <main id="main" className="mx-auto w-full max-w-5xl px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4 sm:px-6">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
