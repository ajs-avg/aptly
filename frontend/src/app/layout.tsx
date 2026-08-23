import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, JetBrains_Mono, Poppins } from "next/font/google";

import { ThemeProvider, themeScript } from "@/components/theme/ThemeProvider";
import "./globals.css";

/* Three voices, three jobs (design doc, p.9):
   geometric labels for structure, a calm humanist sans for prose, and mono for
   the literal lines being changed. */

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Aptly — tailor every application, be ready when they call",
    template: "%s · Aptly",
  },
  description:
    "Drop a job post and your CV, get the exact changes with one-tap apply, and keep a living record of every application — so the moment a recruiter calls, you are already prepared.",
  applicationName: "Aptly",
  openGraph: {
    title: "Aptly — tailor every application, be ready when they call",
    description:
      "A low-friction CV tailoring tool with a memory. Tailor, track, and walk into every recruiter call prepared.",
    siteName: "Aptly",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  // Both, so the browser chrome matches the page instead of framing a dark
  // page in a white bar.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FBFBFA" },
    { media: "(prefers-color-scheme: dark)", color: "#0F1115" },
  ],
  width: "device-width",
  initialScale: 1,
  // Not `maximumScale: 1`. Pinch-zoom is how people with low vision read a
  // page, and taking it away to stop iOS zooming on input focus trades their
  // access for our tidiness. The inputs use a 16px font instead.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: the inline script below sets `data-theme` on
    // this element before React hydrates, so the server's markup and the
    // client's necessarily differ by that one attribute. That is the point of
    // it, not a bug to fix.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the stored theme before first paint. Without it, everyone on
            dark mode gets a white flash on every navigation — there is no React
            lifecycle early enough to prevent that paint. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${poppins.variable} ${plexSans.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
