import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, Inter } from "next/font/google";
import { Suspense } from "react";

import { Header } from "@/components/Header";
import { SWRProvider } from "@/components/SWRProvider";
import { AdminProvider } from "@/lib/admin-context";
import { UnitProvider } from "@/lib/unit-context";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], weight: "600" });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "TI Analytics — CHVC",
  description: "Gamificacao dos chamados de TI (GLPI)",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      className={`${fraunces.variable} ${inter.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <SWRProvider>
          <AdminProvider>
            <UnitProvider>
              <Suspense fallback={null}>
                <Header />
              </Suspense>
              {children}
            </UnitProvider>
          </AdminProvider>
        </SWRProvider>
      </body>
    </html>
  );
}
