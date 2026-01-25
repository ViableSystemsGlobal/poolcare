import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { getNetworkIp } from "./network-utils";

// Get network IP for mobile devices (localhost doesn't work on physical devices/simulators)
const getApiUrl = (): string => {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000/api";
  
  // On mobile platforms, replace localhost with network IP
  if (Platform.OS !== "web" && baseUrl.includes("localhost")) {
    const networkIp = getNetworkIp();
    const finalUrl = baseUrl.replace("localhost", networkIp);
    console.log(`[API Client] Platform: ${Platform.OS}, Network IP: ${networkIp}, API URL: ${finalUrl}`);
    return finalUrl;
  }
  
  console.log(`[API Client] Platform: ${Platform.OS}, API URL: ${baseUrl}`);
  return baseUrl;
};

const API_URL = getApiUrl();
console.log(`[API Client] Initialized with URL: ${API_URL}`);

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";
const ORG_KEY = "auth_org";

interface RequestOptions extends RequestInit {
  requireAuth?: boolean;
}

interface AuthResult {
  token: string;
  user: any;
  org: any;
  role: string;
}

class ApiClient {
  async getAuthToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(TOKEN_KEY);
    } catch (error) {
      console.error("Error getting auth token:", error);
      return null;
    }
  }

  private async setAuthToken(token: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
    } catch (error) {
      console.error("Error setting auth token:", error);
    }
  }

  private async clearAuthToken(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      await SecureStore.deleteItemAsync(USER_KEY);
      await SecureStore.deleteItemAsync(ORG_KEY);
    } catch (error) {
      console.error("Error clearing auth token:", error);
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const { requireAuth = true, headers = {}, ...restOptions } = options;

    const url = endpoint.startsWith("http") ? endpoint : `${API_URL}${endpoint}`;

    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...(headers as Record<string, string>),
    };

    if (requireAuth) {
      const token = await this.getAuthToken();
      if (token) {
        requestHeaders.Authorization = `Bearer ${token}`;
      }
    }

    try {
      console.log("API Request:", url, { method: restOptions.method || "GET" });

      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout for mobile

      const response = await fetch(url, {
        ...restOptions,
        headers: requestHeaders,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log("API Response:", response.status, response.statusText);

      if (!response.ok) {
        let errorData: any;
        try {
          errorData = await response.json();
        } catch {
          errorData = { message: response.statusText };
        }

        // Handle 401 Unauthorized
        if (response.status === 401 && !url.includes("/auth/otp")) {
          await this.clearAuthToken();
          // In a real app, you might want to navigate to login screen here
          // For now, we'll just throw the error
        }

        // Extract the actual error message
        const errorMessage = errorData?.message || errorData?.error || response.statusText;
        // Only log detailed error info in development, and skip logging 404s (handled gracefully in UI)
        if (__DEV__ && response.status !== 404) {
          console.error("API Error Response:", { status: response.status, url, errorData });
        }
        throw new Error(errorMessage);
      }

      return response.json();
    } catch (error: any) {
      // Only log network/abort errors, not handled API errors (they're already logged above)
      if (error.name === "AbortError" || error.message?.includes("Network request failed")) {
        console.error("API Request failed:", error);
        throw new Error("Request timed out. Please check your connection and try again.");
      }
      if (error.message?.includes("fetch") || error.message?.includes("Failed to fetch")) {
        throw new Error("Cannot connect to server. Please check your internet connection.");
      }
      throw error;
    }
  }

  // Auth endpoints
  async requestOtp(channel: "phone" | "email", target: string) {
    return this.request("/auth/otp/request", {
      method: "POST",
      body: JSON.stringify({ channel, target }),
      requireAuth: false,
    });
  }

  async verifyOtp(
    channel: "phone" | "email",
    target: string,
    code: string
  ): Promise<AuthResult> {
    const result = await this.request<AuthResult>("/auth/otp/verify", {
      method: "POST",
      body: JSON.stringify({ channel, target, code }),
      requireAuth: false,
    });

    if (result.token) {
      await this.setAuthToken(result.token);
      // Store user and org info for quick access
      if (result.user) {
        await SecureStore.setItemAsync(USER_KEY, JSON.stringify(result.user));
      }
      if (result.org) {
        await SecureStore.setItemAsync(ORG_KEY, JSON.stringify(result.org));
      }
    }

    return result;
  }

  async checkOtpCode(channel: "phone" | "email", target: string) {
    return this.request<{ exists: boolean; code: string | null; message: string }>(
      "/auth/otp/check",
      {
        method: "POST",
        body: JSON.stringify({ channel, target }),
        requireAuth: false,
      }
    );
  }

  async logout() {
    await this.clearAuthToken();
  }

  // Organization/User info
  async getMe() {
    return this.request("/orgs/me");
  }

  // Pools
  async getPools(clientId?: string) {
    const query = clientId ? `?clientId=${clientId}` : "";
    return this.request(`/pools${query}`);
  }

  async getPool(id: string) {
    return this.request(`/pools/${id}`);
  }

  async createPool(data: any) {
    return this.request("/pools", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updatePool(id: string, data: any) {
    return this.request(`/pools/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  // Jobs
  async getJobs(params?: { status?: string; date?: string; clientId?: string; poolId?: string }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request(`/jobs${query ? `?${query}` : ""}`);
  }

  async getJob(id: string) {
    return this.request(`/jobs/${id}`);
  }

  // Visits
  async getVisits(params?: { poolId?: string; date?: string; status?: string }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request(`/visits${query ? `?${query}` : ""}`);
  }

  async getVisit(id: string) {
    return this.request(`/visits/${id}`);
  }

  // Quotes
  async getQuotes(params?: { status?: string; clientId?: string; poolId?: string }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request(`/quotes${query ? `?${query}` : ""}`);
  }

  async getQuote(id: string) {
    return this.request(`/quotes/${id}`);
  }

  async approveQuote(id: string, data?: any) {
    return this.request(`/quotes/${id}/approve`, {
      method: "POST",
      body: JSON.stringify(data || {}),
    });
  }

  async rejectQuote(id: string, data?: any) {
    return this.request(`/quotes/${id}/reject`, {
      method: "POST",
      body: JSON.stringify(data || {}),
    });
  }

  // Invoices
  async getInvoices(params?: { status?: string; clientId?: string; poolId?: string }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request(`/invoices${query ? `?${query}` : ""}`);
  }

  async getInvoice(id: string) {
    return this.request(`/invoices/${id}`);
  }

  async initiatePayment(invoiceId: string, data: any) {
    return this.request(`/invoices/${invoiceId}/pay/paystack`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Issues/Complaints
  async getIssues(params?: { poolId?: string; status?: string }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request(`/issues${query ? `?${query}` : ""}`);
  }

  async createIssue(data: any) {
    return this.request("/issues", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Subscription Templates
  async getSubscriptionTemplates() {
    return this.request("/subscription-templates?active=true");
  }

  async getSubscriptionTemplate(id: string) {
    return this.request(`/subscription-templates/${id}`);
  }

  async subscribeToTemplate(templateId: string, data: { poolId: string; startsOn?: string; autoRenew?: boolean }) {
    return this.request(`/subscription-templates/${templateId}/subscribe`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Service Plans (for viewing active subscriptions)
  async getServicePlans(params?: { poolId?: string; active?: boolean }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request(`/service-plans${query ? `?${query}` : ""}`);
  }

  async getServicePlan(id: string) {
    return this.request(`/service-plans/${id}`);
  }

  async cancelServicePlan(id: string, reason?: string) {
    return this.request(`/service-plans/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  }

  // Mobile Sync (for offline support)
  async sync(since?: number, shapes?: string[]) {
    const params = new URLSearchParams();
    if (since) params.append("since", since.toString());
    if (shapes && shapes.length > 0) params.append("shapes", shapes.join(","));
    return this.request(`/mobile/sync${params.toString() ? `?${params.toString()}` : ""}`);
  }

  // Settings
  async getOrgSettings() {
    return this.request("/settings/org");
  }
}

export const api = new ApiClient();
export type { AuthResult };

