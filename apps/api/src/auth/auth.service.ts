import { Injectable, UnauthorizedException, BadRequestException } from "@nestjs/common";

const INVITE_ONLY_MESSAGE =
  "You don't have access yet. Contact your organization to get an invite.";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { prisma } from "@poolcare/db";
import { OtpService } from "./otp.service";
import { OtpRequestDto, OtpVerifyDto } from "./dto";
import * as bcrypt from "bcryptjs";
import { normalizePhone } from "../utils/phone.util";

// In-memory store for dev OTP codes (only in development)
export const devOtpStore = new Map<string, { code: string; expiresAt: Date }>();

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly otpService: OtpService
  ) {}

  async requestOtp(dto: OtpRequestDto) {
    try {
      console.log('[AuthService] Requesting OTP for:', dto.channel, dto.target);
      
      const cooldownSeconds =
        this.configService.get<number>("OTP_REQUEST_COOLDOWN_SECONDS") || 45;
      const ttlSeconds = this.configService.get<number>("OTP_CODE_TTL_SECONDS") || 300;

      console.log('[AuthService] Checking cooldown...');
      
      // Check if database is available
      if (!process.env.DATABASE_URL) {
        throw new BadRequestException("Database not configured. Please set DATABASE_URL.");
      }
      
      const requestTarget = dto.channel === "phone" ? (normalizePhone(dto.target) ?? dto.target) : dto.target;
      // Check cooldown with timeout
      const existing = await Promise.race([
        prisma.otpRequest.findFirst({
          where: {
            target: requestTarget,
            purpose: "login",
            cooldownAt: {
              gt: new Date(),
            },
          },
          orderBy: { createdAt: "desc" },
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Database query timeout")), 5000)
        ),
      ]) as any;

    if (existing) {
      throw new BadRequestException("Please wait before requesting another code");
    }

    // Generate OTP
    const code = this.generateOtp();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const cooldownAt = new Date(Date.now() + cooldownSeconds * 1000);

    // Store in dev store for easy access (development only)
    if (process.env.NODE_ENV !== "production") {
      const key = `${dto.channel}:${dto.target}`;
      devOtpStore.set(key, { code, expiresAt });
      // Clean up expired entries
      setTimeout(() => devOtpStore.delete(key), ttlSeconds * 1000);
    }

    await prisma.otpRequest.create({
      data: {
        channel: dto.channel,
        target: requestTarget,
        codeHash,
        purpose: "login",
        expiresAt,
        cooldownAt,
        attempts: 0,
      },
    });

      // Send OTP via SMS and/or Email
      try {
        // Check if user exists to see if they have both phone and email AND get their org
        const userLookup = dto.channel === "phone"
          ? (() => {
              const normalized = normalizePhone(dto.target);
              return normalized ? { OR: [{ phone: dto.target }, { phone: normalized }] } : { phone: dto.target };
            })()
          : { email: dto.target };
        const existingUser = await prisma.user.findFirst({
          where: userLookup,
          include: {
            memberships: {
              include: {
                org: true,
              },
            },
          },
        });

        // Use the user's org if they exist, otherwise use first org
        let orgId: string | null = null;
        if (existingUser && existingUser.memberships.length > 0) {
          // Use the user's first org (they should have at least one)
          orgId = existingUser.memberships[0].orgId;
          console.log(`[OTP] Using user's org ${orgId} for SMS/Email settings`);
        } else {
          // User doesn't exist yet, get first org as fallback
        const firstOrg = await prisma.organization.findFirst({
          orderBy: { createdAt: "asc" },
        });
          orgId = firstOrg?.id || null;
          console.log(`[OTP] Using first org ${orgId} as fallback for new user`);
        }

        const sendResults: string[] = [];
        let primarySuccess = false;
        
        // Send to primary channel
        try {
        await this.otpService.sendOtp(dto.channel, dto.target, code, orgId || undefined);
          sendResults.push(`${dto.channel}:${dto.target}`);
          primarySuccess = true;
        console.log(`[OTP] ${dto.channel}:${dto.target} → Code sent successfully`);
        } catch (error: any) {
          console.error(`[OTP] Failed to send to primary channel ${dto.channel}:${dto.target}:`, error.message);
        }

        // Always try the other channel if user exists and has it
        // OR if primary failed, try to find user by other means and send there
        if (existingUser) {
          const otherChannel = dto.channel === "phone" ? "email" : "phone";
          const otherTarget = dto.channel === "phone" ? existingUser.email : existingUser.phone;
          
          if (otherTarget) {
            try {
              await this.otpService.sendOtp(otherChannel as "phone" | "email", otherTarget, code, orgId || undefined);
              sendResults.push(`${otherChannel}:${otherTarget}`);
              console.log(`[OTP] ${otherChannel}:${otherTarget} → Code sent successfully (dual channel)`);
            } catch (error: any) {
              console.error(`[OTP] Failed to send to secondary channel ${otherChannel}:${otherTarget}:`, error.message);
              // Don't fail if secondary channel fails
            }
          }
        } else if (!primarySuccess && dto.channel === "phone") {
          // If primary (SMS) failed and user doesn't exist yet, try to find by email pattern
          // This is a fallback - if phone fails, we can't really find the user
          // But we'll log the code in dev mode
        }

        // In development, always log the code for easy testing
        if (process.env.NODE_ENV === "development" || process.env.NODE_ENV !== "production") {
          console.log(`\n🔐 [DEV] OTP CODE for ${dto.channel}:${dto.target} → ${code}`);
          if (sendResults.length > 1) {
            console.log(`📧 [DEV] Code also sent to: ${sendResults.slice(1).join(", ")}\n`);
          } else if (!primarySuccess) {
            console.log(`⚠️  [DEV] Primary channel failed, but code is: ${code}\n`);
          } else {
            console.log();
          }
        }
        
        // Warn if no channels succeeded
        if (sendResults.length === 0) {
          console.warn(`⚠️  [OTP] WARNING: Failed to send OTP via any channel. Code: ${code} (logged in dev mode)`);
        }
      } catch (error: any) {
        console.error(`[OTP] Failed to send OTP:`, error.message);
        // In development, still log the code even if sending fails
        if (process.env.NODE_ENV === "development" || process.env.NODE_ENV !== "production") {
          console.log(`\n🔐 [DEV] OTP CODE for ${dto.channel}:${dto.target} → ${code} (send failed, logged for dev)\n`);
        }
        // Don't throw error - OTP is stored, user can retry sending if needed
      }
      
      console.log('[AuthService] OTP request completed successfully');
    } catch (error: any) {
      console.error('[AuthService] Error in requestOtp:', error);
      throw error;
    }
  }

  async verifyOtp(dto: OtpVerifyDto) {
    console.log('[AuthService] Verifying OTP for:', dto.channel, dto.target);
    const maxAttempts = this.configService.get<number>("OTP_MAX_ATTEMPTS") || 5;

    const otpTargetForVerify = dto.channel === "phone" ? (normalizePhone(dto.target) ?? dto.target) : dto.target;
    const otpRequest = await prisma.otpRequest.findFirst({
      where: {
        channel: dto.channel,
        target: otpTargetForVerify,
        purpose: "login",
        usedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!otpRequest) {
      console.log('[AuthService] No valid OTP request found');
      throw new UnauthorizedException("Invalid or expired code");
    }

    console.log('[AuthService] Found OTP request, attempts:', otpRequest.attempts, 'max:', maxAttempts);

    if (otpRequest.attempts >= maxAttempts) {
      console.log('[AuthService] Too many attempts');
      throw new UnauthorizedException("Too many attempts. Please request a new code");
    }

    console.log('[AuthService] Comparing code...');
    const isValid = await bcrypt.compare(dto.code, otpRequest.codeHash);
    if (!isValid) {
      console.log('[AuthService] Code comparison failed, incrementing attempts');
      await prisma.otpRequest.update({
        where: { id: otpRequest.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException("Invalid code");
    }

    console.log('[AuthService] Code is valid, proceeding with login');

    try {
      // Mark as used
      await prisma.otpRequest.update({
        where: { id: otpRequest.id },
        data: { usedAt: new Date() },
      });

      const app = dto.app || "client";

      // Find user (never create for admin or carer); normalize phone so 0200000799 and 200000799 match
      const userLookupVerify = dto.channel === "phone"
        ? (() => {
            const normalized = normalizePhone(dto.target);
            return normalized ? { OR: [{ phone: dto.target }, { phone: normalized }] } : { phone: dto.target };
          })()
        : { email: dto.target };
      let user = await prisma.user.findFirst({
        where: userLookupVerify,
      });

      if (app === "admin" || app === "carer") {
        // Invite-only: must already be in the system
        if (!user) {
          console.log('[AuthService] Invite-only: no user for', dto.target);
          throw new UnauthorizedException(INVITE_ONLY_MESSAGE);
        }
        let membership = await prisma.orgMember.findFirst({
          where: { userId: user.id },
          include: { org: true },
        });
        if (app === "carer") {
          membership = await prisma.orgMember.findFirst({
            where: { userId: user.id, role: "CARER" },
            include: { org: true },
          });
        }
        if (!membership) {
          console.log('[AuthService] Invite-only: no membership for user', user.id);
          throw new UnauthorizedException(INVITE_ONLY_MESSAGE);
        }

        // Resolve display name: User.name → Client.name → Carer.name
        const [relatedClientA, relatedCarerA] = await Promise.all([
          prisma.client.findFirst({ where: { userId: user.id, orgId: membership.orgId }, select: { name: true } }).catch(() => null),
          prisma.carer.findFirst({ where: { userId: user.id, orgId: membership.orgId }, select: { name: true } }).catch(() => null),
        ]);
        const displayNameA = user.name || relatedClientA?.name || relatedCarerA?.name || null;

        // Issue JWT (same as below; we'll reuse the token block)
        const jwtSecret = this.configService.get<string>("JWT_SECRET") || "dev-secret-change-in-prod";
        const token = this.jwtService.sign(
          {
            sub: user.id,
            org_id: membership.orgId,
            role: membership.role,
          },
          {
            secret: jwtSecret,
            expiresIn: this.configService.get<string>("JWT_EXPIRES_IN") || "7d",
          }
        );
        return {
          token,
          user: {
            id: user.id,
            phone: user.phone,
            email: user.email,
            name: displayNameA,
          },
          org: {
            id: membership.org.id,
            name: membership.org.name,
          },
          role: membership.role,
        };
      }

      // Client app: find or create user and org (self-signup allowed)
      if (!user) {
        console.log('[AuthService] Creating new user for:', dto.target);
        try {
          const phoneForCreate = dto.channel === "phone" ? (normalizePhone(dto.target) ?? dto.target) : undefined;
          const emailForCreate = dto.channel === "email" ? dto.target : undefined;
          user = await prisma.user.create({
            data: { phone: phoneForCreate, email: emailForCreate },
          });
          console.log('[AuthService] User created:', user.id);
        } catch (error: any) {
          console.error('[AuthService] Failed to create user:', error);
          throw new BadRequestException(`Failed to create user: ${error.message}`);
        }
      } else {
        console.log('[AuthService] Found existing user:', user.id);
      }

      let membership = await prisma.orgMember.findFirst({
        where: { userId: user.id },
        include: { org: true },
      });

      if (!membership) {
        console.log('[AuthService] Creating default org for user');
        try {
          const org = await prisma.organization.create({
            data: { name: `${user.phone || user.email}'s Organization` },
          });
          membership = await prisma.orgMember.create({
            data: {
              orgId: org.id,
              userId: user.id,
              role: "ADMIN",
            },
            include: { org: true },
          });
        } catch (error: any) {
          console.error('[AuthService] Failed to create org/membership:', error);
          throw new BadRequestException(`Failed to create organization: ${error.message}`);
        }
      } else {
        console.log('[AuthService] Found existing membership');
      }

      // Issue JWT
      const jwtSecret = this.configService.get<string>("JWT_SECRET") || "dev-secret-change-in-prod";
      const token = this.jwtService.sign(
        {
          sub: user.id,
          org_id: membership.orgId,
          role: membership.role,
        },
        {
          secret: jwtSecret,
          expiresIn: this.configService.get<string>("JWT_EXPIRES_IN") || "7d",
        }
      );

      console.log('[AuthService] JWT issued successfully');

      // Resolve display name: User.name → Client.name fallback
      const relatedClient = await prisma.client.findFirst({
        where: { userId: user.id, orgId: membership.orgId },
        select: { name: true },
      }).catch(() => null);
      const displayName = user.name || relatedClient?.name || null;

      return {
        token,
        user: {
          id: user.id,
          phone: user.phone,
          email: user.email,
          name: displayName,
        },
        org: {
          id: membership.org.id,
          name: membership.org.name,
        },
        role: membership.role,
      };
    } catch (error: any) {
      console.error('[AuthService] Error during user/org creation:', error);
      throw error;
    }
  }

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}

