import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { prisma } from "@poolcare/db";
import { InitPaymentDto } from "./dto";

@Injectable()
export class PaymentsService {
  constructor(private readonly configService: ConfigService) {}

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

      // TODO: Call Paystack Initialize Transaction API
      // const response = await fetch("https://api.paystack.co/transaction/initialize", {
      //   method: "POST",
      //   headers: {
      //     Authorization: `Bearer ${paystackSecret}`,
      //     "Content-Type": "application/json",
      //   },
      //   body: JSON.stringify({
      //     email: invoice.client.email || invoice.client.phone,
      //     amount: amountCents,
      //     reference: payment.id,
      //     metadata: {
      //       invoiceId: invoice.id,
      //       orgId,
      //     },
      //   }),
      // });

      // Placeholder response
      return {
        paymentId: payment.id,
        authorizationUrl: `https://paystack.com/pay/${payment.id}`,
        accessCode: "placeholder",
      };
    }

    throw new BadRequestException("Unsupported payment provider");
  }

  async handleWebhook(body: any) {
    // TODO: Verify webhook signature from Paystack
    const event = body.event;
    const data = body.data;

    if (event === "charge.success") {
      const reference = data.reference; // This should be payment.id
      const providerRef = data.id;

      const payment = await prisma.payment.findFirst({
        where: {
          id: reference,
          status: "pending",
        },
        include: {
          invoice: true,
        },
      });

      if (!payment) {
        return { success: false, message: "Payment not found" };
      }

      // Update payment
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: "completed",
          providerRef,
          processedAt: new Date(),
          metadata: data,
        },
      });

      // Update invoice paid amount
      const newPaidCents = payment.invoice.paidCents + payment.amountCents;
      const newStatus = newPaidCents >= payment.invoice.totalCents ? "paid" : "sent";

      await prisma.invoice.update({
        where: { id: payment.invoiceId },
        data: {
          paidCents: newPaidCents,
          status: newStatus,
          paidAt: newStatus === "paid" ? new Date() : payment.invoice.paidAt,
        },
      });

      // Generate receipt if fully paid
      if (newStatus === "paid") {
        await this.generateReceipt(payment.orgId, payment.invoiceId, payment.id);
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

    // TODO: Generate PDF receipt
    // For now, create receipt record
    await prisma.receipt.create({
      data: {
        orgId,
        invoiceId,
        paymentId,
        receiptNumber,
        // pdfUrl will be set when PDF is generated
      },
    });
  }
}

