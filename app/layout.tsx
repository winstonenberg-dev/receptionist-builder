import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Receptionist Builder",
  description: "Bygg AI-receptionister för dina kunder",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body className="antialiased bg-gray-50 font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
