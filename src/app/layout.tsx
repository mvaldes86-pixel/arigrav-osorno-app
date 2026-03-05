import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ARIGRAV · Sistema de Guías",
  description: "Sistema de guías ARIGRAV",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        {children}
      </body>
    </html>
  );
}