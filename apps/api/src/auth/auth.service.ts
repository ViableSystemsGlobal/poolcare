import { Injectable, UnauthorizedException, BadRequestException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { prisma } from "@poolcare/db";
import { OtpService } from "./otp.service";
import { OtpRequestDto, OtpVerifyDto } from "./dto";
import * as bcrypt from "bcryptjs";

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
      
      // Check cooldown with timeout
      const existing = await Promise.race([
        prisma.otpRequest.findFirst({
          where: {
            target: dto.target,
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

    await prisma.otpRequest.create({
      data: {
        channel: dto.channel,
        target: dto.target,
        codeHash,
        purpose: "login",
        expiresAt,
        cooldownAt,
        attempts: 0,
      },
    });

      // Send OTP via SMS or Email
      try {
        // Get first org or create default (for OTP, org doesn't matter much since user will join org after login)
        const firstOrg = await prisma.organization.findFirst({
          orderBy: { createdAt: "asc" },
        });
        const orgId = firstOrg?.id || null;
        
        await this.otpService.sendOtp(dto.channel, dto.target, code, orgId || undefined);
        console.log(`[OTP] ${dto.channel}:${dto.target} → Code sent successfully`);
      } catch (error: any) {
        console.error(`[OTP] Failed to send to ${dto.channel}:${dto.target}:`, error.message);
        // In development, still log the code even if sending fails
        if (process.env.NODE_ENV === "development") {
          console.log(`[OTP] ${dto.channel}:${dto.target} → Code: ${code} (send failed, logged for dev)`);
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
    const maxAttempts = this.configService.get<number>("OTP_MAX_ATTEMPTS") || 5;

    const otpRequest = await prisma.otpRequest.findFirst({
      where: {
        channel: dto.channel,
        target: dto.target,
        purpose: "login",
        usedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!otpRequest) {
      throw new UnauthorizedException("Invalid or expired code");
    }

    if (otpRequest.attempts >= maxAttempts) {
      throw new UnauthorizedException("Too many attempts. Please request a new code");
    }

    const isValid = await bcrypt.compare(dto.code, otpRequest.codeHash);
    if (!isValid) {
      await prisma.otpRequest.update({
        where: { id: otpRequest.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException("Invalid code");
    }

    // Mark as used
    await prisma.otpRequest.update({
      where: { id: otpRequest.id },
      data: { usedAt: new Date() },
    });

    // Find or create user
    let user = await prisma.user.findFirst({
      where:
        dto.channel === "phone"
          ? { phone: dto.target }
          : { email: dto.target },
    });

    if (!user) {
      user = await prisma.user.create({
        data:
          dto.channel === "phone"
            ? { phone: dto.target }
            : { email: dto.target },
      });
    }

    // Find or create org membership (first org or create default)
    let membership = await prisma.orgMember.findFirst({
      where: { userId: user.id },
      include: { org: true },
    });

    if (!membership) {
      // Create default org for new user
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
    }

    // Issue JWT
    const token = this.jwtService.sign({
      sub: user.id,
      org_id: membership.orgId,
      role: membership.role,
    });

    return {
      token,
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        name: user.name,
      },
      org: {
        id: membership.org.id,
        name: membership.org.name,
      },
      role: membership.role,
    };
  }

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}

