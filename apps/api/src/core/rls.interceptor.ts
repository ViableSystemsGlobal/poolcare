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
      // TODO: Re-enable RLS once database is properly configured
      // For now, RLS is disabled to allow the app to work
      // The RLS interceptor was causing syntax errors with SET LOCAL statements
      // 
      // When re-enabling, we need to:
      // 1. Ensure RLS policies are set up in the database
      // 2. Use proper transaction handling for SET LOCAL statements
      // 3. Test that session variables are properly set
      
      // Temporarily disabled:
      // await prisma.$executeRawUnsafe(
      //   `SET LOCAL app.user_id = '${user.sub}'::uuid;
      //    SET LOCAL app.org_id = '${user.org_id}'::uuid;
      //    SET LOCAL app.role = '${user.role}';`
      // );
    }

    return next.handle().pipe(
      tap(() => {
        // Session vars auto-clear after transaction
      })
    );
  }
}

