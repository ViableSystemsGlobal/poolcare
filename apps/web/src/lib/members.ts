// Org members (GET /orgs/members) come back one row PER ROLE, so a user with
// multiple roles appears multiple times. Dedupe to one entry per user (and drop
// CLIENT-only entries) for assignee pickers.
export function dedupeMembers(items?: any[]): any[] {
  const seen = new Map<string, any>();
  for (const m of items || []) {
    if (!m?.userId || m.role === "CLIENT") continue;
    if (!seen.has(m.userId)) seen.set(m.userId, m);
  }
  return [...seen.values()];
}
