"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { MainLayout } from "./main-layout";
import { useAuth } from "@/contexts/auth-context";
import { TopLoadingBar } from "@/components/ui/top-loading-bar";
import { HelpChat } from "@/components/help-chat";
import { HelpDialogProvider } from "@/contexts/help-dialog-context";
import { HelpDialog } from "@/components/layout/help-dialog";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();

  // Don't show layout on auth pages
  const isAuthPage = pathname.startsWith("/auth/");

  useEffect(() => {
    console.log("🔍 AppLayout auth check:", {
      pathname,
      loading,
      isAuthenticated,
      isAuthPage
    });
    
    // Only redirect when loading is complete
    if (loading) {
      return; // Wait for auth check to complete
    }
    
    // Redirect to login if not authenticated and not on auth page
    if (!isAuthenticated && !isAuthPage) {
      console.log("❌ Not authenticated, redirecting to login");
      // Only redirect if we're not already going to login
      if (pathname !== "/auth/login") {
        router.push("/auth/login");
      }
      return;
    }
    
    // Redirect to dashboard if authenticated and on login page
    if (isAuthenticated && pathname === "/auth/login") {
      console.log("✅ Authenticated on login page, redirecting to dashboard");
      router.push("/dashboard");
    }
  }, [isAuthenticated, loading, isAuthPage, pathname, router]);

  if (isAuthPage) {
    return <>{children}</>;
  }

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#397d54' }}></div>
      </div>
    );
  }

  // Don't render protected content if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  return (
    <HelpDialogProvider>
      <TopLoadingBar />
      <MainLayout>{children}</MainLayout>
      <HelpDialog />
      <HelpChat />
    </HelpDialogProvider>
  );
}

