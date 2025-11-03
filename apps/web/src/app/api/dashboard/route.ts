import { NextResponse } from "next/server";
import { headers } from "next/headers";

// This is a Next.js API route that proxies to the backend API
// It handles authentication and forwards requests
export async function GET() {
  try {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
    
    // Get auth token from request headers (sent by client)
    const headersList = await headers();
    const authHeader = headersList.get("authorization");
    
    // Call backend API
    const response = await fetch(`${API_URL}/dashboard`, {
      headers: {
        "Content-Type": "application/json",
        ...(authHeader && { Authorization: authHeader }),
      },
    });

    if (!response.ok) {
      // If backend doesn't have dashboard endpoint yet, return mock data
      return NextResponse.json({
        metrics: {
          todayJobs: 12,
          totalClients: 45,
          activePools: 52,
          pendingQuotes: 3,
          monthlyRevenue: 1250000, // in cents
        },
        recentActivity: [
          {
            id: "1",
            type: "visit",
            title: "Visit completed for East Legon Pool",
            description: "Visit #V-2025-001 completed successfully",
            timestamp: new Date().toISOString(),
          },
          {
            id: "2",
            type: "quote",
            title: "New quote created",
            description: "Quote for pump repair - GH₵1,200",
            timestamp: new Date(Date.now() - 3600000).toISOString(),
          },
          {
            id: "3",
            type: "job",
            title: "Job scheduled for tomorrow",
            description: "Weekly service for Labone Residence",
            timestamp: new Date(Date.now() - 7200000).toISOString(),
          },
        ],
      });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Dashboard API error:", error);
    // Return mock data on error
    return NextResponse.json({
      metrics: {
        todayJobs: 12,
        totalClients: 45,
        activePools: 52,
        pendingQuotes: 3,
        monthlyRevenue: 1250000,
      },
      recentActivity: [],
    });
  }
}
