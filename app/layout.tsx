import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AllenAI",
  description: "Allenamento, alimentazione e progressi in un unico posto.",
  applicationName: "AllenAI",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "AllenAI",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#f1f0f6",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Script id="theme-init" strategy="beforeInteractive">
          {`try {
            var theme = localStorage.getItem("allenai-theme");
            if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
          } catch (e) {}`}
        </Script>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
