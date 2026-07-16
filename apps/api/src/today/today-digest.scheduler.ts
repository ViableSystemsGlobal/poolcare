import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { TodayService } from "./today.service";

/** Sends the "Today at PoolCare" email digest every morning at 06:30 Accra time. */
@Injectable()
export class TodayDigestScheduler {
  private readonly logger = new Logger("TodayDigest");
  constructor(private readonly today: TodayService) {}

  @Cron("30 6 * * *", { timeZone: "Africa/Accra" })
  async tick() {
    try {
      await this.today.sendDigest();
    } catch (e: any) {
      this.logger.error(`Today digest failed: ${e?.message ?? e}`);
    }
  }
}
