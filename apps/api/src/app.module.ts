import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { AppController } from "./app.controller";
import { AuthModule } from "./auth/auth.module";
import { OrgsModule } from "./orgs/orgs.module";
import { CarersModule } from "./carers/carers.module";
import { ClientsModule } from "./clients/clients.module";
import { PoolsModule } from "./pools/pools.module";
import { FilesModule } from "./files/files.module";
import { TemplatesModule } from "./templates/templates.module";
import { PlansModule } from "./plans/plans.module";
import { SubscriptionTemplatesModule } from "./subscription-templates/subscription-templates.module";
import { JobsModule } from "./jobs/jobs.module";
import { VisitsModule } from "./visits/visits.module";
import { IssuesModule } from "./issues/issues.module";
import { QuotesModule } from "./quotes/quotes.module";
import { InvoicesModule } from "./invoices/invoices.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { InboxModule } from "./inbox/inbox.module";
import { AiModule } from "./ai/ai.module";
import { MobileModule } from "./mobile/mobile.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { SettingsModule } from "./settings/settings.module";
import { SmsModule } from "./sms/sms.module";
import { EmailModule } from "./email/email.module";
import { SuppliesModule } from "./supplies/supplies.module";
import { MapsModule } from "./maps/maps.module";
import { BillingModule } from "./billing/billing.module";
import { InventoryModule } from "./inventory/inventory.module";
import { RlsInterceptor } from "./core/rls.interceptor";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../api/.env', '../../apps/api/.env'],
    }),
    AuthModule,
    OrgsModule,
    CarersModule,
    ClientsModule,
    PoolsModule,
    FilesModule,
    TemplatesModule,
    PlansModule,
    SubscriptionTemplatesModule,
    JobsModule,
    VisitsModule,
    IssuesModule,
    QuotesModule,
    InvoicesModule,
    NotificationsModule,
    InboxModule,
    AiModule,
    MobileModule,
    DashboardModule,
    SettingsModule,
    SmsModule,
    EmailModule,
    SuppliesModule,
    MapsModule,
    BillingModule,
    InventoryModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: RlsInterceptor,
    },
  ],
})
export class AppModule {}

