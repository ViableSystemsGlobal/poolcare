import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { FilesModule } from "../files/files.module";
import { NotificationsModule } from "../notifications/notifications.module";

import { AccountsService } from "./accounts.service";
import { ContactsService } from "./contacts.service";
import { LeadsService } from "./leads.service";
import { OpportunitiesService } from "./opportunities.service";
import { ActivitiesService } from "./activities.service";
import { LeadSourcesService } from "./lead-sources.service";
import { CrmMessagingService } from "./crm-messaging.service";

import { PublicLeadsController } from "./public-leads.controller";
import { PublicAssessmentController } from "./public-assessment.controller";
import { AccountsController } from "./accounts.controller";
import { ContactsController } from "./contacts.controller";
import { LeadsController } from "./leads.controller";
import { OpportunitiesController } from "./opportunities.controller";
import { ActivitiesController } from "./activities.controller";
import { LeadSourcesController } from "./lead-sources.controller";
import { MapsModule } from "../maps/maps.module";
import { SettingsModule } from "../settings/settings.module";

@Module({
  imports: [AuthModule, FilesModule, NotificationsModule, MapsModule, SettingsModule],
  controllers: [
    PublicLeadsController,
    PublicAssessmentController,
    AccountsController,
    ContactsController,
    LeadsController,
    OpportunitiesController,
    ActivitiesController,
    LeadSourcesController,
  ],
  providers: [
    AccountsService,
    ContactsService,
    LeadsService,
    OpportunitiesService,
    ActivitiesService,
    LeadSourcesService,
    CrmMessagingService,
  ],
})
export class CrmModule {}
