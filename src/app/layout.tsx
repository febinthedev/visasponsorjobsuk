import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Next, Geist_Mono } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

// Atkinson Hyperlegible Next: designed so easily-confused characters (I/l/1, 0/O, rn/m) stay
// distinct, which helps people scanning salaries, job codes and visa terms, often in a second
// language. Variable weight (200–800), so one family covers headings and body.
// The variable is named --font-sans because globals.css maps Tailwind's font-sans to it.
const sans = Atkinson_Hyperlegible_Next({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "VisaSponsorJobsUK",
    template: "%s | VisaSponsorJobsUK", // e.g. "Your profile | VisaSponsorJobsUK"
  },
  description:
    "Genuine UK jobs from licensed visa sponsors, taken straight from employers' own careers pages. See which jobs offer or are likely eligible for visa sponsorship.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-GB"
      className={`${sans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
