import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Mono, Manrope, Inter } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono-ticket",
  weight: ["400", "500"],
});

// Khusus dipakai di area admin (/admin/master) - tema terpisah
// dari halaman pelanggan yang pakai Space Grotesk.
const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-admin-heading",
  weight: ["600", "700", "800"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-admin-body",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Smart Feedback & Review",
  description: "Sistem feedback & review pelanggan berbasis QR/NFC",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body
        className={`${spaceGrotesk.variable} ${plexMono.variable} ${manrope.variable} ${inter.variable} antialiased`}
        style={{ fontFamily: "var(--font-display)" }}
      >
        {children}
      </body>
    </html>
  );
}
