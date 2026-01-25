import { Injectable, Logger, forwardRef, Inject } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { NotificationsService } from "../notifications/notifications.service";
import { createEmailTemplate, getOrgEmailSettings } from "../email/email-template.util";

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService
  ) {}

  /**
   * Process billing for all active subscriptions on the 25th of the month
   * This should be called on the 25th of each month (via cron job)
   * @param orgId Optional organization ID to filter by
   * @param force If true, bypasses the date check (for manual testing)
   */
  async processMonthlyBilling(orgId?: string, force: boolean = false) {
    this.logger.log("Starting monthly billing processing...");

    const today = new Date();
    const billingDay = 25;

    // Only process if today is the 25th (unless forced for testing)
    if (!force && today.getDate() !== billingDay) {
      this.logger.warn(`Today is not the 25th (current day: ${today.getDate()}). Skipping billing.`);
      return {
        processed: 0,
        skipped: 0,
        errors: [],
        message: `Billing only runs on the 25th. Today is the ${today.getDate()}th. Use force=true for manual testing.`,
      };
    }

    const where: any = {
      status: "active",
      billingType: { in: ["monthly", "quarterly", "annually"] },
      autoRenew: true,
      nextBillingDate: {
        lte: today, // Billing date is today or in the past
      },
    };

    if (orgId) {
      where.orgId = orgId;
    }

    const plans = await prisma.servicePlan.findMany({
      where,
      include: {
        pool: {
          include: {
            client: true,
          },
        },
        template: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    this.logger.log(`Found ${plans.length} plans ready for billing`);

    const results = {
      processed: 0,
      skipped: 0,
      errors: [] as Array<{ planId: string; error: string }>,
      billings: [] as Array<{ planId: string; billingId: string; invoiceId?: string }>,
    };

    for (const plan of plans) {
      try {
        // Check if billing already exists for this period
        const billingPeriodStart = new Date(plan.nextBillingDate || plan.startsOn);
        billingPeriodStart.setDate(1); // Start of month
        const billingPeriodEnd = new Date(billingPeriodStart);
        billingPeriodEnd.setMonth(billingPeriodEnd.getMonth() + 1);
        billingPeriodEnd.setDate(0); // Last day of month

        const existingBilling = await prisma.subscriptionBilling.findFirst({
          where: {
            planId: plan.id,
            billingPeriodStart: {
              gte: billingPeriodStart,
              lte: billingPeriodEnd,
            },
          },
        });

        if (existingBilling) {
          this.logger.log(`Billing already exists for plan ${plan.id} in this period`);
          results.skipped++;
          continue;
        }

        // Calculate amount (with tax and discount)
        const subtotalCents = plan.priceCents;
        const taxAmountCents = Math.round(subtotalCents * ((plan.taxPct || 0) / 100));
        const discountAmountCents = Math.round(subtotalCents * ((plan.discountPct || 0) / 100));
        const totalCents = subtotalCents + taxAmountCents - discountAmountCents;

        // Create subscription billing record
        const billing = await prisma.subscriptionBilling.create({
          data: {
            orgId: plan.orgId,
            planId: plan.id,
            billingPeriodStart,
            billingPeriodEnd,
            amountCents: totalCents,
            currency: plan.currency || "GHS",
            status: "pending",
          },
        });

        // Create invoice for the billing
        let invoiceId: string | undefined;
        if (plan.pool.clientId) {
          try {
            const invoiceNumber = await this.generateInvoiceNumber(plan.orgId);
            const dueDate = new Date(today);
            dueDate.setDate(dueDate.getDate() + 7); // Due in 7 days

            const invoice = await prisma.invoice.create({
              data: {
                orgId: plan.orgId,
                clientId: plan.pool.clientId,
                poolId: plan.poolId,
                invoiceNumber,
                status: "sent",
                currency: plan.currency || "GHS",
                items: [
                  {
                    label: `${plan.template?.name || "Subscription"} - ${billingPeriodStart.toLocaleDateString()} to ${billingPeriodEnd.toLocaleDateString()}`,
                    qty: 1,
                    unitPriceCents: subtotalCents,
                    taxPct: plan.taxPct || 0,
                  },
                ],
                subtotalCents,
                taxCents: taxAmountCents,
                discountCents: discountAmountCents,
                totalCents,
                dueDate,
                metadata: {
                  servicePlanId: plan.id,
                  subscriptionBillingId: billing.id,
                  billingPeriodStart: billingPeriodStart.toISOString(),
                  billingPeriodEnd: billingPeriodEnd.toISOString(),
                },
              },
            });

            invoiceId = invoice.id;

            // Link invoice to billing
            await prisma.subscriptionBilling.update({
              where: { id: billing.id },
              data: { invoiceId },
            });

            this.logger.log(`Created invoice ${invoiceNumber} for plan ${plan.id}`);

            // Send invoice notifications (email and SMS) automatically
            try {
              await this.sendInvoiceNotifications(invoice, plan, billingPeriodStart, billingPeriodEnd);
            } catch (notifError: any) {
              this.logger.error(`Failed to send notifications for invoice ${invoice.id}:`, notifError);
              // Don't fail billing if notifications fail
            }
          } catch (invoiceError: any) {
            this.logger.error(`Failed to create invoice for plan ${plan.id}:`, invoiceError);
            // Continue even if invoice creation fails
          }
        }

        // Update next billing date
        const nextBillingDate = this.calculateNextBillingDate(
          plan.billingType,
          plan.nextBillingDate || plan.startsOn || new Date()
        );

        await prisma.servicePlan.update({
          where: { id: plan.id },
          data: {
            nextBillingDate,
            lastBilledDate: today,
          },
        });

        results.processed++;
        results.billings.push({
          planId: plan.id,
          billingId: billing.id,
          invoiceId,
        });

        this.logger.log(`Processed billing for plan ${plan.id}`);
      } catch (error: any) {
        this.logger.error(`Failed to process billing for plan ${plan.id}:`, error);
        results.errors.push({
          planId: plan.id,
          error: error.message || "Unknown error",
        });
      }
    }

    this.logger.log(
      `Billing processing complete: ${results.processed} processed, ${results.skipped} skipped, ${results.errors.length} errors`
    );

    return results;
  }

  /**
   * Calculate next billing date (always on the 25th)
   */
  private calculateNextBillingDate(billingType: string, currentBillingDate: Date): Date {
    const BILLING_DAY = 25;
    const next = new Date(currentBillingDate);

    switch (billingType) {
      case "monthly":
        next.setMonth(next.getMonth() + 1);
        break;
      case "quarterly":
        next.setMonth(next.getMonth() + 3);
        break;
      case "annually":
        next.setFullYear(next.getFullYear() + 1);
        break;
      default:
        return currentBillingDate;
    }

    // Ensure it's always on the 25th
    next.setDate(BILLING_DAY);

    return next;
  }

  /**
   * Generate invoice number (same format as InvoicesService)
   */
  private async generateInvoiceNumber(orgId: string, retryCount = 0): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;

    // Use a transaction to get the latest invoice number atomically
    const lastInvoice = await prisma.invoice.findFirst({
      where: {
        orgId,
        invoiceNumber: {
          startsWith: prefix,
        },
      },
      orderBy: { invoiceNumber: "desc" },
    });

    let nextNum: number;
    if (!lastInvoice) {
      nextNum = 1;
    } else {
      const lastNum = parseInt(lastInvoice.invoiceNumber.replace(prefix, ""));
      nextNum = lastNum + 1;
    }

    const invoiceNumber = `${prefix}${String(nextNum).padStart(4, "0")}`;

    // Check if this number already exists (race condition check)
    const existing = await prisma.invoice.findUnique({
      where: { invoiceNumber },
    });

    if (existing) {
      // If it exists and we haven't retried too many times, try next number
      if (retryCount < 10) {
        return this.generateInvoiceNumber(orgId, retryCount + 1);
      }
      // Fallback: add timestamp to ensure uniqueness
      return `${prefix}${String(nextNum).padStart(4, "0")}-${Date.now().toString().slice(-4)}`;
    }

    return invoiceNumber;
  }

  /**
   * Send invoice notifications via email and SMS for subscription billing
   */
  private async sendInvoiceNotifications(
    invoice: any,
    plan: any,
    billingPeriodStart: Date,
    billingPeriodEnd: Date
  ) {
    const client = plan.pool?.client;
    if (!client) {
      this.logger.warn(`No client found for invoice ${invoice.id}`);
      return;
    }

    const currency = invoice.currency || "GHS";
    const totalAmount = (invoice.totalCents / 100).toFixed(2);
    const invoiceNumber = invoice.invoiceNumber;
    const dueDate = invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }) : "N/A";
    const poolName = plan.pool?.name || plan.pool?.address || "your pool";
    const planName = plan.template?.name || "Subscription Plan";
    const periodStart = billingPeriodStart.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const periodEnd = billingPeriodEnd.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    // SMS notification
    if (client.phone) {
      const smsBody = `Your PoolCare subscription invoice #${invoiceNumber} for ${currency} ${totalAmount} is ready.\n\nDue: ${dueDate}\n\nPool: ${poolName}\n\nPay online in the app or contact us for assistance.`;
      
      await this.notificationsService.send(plan.orgId, {
        recipientId: client.id,
        recipientType: "client",
        channel: "sms",
        to: client.phone,
        template: "subscription_invoice",
        body: smsBody,
        metadata: {
          type: "subscription_billing",
          invoiceId: invoice.id,
          invoiceNumber,
          amount: invoice.totalCents,
          currency,
          servicePlanId: plan.id,
        },
      });
    }

    // Email notification
    if (client.email) {
      const emailSubject = `Subscription Invoice #${invoiceNumber} - ${currency} ${totalAmount}`;
      
      // Get org settings for email template
      const orgSettings = await getOrgEmailSettings(plan.orgId);
      
      const emailContent = `
        <h2 style="color: #333333; margin-top: 0; margin-bottom: 16px;">Subscription Invoice</h2>
        <p style="margin: 0 0 16px 0;">Hello ${client.name || "Valued Customer"},</p>
        <p style="margin: 0 0 16px 0;">Your subscription invoice has been generated for your service plan.</p>
        
        <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 8px 0;"><strong>Invoice Number:</strong> ${invoiceNumber}</p>
          <p style="margin: 8px 0;"><strong>Amount:</strong> ${currency} ${totalAmount}</p>
          <p style="margin: 8px 0;"><strong>Due Date:</strong> ${dueDate}</p>
          <p style="margin: 8px 0;"><strong>Pool:</strong> ${poolName}</p>
          <p style="margin: 8px 0;"><strong>Service Plan:</strong> ${planName}</p>
          <p style="margin: 8px 0;"><strong>Billing Period:</strong> ${periodStart} to ${periodEnd}</p>
        </div>

        <p style="margin: 16px 0 0 0;">You can view and pay this invoice directly in the ${orgSettings.organizationName} mobile app.</p>
        
        <p style="margin: 24px 0 0 0;">Thank you for your continued business!</p>
        <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
          This is an automated message. Please do not reply to this email.
        </p>
      `;

      const emailHtml = createEmailTemplate(emailContent, orgSettings);

      await this.notificationsService.send(plan.orgId, {
        recipientId: client.id,
        recipientType: "client",
        channel: "email",
        to: client.email,
        template: "subscription_invoice",
        subject: emailSubject,
        body: emailHtml,
        metadata: {
          type: "subscription_billing",
          invoiceId: invoice.id,
          invoiceNumber,
          amount: invoice.totalCents,
          currency,
          servicePlanId: plan.id,
          html: emailHtml,
        },
      });
    }
  }

  /**
   * Get billing summary for admin dashboard
   */
  async getBillingSummary(orgId: string, month?: number, year?: number) {
    const targetDate = month && year ? new Date(year, month - 1, 1) : new Date();
    const startOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
    const endOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);

    const [upcomingBillings, recentBillings, pendingBillings] = await Promise.all([
      // Upcoming billings (next 30 days)
      prisma.servicePlan.findMany({
        where: {
          orgId,
          status: "active",
          billingType: { in: ["monthly", "quarterly", "annually"] },
          nextBillingDate: {
            gte: new Date(),
            lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        },
        include: {
          pool: {
            include: {
              client: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          template: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          nextBillingDate: "asc",
        },
      }),

      // Recent billings (this month)
      prisma.subscriptionBilling.findMany({
        where: {
          orgId,
          billingPeriodStart: {
            gte: startOfMonth,
            lte: endOfMonth,
          },
        },
        include: {
          plan: {
            include: {
              pool: {
                include: {
                  client: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
              template: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              status: true,
              totalCents: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      }),

      // Pending billings (not yet paid)
      prisma.subscriptionBilling.findMany({
        where: {
          orgId,
          status: "pending",
        },
        include: {
          plan: {
            include: {
              pool: {
                include: {
                  client: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              status: true,
            },
          },
        },
        orderBy: {
          billingPeriodStart: "desc",
        },
      }),
    ]);

    return {
      upcomingBillings,
      recentBillings,
      pendingBillings,
      summary: {
        upcomingCount: upcomingBillings.length,
        recentCount: recentBillings.length,
        pendingCount: pendingBillings.length,
        totalUpcomingAmount: upcomingBillings.reduce(
          (sum, plan) => sum + (plan.priceCents || 0),
          0
        ),
        totalRecentAmount: recentBillings.reduce((sum, billing) => sum + billing.amountCents, 0),
        totalPendingAmount: pendingBillings.reduce((sum, billing) => sum + billing.amountCents, 0),
      },
    };
  }
}

