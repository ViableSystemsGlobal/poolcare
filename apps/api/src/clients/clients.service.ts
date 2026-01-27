import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { CreateClientDto, UpdateClientDto, CreateHouseholdDto, InviteHouseholdMemberDto } from "./dto";
import { NotificationsService } from "../notifications/notifications.service";
import { createWelcomeEmailTemplate, createEmailTemplate } from "../email/email-template.util";

@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);

  constructor(private readonly notificationsService: NotificationsService) {}
  async list(
    orgId: string,
    role: string,
    filters: {
      query?: string;
      tag?: string;
      page: number;
      limit: number;
    }
  ) {
    // CLIENT role can only see themselves
    if (role === "CLIENT") {
      throw new ForbiddenException("Use /clients/me to view your profile");
    }

    const where: any = {
      orgId,
    };

    if (filters.query) {
      where.OR = [
        { name: { contains: filters.query, mode: "insensitive" } },
        { phone: { contains: filters.query, mode: "insensitive" } },
        { email: { contains: filters.query, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.client.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        include: {
          pools: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              pools: true,
              invoices: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.client.count({ where }),
    ]);

    return {
      items,
      total,
      page: filters.page,
      limit: filters.limit,
    };
  }

  async create(orgId: string, dto: CreateClientDto) {
    if (!dto.phone && !dto.email) {
      throw new BadRequestException("At least one of phone or email must be provided");
    }

    // Find or create user if userId not provided
    let userId = dto.userId;
    if (!userId) {
      const orConditions: any[] = [];
      if (dto.phone) orConditions.push({ phone: dto.phone });
      if (dto.email) orConditions.push({ email: dto.email });

      const existingUser = orConditions.length > 0
        ? await prisma.user.findFirst({
            where: { OR: orConditions },
          })
        : null;

      if (existingUser) {
        userId = existingUser.id;
      } else {
        const newUser = await prisma.user.create({
          data: {
            phone: dto.phone,
            email: dto.email,
            name: dto.name,
          },
        });
        userId = newUser.id;

        // Add membership
        await prisma.orgMember.upsert({
          where: {
            orgId_userId: {
              orgId,
              userId,
            },
          },
          create: {
            orgId,
            userId,
            role: "CLIENT",
          },
          update: {},
        });
      }
    }

    const client = await prisma.client.create({
      data: {
        orgId,
        userId,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        imageUrl: dto.imageUrl,
        billingAddress: dto.billingAddress,
        preferredChannels: dto.preferredChannels || ["WHATSAPP"],
        notes: dto.notes,
      },
    });

    // Send welcome notifications (SMS and Email)
    try {
      // Get organization settings for email template
      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        include: {
          settings: true,
        },
      });

      const profile = org?.settings?.profile as { name?: string; logoUrl?: string } | null;
      const orgName = profile?.name || org?.name || "PoolCare";
      const logoUrl = profile?.logoUrl;

      // Send welcome email if email is provided
      if (dto.email) {
        try {
          const emailHtml = createWelcomeEmailTemplate(dto.name, orgName, {
            logoUrl,
            organizationName: orgName,
          });

          await this.notificationsService.send(orgId, {
            channel: "email",
            to: dto.email,
            subject: `Welcome to ${orgName}!`,
            body: `Welcome to ${orgName}! Your account has been created. Download our mobile app to manage your pool services.`,
            metadata: { html: emailHtml },
            recipientId: userId || undefined,
            recipientType: "user",
          });

          this.logger.log(`Welcome email sent to ${dto.email} for client ${client.id}`);
        } catch (emailError) {
          this.logger.error(`Failed to send welcome email to ${dto.email}:`, emailError);
          // Don't fail client creation if email fails
        }
      }

      // Send welcome SMS if phone is provided
      if (dto.phone) {
        try {
          const smsMessage = `Welcome to ${orgName}! Your account has been created. Download our mobile app to manage your pool services.`;

          await this.notificationsService.send(orgId, {
            channel: "sms",
            to: dto.phone,
            subject: "Welcome",
            body: smsMessage,
            recipientId: userId || undefined,
            recipientType: "user",
          });

          this.logger.log(`Welcome SMS sent to ${dto.phone} for client ${client.id}`);
        } catch (smsError) {
          this.logger.error(`Failed to send welcome SMS to ${dto.phone}:`, smsError);
          // Don't fail client creation if SMS fails
        }
      }
    } catch (notificationError) {
      this.logger.error(`Failed to send welcome notifications for client ${client.id}:`, notificationError);
      // Don't fail client creation if notifications fail
    }

    return client;
  }

  async getOne(orgId: string, role: string, currentUserId: string, clientId: string) {
    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        orgId,
      },
      include: {
        pools: true,
      },
    });

    if (!client) {
      throw new NotFoundException("Client not found");
    }

    // CLIENT can only see themselves
    if (role === "CLIENT" && client.userId !== currentUserId) {
      throw new ForbiddenException("Access denied");
    }

    return client;
  }

  async update(orgId: string, clientId: string, dto: UpdateClientDto) {
    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        orgId,
      },
    });

    if (!client) {
      throw new NotFoundException("Client not found");
    }

    const updated = await prisma.client.update({
      where: { id: clientId },
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        imageUrl: dto.imageUrl,
        billingAddress: dto.billingAddress,
        preferredChannels: dto.preferredChannels,
        notes: dto.notes,
      },
      include: {
        pools: true,
      },
    });

    return updated;
  }

  async delete(orgId: string, clientId: string) {
    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        orgId,
      },
      include: {
        pools: true,
        household: true,
      },
    });

    if (!client) {
      throw new NotFoundException("Client not found");
    }

    // Check if client is primary of a household
    if (client.household && client.household.primaryClientId === clientId) {
      // Delete the household first (or reassign)
      await prisma.household.delete({
        where: { id: client.household.id },
      });
    }

    // Delete the client
    await prisma.client.delete({
      where: { id: clientId },
    });

    this.logger.log(`Client ${clientId} deleted from org ${orgId}`);

    return { message: "Client deleted successfully" };
  }

  // =====================
  // HOUSEHOLD MANAGEMENT
  // =====================

  async createHousehold(orgId: string, clientId: string, dto: CreateHouseholdDto) {
    const client = await prisma.client.findFirst({
      where: { id: clientId, orgId },
    });

    if (!client) {
      throw new NotFoundException("Client not found");
    }

    // Check if client already has a household
    if (client.householdId) {
      throw new BadRequestException("Client already belongs to a household");
    }

    // Create household with this client as primary and connect as member
    const household = await prisma.household.create({
      data: {
        orgId,
        primaryClientId: clientId,
        name: dto.name,
        members: {
          connect: { id: clientId },
        },
      },
      include: {
        primaryClient: true,
        members: true,
      },
    });

    this.logger.log(`Household '${household.name}' created for client ${clientId}`);
    return household;
  }

  async getHousehold(orgId: string, clientId: string) {
    const client = await prisma.client.findFirst({
      where: { id: clientId, orgId },
      include: {
        household: {
          include: {
            members: {
              include: {
                pools: {
                  select: { id: true, name: true },
                },
                _count: {
                  select: {
                    pools: true,
                    invoices: true,
                  },
                },
              },
            },
            primaryClient: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                imageUrl: true,
              },
            },
          },
        },
      },
    });

    if (!client) {
      throw new NotFoundException("Client not found");
    }

    if (!client.household) {
      throw new NotFoundException("Client does not belong to a household");
    }

    return client.household;
  }

  async inviteHouseholdMember(
    orgId: string,
    primaryClientId: string,
    dto: InviteHouseholdMemberDto
  ) {
    if (!dto.phone && !dto.email) {
      throw new BadRequestException("At least one of phone or email must be provided");
    }

    // Verify primary client exists and has a household
    const primaryClient = await prisma.client.findFirst({
      where: { id: primaryClientId, orgId },
      include: { household: true },
    });

    if (!primaryClient) {
      throw new NotFoundException("Primary client not found");
    }

    if (!primaryClient.household) {
      throw new BadRequestException("Primary client does not have a household");
    }

    const household = primaryClient.household;

    // Check if user already exists
    const orConditions: any[] = [];
    if (dto.phone) orConditions.push({ phone: dto.phone });
    if (dto.email) orConditions.push({ email: dto.email });

    const existingUser = orConditions.length > 0
      ? await prisma.user.findFirst({
          where: { OR: orConditions },
        })
      : null;

    let userId: string | undefined;
    let existingClient: any = null;

    if (existingUser) {
      userId = existingUser.id;
      // Check if they're already a client in this org
      existingClient = await prisma.client.findFirst({
        where: { orgId, userId },
      });
    }

    // Get organization settings for email template
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      include: { settings: true },
    });

    const profile = org?.settings?.profile as { name?: string; logoUrl?: string } | null;
    const orgName = profile?.name || org?.name || "PoolCare";
    const logoUrl = profile?.logoUrl;

    const invitationMessage = dto.message || `${primaryClient.name} has invited you to join their household on ${orgName}. Download our app to accept the invitation and manage your pool services together.`;

    // Send invitation via email
    if (dto.email) {
      try {
        const emailContent = `
          <h2 style="color: #333333; margin-top: 0; margin-bottom: 16px;">You've been invited!</h2>
          <p style="margin: 0 0 16px 0;">Hi ${dto.name || "there"},</p>
          <p style="margin: 0 0 16px 0;">
            <strong>${primaryClient.name}</strong> has invited you to join their household on ${orgName}.
          </p>
          <p style="margin: 0 0 16px 0;">
            ${dto.message || "Join their household to share access to pool services, invoices, and more."}
          </p>
          <p style="margin: 0 0 16px 0;">
            Download our mobile app to accept the invitation and get started!
          </p>
          <p style="margin: 16px 0 0 0;">
            Best regards,<br>
            <strong>The ${orgName} Team</strong>
          </p>
        `;

        const emailHtml = createEmailTemplate(emailContent, {
          logoUrl,
          organizationName: orgName,
        });

        await this.notificationsService.send(orgId, {
          channel: "email",
          to: dto.email,
          subject: `${primaryClient.name} invited you to join ${orgName}`,
          body: invitationMessage,
          metadata: { html: emailHtml },
          recipientId: userId || undefined,
          recipientType: "user",
        });

        this.logger.log(`Household invitation email sent to ${dto.email}`);
      } catch (emailError) {
        this.logger.error(`Failed to send invitation email to ${dto.email}:`, emailError);
      }
    }

    // Send invitation via SMS
    if (dto.phone) {
      try {
        await this.notificationsService.send(orgId, {
          channel: "sms",
          to: dto.phone,
          subject: "Household Invitation",
          body: invitationMessage,
          recipientId: userId || undefined,
          recipientType: "user",
        });

        this.logger.log(`Household invitation SMS sent to ${dto.phone}`);
      } catch (smsError) {
        this.logger.error(`Failed to send invitation SMS to ${dto.phone}:`, smsError);
      }
    }

    // If user exists but not as client, create client and add to household
    if (existingUser && !existingClient) {
      const newClient = await prisma.client.create({
        data: {
          orgId,
          userId: existingUser.id,
          name: dto.name || existingUser.name || "Household Member",
          email: dto.email || existingUser.email,
          phone: dto.phone || existingUser.phone,
          householdId: household.id,
        },
      });

      // Add membership if not exists
      await prisma.orgMember.upsert({
        where: {
          orgId_userId: {
            orgId,
            userId: existingUser.id,
          },
        },
        create: {
          orgId,
          userId: existingUser.id,
          role: "CLIENT",
        },
        update: {},
      });

      return {
        message: "Invitation sent. Client account created and added to household.",
        client: newClient,
        household,
      };
    }

    // If user doesn't exist, we'll create them when they accept the invitation
    // For now, just return success
    return {
      message: "Invitation sent. User will be able to join the household when they create an account.",
      household,
    };
  }

  async addClientToHousehold(orgId: string, clientId: string, householdId: string) {
    const client = await prisma.client.findFirst({
      where: { id: clientId, orgId },
    });

    if (!client) {
      throw new NotFoundException("Client not found");
    }

    if (client.householdId) {
      throw new BadRequestException("Client already belongs to a household");
    }

    const household = await prisma.household.findFirst({
      where: { id: householdId, orgId },
    });

    if (!household) {
      throw new NotFoundException("Household not found");
    }

    // Add client to household
    await prisma.client.update({
      where: { id: clientId },
      data: { householdId: household.id },
    });

    return { message: "Client added to household successfully", household };
  }

  async removeHouseholdMember(orgId: string, primaryClientId: string, memberClientId: string) {
    // Verify primary client owns the household
    const primaryClient = await prisma.client.findFirst({
      where: { id: primaryClientId, orgId },
      include: { household: true },
    });

    if (!primaryClient || !primaryClient.household) {
      throw new NotFoundException("Primary client or household not found");
    }

    if (primaryClient.household.primaryClientId !== primaryClientId) {
      throw new ForbiddenException("Only the primary client can remove members");
    }

    // Don't allow removing the primary client
    if (memberClientId === primaryClientId) {
      throw new BadRequestException("Cannot remove the primary client from their own household");
    }

    const memberClient = await prisma.client.findFirst({
      where: { id: memberClientId, orgId, householdId: primaryClient.household.id },
    });

    if (!memberClient) {
      throw new NotFoundException("Member not found in this household");
    }

    // Remove from household
    await prisma.client.update({
      where: { id: memberClientId },
      data: { householdId: null },
    });

    return { message: "Member removed from household successfully" };
  }

  async leaveHousehold(orgId: string, clientId: string) {
    const client = await prisma.client.findFirst({
      where: { id: clientId, orgId },
      include: { household: true },
    });

    if (!client || !client.household) {
      throw new NotFoundException("Client not found or does not belong to a household");
    }

    // If primary client, cannot leave (must delete household or transfer)
    if (client.household.primaryClientId === clientId) {
      throw new BadRequestException("Primary client cannot leave. Transfer ownership or delete household first.");
    }

    // Remove from household
    await prisma.client.update({
      where: { id: clientId },
      data: { householdId: null },
    });

    return { message: "Left household successfully" };
  }
}

