import { Injectable } from "@nestjs/common";
import { prisma } from "@poolcare/db";

@Injectable()
export class MobileService {
  async getDelta(
    orgId: string,
    userId: string,
    role: string,
    shapes: string[],
    since?: number
  ) {
    const sinceDate = since ? new Date(since) : new Date(0);
    const serverTs = Date.now();

    const result: any = {
      serverTs,
      jobs: [],
      pools: [],
      visits: [],
      readings: [],
      chemicals: [],
      issues: [],
      vanStock: [],
      tombstones: [],
    };

    // Get today's jobs for CARER role
    if (shapes.includes("jobs")) {
      if (role === "CARER") {
        const carer = await prisma.carer.findFirst({
          where: { orgId, userId },
        });

        if (carer) {
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const todayEnd = new Date(todayStart);
          todayEnd.setDate(todayEnd.getDate() + 1);

          result.jobs = await prisma.job.findMany({
            where: {
              orgId,
              assignedCarerId: carer.id,
              windowStart: {
                gte: todayStart,
                lt: todayEnd,
              },
            },
            include: {
              pool: {
                select: {
                  id: true,
                  name: true,
                  address: true,
                },
              },
              plan: {
                select: {
                  id: true,
                  visitTemplateId: true,
                },
              },
            },
          });
        }
      } else {
        // For managers/admins, return all jobs
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(todayStart);
        todayEnd.setDate(todayEnd.getDate() + 1);

        result.jobs = await prisma.job.findMany({
          where: {
            orgId,
            windowStart: {
              gte: todayStart,
              lt: todayEnd,
            },
          },
          include: {
            pool: {
              select: {
                id: true,
                name: true,
                address: true,
              },
            },
          },
        });
      }
    }

    // Get pools for assigned jobs
    if (shapes.includes("pools")) {
      const poolIds = result.jobs.map((j: any) => j.poolId).filter(Boolean);
      if (poolIds.length > 0) {
        result.pools = await prisma.pool.findMany({
          where: {
            orgId,
            id: { in: poolIds },
          },
          select: {
            id: true,
            orgId: true,
            clientId: true,
            name: true,
            address: true,
            volumeL: true,
            targets: true,
          },
        });
      }
    }

    // Get recent visits
    if (shapes.includes("visits")) {
      const jobIds = result.jobs.map((j: any) => j.id);
      if (jobIds.length > 0 || role !== "CARER") {
        const where: any = {
          orgId,
        };

        if (role === "CARER") {
          where.jobId = { in: jobIds };
        }

        result.visits = await prisma.visitEntry.findMany({
          where,
          include: {
            job: {
              select: {
                id: true,
                poolId: true,
              },
            },
          },
        });
      }
    }

    // Get readings for visits
    if (shapes.includes("readings") && result.visits.length > 0) {
      const visitIds = result.visits.map((v: any) => v.id);
      result.readings = await prisma.reading.findMany({
        where: {
          orgId,
          visitId: { in: visitIds },
        },
      });
    }

    // Get chemicals for visits
    if (shapes.includes("chemicals") && result.visits.length > 0) {
      const visitIds = result.visits.map((v: any) => v.id);
      result.chemicals = await prisma.chemicalsUsed.findMany({
        where: {
          orgId,
          visitId: { in: visitIds },
        },
      });
    }

    // Get issues for visits
    if (shapes.includes("issues") && result.visits.length > 0) {
      const visitIds = result.visits.map((v: any) => v.id);
      result.issues = await prisma.issue.findMany({
        where: {
          orgId,
          visitId: { in: visitIds },
        },
      });
    }

    // Get van stock for CARER
    if (shapes.includes("vanStock") && role === "CARER") {
      // TODO: Implement inventory/van stock sync
      result.vanStock = [];
    }

    return result;
  }
}

