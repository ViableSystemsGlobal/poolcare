export * from "./auth";
export * from "./validation";

export type Role = "ADMIN" | "MANAGER" | "CARER" | "CLIENT";

export interface JwtPayload {
  sub: string; // user id
  org_id: string;
  role: Role;
}

export function parseBearerToken(authHeader?: string): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}

