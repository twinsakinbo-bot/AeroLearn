import "./globals.css"

import { Metadata, Viewport } from "next"
import { Inter, Nunito } from "next/font/google"
import { ThemeProvider } from "@/components/ui/theme-provider"
import { SITE_URL } from "@/lib/site"

// Body / UI text.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
})

// Headings. Nunito replaces Plus Jakarta Sans: it is a rounded-terminal face,
// which is what makes a heading read as friendly rather than corporate, and it
// carries weight 800/900 without turning into a solid black slab. Only the
// weights the type scale actually asks for are loaded.
const nunito = Nunito({
  subsets: ["latin"],
  display: "swap",
  weight: ["600", "700", "800", "900"],
  variable: "--font-display",
})

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // No maximumScale / userScalable lock — pinch-zoom is an accessibility
  // requirement, and students on small phones rely on it.
  // These two must track --color-bg in globals.css by hand; there is no way to
  // read a custom property from here. Navy-white and navy-black, per the logo.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F7FC" },
    { media: "(prefers-color-scheme: dark)", color: "#0B1220" },
  ],
}

const TITLE = "AeroLearn — Master your subjects. Ace your exams."
const DESCRIPTION =
  "AeroLearn is a learning platform for Nigerian secondary school students preparing for WAEC, NECO and JAMB. Full JSS1–SS3 curriculum, past-question practice, mock exams and an AI tutor."

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    // Sub-pages set their own `title` and inherit this frame.
    template: "%s — AeroLearn",
  },
  description: DESCRIPTION,
  applicationName: "AeroLearn",
  keywords: [
    "AeroLearn",
    "WAEC preparation",
    "NECO past questions",
    "JAMB mock exams",
    "Nigerian secondary school",
    "JSS1 to SS3 curriculum",
    "CBT practice",
  ],
  authors: [{ name: "AeroLearn", url: SITE_URL }],
  manifest: "/manifest.json",
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "AeroLearn",
    locale: "en_NG",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  verification: {
    google: "Ub3rsRIJWZ_hURHdlVZc-2hDVtaFvnhbLd091Z9c_Rk",
  },
}

/**
 * Runs before first paint so a dark-mode user never sees a white flash.
 * Mirrors the logic in ThemeProvider; keep the storage key in sync.
 */
const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem('aerolearn-theme');
    var dark = stored
      ? stored === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${nunito.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100]
                     focus:rounded-lg focus:border-2 focus:border-brand focus:bg-surface
                     focus:px-4 focus:py-2.5 focus:text-body-sm focus:font-extrabold
                     focus:text-foreground focus:shadow-lg"
        >
          Skip to content
        </a>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
