import type { Metadata } from "next";
import "@fontsource-variable/inter"; // self-hosted Inter (400–700), no Google Fonts request
import "./globals.css";

export const metadata: Metadata = {
  title: "Design reviews · OtterlyAI",
  description: "Internal design QA: production vs design, with numbered notes for developers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
