import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { prisma } from "@poolcare/db";
import { NotificationsService } from "../notifications/notifications.service";
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
    private readonly notificationsService: NotificationsService
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
      const paystackSecret = this.configService.get<string>("PAYSTACK_SECRET_KEY");
      if (!paystackSecret) {
        throw new BadRequestException("Payment provider not configured");
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
    const paystackSecret = this.configService.get<string>("PAYSTACK_SECRET_KEY");

    // Always require a valid signature — reject unsigned or unverifiable requests
    if (!paystackSecret) {
      this.logger.error("PAYSTACK_SECRET_KEY not configured — cannot verify webhook");
      throw new BadRequestException("Payment provider not configured");
    }
    if (!signature) {
      this.logger.warn("Webhook received without x-paystack-signature header");
      throw new BadRequestException("Missing webhook signature");
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

      // Update payment and invoice atomically
      const newPaidCents = payment.invoice.paidCents + payment.amountCents;
      const newStatus = newPaidCents >= payment.invoice.totalCents ? "paid" : "sent";

      await prisma.$transaction([
        prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: "completed",
            providerRef,
            processedAt: new Date(),
            metadata: data,
          },
        }),
        prisma.invoice.update({
          where: { id: payment.invoiceId },
          data: {
            paidCents: newPaidCents,
            status: newStatus,
            paidAt: newStatus === "paid" ? new Date() : payment.invoice.paidAt,
          },
        }),
      ]);

      // Generate receipt if fully paid
      if (newStatus === "paid") {
        await this.generateReceipt(payment.orgId, payment.invoiceId, payment.id);
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

          const amount = (payment.amountCents / 100).toFixed(2);
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

  private async generateReceipt(orgId: string, invoiceId: string, paymentId: string) {
    const year = new Date().getFullYear();
    const prefix = `RCP-${year}-`;

    const lastReceipt = await prisma.receipt.findFirst({
      where: {
        orgId,
        receiptNumber: {
          startsWith: prefix,
        },
      },
      orderBy: { receiptNumber: "desc" },
    });

    const receiptNumber = lastReceipt
      ? `${prefix}${String(parseInt(lastReceipt.receiptNumber.replace(prefix, "")) + 1).padStart(4, "0")}`
      : `${prefix}0001`;

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
      return;
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
    doc.text(`Amount Paid: ${(payment.amountCents / 100).toFixed(2)} ${invoice.currency}`);
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
      await prisma.receipt.create({
        data: {
          orgId,
          invoiceId,
          paymentId,
          receiptNumber,
          pdfUrl,
          storageKey: key,
        },
      });

      this.logger.log(`Receipt ${receiptNumber} generated and uploaded successfully`);
    } catch (error: any) {
      this.logger.error(`Failed to upload receipt PDF: ${error.message}`, error);
      // Still create receipt record without PDF URL
      await prisma.receipt.create({
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

    if (newStatus === "paid") {
      await this.generateReceipt(orgId, dto.invoiceId, payment.id);
    }

    return payment;
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

    // Update invoice balance (increase it by refund amount)
    const invoice = payment.invoice;
    if (invoice) {
      const newBalanceCents = invoice.balanceCents + dto.amountCents;
      const newPaidCents = invoice.paidCents - dto.amountCents;

      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          balanceCents: newBalanceCents,
          paidCents: Math.max(0, newPaidCents),
          status: newBalanceCents > 0 ? "sent" : "paid",
        },
      });
    }

    // Process refund through payment provider (Paystack) if providerRef exists
    if (payment.providerRef && payment.provider === "paystack") {
      const paystackSecret = this.configService.get<string>("PAYSTACK_SECRET_KEY");
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

