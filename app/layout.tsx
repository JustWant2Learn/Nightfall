import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nightfall — 3D Third-Person Horror Game",
  description:
    "Something hunts you in the dead forest. Choose your survivor, collect the talismans, and escape through the gate in this 3D third-person browser horror game.",
  keywords: [
    "horror game",
    "3d browser game",
    "third person",
    "survival horror",
    "web game",
  ],
  openGraph: {
    title: "Nightfall — 3D Third-Person Horror Game",
    description:
      "Escape the dead forest before The Hollow One finds you. Play free in your browser.",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
