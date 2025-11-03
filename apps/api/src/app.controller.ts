import { Controller, Get } from "@nestjs/common";
import { prisma } from "@poolcare/db";

@Controller()
export class AppController {
  @Get("healthz")
  async healthz() {
    try {
      // Quick database ping
      await Promise.race([
        prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => setTimeout(() => reject(new Error("DB timeout")), 2000)),
      ]);
      return { status: "ok", database: "connected", timestamp: new Date().toISOString() };
    } catch (error: any) {
      return { 
        status: "ok", 
        database: "disconnected", 
        error: error.message,
        timestamp: new Date().toISOString() 
      };
    }
  }
}

