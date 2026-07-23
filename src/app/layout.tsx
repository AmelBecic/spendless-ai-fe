import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "../auth/AuthProvider";
import { AiModeProvider } from "../ai/AiModeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "SpendLess AI",
  description:
    "Grounded personal-finance profiling — every suggestion next to the stat it rests on.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <AiModeProvider>{children}</AiModeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
