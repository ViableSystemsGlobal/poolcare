// Get API URL from environment, with fallback for localhost
const getApiUrl = () => {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  
  // If no env var is set, default to localhost for local development
  if (!envUrl) {
    // In production (Render), warn if API URL is not set
    if (typeof window !== "undefined" && window.location.hostname.includes("onrender.com")) {
      console.error(
        "⚠️ NEXT_PUBLIC_API_URL is not set! " +
        "Please set it in Render environment variables to point to your API service. " +
        "Example: https://your-api-service.onrender.com/api"
      );
    }
    return "http://localhost:4000/api";
  }
  
  return envUrl;
};

const API_URL = getApiUrl();

interface RequestOptions extends RequestInit {
  requireAuth?: boolean;
}

class ApiClient {
  private getAuthToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("auth_token");
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
      const token = this.getAuthToken();
      if (token) {
        requestHeaders.Authorization = `Bearer ${token}`;
      }
    }

    try {
      console.log("API Request:", url, { method: restOptions.method, headers: requestHeaders });
      
      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
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
      console.error("API Request failed:", error);
      if (error.name === 'AbortError') {
        throw new Error("Request timed out. Check if the API server is running on port 4000.");
      }
      if (error.message?.includes("fetch") || error.message?.includes("Failed to fetch")) {
        throw new Error("Cannot connect to API server. Make sure it's running on port 4000 and check CORS settings.");
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
  ): Promise<{ token: string; user: any; org: any; role: string }> {
    const result = await this.request<{
      token: string;
      user: any;
      org: any;
      role: string;
    }>("/auth/otp/verify", {
      method: "POST",
      body: JSON.stringify({ channel, target, code }),
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
  async getJobs(params?: { status?: string; date?: string }) {
    const query = new URLSearchParams(params as any).toString();
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
  async getCarers() {
    return this.request("/carers");
  }

  async createCarer(data: any) {
    return this.request("/carers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }
}

export const api = new ApiClient();

