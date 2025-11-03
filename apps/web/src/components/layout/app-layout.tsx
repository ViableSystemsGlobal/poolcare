"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { MainLayout } from "./main-layout";
import { useAuth } from "@/contexts/auth-context";

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
    
    // Redirect to login if not authenticated and not on auth page
    if (!loading && !isAuthenticated && !isAuthPage) {
      console.log("❌ Not authenticated, redirecting to login");
      router.push("/auth/login");
    }
    // Redirect to dashboard if authenticated and on login page
    if (!loading && isAuthenticated && pathname === "/auth/login") {
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  // Don't render protected content if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  return <MainLayout>{children}</MainLayout>;
}

