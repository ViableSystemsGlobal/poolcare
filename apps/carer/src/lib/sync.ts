import { getToken } from "./storage";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000";

export async function syncData(shapes: string[] = ["jobs", "pools", "visits"], since?: number) {
  const token = await getToken();
  if (!token) {
    throw new Error("Not authenticated");
  }

  const params = new URLSearchParams({
    shapes: shapes.join(","),
  });
  if (since) {
    params.append("since", since.toString());
  }

  const response = await fetch(`${API_URL}/api/mobile/sync?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Sync failed: ${response.statusText}`);
  }

  return await response.json();
}

export async function pushMutation(method: string, path: string, body: any, dedupeKey: string) {
  const token = await getToken();
  if (!token) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(`${API_URL}/api${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": dedupeKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Mutation failed: ${response.statusText}`);
  }

  return await response.json();
}

