import { NextRequest, NextResponse } from "next/server";

// Proxy API route for OTP code check
export async function POST(request: NextRequest) {
  try {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
    const body = await request.json();
    
    const response = await fetch(`${API_URL}/auth/otp/check`, {
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
    console.error("OTP check proxy error:", error);
    return NextResponse.json(
      { message: error.message || "Failed to check OTP" },
      { status: 500 }
    );
  }
}
