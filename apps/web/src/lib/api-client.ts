// Runtime API URL detection - works in both development and production
function getApiUrl(): string {
  // First check if explicitly set via environment variable (baked in at build time)
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  
  // In browser, try to detect the API URL based on current location
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    
    // Production: if on Render or custom domain, use the API service URL
    // Check for common production patterns
    if (hostname.includes("onrender.com")) {
      // Render deployment - API should be at a parallel service
      // Convention: web is poolcare-web.onrender.com, api is poolcare-api.onrender.com
      const apiHostname = hostname.replace("-web", "-api").replace("poolcare.onrender", "poolcare-api.onrender");
      return `https://${apiHostname}/api`;
    }
    
    // Check if there's a custom API URL in localStorage (for debugging/testing)
    const customApiUrl = localStorage.getItem("__poolcare_api_url");
    if (customApiUrl) {
      return customApiUrl;
    }
    
    // Production domain - assume API is at api subdomain or /api path
    if (!hostname.includes("localhost") && !hostname.includes("127.0.0.1")) {
      // Try same origin with /api prefix (useful if API is proxied)
      return `${window.location.origin}/api`;
    }
  }
  
  // Default fallback for local development
  return "http://localhost:4000/api";
}

const API_URL = getApiUrl();

interface RequestOptions extends RequestInit {
  requireAuth?: boolean;
}

class ApiClient {
  private getAuthToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("auth_token");
  }
  
  // Allow checking/changing API URL at runtime
  getApiUrl(): string {
    return API_URL;
  }

  private async request<T>(
    endpoint: string,
    options: RequestOptions & { timeout?: number } = {}
  ): Promise<T> {
    const { requireAuth = true, headers = {}, timeout, ...restOptions } = options;

    const url = endpoint.startsWith("http") ? endpoint : `${API_URL}${endpoint}`;

    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...(headers as Record<string, string>),
    };

    if (requireAuth) {
      const token = this.getAuthToken();
      if (token) {
        requestHeaders.Authorization = `Bearer ${token}`;
      }
    }

    try {
      console.log("API Request:", url, { method: restOptions.method, headers: requestHeaders });

      // Add timeout to prevent hanging (longer for AI endpoints)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout || 10000);
      
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
        
        // Only redirect to login if this is NOT an auth endpoint (OTP endpoints return 401 for invalid codes)
        if (response.status === 401 && !url.includes("/auth/otp")) {
          localStorage.removeItem("auth_token");
          window.location.href = "/auth/login";
        }
        
        // Extract the actual error message
        const errorMessage = errorData?.message || errorData?.error || response.statusText;
        console.error("API Error Response:", { status: response.status, url, errorData });
        throw new Error(errorMessage);
      }

      return response.json();
    } catch (error: any) {
      console.error("API Request failed:", error, "API_URL:", API_URL);
      if (error.name === 'AbortError') {
        throw new Error(`Request timed out. API URL: ${API_URL}`);
      }
      if (error.message?.includes("fetch") || error.message?.includes("Failed to fetch")) {
        throw new Error(`Cannot connect to API server at ${API_URL}. Check CORS settings and ensure the API service is running.`);
      }
      throw error;
    }
  }

  // Auth endpoints (admin console = invite-only)
  async requestOtp(channel: "phone" | "email", target: string) {
    return this.request("/auth/otp/request", {
      method: "POST",
      body: JSON.stringify({ channel, target, app: "admin" }),
      requireAuth: false,
    });
  }

  async verifyOtp(
    channel: "phone" | "email",
    target: string,
    code: string
  ): Promise<{ token: string; user: any; org: any; role: string }> {
    const result = await this.request<{
      token: string;
      user: any;
      org: any;
      role: string;
    }>("/auth/otp/verify", {
      method: "POST",
      body: JSON.stringify({ channel, target, code, app: "admin" }),
      requireAuth: false,
    });

    if (result.token) {
      localStorage.setItem("auth_token", result.token);
    }

    return result;
  }

  async checkOtpCode(channel: "phone" | "email", target: string) {
    return this.request<{ exists: boolean; code: string | null; message: string }>("/auth/otp/check", {
      method: "POST",
      body: JSON.stringify({ channel, target }),
      requireAuth: false,
    });
  }

  // Dashboard
  async getDashboard() {
    return this.request("/dashboard");
  }

  // Jobs
  async getJobs(params?: {
    status?: string;
    date?: string;
    dateFrom?: string;
    dateTo?: string;
    carerId?: string;
    limit?: number;
  }) {
    const filtered = Object.fromEntries(
      Object.entries(params ?? {}).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
    );
    const query = new URLSearchParams(filtered).toString();
    return this.request(`/jobs${query ? `?${query}` : ""}`);
  }

  async getJob(id: string) {
    return this.request(`/jobs/${id}`);
  }

  async createJob(data: any) {
    return this.request("/jobs", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateJob(id: string, data: any) {
    return this.request(`/jobs/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  // Clients
  async getClients() {
    return this.request("/clients");
  }

  async getClient(id: string) {
    return this.request(`/clients/${id}`);
  }

  async createClient(data: any) {
    return this.request("/clients", {
      method: "POST",
      body: JSON.stringify(data),
    });
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

  // Service Plans
  async getPlans() {
    return this.request("/plans");
  }

  async getPlan(id: string) {
    return this.request(`/plans/${id}`);
  }

  async createPlan(data: any) {
    return this.request("/plans", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Visits
  async getVisits(params?: { jobId?: string; date?: string }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request(`/visits${query ? `?${query}` : ""}`);
  }

  // Quotes
  async getQuotes(params?: { status?: string; clientId?: string }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request(`/quotes${query ? `?${query}` : ""}`);
  }

  // Invoices
  async getInvoices(params?: { status?: string; clientId?: string }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request(`/invoices${query ? `?${query}` : ""}`);
  }

  // Carers
  async getCarers(params?: { active?: boolean; limit?: number }) {
    const filtered = Object.fromEntries(
      Object.entries(params ?? {}).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
    );
    const query = new URLSearchParams(filtered).toString();
    return this.request(`/carers${query ? `?${query}` : ""}`);
  }

  async createCarer(data: any) {
    return this.request("/carers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Tip Schedule
  async getTipSchedule() {
    return this.request<{
      enabled: boolean;
      days: {
        monday: boolean;
        tuesday: boolean;
        wednesday: boolean;
        thursday: boolean;
        friday: boolean;
        saturday: boolean;
        sunday: boolean;
      };
      lastTipIndex: number;
    }>("/settings/tip-schedule");
  }

  async updateTipSchedule(schedule: {
    enabled: boolean;
    days: {
      monday: boolean;
      tuesday: boolean;
      wednesday: boolean;
      thursday: boolean;
      friday: boolean;
      saturday: boolean;
      sunday: boolean;
    };
    lastTipIndex?: number;
  }) {
    return this.request("/settings/tip-schedule", {
      method: "PATCH",
      body: JSON.stringify(schedule),
    });
  }
  // Weekly Tips Queue
  async getWeeklyTipsQueue() {
    return this.request("/ai/tips/weekly-queue");
  }

  async approveWeeklyTips() {
    return this.request("/ai/tips/weekly-queue/approve", { method: "POST" });
  }

  async updateWeeklyTip(index: number, tip: string) {
    return this.request(`/ai/tips/weekly-queue/${index}`, {
      method: "PATCH",
      body: JSON.stringify({ tip }),
    });
  }

  async prepareWeeklyContent() {
    return this.request("/ai/tips/prepare-weekly", {
      method: "POST",
      timeout: 120000,
    });
  }

  // Newsletter
  async generateNewsletter(topic?: string, tone?: string) {
    return this.request("/ai/newsletter/generate", {
      method: "POST",
      body: JSON.stringify({ topic, tone }),
      timeout: 120000,
    });
  }

  async previewNewsletter(topic?: string, tone?: string) {
    return this.request("/ai/newsletter/preview", {
      method: "POST",
      body: JSON.stringify({ topic, tone }),
    });
  }

  async sendNewsletter(
    subject: string,
    htmlBody: string,
    recipientType: string,
    customEmails?: string
  ) {
    return this.request("/ai/newsletter/send", {
      method: "POST",
      body: JSON.stringify({ subject, htmlBody, recipientType, customEmails }),
      timeout: 60000,
    });
  }

  async getNewsletterHistory() {
    return this.request("/ai/newsletter/history");
  }

  async getNewsletterById(id: string) {
    return this.request(`/ai/newsletter/history/${id}`);
  }

  async getTipHistory() {
    return this.request("/ai/tips/history");
  }

  async sendTip(tip: string, testPhone?: string) {
    return this.request("/ai/tips/send-manual", {
      method: "POST",
      body: JSON.stringify({ tip, testPhone: testPhone || undefined }),
      timeout: 30000,
    });
  }

  async getNewsletterDrafts() {
    return this.request("/ai/newsletter/drafts");
  }

  async approveNewsletterDraft(id: string) {
    return this.request(`/ai/newsletter/drafts/${id}/approve`, { method: "POST" });
  }

  async sendNewsletterDraft(id: string, recipientType = "all", customEmails?: string) {
    return this.request(`/ai/newsletter/drafts/${id}/send`, {
      method: "POST",
      body: JSON.stringify({ recipientType, customEmails }),
    });
  }

  // Settings
  async getOrgSettings() {
    return this.request<{ profile: any }>("/settings/org");
  }

  // Help Assistant (ephemeral chat)
  async chatWithHelpAssistant(messages: { role: string; content: string }[]) {
    return this.request<{ message: string }>("/ai/help/chat", {
      method: "POST",
      body: JSON.stringify({ messages }),
      timeout: 60000,
    });
  }

  // App Users (combines clients + carers)
  async getAppUsers() {
    const [clients, carers] = await Promise.all([
      this.request<{ items: any[]; total: number }>("/clients?limit=500"),
      this.request<{ items: any[]; total: number }>("/carers?limit=500"),
    ]);
    return { clients: clients.items || [], carers: carers.items || [] };
  }

  // Push notifications
  async broadcastNotification(dto: {
    title: string;
    body: string;
    audience: "all" | "clients" | "carers";
  }) {
    return this.request("/notifications/broadcast", {
      method: "POST",
      body: JSON.stringify(dto),
    });
  }

  async sendPushNotification(dto: {
    recipientId: string;
    recipientType: string;
    subject: string;
    body: string;
  }) {
    return this.request("/notifications/send", {
      method: "POST",
      body: JSON.stringify({
        ...dto,
        channel: "push",
        to: "",
      }),
    });
  }
  // Knowledge Base
  async uploadKnowledgeDoc(
    file: File,
    name: string,
    description: string,
    category: string,
  ) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", name);
    formData.append("description", description);
    formData.append("category", category);

    const token = this.getAuthToken();
    const res = await fetch(`${API_URL}/knowledge/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || "Upload failed");
    }
    return res.json();
  }

  async getKnowledgeDocs() {
    return this.request("/knowledge");
  }

  async deleteKnowledgeDoc(id: string) {
    return this.request(`/knowledge/${id}`, { method: "DELETE" });
  }
}

export const api = new ApiClient();

