import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { NotificationsService } from "./notifications.service";
import { createEmailTemplate, getOrgEmailSettings } from "../email/email-template.util";

/*
 * One way to tell a carer something: push to the carer app, SMS and a branded
 * email, all three, each best-effort (one failing never stops the others or
 * the action that triggered it). Every send is logged in the Notification table
 * by NotificationsService.
 */

export interface CarerMessage {
  /** Machine type, e.g. "job_assigned", "visit_completed", "day_plan". */
  type: string;
  /** Push title (short). */
  title: string;
  /** Push body (one or two lines). */
  push: string;
  /** SMS text. Keep it plain and short; long texts cost more segments. */
  sms: string;
  /** Email subject; defaults to the push title. */
  emailSubject?: string;
  /** Email content (HTML fragment; wrapped in the org's branded template). */
  emailHtml: string;
  /** Plain-text email fallback; defaults to the SMS text. */
  emailText?: string;
  /** Where a push tap should go in the carer app, plus ids for the record. */
  metadata?: Record<string, any>;
}

type CarerLite = {
  id: string;
  userId: string | null;
  name: string | null;
  phone: string | null;
  user?: { email: string | null; phone: string | null } | null;
};

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** "8:00 AM" in Ghana time. */
export const ghTime = (d: Date | string) =>
  new Date(d).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Accra" });

@Injectable()
export class CarerNotifyService {
  private readonly logger = new Logger(CarerNotifyService.name);

  constructor(private readonly notifications: NotificationsService) {}

  private async load(orgId: string, where: { id?: string; userId?: string }): Promise<CarerLite | null> {
    return prisma.carer.findFirst({
      where: { orgId, ...where },
      select: { id: true, userId: true, name: true, phone: true, user: { select: { email: true, phone: true } } },
    });
  }

  async notifyCarerId(orgId: string, carerId: string | null | undefined, msg: CarerMessage) {
    if (!carerId) return;
    const carer = await this.load(orgId, { id: carerId }).catch(() => null);
    if (carer) await this.notify(orgId, carer, msg);
  }

  async notifyCarerUser(orgId: string, userId: string | null | undefined, msg: CarerMessage) {
    if (!userId) return;
    const carer = await this.load(orgId, { userId }).catch(() => null);
    if (carer) await this.notify(orgId, carer, msg);
  }

  /** Send on all three channels. Never throws. Returns which channels went out. */
  async notify(orgId: string, carer: CarerLite, msg: CarerMessage): Promise<{ push: boolean; sms: boolean; email: boolean }> {
    const sent = { push: false, sms: false, email: false };
    const metadata = { ...(msg.metadata || {}), type: msg.type, carerId: carer.id };
    const phone = carer.user?.phone || carer.phone;
    const email = carer.user?.email;

    const jobs: Promise<void>[] = [];

    if (carer.userId) {
      jobs.push(
        this.notifications
          .send(orgId, {
            channel: "push",
            to: "",
            recipientId: carer.userId,
            recipientType: "carer",
            subject: msg.title,
            body: msg.push,
            template: msg.type,
            metadata,
          } as any)
          .then(() => void (sent.push = true))
          .catch((e) => this.logger.warn(`push ${msg.type} → carer ${carer.id}: ${e?.message ?? e}`))
      );
    }

    if (phone) {
      jobs.push(
        this.notifications
          .send(orgId, {
            channel: "sms",
            to: phone,
            recipientId: carer.userId || undefined,
            recipientType: "carer",
            subject: msg.title,
            body: msg.sms,
            template: msg.type,
            metadata,
          } as any)
          .then(() => void (sent.sms = true))
          .catch((e) => this.logger.warn(`sms ${msg.type} → carer ${carer.id}: ${e?.message ?? e}`))
      );
    }

    if (email) {
      jobs.push(
        getOrgEmailSettings(orgId)
          .then((settings) =>
            this.notifications.send(orgId, {
              channel: "email",
              to: email,
              recipientId: carer.userId || undefined,
              recipientType: "carer",
              subject: msg.emailSubject || msg.title,
              body: msg.emailText || msg.sms,
              template: msg.type,
              metadata: { ...metadata, html: createEmailTemplate(msg.emailHtml, settings) },
            } as any)
          )
          .then(() => void (sent.email = true))
          .catch((e) => this.logger.warn(`email ${msg.type} → carer ${carer.id}: ${e?.message ?? e}`))
      );
    }

    await Promise.all(jobs);
    return sent;
  }

  // ---------------------------------------------------------------------------
  // Shared email building blocks (kept plain so every email client renders them)

  static heading(text: string) {
    return `<h2 style="color:#111827;margin:0 0 12px 0;font-size:20px;">${esc(text)}</h2>`;
  }

  static para(text: string) {
    return `<p style="margin:0 0 14px 0;color:#374151;line-height:1.5;">${text}</p>`;
  }

  /** Two-column detail rows: [label, value] (values are escaped). */
  static details(rows: Array<[string, string | null | undefined]>) {
    const body = rows
      .filter(([, v]) => v)
      .map(
        ([k, v]) =>
          `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:13px;white-space:nowrap;vertical-align:top;">${esc(k)}</td>` +
          `<td style="padding:6px 0;color:#111827;font-size:14px;">${esc(v)}</td></tr>`
      )
      .join("");
    return `<table role="presentation" style="border-collapse:collapse;margin:0 0 16px 0;">${body}</table>`;
  }
}
