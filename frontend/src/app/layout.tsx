import type { Metadata, Viewport } from "next";
import { Geist, Inter, JetBrains_Mono } from "next/font/google";

import { ThemeProvider, themeScript } from "@/components/theme/ThemeProvider";
import "./globals.css";

/* Three voices, three jobs: Geist, tight and geometric, for headlines, labels
   and figures; Inter for prose and the interface; mono for the literal lines
   being changed. All three self-hosted by next/font — no third-party request,
   no swap flash on a headline. */

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
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
    // The font variables go on `<html>`, not on `<body>`.
    //
    // `--font-display` and `--font-body` are declared in `@theme`, which lands
    // on `:root`. A `var()` inside a custom property is substituted where that
    // property is *declared* — so with the families defined one level down on
    // `<body>`, `var(--font-geist)` resolved to nothing at `:root`, the whole
    // token went invalid, and every `font-display` and `font-body` utility in
    // the app silently fell back to the system stack. The landing page escaped
    // it only because its own module declares its families on a wrapper inside
    // `<body>`, where they are in scope.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geist.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        {/* Applies the stored theme before first paint. Without it, everyone on
            dark mode gets a white flash on every navigation — there is no React
            lifecycle early enough to prevent that paint. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
