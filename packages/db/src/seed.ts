import { prisma } from "./prisma";

async function main() {
  console.log("🌱 Seeding database with sample data...");

  // Get or create organization
  let org = await prisma.organization.findFirst();
  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: "PoolPro Maintenance Co.",
      },
    });
    console.log("✅ Created organization:", org.name);
  } else {
    console.log("✅ Using existing organization:", org.name);
  }

  // Create or get users
  const adminUser = await prisma.user.upsert({
    where: { email: "admin@poolpro.com" },
    update: {},
    create: {
      email: "admin@poolpro.com",
      phone: "+1234567890",
      name: "Admin User",
    },
  });

  // Create org member (admin)
  await prisma.orgMember.upsert({
    where: {
      orgId_userId: {
        orgId: org.id,
        userId: adminUser.id,
      },
    },
    update: {},
    create: {
      orgId: org.id,
      userId: adminUser.id,
      role: "ADMIN",
    },
  });

  // Create carers
  const carers = [
    {
      name: "John Doe",
      phone: "+1234567891",
      email: "john@poolpro.com",
    },
    {
      name: "Jane Smith",
      phone: "+1234567892",
      email: "jane@poolpro.com",
    },
    {
      name: "Mike Johnson",
      phone: "+1234567893",
      email: "mike@poolpro.com",
    },
  ];

  const createdCarers = [];
  for (const carerData of carers) {
    const carerUser = await prisma.user.upsert({
      where: { email: carerData.email },
      update: {},
      create: {
        email: carerData.email,
        phone: carerData.phone,
        name: carerData.name,
      },
    });

    // Check if carer already exists
    const existingCarer = await prisma.carer.findFirst({
      where: {
        orgId: org.id,
        userId: carerUser.id,
      },
    });

    const carer = existingCarer || await prisma.carer.create({
      data: {
        orgId: org.id,
        userId: carerUser.id,
        name: carerData.name,
        phone: carerData.phone,
        active: true,
      },
    });

    createdCarers.push(carer);
    console.log(`✅ Created carer: ${carerData.name}`);
  }

  // Create clients
  const clients = [
    {
      name: "Sarah Johnson",
      email: "sarah.johnson@example.com",
      phone: "+1234567900",
      billingAddress: "123 Oak Street, Springfield, IL 62701",
      preferredChannel: "WHATSAPP",
    },
    {
      name: "Robert Williams",
      email: "robert.w@example.com",
      phone: "+1234567901",
      billingAddress: "456 Maple Avenue, Springfield, IL 62702",
      preferredChannel: "SMS",
    },
    {
      name: "Emily Davis",
      email: "emily.davis@example.com",
      phone: "+1234567902",
      billingAddress: "789 Pine Road, Springfield, IL 62703",
      preferredChannel: "EMAIL",
    },
    {
      name: "Michael Brown",
      email: "michael.b@example.com",
      phone: "+1234567903",
      billingAddress: "321 Elm Street, Springfield, IL 62704",
      preferredChannel: "WHATSAPP",
    },
    {
      name: "Jessica Martinez",
      email: "jessica.m@example.com",
      phone: "+1234567904",
      billingAddress: "654 Cedar Lane, Springfield, IL 62705",
      preferredChannel: "SMS",
    },
  ];

  const createdClients = [];
  for (const clientData of clients) {
    // Check if client already exists
    const existing = await prisma.client.findFirst({
      where: {
        orgId: org.id,
        email: clientData.email,
      },
    });

    const client = existing || await prisma.client.create({
      data: {
        orgId: org.id,
        name: clientData.name,
        email: clientData.email,
        phone: clientData.phone,
        billingAddress: clientData.billingAddress,
        preferredChannel: clientData.preferredChannel,
      },
    });

    createdClients.push(client);
    console.log(`✅ Created client: ${clientData.name}`);
  }

  // Create pools for clients
  const pools = [];
  const poolData = [
    { name: "Main Pool", volume: 20000, surfaceType: "concrete", clientIndex: 0 },
    { name: "Backyard Pool", volume: 15000, surfaceType: "vinyl", clientIndex: 0 },
    { name: "Swimming Pool", volume: 25000, surfaceType: "fiberglass", clientIndex: 1 },
    { name: "Pool", volume: 18000, surfaceType: "concrete", clientIndex: 2 },
    { name: "Main Pool", volume: 22000, surfaceType: "tile", clientIndex: 3 },
    { name: "Resort Pool", volume: 30000, surfaceType: "concrete", clientIndex: 4 },
  ];

  for (const poolInfo of poolData) {
    const client = createdClients[poolInfo.clientIndex];
    const pool = await prisma.pool.create({
      data: {
        orgId: org.id,
        clientId: client.id,
        name: poolInfo.name,
        address: client.billingAddress,
        volumeL: poolInfo.volume,
        surfaceType: poolInfo.surfaceType,
        equipment: {
          pump: "Variable Speed Pump",
          filter: "Sand Filter",
          heater: "Gas Heater",
        },
        notes: `${poolInfo.name} - ${poolInfo.surfaceType} pool`,
      },
    });
    pools.push(pool);
    console.log(`✅ Created pool: ${poolInfo.name} for ${client.name}`);
  }

  // Create visit templates
  const templates = [
    {
      name: "Weekly Maintenance",
      checklist: [
        "Skim surface debris",
        "Vacuum pool floor",
        "Check and clean skimmer basket",
        "Test water chemistry (pH, chlorine)",
        "Add chemicals as needed",
        "Check pump and filter",
        "Inspect equipment",
      ],
      serviceDurationMin: 45,
    },
    {
      name: "Deep Clean",
      checklist: [
        "Full pool cleaning",
        "Vacuum and brush all surfaces",
        "Clean filter system",
        "Backwash filter",
        "Service pool equipment",
        "Test all water levels",
        "Add shock treatment",
      ],
      serviceDurationMin: 120,
    },
    {
      name: "Opening Service",
      checklist: [
        "Remove pool cover",
        "Inspect pool structure",
        "Clean and prime filter",
        "Test water chemistry",
        "Balance chemicals",
        "Start pump system",
        "Check safety equipment",
      ],
      serviceDurationMin: 90,
    },
  ];

  const createdTemplates = [];
  for (const templateData of templates) {
    const template = await prisma.visitTemplate.create({
      data: {
        orgId: org.id,
        name: templateData.name,
        checklist: templateData.checklist,
        serviceDurationMin: templateData.serviceDurationMin,
      },
    });
    createdTemplates.push(template);
    console.log(`✅ Created visit template: ${templateData.name}`);
  }

  // Create service plans
  const servicePlans = [];
  const planData = [
    {
      poolIndex: 0,
      frequency: "weekly",
      dow: "mon",
      windowStart: "09:00:00",
      windowEnd: "11:00:00",
      templateIndex: 0,
      priceCents: 15000, // $150
      startsOn: new Date(),
      status: "active",
    },
    {
      poolIndex: 1,
      frequency: "biweekly",
      dow: "wed",
      windowStart: "10:00:00",
      windowEnd: "12:00:00",
      templateIndex: 0,
      priceCents: 18000, // $180
      startsOn: new Date(),
      status: "active",
    },
    {
      poolIndex: 2,
      frequency: "monthly",
      dom: 1,
      windowStart: "08:00:00",
      windowEnd: "10:00:00",
      templateIndex: 1,
      priceCents: 25000, // $250
      startsOn: new Date(),
      status: "active",
    },
  ];

  for (const planInfo of planData) {
    const pool = pools[planInfo.poolIndex];
    const template = createdTemplates[planInfo.templateIndex];

    const plan = await prisma.servicePlan.create({
      data: {
        orgId: org.id,
        poolId: pool.id,
        visitTemplateId: template.id,
        frequency: planInfo.frequency,
        dow: planInfo.dow || null,
        dom: planInfo.dom || null,
        windowStart: planInfo.windowStart,
        windowEnd: planInfo.windowEnd,
        priceCents: planInfo.priceCents,
        currency: "USD",
        startsOn: planInfo.startsOn,
        status: planInfo.status,
      },
    });
    servicePlans.push(plan);
    console.log(`✅ Created service plan for ${pool.name}`);
  }

  // Create jobs (scheduled for next 2 weeks)
  const jobs = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Map days of week names to numbers
  const dayMap: { [key: string]: number } = {
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
    sun: 0,
  };

  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const jobDate = new Date(today);
    jobDate.setDate(today.getDate() + dayOffset);

    // Create jobs for active service plans
    for (let planIndex = 0; planIndex < servicePlans.length; planIndex++) {
      const plan = servicePlans[planIndex];
      const pool = pools.find((p) => p.id === plan.poolId);
      const carer = createdCarers[planIndex % createdCarers.length]; // Assign carers round-robin
      if (!pool) continue;

      // Check if job should be created based on frequency
      const dayOfWeek = jobDate.getDay();
      const dayOfMonth = jobDate.getDate();
      let shouldCreate = false;

      if (plan.frequency === "weekly" && plan.dow && dayOfWeek === dayMap[plan.dow]) {
        shouldCreate = true;
      } else if (
        plan.frequency === "biweekly" &&
        plan.dow &&
        dayOfWeek === dayMap[plan.dow] &&
        dayOffset % 14 < 2
      ) {
        shouldCreate = true;
      } else if (plan.frequency === "monthly" && plan.dom && dayOfMonth === plan.dom) {
        shouldCreate = true;
      }

      if (shouldCreate) {
        const windowStart = new Date(jobDate);
        const [hours, minutes] = plan.windowStart?.split(":") || ["09", "00"];
        windowStart.setHours(parseInt(hours), parseInt(minutes), 0, 0);

        const windowEnd = new Date(jobDate);
        const [endHours, endMinutes] = plan.windowEnd?.split(":") || ["11", "00"];
        windowEnd.setHours(parseInt(endHours), parseInt(endMinutes), 0, 0);

        let status: "scheduled" | "on_site" | "completed" = "scheduled";
        if (dayOffset === 0) {
          // Today - some completed, some in progress
          if (Math.random() > 0.5) status = "completed";
          else if (Math.random() > 0.5) status = "on_site";
        } else if (dayOffset < 0) {
          status = "completed";
        }

        const job = await prisma.job.create({
          data: {
            orgId: org.id,
            planId: plan.id,
            poolId: pool.id,
            assignedCarerId: carer.id,
            status: status,
            windowStart: windowStart,
            windowEnd: windowEnd,
            scheduledStart: windowStart,
          },
        });
        jobs.push(job);

        // Create visit if job is completed
        if (status === "completed") {
          const visit = await prisma.visitEntry.create({
            data: {
              orgId: org.id,
              jobId: job.id,
              startedAt: new Date(windowStart.getTime() + 10 * 60000), // 10 min after window start
              arrivedAt: new Date(windowStart.getTime() + 15 * 60000),
              completedAt: new Date(windowStart.getTime() + 45 * 60000), // 45 min later
              rating: 5,
            },
          });

          // Add readings
          await prisma.reading.create({
            data: {
              orgId: org.id,
              visitId: visit.id,
              ph: 7.4 + (Math.random() * 0.4 - 0.2), // 7.2 - 7.6
              chlorineTotal: 2.0 + (Math.random() * 1.0 - 0.5), // 1.5 - 3.0
              tempC: 28 + (Math.random() * 4 - 2), // 26 - 30
              measuredAt: visit.completedAt || new Date(),
            },
          });

          // Add chemicals used
          await prisma.chemicalsUsed.create({
            data: {
              orgId: org.id,
              visitId: visit.id,
              chemical: "Chlorine Tablets",
              qty: 2,
              unit: "tablets",
              costCents: 500,
            },
          });
        }
      }
    }
  }

  console.log(`✅ Created ${jobs.length} jobs`);

  // Create sample invoices and payments
  for (let i = 0; i < 3; i++) {
    const client = createdClients[i];
    const pool = pools.find((p) => p.clientId === client.id);

    if (pool) {
      const invoiceNumber = `INV-2025-${String(Date.now()).slice(-6)}-${i}`;
      // Check if invoice already exists
      const existingInvoice = await prisma.invoice.findUnique({
        where: { invoiceNumber },
      });

      if (existingInvoice) {
        console.log(`⚠️  Invoice ${invoiceNumber} already exists, skipping...`);
        continue;
      }

      const invoice = await prisma.invoice.create({
        data: {
          orgId: org.id,
          clientId: client.id,
          invoiceNumber: invoiceNumber,
          currency: "USD",
          items: [
            {
              label: "Weekly Pool Service",
              qty: 4,
              unitPriceCents: 15000,
              taxPct: 0,
            },
          ],
          subtotalCents: 60000,
          taxCents: 0,
          totalCents: 60000,
          paidCents: i < 2 ? 60000 : 30000, // First 2 fully paid, 3rd partial
          status: i < 2 ? "paid" : "sent",
          issuedAt: new Date(Date.now() - (i + 1) * 7 * 24 * 60 * 60 * 1000), // Days ago
        },
      });

      if (i < 2) {
        // Create payment
        const payment = await prisma.payment.create({
          data: {
            orgId: org.id,
            invoiceId: invoice.id,
            method: i === 0 ? "paystack" : "cash",
            provider: i === 0 ? "paystack" : null,
            amountCents: 60000,
            currency: "USD",
            status: "completed",
            processedAt: new Date(invoice.issuedAt.getTime() + 2 * 24 * 60 * 60 * 1000),
          },
        });

        // Create receipt (check if already exists)
        const year = new Date().getFullYear();
        const receiptNumber = `REC-${year}-${String(Date.now()).slice(-6)}-${i}`;
        const existingReceipt = await prisma.receipt.findUnique({
          where: { receiptNumber },
        });

        if (!existingReceipt) {
          await prisma.receipt.create({
            data: {
              orgId: org.id,
              invoiceId: invoice.id,
              paymentId: payment.id,
              receiptNumber: receiptNumber,
              issuedAt: payment.processedAt || new Date(),
            },
          });
        }
      }

      console.log(`✅ Created invoice for ${client.name}`);
    }
  }

  // Create sample issues
  const issueDescriptions = [
    { type: "Equipment", description: "Pool pump making unusual noise" },
    { type: "Water Quality", description: "Chlorine levels consistently low" },
    { type: "Maintenance", description: "Pool filter needs cleaning" },
  ];

  for (let i = 0; i < 3; i++) {
    const pool = pools[i];
    const issueData = issueDescriptions[i];
    const issue = await prisma.issue.create({
      data: {
        orgId: org.id,
        poolId: pool.id,
        type: issueData.type,
        severity: i === 0 ? "high" : i === 1 ? "medium" : "low",
        status: i === 0 ? "open" : i === 1 ? "quoted" : "resolved",
        description: issueData.description,
      },
    });

    // Create quote for second issue
    if (i === 1) {
      const client = createdClients.find((c) => c.id === pool.clientId);
      if (client) {
        await prisma.quote.create({
          data: {
            orgId: org.id,
            issueId: issue.id,
            poolId: pool.id,
            clientId: client.id,
            items: [
              {
                label: "Filter Cleaning Service",
                qty: 1,
                unitPriceCents: 15000,
              },
            ],
            subtotalCents: 15000,
            taxCents: 0,
            totalCents: 15000,
            currency: "USD",
            status: "pending",
          },
        });
      }
    }

    console.log(`✅ Created issue for ${pool.name}`);
  }

  // Create sample notifications
  const notificationData = [
    {
      recipientType: "client",
      channel: "whatsapp",
      template: "job_reminder_24h",
      body: "Reminder: Your pool service is scheduled for tomorrow at 9:00 AM",
      status: "sent",
    },
    {
      recipientType: "client",
      channel: "email",
      template: "invoice_sent",
      body: "Your invoice INV-2025-0001 has been sent. Amount: $600.00",
      status: "sent",
    },
    {
      recipientType: "user",
      channel: "push",
      template: "quote_approved",
      body: "Quote for Pool Filter Cleaning has been approved by client",
      status: "delivered",
    },
  ];

  for (const notifData of notificationData) {
    await prisma.notification.create({
      data: {
        orgId: org.id,
        recipientId: notifData.recipientType === "client" ? createdClients[0].id : adminUser.id,
        recipientType: notifData.recipientType,
        channel: notifData.channel,
        template: notifData.template,
        body: notifData.body,
        status: notifData.status,
        sentAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
      },
    });
  }

  const notificationsCreated = notificationData.length;
  console.log(`✅ Created ${notificationsCreated} notifications`);

  console.log("\n🎉 Seeding complete!");
  console.log(`\n📊 Summary:`);
  console.log(`   • Organization: 1`);
  console.log(`   • Carers: ${createdCarers.length}`);
  console.log(`   • Clients: ${createdClients.length}`);
  console.log(`   • Pools: ${pools.length}`);
  console.log(`   • Service Plans: ${servicePlans.length}`);
  console.log(`   • Jobs: ${jobs.length}`);
  console.log(`   • Visit Templates: ${createdTemplates.length}`);
  console.log(`   • Invoices: 3`);
  console.log(`   • Issues: 3`);
  console.log(`   • Notifications: ${notificationsCreated}`);
}

main()
  .catch((e) => {
    console.error("❌ Seeding error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
