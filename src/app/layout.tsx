import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "@/lib/app-context";
import { Sidebar } from "@/components/sidebar";

export const metadata: Metadata = {
  title: "Skill-Agent — Compliance AI",
  description: "AI-powered compliance assessment with traceable regulation citations",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark h-full">
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
