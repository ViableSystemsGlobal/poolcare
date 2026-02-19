import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { getNetworkIp } from "./network-utils";

// Get network IP for mobile devices (localhost doesn't work on physical devices)
export const getApiUrl = (): string => {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000/api";
  
  // Use localhost when set (required for iOS Simulator; optional for Android emulator)
  if (process.env.EXPO_PUBLIC_USE_LOCALHOST === "true") {
    console.log("[API Client] Using localhost (EXPO_PUBLIC_USE_LOCALHOST=true)");
    return baseUrl;
  }

  // On mobile, replace localhost so device can reach the API
  if (Platform.OS !== "web" && baseUrl.includes("localhost")) {
    // Android emulator: use 10.0.2.2 to reach host machine's localhost
    if (Platform.OS === "android") {
      const url = baseUrl.replace("localhost", "10.0.2.2");
      console.log("[API Client] Using 10.0.2.2 for Android");
      return url;
    }
    const networkIp = getNetworkIp();
    console.log(`[API Client] Replacing localhost with network IP: ${networkIp}`);
    return baseUrl.replace("localhost", networkIp);
  }
  
  return baseUrl;
};

// Resolve at request time so env (e.g. EXPO_PUBLIC_USE_LOCALHOST) is always respected after Metro reload
const getBaseUrl = (): string => getApiUrl();

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

    const url = endpoint.startsWith("http") ? endpoint : `${getBaseUrl()}${endpoint}`;

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

        // Handle 401 Unauthorized: clear token so next request can show login
        if (response.status === 401 && !url.includes("/auth/otp")) {
          await this.clearAuthToken();
        }

        // Extract the actual error message
        const errorMessage = errorData?.message || errorData?.error || response.statusText;
        // Skip logging expected errors to reduce console noise
        const isExpectedError =
          response.status === 401 ||
          response.status === 404 ||
          errorMessage?.includes("not assigned to you") ||
          errorMessage?.includes("not found") ||
          errorMessage?.toLowerCase().includes("invalid token");
        
        if (!isExpectedError) {
          console.error("API Error Response:", { status: response.status, url, errorData });
        }
        const err = new Error(errorMessage) as any;
        err.isHttpError = true;
        throw err;
      }

      return response.json();
    } catch (error: any) {
      // Only log genuine network errors — HTTP errors (4xx/5xx) are already handled above
      if (!error.isHttpError) {
        console.error("API Request failed:", error);
      }
      if (error.name === "AbortError") {
        const networkIp = getNetworkIp();
        throw new Error(
          `Request timed out. Cannot reach API at ${url}. ` +
          `Make sure:\n` +
          `1. API server is running\n` +
          `2. Network IP is correct (current: ${networkIp})\n` +
          `3. Both devices are on the same network\n` +
          `4. Set EXPO_PUBLIC_NETWORK_IP in .env if needed`
        );
      }
      if (error.message?.includes("fetch") || error.message?.includes("Failed to fetch")) {
        const networkIp = getNetworkIp();
        throw new Error(
          `Cannot connect to server at ${url}. ` +
          `Check network IP (current: ${networkIp}) and ensure API server is running.`
        );
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
      body: JSON.stringify({ channel, target, code, app: "carer" }),
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

  async getMyCarer() {
    return this.request("/carers/me/carer");
  }

  // Jobs
  async getJobs(params?: { status?: string; date?: string; carerId?: string }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request(`/jobs${query ? `?${query}` : ""}`);
  }

  async getJob(id: string) {
    return this.request(`/jobs/${id}`);
  }

  async updateJob(id: string, data: any) {
    return this.request(`/jobs/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async startJob(id: string, data?: { location?: { lat: number; lng: number; accuracyM?: number }; etaMinutes?: number }) {
    return this.request(`/jobs/${id}/start`, {
      method: "POST",
      body: JSON.stringify(data || {}),
    });
  }

  async arriveAtJob(id: string, data?: { occurredAt?: string; location?: { lat: number; lng: number; accuracyM?: number } }) {
    return this.request(`/jobs/${id}/arrive`, {
      method: "POST",
      body: JSON.stringify(data || {}),
    });
  }

  async completeJob(id: string, data?: any) {
    return this.request(`/jobs/${id}/complete`, {
      method: "POST",
      body: JSON.stringify(data || {}),
    });
  }

  // Visits
  async getVisits(params?: { jobId?: string; date?: string; limit?: number; page?: number }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request(`/visits${query ? `?${query}` : ""}`);
  }

  async getVisit(id: string) {
    return this.request(`/visits/${id}`);
  }

  async createVisit(data: any) {
    return this.request("/visits", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateVisit(id: string, data: any) {
    return this.request(`/visits/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async addReading(visitId: string, data: any) {
    return this.request(`/visits/${visitId}/readings`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Alias for saveReadings (used by wizard)
  async saveReadings(visitId: string, data: any) {
    return this.addReading(visitId, data);
  }

  // Upload visit photo using FormData
  async uploadVisitPhoto(visitId: string, formData: FormData) {
    const token = await this.getAuthToken();
    if (!token) {
      throw new Error("Not authenticated");
    }

    const url = `${getBaseUrl()}/visits/${visitId}/photos/upload`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        // Note: Don't set Content-Type for FormData, let fetch set it with boundary
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(errorData?.message || errorData?.error || response.statusText);
    }

    return response.json();
  }

  async addChemical(visitId: string, data: any) {
    return this.request(`/visits/${visitId}/chemicals`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async completeVisit(visitId: string, data?: any) {
    return this.request(`/visits/${visitId}/complete`, {
      method: "POST",
      body: JSON.stringify(data || {}),
    });
  }

  async presignPhoto(visitId: string, contentType: string, fileName?: string) {
    return this.request(`/visits/${visitId}/photos/presign`, {
      method: "POST",
      body: JSON.stringify({ contentType, fileName }),
    });
  }

  async uploadPhotoDirect(visitId: string, imageData: string, contentType: string, label: "before" | "after" | "issue", fileName?: string) {
    return this.request(`/visits/${visitId}/photos/upload`, {
      method: "POST",
      body: JSON.stringify({ imageData, contentType, label, fileName }),
    });
  }

  async commitPhoto(visitId: string, key: string, label: "before" | "after" | "issue", takenAt?: string, meta?: any) {
    return this.request(`/visits/${visitId}/photos/commit`, {
      method: "POST",
      body: JSON.stringify({ key, label, takenAt, meta }),
    });
  }

  async getVisitReport(visitId: string, format?: "json" | "pdf"): Promise<any> {
    const token = await this.getAuthToken();
    if (!token) {
      throw new Error("Not authenticated");
    }

    const formatParam = format ? `?format=${format}` : "";
    const url = `${getBaseUrl()}/visits/${visitId}/report${formatParam}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    // For JSON format, return parsed JSON directly
    if (format === "json") {
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(errorData?.message || errorData?.error || response.statusText);
      }
      return response.json();
    }

    // For PDF format, continue with existing behavior

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(errorData?.message || errorData?.error || response.statusText);
    }

    // Get response as array buffer and convert to base64
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Convert to base64 string (React Native compatible)
    const base64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let base64 = "";
    let i = 0;
    while (i < uint8Array.length) {
      const a = uint8Array[i++];
      const b = i < uint8Array.length ? uint8Array[i++] : 0;
      const c = i < uint8Array.length ? uint8Array[i++] : 0;
      
      const bitmap = (a << 16) | (b << 8) | c;
      base64 += base64Chars.charAt((bitmap >> 18) & 63);
      base64 += base64Chars.charAt((bitmap >> 12) & 63);
      base64 += i - 2 < uint8Array.length ? base64Chars.charAt((bitmap >> 6) & 63) : "=";
      base64 += i - 1 < uint8Array.length ? base64Chars.charAt(bitmap & 63) : "=";
    }

    return base64;
  }

  async getVisitReportData(visitId: string) {
    return this.request(`/visits/${visitId}/report?format=json`);
  }

  // Settings
  async getOrgSettings() {
    return this.request("/settings/org");
  }

  async getPublicBranding() {
    return this.request<{
      organizationName: string;
      logoUrl: string | null;
      themeColor: string;
      primaryColorHex: string;
    }>("/settings/branding", { requireAuth: false });
  }

  // Update carer's own profile (name, imageUrl)
  async updateMyCarer(data: { name?: string; imageUrl?: string }) {
    return this.request("/carers/me/carer", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  // Upload carer's own profile photo
  async uploadMyCarerPhoto(imageUri: string, fileName: string, mimeType: string) {
    const formData = new FormData();
    formData.append("photo", { uri: imageUri, name: fileName, type: mimeType } as any);
    const token = await this.getAuthToken();
    const url = `${getBaseUrl()}/carers/me/upload-photo`;
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(errorData?.message || response.statusText);
    }
    return response.json() as Promise<{ imageUrl: string }>;
  }

  // Carer earnings
  async getEarnings(params?: { month?: string; year?: string }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request(`/carers/me/earnings${query ? `?${query}` : ""}`);
  }

  // Mobile Sync (for offline support)
  async sync(since?: number, shapes?: string[]) {
    const params = new URLSearchParams();
    if (since) params.append("since", since.toString());
    if (shapes && shapes.length > 0) params.append("shapes", shapes.join(","));
    return this.request(`/mobile/sync${params.toString() ? `?${params.toString()}` : ""}`);
  }

  // Settings
  async getGoogleMapsSettings() {
    return this.request("/settings/integrations/google-maps");
  }

  // Products (for supplies / inventory catalog)
  async getProducts(params?: { limit?: number; isActive?: string; category?: string }) {
    const query = new URLSearchParams();
    if (params?.limit != null) query.set("limit", String(params.limit));
    if (params?.isActive != null) query.set("isActive", params.isActive);
    if (params?.category != null) query.set("category", params.category);
    const qs = query.toString();
    return this.request<{ items: any[]; total?: number }>(`/products${qs ? `?${qs}` : ""}`);
  }

  // Supply requests (carer's own requests)
  async getSupplyRequests(params?: { status?: string; priority?: string; page?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.status != null) query.set("status", params.status);
    if (params?.priority != null) query.set("priority", params.priority);
    if (params?.page != null) query.set("page", String(params.page));
    if (params?.limit != null) query.set("limit", String(params.limit));
    const qs = query.toString();
    return this.request<{ items: any[]; total?: number }>(`/supplies/requests${qs ? `?${qs}` : ""}`);
  }

  async createSupplyRequest(body: { items: Array<{ name: string; quantity: number; unit?: string; notes?: string }>; priority?: string; notes?: string }) {
    return this.request("/supplies/requests", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async getNotifications(params?: { limit?: number; page?: number }) {
    const query = new URLSearchParams();
    if (params?.limit != null) query.set("limit", String(params.limit));
    if (params?.page != null) query.set("page", String(params.page));
    const qs = query.toString();
    return this.request(`/notifications${qs ? `?${qs}` : ""}`);
  }
}

export const api = new ApiClient();
export type { AuthResult };

