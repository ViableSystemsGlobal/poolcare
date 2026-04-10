import { Injectable, UnauthorizedException, BadRequestException, Logger } from "@nestjs/common";

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
  private readonly logger = new Logger(AuthService.name);

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

    // Magic review bypass — allows Apple/Google reviewers to log in without a real OTP.
    // This is for app store review only. Only active when at least one review phone
    // is configured AND the target matches a configured review account AND code is 000000.
    const reviewPhones = [
      process.env.APPLE_REVIEW_CLIENT_PHONE,
      process.env.APPLE_REVIEW_CARER_PHONE,
    ].filter(Boolean);
    const isMagicBypass =
      reviewPhones.length > 0 &&
      dto.code === "000000" &&
      reviewPhones.some((p) => p === dto.target || p === normalizePhone(dto.target));

    if (isMagicBypass) {
      this.logger.warn(`App store review bypass used for: ${dto.target}`);
    }

    if (!isMagicBypass) {
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
    } else {
      console.log('[AuthService] Magic review bypass used for:', dto.target);
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

      if (app === "admin" || app === "carer" || app === "client") {
        // Invite-only: must already be in the system
        if (!user) {
          console.log('[AuthService] Invite-only: no user for', dto.target);
          throw new UnauthorizedException(INVITE_ONLY_MESSAGE);
        }

        // Fetch ALL memberships for this user to build multi-role JWT
        const allMemberships = await prisma.orgMember.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: "asc" },
          include: { org: true },
        });

        // Determine which membership qualifies for this app
        let membership: (typeof allMemberships)[0] | undefined;
        if (app === "client") {
          membership = allMemberships.find((m) => m.role === "CLIENT");
        } else if (app === "carer") {
          membership = allMemberships.find((m) => m.role === "CARER");
        } else {
          membership = allMemberships.find((m) => ["ADMIN", "MANAGER", "STAFF"].includes(m.role));
        }

        if (!membership) {
          console.log('[AuthService] Invite-only: no qualifying membership for user', user.id);
          throw new UnauthorizedException(INVITE_ONLY_MESSAGE);
        }

        // Collect all roles in this org
        const orgMemberships = allMemberships.filter((m) => m.orgId === membership!.orgId);
        const allRoles = orgMemberships.map((m) => m.role);
        const primaryRole = app === "client" ? "CLIENT" : this.getHighestPrivilegeRole(allRoles);

        // Resolve display name: User.name → Client.name → Carer.name
        const [relatedClientA, relatedCarerA] = await Promise.all([
          prisma.client.findFirst({ where: { userId: user.id, orgId: membership.orgId }, select: { name: true } }).catch(() => null),
          prisma.carer.findFirst({ where: { userId: user.id, orgId: membership.orgId }, select: { name: true } }).catch(() => null),
        ]);
        const displayNameA = user.name || relatedClientA?.name || relatedCarerA?.name || null;

        // Issue JWT with all roles
        const jwtSecretRaw = this.configService.get<string>("JWT_SECRET");
      if (!jwtSecretRaw && this.configService.get<string>("NODE_ENV") === "production") {
        throw new Error("JWT_SECRET must be set in production");
      }
      const jwtSecret = jwtSecretRaw || "dev-secret-change-in-prod";
        const token = this.jwtService.sign(
          {
            sub: user.id,
            org_id: membership.orgId,
            role: primaryRole,
            roles: allRoles,
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
          role: primaryRole,
          roles: allRoles,
        };
      }

      // All apps are now invite-only — no self-signup
      throw new UnauthorizedException(INVITE_ONLY_MESSAGE);
  }

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /** Return the highest-privilege role from a list (ADMIN > MANAGER > STAFF > CARER > CLIENT). */
  private getHighestPrivilegeRole(roles: string[]): string {
    const priority = ["ADMIN", "MANAGER", "STAFF", "CARER", "CLIENT"];
    for (const p of priority) {
      if (roles.includes(p)) return p;
    }
    return roles[0] || "CLIENT";
  }
}

