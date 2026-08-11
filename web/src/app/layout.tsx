import type { Metadata, Viewport } from "next";
import { Archivo, Atkinson_Hyperlegible, IBM_Plex_Mono } from "next/font/google";
import { SerwistProvider } from "@serwist/turbopack/react";
import "./globals.css";
import { Footer } from "@/components/footer";
import { Nav } from "@/components/nav";
import { PwaLifecycle } from "@/components/pwa-lifecycle";
import { Providers } from "./providers";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-archivo",
  display: "swap",
});

const atkinson = Atkinson_Hyperlegible({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-atkinson",
  display: "swap",
});

const plex = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-plex",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: {
    default: "WitnessGrid",
    template: "%s · WitnessGrid",
  },
  description:
    "A public register of UK police interactions. Record safely, stay pseudonymous, browse the evidence register.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "WitnessGrid",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    siteName: "WitnessGrid",
    type: "website",
    locale: "en_GB",
    title: "WitnessGrid",
    description:
      "A public register of UK police interactions. Record safely, stay pseudonymous.",
  },
};

export const viewport: Viewport = {
  themeColor: "#12151C",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${atkinson.variable} ${plex.variable}`}
    >
      <body>
        <SerwistProvider swUrl="/serwist/sw.js">
          <Providers>
            <PwaLifecycle />
            <Nav />
            <div className="min-h-dvh pb-20 lg:pb-0 lg:pl-60">{children}</div>
            <Footer />
          </Providers>
        </SerwistProvider>
      </body>
    </html>
  );
}