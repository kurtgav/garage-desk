import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// next/font self-hosts the files at build time (CSP font-src 'self').
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { template: "%s · Garage Desk", default: "Garage Desk" },
  description: "Job cards, quotes and customer approvals for the garage.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="flex min-h-full flex-col bg-canvas font-sans text-ink">{children}</body>
    </html>
  );
}
