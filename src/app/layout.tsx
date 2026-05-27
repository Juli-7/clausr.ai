import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "@/lib/app-context";
import { Sidebar } from "@/components/sidebar";

export const metadata: Metadata = {
  title: "clausr.ai — Compliance Assessment",
  description: "AI-powered compliance assessment with traceable regulation citations",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;1,400&family=Instrument+Serif&family=JetBrains+Mono:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet" />
      </head>
      <body className="h-full overflow-hidden antialiased">
        <AppProvider>
          <div className="flex h-full">
            <Sidebar />
            <main className="flex-1 flex flex-col min-w-0">{children}</main>
          </div>
        </AppProvider>
      </body>
    </html>
  );
}
