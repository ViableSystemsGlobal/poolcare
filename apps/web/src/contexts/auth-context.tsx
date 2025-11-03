"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { api } from "@/lib/api-client";
import { useRouter } from "next/navigation";

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
      console.log("🔍 Fetching user info with token:", authToken);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/orgs/me`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log("✅ User info fetched successfully:", data);
        setUser(data.user || null);
        setOrg(data.org || null);
      } else {
        console.error("❌ Failed to fetch user info - HTTP", response.status);
        throw new Error(`Failed to fetch user info: ${response.status}`);
      }
    } catch (error) {
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
        fetchUserInfo(storedToken).catch((error) => {
          // If token is invalid, clear it
          console.log("❌ Token validation failed, clearing auth:", error.message);
          localStorage.removeItem("auth_token");
          setToken(null);
          setUser(null);
          setOrg(null);
        }).finally(() => {
          setLoading(false);
        });
      } else {
        console.log("ℹ️ No stored token found");
        setLoading(false);
      }
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

