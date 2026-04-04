/**
 * seed-review.ts
 *
 * Seeds demo data for Apple/Google app review accounts.
 * Run with:  pnpm --filter @poolcare/db seed:review
 *
 * Required env vars (add to your .env):
 *   APPLE_REVIEW_CLIENT_PHONE  — phone for the client-app reviewer  (e.g. +233200000000)
 *   APPLE_REVIEW_CARER_PHONE   — phone for the carer-app reviewer   (e.g. +233200000001)
 *
 * Magic OTP: enter 000000 to log in with either account.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86400000);
}
function daysFromNow(n: number) {
  return new Date(Date.now() + n * 86400000);
}
function windowFor(date: Date, startHour: number, durationHours = 2) {
  const start = new Date(date);
  start.setHours(startHour, 0, 0, 0);
  const end = new Date(start);
  end.setHours(startHour + durationHours, 0, 0, 0);
  return { windowStart: start, windowEnd: end };
}

async function main() {
  const clientPhone = process.env.APPLE_REVIEW_CLIENT_PHONE;
  const carerPhone = process.env.APPLE_REVIEW_CARER_PHONE;

  if (!clientPhone || !carerPhone) {
    console.error(
      "❌  Missing env vars. Set APPLE_REVIEW_CLIENT_PHONE and APPLE_REVIEW_CARER_PHONE"
    );
    process.exit(1);
  }

  // Use the first org in the database
  const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) {
    console.error("❌  No organisation found. Set up your org first.");
    process.exit(1);
  }
  console.log(`✅  Using org: ${org.name} (${org.id})`);

  // ─────────────────────────────────────────────────────────────
  // CLIENT REVIEW ACCOUNT
  // ─────────────────────────────────────────────────────────────
  console.log("\n👤  Setting up client review account…");

  const clientUser = await prisma.user.upsert({
    where: { phone: clientPhone },
    create: { phone: clientPhone, name: "Review Client" },
    update: { name: "Review Client" },
  });

  await prisma.orgMember.upsert({
    where: { orgId_userId_role: { orgId: org.id, userId: clientUser.id, role: "CLIENT" } },
    create: { orgId: org.id, userId: clientUser.id, role: "CLIENT" },
    update: {},
  });

  const existingClientRecord = await prisma.client.findFirst({
    where: { orgId: org.id, userId: clientUser.id },
  });
  const clientRecord = existingClientRecord ?? await prisma.client.create({
    data: { orgId: org.id, userId: clientUser.id, name: "Review Client", phone: clientPhone },
  });

  console.log(`   Client record: ${clientRecord.id}`);

  // Pool 1 — main demo pool
  const pool1 = await prisma.pool.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      orgId: org.id,
      clientId: clientRecord.id,
      name: "Main Residence Pool",
      address: "12 Airport Residential, Accra",
      volumeL: 65000,
      surfaceType: "Plaster",
      poolType: "Inground",
      filtrationType: "Sand",
    },
    update: {},
  });

  // Pool 2 — second pool
  const pool2 = await prisma.pool.upsert({
    where: { id: "00000000-0000-0000-0000-000000000002" },
    create: {
      id: "00000000-0000-0000-0000-000000000002",
      orgId: org.id,
      clientId: clientRecord.id,
      name: "Villa Pool",
      address: "5 Cantonments Road, Accra",
      volumeL: 40000,
      surfaceType: "Fiberglass",
      poolType: "Infinity",
      filtrationType: "Saltwater",
    },
    update: {},
  });

  console.log(`   Pools: ${pool1.id}, ${pool2.id}`);

  // Find or pick a carer to assign (use any active carer in the org, or null)
  const anyCarerRecord = await prisma.carer.findFirst({ where: { orgId: org.id, active: true } });

  // Completed visits (past)
  const pastVisitDefs = [
    { daysAgo: 7, pool: pool1, ph: 7.4, chlorine: 1.8, alkalinity: 100, tempC: 28 },
    { daysAgo: 14, pool: pool1, ph: 7.2, chlorine: 2.0, alkalinity: 95, tempC: 29 },
    { daysAgo: 21, pool: pool1, ph: 7.6, chlorine: 1.5, alkalinity: 110, tempC: 27 },
    { daysAgo: 5, pool: pool2, ph: 7.3, chlorine: 1.9, alkalinity: 102, tempC: 30 },
  ];

  let invoiceCounter = 9000;

  for (const def of pastVisitDefs) {
    const visitDate = daysAgo(def.daysAgo);
    const { windowStart, windowEnd } = windowFor(visitDate, 9);

    const jobId = `review-job-c-${def.pool.id.slice(-4)}-${def.daysAgo}`;
    // Use deterministic-ish IDs via hash (just use a fixed prefix)
    const existingJob = await prisma.job.findFirst({ where: { orgId: org.id, notes: `review-seed-${jobId}` } });

    if (!existingJob) {
      const job = await prisma.job.create({
        data: {
          orgId: org.id,
          poolId: def.pool.id,
          windowStart,
          windowEnd,
          status: "completed",
          assignedCarerId: anyCarerRecord?.id ?? null,
          notes: `review-seed-${jobId}`,
        },
      });

      const startedAt = new Date(windowStart.getTime() + 5 * 60000);
      const arrivedAt = new Date(windowStart.getTime() + 15 * 60000);
      const completedAt = new Date(windowStart.getTime() + 90 * 60000);

      const visit = await prisma.visitEntry.create({
        data: {
          orgId: org.id,
          jobId: job.id,
          startedAt,
          arrivedAt,
          completedAt,
          rating: 5,
          feedback: "Great service, pool looks perfect!",
          paymentStatus: "approved",
          approvedAt: completedAt,
          paymentAmountCents: anyCarerRecord?.ratePerVisitCents ?? 5000,
        },
      });

      await prisma.reading.create({
        data: {
          orgId: org.id,
          visitId: visit.id,
          ph: def.ph,
          chlorineFree: def.chlorine,
          chlorineTotal: def.chlorine + 0.2,
          alkalinity: def.alkalinity,
          calciumHardness: 250,
          tempC: def.tempC,
          measuredAt: arrivedAt,
        },
      });

      await prisma.chemicalsUsed.create({
        data: {
          orgId: org.id,
          visitId: visit.id,
          chemical: "Chlorine",
          qty: 0.5,
          unit: "kg",
          costCents: 1500,
        },
      });

      invoiceCounter++;
      await prisma.invoice.create({
        data: {
          orgId: org.id,
          clientId: clientRecord.id,
          poolId: def.pool.id,
          visitId: visit.id,
          invoiceNumber: `INV-REVIEW-${invoiceCounter}`,
          status: "paid",
          currency: "GHS",
          items: [{ label: "Pool Service Visit", qty: 1, unitPriceCents: 18000, taxPct: 0 }],
          subtotalCents: 18000,
          taxCents: 0,
          totalCents: 18000,
          paidCents: 18000,
          issuedAt: completedAt,
          paidAt: new Date(completedAt.getTime() + 86400000),
          dueDate: new Date(completedAt.getTime() + 7 * 86400000),
        },
      });
    }
  }

  // Upcoming visit
  const upcomingJobExists = await prisma.job.findFirst({
    where: { orgId: org.id, notes: "review-seed-upcoming-client" },
  });
  if (!upcomingJobExists) {
    const { windowStart, windowEnd } = windowFor(daysFromNow(3), 10);
    await prisma.job.create({
      data: {
        orgId: org.id,
        poolId: pool1.id,
        windowStart,
        windowEnd,
        status: "scheduled",
        assignedCarerId: anyCarerRecord?.id ?? null,
        notes: "review-seed-upcoming-client",
      },
    });
  }

  // Outstanding invoice (no visit)
  const outstandingExists = await prisma.invoice.findFirst({
    where: { orgId: org.id, invoiceNumber: "INV-REVIEW-OUTSTANDING" },
  });
  if (!outstandingExists) {
    await prisma.invoice.create({
      data: {
        orgId: org.id,
        clientId: clientRecord.id,
        poolId: pool1.id,
        invoiceNumber: "INV-REVIEW-OUTSTANDING",
        status: "sent",
        currency: "GHS",
        items: [{ label: "Monthly Pool Maintenance", qty: 1, unitPriceCents: 45000, taxPct: 0 }],
        subtotalCents: 45000,
        taxCents: 0,
        totalCents: 45000,
        paidCents: 0,
        issuedAt: daysAgo(3),
        dueDate: daysFromNow(11),
      },
    });
  }

  console.log("   ✅  Client demo data seeded");

  // ─────────────────────────────────────────────────────────────
  // CARER REVIEW ACCOUNT
  // ─────────────────────────────────────────────────────────────
  console.log("\n🧑‍🔧  Setting up carer review account…");

  const carerUser = await prisma.user.upsert({
    where: { phone: carerPhone },
    create: { phone: carerPhone, name: "Review Carer" },
    update: { name: "Review Carer" },
  });

  await prisma.orgMember.upsert({
    where: { orgId_userId_role: { orgId: org.id, userId: carerUser.id, role: "CARER" } },
    create: { orgId: org.id, userId: carerUser.id, role: "CARER" },
    update: {},
  });

  const carerRecord = await prisma.carer.upsert({
    where: { id: "00000000-0000-0000-0000-000000000099" },
    create: {
      id: "00000000-0000-0000-0000-000000000099",
      orgId: org.id,
      userId: carerUser.id,
      name: "Review Carer",
      phone: carerPhone,
      ratePerVisitCents: 5000,
      currency: "GHS",
      active: true,
    },
    update: { name: "Review Carer", active: true },
  });

  console.log(`   Carer record: ${carerRecord.id}`);

  // Completed jobs assigned to the review carer
  const carerPastDefs = [
    { daysAgo: 2, pool: pool1 },
    { daysAgo: 5, pool: pool2 },
    { daysAgo: 9, pool: pool1 },
    { daysAgo: 12, pool: pool2 },
  ];

  for (const def of carerPastDefs) {
    const visitDate = daysAgo(def.daysAgo);
    const { windowStart, windowEnd } = windowFor(visitDate, 8);
    const existingJob = await prisma.job.findFirst({
      where: { orgId: org.id, notes: `review-seed-carer-${def.daysAgo}` },
    });
    if (!existingJob) {
      const job = await prisma.job.create({
        data: {
          orgId: org.id,
          poolId: def.pool.id,
          windowStart,
          windowEnd,
          status: "completed",
          assignedCarerId: carerRecord.id,
          notes: `review-seed-carer-${def.daysAgo}`,
        },
      });

      const startedAt = new Date(windowStart.getTime() + 5 * 60000);
      const arrivedAt = new Date(windowStart.getTime() + 20 * 60000);
      const completedAt = new Date(windowStart.getTime() + 100 * 60000);

      await prisma.visitEntry.create({
        data: {
          orgId: org.id,
          jobId: job.id,
          startedAt,
          arrivedAt,
          completedAt,
          rating: 5,
          paymentStatus: "approved",
          approvedAt: completedAt,
          paymentAmountCents: 5000,
        },
      });
    }
  }

  // Upcoming jobs for the review carer
  const carerUpcomingDefs = [
    { daysFromNow: 1, pool: pool1, startHour: 9 },
    { daysFromNow: 3, pool: pool2, startHour: 11 },
  ];

  for (const def of carerUpcomingDefs) {
    const existingJob = await prisma.job.findFirst({
      where: { orgId: org.id, notes: `review-seed-carer-upcoming-${def.daysFromNow}` },
    });
    if (!existingJob) {
      const { windowStart, windowEnd } = windowFor(daysFromNow(def.daysFromNow), def.startHour);
      await prisma.job.create({
        data: {
          orgId: org.id,
          poolId: def.pool.id,
          windowStart,
          windowEnd,
          status: "scheduled",
          assignedCarerId: carerRecord.id,
          notes: `review-seed-carer-upcoming-${def.daysFromNow}`,
        },
      });
    }
  }

  console.log("   ✅  Carer demo data seeded");

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  Review seed complete!

CLIENT APP
  Phone : ${clientPhone}
  Code  : 000000

CARER APP
  Phone : ${carerPhone}
  Code  : 000000
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
