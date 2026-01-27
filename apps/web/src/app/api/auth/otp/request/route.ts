import { NextRequest, NextResponse } from "next/server";

// Proxy API route for OTP requests
export async function POST(request: NextRequest) {
  try {
    // Server-side: prefer API_URL (runtime), then NEXT_PUBLIC_API_URL (build-time), then fallback
    const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
    console.log("OTP request proxy using API_URL:", API_URL);
    const body = await request.json();
    
    const response = await fetch(`${API_URL}/auth/otp/request`, {
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
