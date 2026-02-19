import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { getNetworkIp } from "./network-utils";

// Get network IP for mobile devices (localhost on device = the device itself, not your Mac)
const getApiUrl = (): string => {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000/api";

  // On native (iOS/Android), localhost only works in Simulator/Emulator. Physical devices must use your machine's LAN IP.
  if (Platform.OS !== "web" && baseUrl.includes("localhost")) {
    if (Platform.OS === "android") {
      const url = baseUrl.replace("localhost", "10.0.2.2");
      console.log("[API Client] Android emulator, API URL:", url);
      return url;
    }
    const networkIp = getNetworkIp();
    const finalUrl = baseUrl.replace("localhost", networkIp);
    console.log(`[API Client] Native (${Platform.OS}), using API URL: ${finalUrl} (localhost would not work on device)`);
    return finalUrl;
  }

  // Web or explicit non-localhost URL
  if (process.env.EXPO_PUBLIC_USE_LOCALHOST === "true") {
    console.log("[API Client] Using localhost:", baseUrl);
  }
  console.log("[API Client] API URL:", baseUrl);
  return baseUrl;
};

const API_URL = getApiUrl();
console.log(`[API Client] Initialized with URL: ${API_URL}`);

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";
const ORG_KEY = "auth_org";
const DEV_API_URL_KEY = "dev_api_base_url";
const REQUEST_TIMEOUT_MS = 45000;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 2000;

// In dev, allow overriding API base URL from the app (no rebuild needed)
let _cachedOverride: string | null | undefined = undefined;
async function getApiBaseUrl(): Promise<string> {
  if (typeof __DEV__ !== "boolean" || !__DEV__) return API_URL;
  if (_cachedOverride !== undefined) return _cachedOverride ?? API_URL;
  try {
    _cachedOverride = await SecureStore.getItemAsync(DEV_API_URL_KEY);
  } catch {
    _cachedOverride = null;
  }
  return _cachedOverride ?? API_URL;
}
export async function setApiBaseUrlOverride(url: string | null): Promise<void> {
  try {
    if (url) {
      await SecureStore.setItemAsync(DEV_API_URL_KEY, url);
      _cachedOverride = url;
    } else {
      await SecureStore.deleteItemAsync(DEV_API_URL_KEY);
      _cachedOverride = null;
    }
  } catch (e) {
    console.error("Failed to save API URL override:", e);
  }
}
export async function getApiBaseUrlOverride(): Promise<string | null> {
  if (!__DEV__) return null;
  try {
    return await SecureStore.getItemAsync(DEV_API_URL_KEY);
  } catch {
    return null;
  }
}

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

  async getStoredUser(): Promise<{ name?: string; email?: string; phone?: string } | null> {
    try {
      const raw = await SecureStore.getItemAsync(USER_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as { name?: string; email?: string; phone?: string };
    } catch (error) {
      console.error("Error getting stored user:", error);
      return null;
    }
  }

  async updateStoredUser(updates: { name?: string; email?: string; phone?: string }): Promise<void> {
    try {
      const existing = await this.getStoredUser();
      const merged = { ...(existing || {}), ...updates };
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(merged));
    } catch (error) {
      console.error("Error updating stored user:", error);
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
    options: RequestOptions = {},
    attempt = 0
  ): Promise<T> {
    const { requireAuth = true, headers = {}, ...restOptions } = options;
    const method = (restOptions.method || "GET") as string;
    const baseUrl = await getApiBaseUrl();
    const url = endpoint.startsWith("http") ? endpoint : `${baseUrl}${endpoint}`;

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

    const doFetch = async (): Promise<Response> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(url, {
          ...restOptions,
          headers: requestHeaders,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return response;
      } catch (e) {
        clearTimeout(timeoutId);
        throw e;
      }
    };

    try {
      if (attempt === 0) console.log("API Request:", url, { method });

      const response = await doFetch();
      console.log("API Response:", response.status, response.statusText);

      if (!response.ok) {
        let errorData: any;
        try {
          errorData = await response.json();
        } catch {
          errorData = { message: response.statusText };
        }

        if (response.status === 401 && !url.includes("/auth/otp")) {
          await this.clearAuthToken();
        }

        const errorMessage = errorData?.message || errorData?.error || response.statusText;
        if (__DEV__ && response.status !== 404) {
          console.error("API Error Response:", { status: response.status, url, errorData });
        }
        throw new Error(errorMessage);
      }

      return response.json();
    } catch (error: any) {
      const isTimeoutOrNetwork =
        error.name === "AbortError" ||
        error.message?.includes("Network request failed") ||
        error.message?.includes("Failed to fetch");

      if (isTimeoutOrNetwork && method === "GET" && attempt < MAX_RETRIES) {
        // Exponential backoff with jitter: 2s, 4s, 8s (±20%)
        const base = RETRY_BASE_MS * Math.pow(2, attempt);
        const jitter = base * 0.2 * (Math.random() * 2 - 1);
        const delay = Math.round(base + jitter);
        if (__DEV__) console.warn(`API request failed, retrying in ${(delay / 1000).toFixed(1)}s (attempt ${attempt + 1}/${MAX_RETRIES}):`, url);
        await new Promise((r) => setTimeout(r, delay));
        return this.request<T>(endpoint, options, attempt + 1);
      }

      if (error.name === "AbortError" || error.message?.includes("Network request failed")) {
        if (__DEV__) console.warn("API request timed out or aborted:", url);
        const isLocalNetwork = /^https?:\/\/(localhost|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(url);
        const hint = isLocalNetwork
          ? " Set your Mac's IP on the login screen (Dev: API URL) or in apps/client/.env as EXPO_PUBLIC_API_URL=http://YOUR_MAC_IP:4000/api. Same Wi‑Fi; allow port 4000 in firewall."
          : " Check your connection and try again.";
        throw new Error("Request timed out." + hint);
      }
      if (error.message?.includes("fetch") || error.message?.includes("Failed to fetch")) {
        throw new Error("Cannot connect to server. Check API URL and network.");
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

  // Client self-profile
  async getMyClientProfile() {
    return this.request<any>("/clients/me");
  }

  async updateMyClientProfile(dto: { name?: string; phone?: string; email?: string; imageUrl?: string }) {
    return this.request<any>("/clients/me", {
      method: "PATCH",
      body: JSON.stringify(dto),
    });
  }

  async uploadMyClientPhoto(imageUri: string, fileName: string, mimeType: string) {
    const formData = new FormData();
    formData.append("photo", { uri: imageUri, name: fileName, type: mimeType } as any);
    const baseUrl = await getApiBaseUrl();
    const token = await this.getAuthToken();
    const response = await fetch(`${baseUrl}/clients/me/upload-photo`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as any).message || "Photo upload failed");
    }
    return response.json() as Promise<{ imageUrl: string }>;
  }

  // Household / Family
  async getMyHousehold(clientId: string) {
    return this.request<any>(`/clients/${clientId}/household`);
  }

  async createHousehold(clientId: string, name: string) {
    return this.request<any>(`/clients/${clientId}/household`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  async inviteToHousehold(clientId: string, dto: { phone?: string; email?: string; name?: string }) {
    return this.request<any>(`/clients/${clientId}/household/invite`, {
      method: "POST",
      body: JSON.stringify(dto),
    });
  }

  async registerDeviceToken(token: string, platform: "ios" | "android") {
    return this.request<any>("/clients/me/device-token", {
      method: "POST",
      body: JSON.stringify({ token, platform }),
    });
  }

  async getMyNotifications(page = 1, limit = 30) {
    return this.request<any>(`/clients/me/notifications?page=${page}&limit=${limit}`);
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

  async clientCancelJob(id: string, reason?: string) {
    return this.request(`/jobs/${id}/client-cancel`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  }

  async clientRescheduleJob(id: string, dto: { windowStart: string; windowEnd: string; reason?: string }) {
    return this.request(`/jobs/${id}/client-reschedule`, {
      method: "POST",
      body: JSON.stringify(dto),
    });
  }

  // Visits
  async getVisits(params?: { poolId?: string; date?: string; status?: string }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request(`/visits${query ? `?${query}` : ""}`);
  }

  async getVisit(id: string) {
    return this.request(`/visits/${id}`);
  }

  async reviewVisit(visitId: string, dto: { rating?: number; comments?: string }) {
    return this.request(`/visits/${visitId}/review`, {
      method: "POST",
      body: JSON.stringify(dto),
    });
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
    return this.request(`/invoices/${invoiceId}/payments/init`, {
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

  async uploadIssuePhoto(formData: FormData) {
    // For FormData, we don't set Content-Type header manually, fetch does it
    const baseUrl = await getApiBaseUrl();
    const url = `${baseUrl}/issues/upload-photo`;
    const token = await this.getAuthToken();
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error("Failed to upload photo");
    }

    return response.json();
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

  // Kwame AI – pool coach chat
  async chatWithKwame(
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    conversationId?: string
  ) {
    return this.request<{ message: string; conversationId: string; title: string }>(
      "/ai/pool-coach/chat",
      {
        method: "POST",
        body: JSON.stringify({ messages, conversationId }),
      }
    );
  }

  async getPoolCoachChats() {
    return this.request<Array<{ id: string; title: string; createdAt: string; updatedAt: string }>>(
      "/ai/pool-coach/chats"
    );
  }

  async getPoolCoachChat(id: string) {
    return this.request<{ id: string; title: string; messages: any[]; createdAt: string }>(
      `/ai/pool-coach/chats/${id}`
    );
  }

  async deletePoolCoachChat(id: string) {
    return this.request<{ success: boolean }>(`/ai/pool-coach/chats/${id}`, {
      method: "DELETE",
    });
  }

  // Settings
  async getOrgSettings() {
    return this.request("/settings/org");
  }

  /** Public branding (no auth) for login and unauthenticated views */
  async getPublicBranding() {
    return this.request<{
      organizationName: string;
      logoUrl: string | null;
      themeColor: string;
      primaryColorHex: string;
    }>("/settings/branding", { requireAuth: false });
  }

  // PoolShop – products (from inventory)
  async getProducts(params?: { search?: string; category?: string; isActive?: string; limit?: string; page?: string }) {
    const query = new URLSearchParams(params as any).toString();
    const res = await this.request<{ items: any[]; pagination?: any }>(`/products${query ? `?${query}` : ""}`);
    return Array.isArray(res) ? { items: res } : res;
  }

  async getProduct(id: string) {
    return this.request(`/products/${id}`);
  }

  // PoolShop – orders
  async createOrder(data: { items: Array<{ productId: string; quantity: number }>; notes?: string }) {
    return this.request("/orders", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getOrders() {
    return this.request("/orders");
  }

  async getOrder(id: string) {
    return this.request(`/orders/${id}`);
  }
}

export const api = new ApiClient();
export type { AuthResult };

