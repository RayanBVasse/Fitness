import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TopNav } from "@/components/TopNav";

export const metadata: Metadata = {
  title: "Fitness Observatory",
  description: "Snatch, calisthenics and hypertrophy training log.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0c0f" },
  ],
};

/**
 * A page, not a phone screen.
 *
 * This was built at 520px against a fixed bottom bar, which is where it is
 * actually read least: the log is kept on a tablet and the analysis on a
 * desktop. The shell now runs to 1180px — wide enough for two columns of
 * charts and a table that needs its width, narrow enough that a paragraph
 * inside a card does not become an unreadable line.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>
        <TopNav />
        <main className="mx-auto w-full max-w-[1180px] px-4 pb-16 sm:px-6 lg:px-8">
          {children}
        </main>
      </body>
    </html>
  );
}
