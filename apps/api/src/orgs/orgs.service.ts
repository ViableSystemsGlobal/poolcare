import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { prisma } from "@poolcare/db";

@Injectable()
export class OrgsService {
  async getOrg(orgId: string) {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
    });

    if (!org) {
      throw new NotFoundException("Organization not found");
    }

    return { id: org.id, name: org.name };
  }

  async inviteMember(orgId: string, inviterRole: string, dto: { target?: string; email?: string; phone?: string; role: string; name?: string }) {
    if (inviterRole !== "ADMIN" && inviterRole !== "MANAGER") {
      throw new ForbiddenException("Only ADMIN or MANAGER can invite members");
    }

    // Support both "target" (single) and "email" + "phone" (both optional, at least one required)
    let email = dto.email?.trim() || "";
    let phone = dto.phone?.trim() || "";
    if (dto.target?.trim()) {
      const t = dto.target.trim().toLowerCase();
      if (t.includes("@")) email = t;
      else phone = t;
    }

    if (!email && !phone) {
      throw new BadRequestException("Provide at least one of email or phone");
    }

    const orConditions: { phone?: string; email?: string }[] = [];
    if (phone) orConditions.push({ phone });
    if (email) orConditions.push({ email });

    // Find or create user
    let user = await prisma.user.findFirst({
      where: { OR: orConditions },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: email || undefined,
          phone: phone || undefined,
          name: dto.name?.trim() || undefined,
        },
      });
    } else {
      // Update existing user with the other contact if we have it and they don't
      const updates: { email?: string; phone?: string; name?: string } = {};
      if (email && !user.email) updates.email = email;
      if (phone && !user.phone) updates.phone = phone;
      if (dto.name?.trim() && !user.name) updates.name = dto.name.trim();
      if (Object.keys(updates).length > 0) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: updates,
        });
      }
    }

    // Upsert membership
    const membership = await prisma.orgMember.upsert({
      where: {
        orgId_userId: {
          orgId,
          userId: user.id,
        },
      },
      create: {
        orgId,
        userId: user.id,
        role: dto.role,
      },
      update: {
        role: dto.role,
      },
      include: {
        user: true,
      },
    });

    return {
      invitedUserId: user.id,
      role: membership.role,
    };
  }

  async listMembers(orgId: string, requesterRole: string) {
    if (requesterRole !== "ADMIN" && requesterRole !== "MANAGER") {
      throw new ForbiddenException("Only ADMIN or MANAGER can list org members");
    }

    const members = await prisma.orgMember.findMany({
      where: { orgId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      items: members.map((m) => ({
        userId: m.userId,
        role: m.role,
        createdAt: m.createdAt,
        user: m.user,
      })),
      total: members.length,
    };
  }

  async removeMember(orgId: string, requesterRole: string, userId: string) {
    if (requesterRole !== "ADMIN" && requesterRole !== "MANAGER") {
      throw new ForbiddenException("Only ADMIN or MANAGER can remove members");
    }

    const membership = await prisma.orgMember.findUnique({
      where: {
        orgId_userId: { orgId, userId },
      },
      include: { user: true },
    });

    if (!membership) {
      throw new NotFoundException("Member not found");
    }

    // Prevent removing the last ADMIN
    if (membership.role === "ADMIN") {
      const adminCount = await prisma.orgMember.count({
        where: { orgId, role: "ADMIN" },
      });
      if (adminCount <= 1) {
        throw new ForbiddenException("Cannot remove the last admin. Assign another admin first.");
      }
    }

    await prisma.orgMember.delete({
      where: {
        orgId_userId: { orgId, userId },
      },
    });

    return { message: "Member removed successfully" };
  }

  async getMe(orgId: string, userId: string, role: string) {
    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException("Organization not found");

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
      },
    });

    if (!user) throw new NotFoundException("User not found");

    // Resolve display name: User.name → Client.name → Carer.name fallback
    let resolvedName = user.name;
    if (!resolvedName) {
      const [relatedClient, relatedCarer] = await Promise.all([
        prisma.client.findFirst({ where: { userId, orgId }, select: { name: true } }).catch(() => null),
        prisma.carer.findFirst({ where: { userId, orgId }, select: { name: true } }).catch(() => null),
      ]);
      resolvedName = relatedClient?.name || relatedCarer?.name || null;
    }

    return {
      org: {
        id: org.id,
        name: org.name,
      },
      user: {
        ...user,
        name: resolvedName,
        role,
      },
    };
  }

  async updateMemberRole(orgId: string, updaterRole: string, userId: string, dto: { role?: string }) {
    if (updaterRole !== "ADMIN" && updaterRole !== "MANAGER") {
      throw new ForbiddenException("Only ADMIN or MANAGER can update roles");
    }

    const membership = await prisma.orgMember.findUnique({
      where: {
        orgId_userId: {
          orgId,
          userId,
        },
      },
    });

    if (!membership) {
      throw new NotFoundException("Member not found");
    }

    const updated = await prisma.orgMember.update({
      where: {
        orgId_userId: {
          orgId,
          userId,
        },
      },
      data: dto.role ? { role: dto.role } : {},
      include: {
        user: true,
      },
    });

    return updated;
  }
}

