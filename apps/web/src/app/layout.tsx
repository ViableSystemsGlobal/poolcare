import type { Metadata } from "next";
import "./globals.css";
import { ThemeProviderWrapper } from "@/components/providers/theme-provider-wrapper";
import { AuthProvider } from "@/contexts/auth-context";
import { AppLayout } from "@/components/layout/app-layout";

export const metadata: Metadata = {
  title: "PoolCare Management System",
  description: "Complete pool maintenance and service management platform",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased" suppressHydrationWarning={true}>
        <AuthProvider>
          <ThemeProviderWrapper>
            <AppLayout>{children}</AppLayout>
          </ThemeProviderWrapper>
        </AuthProvider>
      </body>
    </html>
  );
}
