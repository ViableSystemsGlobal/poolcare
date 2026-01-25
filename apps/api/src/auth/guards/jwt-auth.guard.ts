import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { parseBearerToken } from "@poolcare/utils";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = parseBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException("No token provided");
    }

    try {
      const secret = this.configService.get<string>("JWT_SECRET") || "dev-secret-change-in-prod";
      const payload = this.jwtService.verify(token, { secret });
      request.user = payload;
      return true;
    } catch (error) {
      throw new UnauthorizedException("Invalid token");
    }
  }
}

