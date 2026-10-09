import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JobRadar — pencari lowongan dengan skor",
  description:
    "Mengumpulkan lowongan dari LinkedIn & JobStreet, menilai kecocokan 0-100, dan hanya menampilkan yang 70 ke atas.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
