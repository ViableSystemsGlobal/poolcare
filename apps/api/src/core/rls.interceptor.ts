import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { prisma } from "@poolcare/db";

/**
 * Sets Postgres session variables (app.user_id, app.org_id, app.role) for RLS
 * before each request that has a JWT. Must be applied globally.
 */
@Injectable()
export class RlsInterceptor implements NestInterceptor {
  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const user = request.user; // From JwtAuthGuard

    if (user) {
      // Set session vars for RLS policies
      await prisma.$executeRawUnsafe(
        `SET LOCAL app.user_id = '${user.sub}'::uuid;
         SET LOCAL app.org_id = '${user.org_id}'::uuid;
         SET LOCAL app.role = '${user.role}';`
      );
    }

    return next.handle().pipe(
      tap(() => {
        // Session vars auto-clear after transaction
      })
    );
  }
}

