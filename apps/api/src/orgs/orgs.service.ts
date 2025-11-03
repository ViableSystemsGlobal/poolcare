import { Injectable, ForbiddenException, NotFoundException } from "@nestjs/common";
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

  async inviteMember(orgId: string, inviterRole: string, dto: { target: string; role: string; name?: string }) {
    if (inviterRole !== "ADMIN" && inviterRole !== "MANAGER") {
      throw new ForbiddenException("Only ADMIN or MANAGER can invite members");
    }

    // Normalize target
    const target = dto.target.toLowerCase().trim();

    // Find or create user
    let user = await prisma.user.findFirst({
      where: {
        OR: [{ phone: target }, { email: target }],
      },
    });

    if (!user) {
      const isEmail = target.includes("@");
      user = await prisma.user.create({
        data: isEmail
          ? { email: target, name: dto.name }
          : { phone: target, name: dto.name },
      });
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

    return {
      org: {
        id: org.id,
        name: org.name,
      },
      user: {
        ...user,
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

