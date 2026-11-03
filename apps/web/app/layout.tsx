import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
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
    <ClerkProvider
      publishableKey={env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
      afterSignOutUrl="/"
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary: "hsl(78 85% 60%)",
          colorTextOnPrimaryBackground: "hsl(220 30% 6%)",
          colorBackground: "hsl(220 13% 9%)",
          colorInputBackground: "hsl(220 13% 8%)",
          fontFamily: "var(--font-sans)",
          borderRadius: "0.625rem",
        },
      }}
    >
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
