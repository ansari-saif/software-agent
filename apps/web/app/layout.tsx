import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { Providers } from "@/components/Providers";
import { env } from "@/lib/env";
import "./globals.css";

const sans = Space_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Software Agent", template: "%s · Software Agent" },
  description:
    "Describe any app. An AI agent builds it in a private sandbox with a live preview.",
};

export const viewport: Viewport = {
  themeColor: "#0b0c0f",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider publishableKey={env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY} afterSignOutUrl="/">
      <html
        lang="en"
        className={`dark ${sans.variable} ${mono.variable}`}
        style={{ colorScheme: "dark" }}
      >
        <body>
          <Providers>{children}</Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
