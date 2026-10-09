import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Uithof facturensync",
  description: "Synchronisatie van facturen van SEM naar CASH",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>
        <a href="#inhoud" className="sr-only">
          Naar de inhoud
        </a>
        {children}
      </body>
    </html>
  );
}
