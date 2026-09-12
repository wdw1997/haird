import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Veloceia — AI Front Desk for Salons",
  description:
    "Veloceia is an AI assistant for salons and stylists: record client formulas by voice, auto-reply to booking texts, and sync appointments with Google Calendar.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <head>
        {/* Add this line inside <head> */}
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
