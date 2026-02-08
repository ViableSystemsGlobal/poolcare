"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { api } from "@/lib/api-client";
import { useRouter } from "next/navigation";

// Runtime API URL detection - same logic as api-client.ts
function getApiUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    
    if (hostname.includes("onrender.com")) {
      const apiHostname = hostname.replace("-web", "-api").replace("poolcare.onrender", "poolcare-api.onrender");
      return `https://${apiHostname}/api`;
    }
    
    const customApiUrl = localStorage.getItem("__poolcare_api_url");
    if (customApiUrl) {
      return customApiUrl;
    }
    
    if (!hostname.includes("localhost") && !hostname.includes("127.0.0.1")) {
      return `${window.location.origin}/api`;
    }
  }
  
  return "http://localhost:4000/api";
}

interface User {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  role: string;
}

interface Org {
  id: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  org: Org | null;
  token: string | null;
  loading: boolean;
  login: (token: string, user: User, org: Org) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [org, setOrg] = useState<Org | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchUserInfo = async (authToken: string) => {
    try {
      const API_URL = getApiUrl();
      console.log("🔍 Fetching user info with token:", authToken, "API_URL:", API_URL);
      
      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const response = await fetch(`${API_URL}/orgs/me`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        console.log("✅ User info fetched successfully:", data);
        setUser(data.user || null);
        setOrg(data.org || null);
      } else if (response.status === 401) {
        // Token is invalid
        console.error("❌ Unauthorized - token invalid");
        throw new Error("Unauthorized");
      } else {
        console.error("❌ Failed to fetch user info - HTTP", response.status);
        throw new Error(`Failed to fetch user info: ${response.status}`);
      }
    } catch (error: any) {
      const API_URL = getApiUrl();
      if (error.name === 'AbortError') {
        console.error("❌ Request timed out - API server may not be running at", API_URL);
        throw new Error(`API server not responding at ${API_URL}`);
      }
      if (error.message?.includes("fetch") || error.message?.includes("Failed to fetch")) {
        console.error("❌ Cannot connect to API server at", API_URL);
        throw new Error(`Cannot connect to API server at ${API_URL}`);
      }
      console.error("❌ Failed to fetch user info:", error);
      throw error;
    }
  };

  useEffect(() => {
    // Check for existing token on mount
    if (typeof window !== "undefined") {
      const storedToken = localStorage.getItem("auth_token");
      console.log("🔍 Checking stored token:", storedToken ? "Found" : "Not found");
      if (storedToken) {
        setToken(storedToken);
        // Try to fetch user info
        fetchUserInfo(storedToken)
          .then(() => {
            setLoading(false);
          })
          .catch((error) => {
            // If token is invalid or API is down, clear it
          console.log("❌ Token validation failed, clearing auth:", error.message);
          localStorage.removeItem("auth_token");
          setToken(null);
          setUser(null);
          setOrg(null);
          setLoading(false);
        });
      } else {
        console.log("ℹ️ No stored token found");
        setLoading(false);
      }
    } else {
      // Server-side: don't load
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = (newToken: string, newUser: User, newOrg: Org) => {
    console.log("🔐 Logging in user:", newUser, "with token:", newToken);
    localStorage.setItem("auth_token", newToken);
    setToken(newToken);
    setUser(newUser);
    setOrg(newOrg);
    router.push("/dashboard");
  };

  const logout = () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("themeColor");
    localStorage.removeItem("customLogo");
    setToken(null);
    setUser(null);
    setOrg(null);
    router.push("/auth/login");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        org,
        token,
        loading,
        login,
        logout,
        isAuthenticated: !!token && !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

