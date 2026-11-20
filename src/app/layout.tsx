import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LocalEAS Digital - Yerel EAS Build & Dağıtım İstasyonu",
  description: "OrangeHat Digital bünyesinde geliştirilen açık kaynak yerel EAS build ve artifact yönetim konsolu.",
  icons: {
    icon: "/assets/ohd_logo.png",
    shortcut: "/assets/ohd_logo.png",
    apple: "/assets/ohd_logo.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark",
  themeColor: "#09090b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="tr"
      className={`dark ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-zinc-950 font-sans text-zinc-50 selection:bg-indigo-500/30 selection:text-indigo-200">
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
      </body>
    </html>
  );
}

