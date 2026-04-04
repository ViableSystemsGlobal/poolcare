import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { OtpService } from "./otp.service";
import { JwtService } from "@nestjs/jwt";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { NotificationsModule } from "../notifications/notifications.module";
import { FilesModule } from "../files/files.module";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>("JWT_SECRET");
        if (!secret && config.get<string>("NODE_ENV") === "production") {
          throw new Error("JWT_SECRET must be set in production");
        }
        return {
        secret: secret || "dev-secret-change-in-prod",
        signOptions: {
          expiresIn: config.get<string>("JWT_EXPIRES_IN") || "7d",
        },
      };
      },
    }),
    NotificationsModule,
    FilesModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, OtpService, JwtService, JwtAuthGuard],
  exports: [AuthService, JwtModule, JwtAuthGuard],
})
export class AuthModule {}

