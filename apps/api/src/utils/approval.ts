import { BadRequestException } from "@nestjs/common";

/**
 * Carer-onboarded pools and clients wait for office approval. Scheduling and
 * billing are refused until both the pool (when there is one) and its client
 * are approved.
 */
export function assertApproved(kind: "pool" | "client", record: { approvalStatus?: string | null } | null | undefined) {
  const status = record?.approvalStatus;
  if (!status || status === "approved") return;
  throw new BadRequestException(
    status === "pending"
      ? `This ${kind} is awaiting approval. Approve it before scheduling or billing.`
      : `This ${kind} was rejected. Approve it before scheduling or billing.`
  );
}
