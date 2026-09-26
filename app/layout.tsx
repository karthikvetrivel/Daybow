import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Daybow",
  description: "Every Google Calendar event, color-coded by category as you create it.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
