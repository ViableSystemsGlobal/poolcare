import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger, Inject, forwardRef } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { prisma } from "@poolcare/db";
import { NotificationsService } from "../notifications/notifications.service";
import { PrepaidTermsService } from "../plans/prepaid-terms.service";
import { QuotesService } from "../quotes/quotes.service";
import { createEmailTemplate, getOrgEmailSettings } from "../email/email-template.util";
import { ReceiptsService } from "./receipts.service";
import { InitPaymentDto, CreateRefundDto } from "./dto";
import * as crypto from "crypto";
import PDFDocument from "pdfkit";
import * as MinIO from "minio";
import { v4 as uuidv4 } from "uuid";

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private minioClient: MinIO.Client;
  private bucket: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
    @Inject(forwardRef(() => PrepaidTermsService))
    private readonly prepaidTerms: PrepaidTermsService,
    @Inject(forwardRef(() => QuotesService))
    private readonly quotesService: QuotesService,
    @Inject(forwardRef(() => ReceiptsService))
    private readonly receiptsService: ReceiptsService,
  ) {
    this.minioClient = new MinIO.Client({
      endPoint: this.configService.get<string>("MINIO_ENDPOINT") || "localhost",
      port: parseInt(this.configService.get<string>("MINIO_PORT") || "9000"),
      useSSL: this.configService.get<string>("MINIO_USE_SSL") === "true",
      accessKey: this.configService.get<string>("MINIO_ACCESS_KEY") || "minioadmin",
      secretKey: this.configService.get<string>("MINIO_SECRET_KEY") || "minioadmin",
    });

    this.bucket = this.configService.get<string>("MINIO_BUCKET") || "poolcare";
  }

  /**
   * Get Paystack secret key — checks env first, then org settings (encrypted).
   */
  private async getPaystackSecret(orgId?: string): Promise<string | null> {
    // 1. Environment variable takes precedence
    const envKey = this.configService.get<string>("PAYSTACK_SECRET_KEY");
    if (envKey) return envKey;

    // 2. Fall back to org settings
    if (orgId) {
      try {
        const orgSetting = await prisma.orgSetting.findUnique({ where: { orgId } });
        const integrations = (orgSetting?.integrations as any) || {};
        const paystack = integrations.paystack;
        if (paystack?.secretKey) {
          // Decrypt if encrypted, or return as-is
          const key = this.configService.get<string>("ENCRYPTION_KEY");
          if (key && paystack.secretKey.includes(":")) {
            try {
              const [iv, encrypted] = paystack.secretKey.split(":");
              const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(key, "hex"), Buffer.from(iv, "hex"));
              let decrypted = decipher.update(encrypted, "hex", "utf8");
              decrypted += decipher.final("utf8");
              return decrypted;
            } catch { return paystack.secretKey; }
          }
          return paystack.secretKey;
        }
      } catch {}
    }
    return null;
  }

  async init(
    orgId: string,
    role: string,
    userId: string,
    invoiceId: string,
    dto: InitPaymentDto
  ) {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        orgId,
      },
      include: {
        client: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException("Invoice not found");
    }

    // CLIENT can only pay their own invoices
    if (role === "CLIENT") {
      const client = await prisma.client.findFirst({
        where: { orgId, userId },
      });
      if (!client || invoice.clientId !== client.id) {
        throw new ForbiddenException("Access denied");
      }
    }

    if (invoice.status !== "sent") {
      throw new BadRequestException("Invoice must be sent to accept payment");
    }

    const remainingCents = invoice.totalCents - invoice.paidCents;
    if (remainingCents <= 0) {
      throw new BadRequestException("Invoice already paid");
    }

    const amountCents = dto.amountCents || remainingCents;

    if (amountCents > remainingCents) {
      throw new BadRequestException("Amount exceeds remaining balance");
    }

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        orgId,
        invoiceId,
        method: dto.method || "card",
        provider: dto.provider || "paystack",
        amountCents,
        currency: invoice.currency,
        status: "pending",
      },
    });

    // Initialize payment with Paystack
    if (dto.provider === "paystack" || !dto.provider) {
      const paystackSecret = await this.getPaystackSecret(orgId);
      if (!paystackSecret) {
        throw new BadRequestException("Payment provider not configured. Add your Paystack API key in Settings > Integrations.");
      }

      try {
        const email = invoice.client.email || `${invoice.client.phone || "customer"}@poolcare.local`;
        const callbackUrl = this.configService.get<string>("PAYSTACK_CALLBACK_URL") || 
          `${this.configService.get<string>("NEXT_PUBLIC_APP_URL") || "http://localhost:3000"}/payments/callback`;

        const response = await fetch("https://api.paystack.co/transaction/initialize", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${paystackSecret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            amount: amountCents, // Paystack expects amount in smallest currency unit (pesewas for GHS)
            reference: payment.id,
            callback_url: callbackUrl,
            metadata: {
              invoiceId: invoice.id,
              orgId,
              paymentId: payment.id,
            },
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          this.logger.error(`Paystack API error: ${response.status} - ${errorText}`);
          throw new BadRequestException("Failed to initialize payment with Paystack");
        }

        const data = await response.json() as any;

        if (!data.status || !data.data) {
          this.logger.error("Invalid Paystack response", data);
          throw new BadRequestException("Invalid response from payment provider");
        }

        // Update payment with access code
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            providerRef: data.data.reference,
            metadata: { accessCode: data.data.access_code, ...data.data },
          },
        });

        return {
          paymentId: payment.id,
          authorizationUrl: data.data.authorization_url,
          accessCode: data.data.access_code,
          reference: data.data.reference,
        };
      } catch (error: any) {
        this.logger.error(`Failed to initialize Paystack payment: ${error.message}`, error);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new BadRequestException("Failed to initialize payment");
      }
    }

    throw new BadRequestException("Unsupported payment provider");
  }

  async handleWebhook(body: any, signature?: string) {
    if (!signature) {
      this.logger.warn("Webhook received without x-paystack-signature header");
      throw new BadRequestException("Missing webhook signature");
    }

    // Try env key first, then look up org-specific key from the payment reference
    let paystackSecret = this.configService.get<string>("PAYSTACK_SECRET_KEY") || null;

    if (!paystackSecret) {
      // Try to find the org from the payment reference
      const ref = body?.data?.reference;
      if (ref) {
        const payment = await prisma.payment.findUnique({ where: { id: ref }, select: { orgId: true } });
        if (payment) {
          paystackSecret = await this.getPaystackSecret(payment.orgId);
        }
      }
    }

    if (!paystackSecret) {
      this.logger.error("PAYSTACK_SECRET_KEY not configured — cannot verify webhook");
      throw new BadRequestException("Payment provider not configured");
    }

    const hash = crypto
      .createHmac("sha512", paystackSecret)
      .update(JSON.stringify(body))
      .digest("hex");
    if (hash !== signature) {
      this.logger.warn("Invalid webhook signature — possible spoofed request");
      throw new BadRequestException("Invalid webhook signature");
    }

    const event = body.event;
    const data = body.data;

    if (event === "charge.success") {
      const reference = data.reference; // This should be payment.id (we set it during init)
      const providerRef = data.id;

      // Look up payment by reference (which is payment.id)
      let payment = await prisma.payment.findFirst({
        where: {
          id: reference,
          status: "pending",
        },
        include: {
          invoice: true,
        },
      });

      // Fallback: try finding by providerRef if reference lookup fails
      if (!payment && providerRef) {
        payment = await prisma.payment.findFirst({
          where: {
            providerRef: String(providerRef),
            status: "pending",
          },
          include: {
            invoice: true,
          },
        });
      }

      if (!payment) {
        this.logger.warn(`Payment not found for reference: ${reference}, providerRef: ${providerRef}`);
        return { success: false, message: "Payment not found" };
      }

      // Claim the payment and credit the invoice atomically. Paystack retries
      // deliveries, so only the request that flips pending → completed may
      // add to paidCents, and the add happens in the database, not from a
      // stale read.
      const newStatus = await prisma.$transaction(async (tx) => {
        const claimed = await tx.payment.updateMany({
          where: { id: payment!.id, status: "pending" },
          data: {
            status: "completed",
            // Paystack's transaction id is a number; the column is a string.
            ...(providerRef != null ? { providerRef: String(providerRef) } : {}),
            processedAt: new Date(),
            metadata: data,
          },
        });
        if (claimed.count === 0) return null;
        const inv = await tx.invoice.update({
          where: { id: payment!.invoiceId },
          data: { paidCents: { increment: payment!.amountCents } },
        });
        if (inv.paidCents < inv.totalCents) return "sent";
        await tx.invoice.update({
          where: { id: inv.id },
          data: { status: "paid", paidAt: inv.paidAt ?? new Date() },
        });
        return "paid";
      });

      if (!newStatus) {
        return { success: true, message: "Already processed" };
      }

      // Every completed payment gets a receipt, sent to the client
      await this.generateReceipt(payment.orgId, payment.invoiceId, payment.id);
      if (newStatus === "paid") {
        await this.onInvoicePaid(payment.invoiceId);
      }

      // Send notification to managers about payment received
      try {
        const invoice = await prisma.invoice.findFirst({
          where: { id: payment.invoiceId, orgId: payment.orgId },
          include: {
            client: true,
            pool: true,
          },
        });

        if (invoice) {
          const managers = await prisma.orgMember.findMany({
            where: {
              orgId: payment.orgId,
              role: { in: ["ADMIN", "MANAGER"] },
            },
            include: {
              user: true,
            },
          });

          const amount = (payment.amountCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const currency = payment.currency || "GHS";
          const clientName = invoice.client?.name || "Client";
          const invoiceNumber = invoice.invoiceNumber;

          for (const manager of managers) {
            if (manager.user?.email) {
              await this.notificationsService.send(payment.orgId, {
                recipientId: manager.user.id,
                recipientType: "user",
                channel: "email",
                to: manager.user.email,
                subject: `Payment Received - ${invoiceNumber}`,
                body: `Payment of ${currency} ${amount} received for invoice ${invoiceNumber} from ${clientName}.`,
                template: "payment_received",
                metadata: {
                  paymentId: payment.id,
                  invoiceId: invoice.id,
                  invoiceNumber,
                  amount: payment.amountCents,
                  currency,
                  clientId: invoice.clientId,
                  type: "payment_received",
                },
              });
            }

            // Also send push notification
            if (manager.user?.id) {
              try {
                await this.notificationsService.send(payment.orgId, {
                  channel: "push",
                  to: "", // Push notifications use recipientId instead
                  recipientId: manager.user.id,
                  recipientType: "user",
                  subject: "Payment Received",
                  body: `${currency} ${amount} received for invoice ${invoiceNumber}`,
                  template: "payment_received",
                  metadata: {
                    paymentId: payment.id,
                    invoiceId: invoice.id,
                    invoiceNumber,
                    type: "payment_received",
                  },
                });
              } catch (pushError) {
                this.logger.error(`Failed to send push notification for payment:`, pushError);
              }
            }
          }
        }
      } catch (notifError) {
        // Don't fail payment processing if notification fails
        this.logger.error(`Failed to send payment received notifications:`, notifError);
      }

      return { success: true };
    }

    return { success: false, message: "Unhandled event" };
  }

  /**
   * Never throws: the payment is already recorded, and a receipt failure must
   * not skip what follows it (term activation, booking quoted work).
   */
  private async generateReceipt(orgId: string, invoiceId: string, paymentId: string) {
    try {
      const receipt = await this.createReceipt(orgId, invoiceId, paymentId);
      if (receipt) await this.sendReceipt(orgId, receipt.id);
    } catch (err: any) {
      this.logger.error(`Receipt generation failed for payment ${paymentId}: ${err.message}`);
    }
  }

  /**
   * Emails and texts a receipt to the invoice's client, on whichever channels
   * they have contact details for. Each channel fails independently.
   */
  async sendReceipt(orgId: string, receiptId: string) {
    const receipt = await prisma.receipt.findFirst({
      where: { id: receiptId, orgId },
      include: { invoice: { include: { client: true, pool: true } }, payment: true },
    });
    if (!receipt) {
      throw new NotFoundException("Receipt not found");
    }

    const { invoice, payment } = receipt;
    const client = invoice.client;
    const currency = payment?.currency || invoice.currency || "GHS";
    const fmt = (cents: number) =>
      (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const amount = fmt(payment?.amountCents ?? invoice.paidCents);
    const balanceCents = Math.max(0, invoice.totalCents - invoice.paidCents);
    const paidOn = (payment?.processedAt || receipt.issuedAt).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const method = (payment?.method || "").replace(/_/g, " ");
    const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const orgSettings = await getOrgEmailSettings(orgId);
    const orgName = orgSettings.organizationName || "PoolCare";
    const balanceLine = balanceCents > 0
      ? `Balance due: ${currency} ${fmt(balanceCents)}`
      : "This invoice is now fully paid.";
    const metadata = {
      type: "receipt",
      receiptId: receipt.id,
      receiptNumber: receipt.receiptNumber,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amount: payment?.amountCents ?? invoice.paidCents,
      currency,
    };

    const sent = { email: false, sms: false };

    if (client.phone) {
      try {
        await this.notificationsService.send(orgId, {
          recipientId: client.id,
          recipientType: "client",
          channel: "sms",
          to: client.phone,
          template: "receipt_sent",
          body: `${orgName}: payment of ${currency} ${amount} received for invoice #${invoice.invoiceNumber}. Receipt ${receipt.receiptNumber}. ${balanceLine} Thank you!`,
          metadata,
        });
        sent.sms = true;
      } catch (err: any) {
        this.logger.error(`Failed to text receipt ${receipt.receiptNumber}: ${err.message}`);
      }
    }

    if (client.email) {
      const rows: Array<[string, string]> = [
        ["Receipt number", receipt.receiptNumber],
        ["Invoice", `#${invoice.invoiceNumber}`],
        ["Payment date", paidOn],
        ...(method ? [["Payment method", method] as [string, string]] : []),
        ...(payment?.providerRef ? [["Reference", payment.providerRef] as [string, string]] : []),
        ...(invoice.pool ? [["Pool", invoice.pool.name || ""] as [string, string]] : []),
        ["Invoice total", `${currency} ${fmt(invoice.totalCents)}`],
        ["Balance due", `${currency} ${fmt(balanceCents)}`],
      ];
      const emailContent = `
        <h2 style="color: #333333; margin-top: 0; margin-bottom: 16px;">Payment received</h2>
        <p style="margin: 0 0 16px 0;">Dear ${esc(client.name || "Valued Client")},</p>
        <p style="margin: 0 0 16px 0;">Thank you — we've received your payment of <strong>${currency} ${amount}</strong>. Your receipt is below and attached as a PDF.</p>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          ${rows
            .map(
              ([l, v]) => `<div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e5e5e5;">
                <span style="color: #666666;">${esc(l)}</span><strong style="text-transform: ${l === "Payment method" ? "capitalize" : "none"};">${esc(v)}</strong>
              </div>`
            )
            .join("")}
          <div style="margin-top: 16px; font-size: 18px; font-weight: bold; color: ${orgSettings.primaryColor};">Amount paid: ${currency} ${amount}</div>
        </div>
        <p style="margin: 16px 0 0 0;">${esc(balanceLine)}</p>
        <p style="margin: 16px 0 0 0;">Thank you for choosing ${esc(orgName)}!</p>
      `;
      const emailBody = `Dear ${client.name || "Valued Client"},

Thank you — we've received your payment of ${currency} ${amount}.

${rows.map(([l, v]) => `${l}: ${v}`).join("\n")}

${balanceLine}

Thank you for choosing ${orgName}!`;

      // The PDF is a nice-to-have: if it can't be drawn, still send the email.
      let pdf: { buffer: Buffer; filename: string } | null = null;
      try {
        pdf = await this.receiptsService.generatePdf(orgId, receipt.id);
      } catch (err: any) {
        this.logger.error(`Failed to render receipt PDF ${receipt.receiptNumber}: ${err.message}`);
      }

      try {
        await this.notificationsService.send(orgId, {
          recipientId: client.id,
          recipientType: "client",
          channel: "email",
          to: client.email,
          template: "receipt_sent",
          ...(pdf
            ? { attachments: [{ filename: pdf.filename, content: pdf.buffer, contentType: "application/pdf" }] }
            : {}),
          subject: `Receipt ${receipt.receiptNumber} - ${currency} ${amount}`,
          body: emailBody,
          metadata: { ...metadata, html: createEmailTemplate(emailContent, orgSettings) },
        });
        sent.email = true;
      } catch (err: any) {
        this.logger.error(`Failed to email receipt ${receipt.receiptNumber}: ${err.message}`);
      }
    }

    return { ...sent, hasEmail: !!client.email, hasPhone: !!client.phone };
  }

  /**
   * Returns the payment's receipt, creating one if it has none yet. Receipts are
   * only auto-issued when an invoice is settled in full, so this is how a
   * part-payment gets one on request.
   */
  async ensureReceipt(orgId: string, paymentId: string) {
    const payment = await prisma.payment.findFirst({
      where: { id: paymentId, orgId },
      include: { receipt: true },
    });
    if (!payment) {
      throw new NotFoundException("Payment not found");
    }
    if (payment.receipt) return payment.receipt;
    if (payment.status !== "completed") {
      throw new BadRequestException("Receipts can only be issued for completed payments");
    }
    const receipt = await this.createReceipt(orgId, payment.invoiceId, payment.id);
    if (!receipt) {
      throw new BadRequestException("Could not issue a receipt for this payment");
    }
    return receipt;
  }

  async list(
    orgId: string,
    filters: { status?: string; method?: string; invoiceId?: string; page?: number; limit?: number }
  ) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(200, Math.max(1, filters.limit || 50));
    const where: any = { orgId };
    if (filters.status) where.status = filters.status;
    if (filters.method) where.method = filters.method;
    if (filters.invoiceId) where.invoiceId = filters.invoiceId;

    const [items, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          invoice: {
            select: { id: true, invoiceNumber: true, client: { select: { id: true, name: true } } },
          },
          receipt: { select: { id: true, receiptNumber: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.payment.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  private async createReceipt(orgId: string, invoiceId: string, paymentId: string) {
    const year = new Date().getFullYear();
    const prefix = `RCP-${year}-`;

    // receiptNumber is unique across all orgs, so number across all orgs too,
    // by numeric max (a lexical sort breaks past 9999).
    const existing = await prisma.receipt.findMany({
      where: { receiptNumber: { startsWith: prefix } },
      select: { receiptNumber: true },
    });
    let maxNum = 0;
    for (const { receiptNumber: n } of existing) {
      const parsed = parseInt(n.slice(prefix.length).split("-")[0], 10);
      if (Number.isFinite(parsed) && parsed > maxNum) maxNum = parsed;
    }
    const receiptNumber = `${prefix}${String(maxNum + 1).padStart(4, "0")}`;

    // Fetch invoice and payment details
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, orgId },
      include: {
        client: true,
        pool: true,
        visit: true,
      },
    });

    const payment = await prisma.payment.findFirst({
      where: { id: paymentId, orgId },
    });

    if (!invoice || !payment) {
      this.logger.error(`Failed to generate receipt: invoice or payment not found`);
      return null;
    }

    // Generate PDF
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(chunk));

    // Header
    doc.fontSize(20).text("RECEIPT", { align: "center" });
    doc.moveDown();
    doc.fontSize(12).text(`Receipt Number: ${receiptNumber}`, { align: "center" });
    doc.text(`Date: ${new Date().toLocaleDateString()}`, { align: "center" });
    doc.moveDown(2);

    // Organization info (if available)
    const org = await prisma.organization.findFirst({ where: { id: orgId } });
    if (org) {
      doc.fontSize(14).text(org.name, { align: "left" });
      doc.moveDown();
    }

    // Client info
    doc.fontSize(12).text("Bill To:", { underline: true });
    doc.text(invoice.client.name || "Client");
    if (invoice.client.email) {
      doc.text(invoice.client.email);
    }
    if (invoice.client.phone) {
      doc.text(invoice.client.phone);
    }
    doc.moveDown();

    // Payment details
    doc.fontSize(12).text("Payment Details:", { underline: true });
    doc.text(`Invoice: ${invoice.invoiceNumber || invoiceId}`);
    doc.text(`Amount Paid: ${(payment.amountCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${invoice.currency}`);
    doc.text(`Payment Method: ${payment.method || "Card"}`);
    doc.text(`Payment Date: ${payment.processedAt?.toLocaleDateString() || new Date().toLocaleDateString()}`);
    doc.moveDown();

    // Footer
    doc.fontSize(10).text("Thank you for your business!", { align: "center" });
    doc.end();

    // Wait for PDF to finish generating
    await new Promise<void>((resolve) => {
      doc.on("end", resolve);
    });

    const pdfBuffer = Buffer.concat(chunks);

    // Upload to MinIO
    const fileId = uuidv4();
    const key = `org/${orgId}/receipts/${receiptNumber}/${fileId}.pdf`;

    try {
      await this.minioClient.putObject(this.bucket, key, pdfBuffer, pdfBuffer.length, {
        "Content-Type": "application/pdf",
      });

      // Generate signed URL for the PDF (valid for 1 year)
      const pdfUrl = await this.minioClient.presignedGetObject(this.bucket, key, 365 * 24 * 60 * 60);

      // Create receipt record
      const receipt = await prisma.receipt.create({
        data: {
          orgId,
          invoiceId,
          paymentId,
          receiptNumber,
          pdfUrl,
        },
      });

      this.logger.log(`Receipt ${receiptNumber} generated and uploaded successfully`);
      return receipt;
    } catch (error: any) {
      this.logger.error(`Failed to upload receipt PDF: ${error.message}`, error);
      // Still create receipt record without PDF URL
      return prisma.receipt.create({
        data: {
          orgId,
          invoiceId,
          paymentId,
          receiptNumber,
        },
      });
    }
  }

  async createManual(
    orgId: string,
    role: string,
    userId: string,
    dto: {
      invoiceId: string;
      method: string;
      amountCents: number;
      reference?: string;
    }
  ) {
    // Only ADMIN and MANAGER can create manual payments
    if (role !== "ADMIN" && role !== "MANAGER") {
      throw new ForbiddenException("Only admins and managers can record manual payments");
    }

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: dto.invoiceId,
        orgId,
      },
    });

    if (!invoice) {
      throw new NotFoundException("Invoice not found");
    }

    if (invoice.status === "draft") {
      throw new BadRequestException("Cannot record payment for draft invoice");
    }

    const remainingCents = invoice.totalCents - invoice.paidCents;
    if (remainingCents <= 0) {
      throw new BadRequestException("Invoice already fully paid");
    }

    if (dto.amountCents > remainingCents) {
      throw new BadRequestException("Amount exceeds remaining balance");
    }

    if (dto.amountCents <= 0) {
      throw new BadRequestException("Amount must be greater than zero");
    }

    const newPaidCents = invoice.paidCents + dto.amountCents;
    const newStatus = newPaidCents >= invoice.totalCents ? "paid" : "sent";

    // Create payment and update invoice atomically
    const [payment] = await prisma.$transaction([
      prisma.payment.create({
        data: {
          orgId,
          invoiceId: dto.invoiceId,
          method: dto.method,
          provider: "manual",
          amountCents: dto.amountCents,
          currency: invoice.currency,
          status: "completed",
          providerRef: dto.reference || undefined,
          processedAt: new Date(),
        },
      }),
      prisma.invoice.update({
        where: { id: dto.invoiceId },
        data: {
          paidCents: newPaidCents,
          status: newStatus,
          paidAt: newStatus === "paid" ? new Date() : invoice.paidAt,
        },
      }),
    ]);

    // Every completed payment gets a receipt, sent to the client
    await this.generateReceipt(orgId, dto.invoiceId, payment.id);
    if (newStatus === "paid") {
      await this.onInvoicePaid(dto.invoiceId);
    }

    return payment;
  }

  /**
   * Follow-ups once an invoice is fully paid: a prepaid-term invoice starts that
   * term; a quote invoice books the approved work. Never fails the payment.
   */
  async onInvoicePaid(invoiceId: string) {
    try {
      await this.prepaidTerms.activateFromInvoice(invoiceId);
      const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { orgId: true, quoteId: true } });
      if (invoice?.quoteId) {
        await this.quotesService.scheduleQuoteJob(invoice.orgId, invoice.quoteId);
      }
    } catch (err: any) {
      this.logger.error(`Post-payment follow-up failed for invoice ${invoiceId}: ${err.message}`);
    }
  }

  async createRefund(orgId: string, role: string, userId: string, dto: CreateRefundDto) {
    // Only ADMIN and MANAGER can create refunds
    if (role !== "ADMIN" && role !== "MANAGER") {
      throw new ForbiddenException("Only admins and managers can process refunds");
    }

    const payment = await prisma.payment.findFirst({
      where: {
        id: dto.paymentId,
        orgId,
      },
      include: {
        invoice: true,
      },
    });

    if (!payment) {
      throw new NotFoundException("Payment not found");
    }

    if (payment.status !== "completed") {
      throw new BadRequestException("Can only refund completed payments");
    }

    if (dto.amountCents > payment.amountCents) {
      throw new BadRequestException("Refund amount cannot exceed payment amount");
    }

    if (dto.amountCents <= 0) {
      throw new BadRequestException("Refund amount must be greater than zero");
    }

    // Check if payment already has refunds
    const existingRefunds = await prisma.refund.findMany({
      where: { paymentId: dto.paymentId },
    });

    const totalRefunded = existingRefunds.reduce((sum, r) => sum + r.amountCents, 0);
    if (totalRefunded + dto.amountCents > payment.amountCents) {
      throw new BadRequestException("Total refunds cannot exceed payment amount");
    }

    // Create refund record
    const refund = await prisma.refund.create({
      data: {
        orgId,
        paymentId: dto.paymentId,
        amountCents: dto.amountCents,
        providerRef: dto.metadata?.providerRef,
        meta: dto.metadata || {},
      },
    });

    // A refund reopens that much of the invoice (balance = total - paid).
    const invoice = payment.invoice;
    if (invoice) {
      const newPaidCents = Math.max(0, invoice.paidCents - dto.amountCents);
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          paidCents: newPaidCents,
          status: newPaidCents >= invoice.totalCents ? "paid" : "sent",
          paidAt: newPaidCents >= invoice.totalCents ? invoice.paidAt : null,
        },
      });
    }

    // Process refund through payment provider (Paystack) if providerRef exists
    if (payment.providerRef && payment.provider === "paystack") {
      const paystackSecret = await this.getPaystackSecret(orgId);
      if (paystackSecret) {
        try {
          // Paystack refund API: POST /refund
          const response = await fetch("https://api.paystack.co/refund", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${paystackSecret}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              transaction: payment.providerRef,
              amount: dto.amountCents, // Amount in smallest currency unit (pesewas for GHS)
              currency: payment.currency || "GHS",
              customer_note: dto.metadata?.reason || "Refund processed",
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            this.logger.error(`Paystack refund API error: ${response.status} - ${errorText}`);
            // Don't fail the refund - record it locally even if Paystack call fails
            // Admin can manually process through Paystack dashboard if needed
          } else {
            const refundData = await response.json() as any;
            if (refundData.status && refundData.data) {
              // Update refund with Paystack reference
              await prisma.refund.update({
                where: { id: refund.id },
                data: {
                  providerRef: refundData.data.transaction?.reference || refundData.data.reference,
                  meta: {
                    ...(dto.metadata || {}),
                    paystackRefundId: refundData.data.id,
                    paystackResponse: refundData.data,
                  },
                },
              });
              this.logger.log(`Paystack refund processed: ${refundData.data.id}`);
            }
          }
        } catch (error: any) {
          this.logger.error(`Failed to process Paystack refund: ${error.message}`);
          // Continue - refund is recorded locally
        }
      }
    }

    return refund;
  }

  async listRefunds(orgId: string, paymentId?: string) {
    const where: any = { orgId };

    if (paymentId) {
      where.paymentId = paymentId;
    }

    return prisma.refund.findMany({
      where,
      include: {
        payment: {
          include: {
            invoice: {
              select: { id: true, invoiceNumber: true },
            },
          },
        },
      },
      orderBy: { refundedAt: "desc" },
    });
  }
}

