import { NextRequest, NextResponse } from "next/server";

// Proxy API route for OTP requests
// This proxies requests to the actual NestJS API backend
export async function POST(request: NextRequest) {
  try {
    // Use BACKEND_API_URL if set (for server-side), otherwise fall back to NEXT_PUBLIC_API_URL
    // BACKEND_API_URL should point to the actual NestJS API service
    // If NEXT_PUBLIC_API_URL points to this web app, we need BACKEND_API_URL to be set
    let backendApiUrl = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
    
    // If NEXT_PUBLIC_API_URL points to this web app (same origin), we can't use it
    // In that case, try to use the API service directly if it's on a different port/service
    if (!process.env.BACKEND_API_URL && process.env.NEXT_PUBLIC_API_URL) {
      // If API is on same service but different port, try localhost:4000
      // Or if API is on separate Render service, BACKEND_API_URL should be set
      console.warn("⚠️ BACKEND_API_URL not set. Using NEXT_PUBLIC_API_URL which may point to web app itself.");
    }
    
    const body = await request.json();
    const targetUrl = `${backendApiUrl}/auth/otp/request`;
    
    console.log("🔗 Proxying OTP request to:", targetUrl);
    
    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      console.error("❌ Backend API error:", response.status, errorData);
      return NextResponse.json(errorData, { status: response.status });
    }

    const data = await response.json();
    console.log("✅ OTP request proxied successfully");
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("❌ OTP request proxy error:", error);
    if (error.name === 'AbortError') {
      return NextResponse.json(
        { message: "Backend API request timed out. Make sure the API service is running and BACKEND_API_URL is set correctly." },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { message: error.message || "Failed to request OTP" },
      { status: 500 }
    );
  }
}
