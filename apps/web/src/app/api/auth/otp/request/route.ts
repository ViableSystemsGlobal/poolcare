import { NextRequest, NextResponse } from "next/server";

// Proxy API route for OTP requests
// This proxies requests to the actual NestJS API backend
export async function POST(request: NextRequest) {
  try {
    // Use BACKEND_API_URL if set (for server-side), otherwise fall back to NEXT_PUBLIC_API_URL
    // BACKEND_API_URL should point to the actual NestJS API service
    const backendApiUrl = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
    
    const body = await request.json();
    
    const response = await fetch(`${backendApiUrl}/auth/otp/request`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      return NextResponse.json(errorData, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("OTP request proxy error:", error);
    return NextResponse.json(
      { message: error.message || "Failed to request OTP" },
      { status: 500 }
    );
  }
}
