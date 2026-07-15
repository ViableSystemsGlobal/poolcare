import { Injectable, BadRequestException } from "@nestjs/common";
import { EmailAdapter } from "../notifications/adapters/email.adapter";
import { SmsAdapter } from "../notifications/adapters/sms.adapter";
import { PushAdapter } from "../notifications/adapters/push.adapter";

export type MessageChannel = "email" | "sms" | "push";

export interface MessageRecipient {
  email?: string | null;
  phone?: string | null;
  ownerId?: string | null;
  pushTitleFallback: string;
}

// Shared dispatcher: sends a real Email / SMS / Push and returns the CRM
// activity type + provider reference so each entity can log it on its timeline.
@Injectable()
export class CrmMessagingService {
  constructor(
    private readonly emailAdapter: EmailAdapter,
    private readonly smsAdapter: SmsAdapter,
    private readonly pushAdapter: PushAdapter
  ) {}

  async dispatch(
    orgId: string,
    dto: { channel: MessageChannel; subject?: string; body: string },
    recipient: MessageRecipient
  ): Promise<{ type: "EMAIL" | "SMS" | "PUSH"; providerRef?: string }> {
    const body = (dto.body || "").trim();
    if (!body) throw new BadRequestException("Message body is required");

    if (dto.channel === "email") {
      if (!recipient.email) throw new BadRequestException("No email address on file");
      const subject = dto.subject?.trim() || "A message from PoolCare";
      const ref = await this.emailAdapter.send(recipient.email, subject, body, undefined, orgId);
      return { type: "EMAIL", providerRef: ref };
    }

    if (dto.channel === "sms") {
      if (!recipient.phone) throw new BadRequestException("No phone number on file");
      const ref = await this.smsAdapter.send(recipient.phone, body, orgId);
      return { type: "SMS", providerRef: ref };
    }

    // Push targets the assigned owner's devices (the contact isn't an app user).
    if (!recipient.ownerId) throw new BadRequestException("Assign an owner before sending a push notification");
    const title = dto.subject?.trim() || recipient.pushTitleFallback;
    const refs = await this.pushAdapter.sendToUser(recipient.ownerId, orgId, title, body, {});
    if (!refs || refs.length === 0) {
      throw new BadRequestException("The assigned owner has no registered devices for push");
    }
    return { type: "PUSH", providerRef: refs.join(",") };
  }

  // Folds an optional subject into the logged activity body for the timeline.
  logBody(subject: string | undefined, body: string): string {
    const s = subject?.trim();
    return s ? `${s} — ${body.trim()}` : body.trim();
  }
}
