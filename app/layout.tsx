import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { DM_Sans } from "next/font/google";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
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
  themeColor: "#f6f7f3",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${dmSans.variable} h-full antialiased`}>
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
