import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { NotificationsService } from "./notifications.service";
import { createEmailTemplate, getOrgEmailSettings, emailUi } from "../email/email-template.util";

const BRAND_TOKEN = "__ORG_BRAND_COLOR__";
const CARER_EYEBROWS: Record<string, string> = {
  job_assigned: "New job",
  day_plan: "Today's plan",
  visit_completed: "Visit complete",
  visit_paid: "Payment sent",
  visit_approved: "Visit approved",
  job_rescheduled: "Schedule change",
  job_cancelled: "Job cancelled",
  job_unassigned: "Schedule change",
  assessment: "Assessment",
};

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
              metadata: {
                ...metadata,
                html: createEmailTemplate(msg.emailHtml.split(BRAND_TOKEN).join(settings.primaryColor || "#387c52"), {
                  ...settings,
                  eyebrow: CARER_EYEBROWS[msg.type] || "PoolCare carer",
                  preheader: msg.push,
                  reason: `You're getting this because you're a carer with ${settings.organizationName}.`,
                }),
              },
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

  /** Title of the email (lifted into the brand header by the layout). */
  static heading(text: string) {
    return `<h2>${esc(text)}</h2>`;
  }

  static para(html: string) {
    return emailUi.p(html);
  }

  /** Label/value rows: [label, value] (values are escaped). */
  static details(rows: Array<[string, string | null | undefined]>) {
    return emailUi.facts(rows);
  }

  /** Centred button in the org's brand colour (filled in when the email is sent). */
  static button(label: string, href: string) {
    return emailUi.button(label, href, BRAND_TOKEN);
  }

  /** Colour placeholder for links in carer emails; replaced with the org colour on send. */
  static readonly brand = BRAND_TOKEN;
}
