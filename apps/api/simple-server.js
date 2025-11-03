const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || "postgresql://nanasasu@localhost:5432/poolcare_dev?schema=public"
    }
  }
});

// In-memory storage for integration settings (in production, use database)
const integrationSettings = {
  smtp: null,
  sms: null,
};

// In-memory storage for SMS and Email history (in production, use database)
const messageHistory = {
  sms: [],
  email: [],
};

// Helper function to normalize phone number (Ghana format)
function normalizePhoneNumber(phone) {
  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, "");

  // If already starts with country code (Ghana: 233)
  if (cleaned.startsWith("233")) {
    return cleaned;
  }

  // If starts with 0, replace with 233 (Ghana)
  if (cleaned.startsWith("0")) {
    return "233" + cleaned.substring(1);
  }

  // If 9 digits, assume it's a Ghana number missing the leading 0
  if (cleaned.length === 9) {
    return "233" + cleaned;
  }

  // Otherwise assume it's already in international format or return as-is
  return cleaned;
}

// Helper function to send Email using Hostinger SMTP
async function sendEmailViaSmtp(to, subject, text, html) {
  // Get settings from stored integration settings or environment
  const storedSettings = integrationSettings.smtp;
  const settings = storedSettings || {
    host: process.env.SMTP_HOST || 'smtp.hostinger.com',
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: process.env.SMTP_SECURE !== 'false',
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.SMTP_FROM || process.env.SMTP_USER || '',
    fromName: process.env.SMTP_FROM_NAME || 'PoolCare',
  };

  // Debug logging
  console.log('[Email] Checking SMTP credentials:', {
    hasStoredSettings: !!storedSettings,
    hasUser: !!settings.user,
    hasPassword: !!settings.password,
    user: settings.user || '(empty)',
    password: settings.password ? '***' : '(empty)',
    host: settings.host,
    port: settings.port,
  });

  if (!settings.user || !settings.password) {
    console.error('[Email] Missing SMTP credentials:', {
      user: settings.user || 'MISSING',
      password: settings.password ? 'SET' : 'MISSING',
      storedSettingsExists: !!storedSettings,
    });
    throw new Error('SMTP credentials not configured. Please configure Email settings in Settings > Integrations.');
  }

  try {
    // Use nodemailer if available, otherwise use fetch-based SMTP
    // For simple-server.js, we'll use a basic fetch-based approach
    const nodemailer = require('nodemailer');
    
    const transporter = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure, // true for 465, false for other ports
      auth: {
        user: settings.user,
        pass: settings.password,
      },
    });

    const info = await transporter.sendMail({
      from: `${settings.fromName} <${settings.from}>`,
      to,
      subject,
      text,
      html: html || text,
    });

    console.log(`[Email] Sent successfully to ${to}: ${info.messageId}`);
    return info.messageId || `email_${Date.now()}`;
  } catch (error) {
    console.error(`[Email] Failed to send to ${to}:`, error.message);
    
    // In development, if credentials not configured, fall back to mock
    if (process.env.NODE_ENV === "development" && !settings.user) {
      console.warn(`[Email Dev Mode] Email would be sent to ${to}: ${subject}`);
      return `dev_ref_${Date.now()}`;
    }

    throw error;
  }
}

// Helper function to send SMS using Deywuro API
async function sendSmsViaDeywuro(to, message) {
  // Get settings from stored integration settings or environment
  const storedSettings = integrationSettings.sms;
  const settings = storedSettings || {
    provider: process.env.SMS_PROVIDER || 'deywuro',
    username: process.env.DEYWURO_USERNAME || '',
    password: process.env.DEYWURO_PASSWORD || '',
    senderId: process.env.SMS_SENDER_ID || 'PoolCare',
    apiUrl: process.env.DEYWURO_API_URL || 'https://deywuro.com/api/sms',
  };

  // Debug logging
  console.log('[SMS] Checking credentials:', {
    hasStoredSettings: !!storedSettings,
    hasUsername: !!settings.username,
    hasPassword: !!settings.password,
    username: settings.username || '(empty)',
    password: settings.password ? '***' : '(empty)',
  });

  if (!settings.username || !settings.password) {
    console.error('[SMS] Missing credentials:', {
      username: settings.username || 'MISSING',
      password: settings.password ? 'SET' : 'MISSING',
      storedSettingsExists: !!storedSettings,
    });
    throw new Error('Deywuro SMS credentials not configured. Please configure SMS settings in Settings > Integrations.');
  }

  try {
    // Normalize phone number
    const normalizedPhone = normalizePhoneNumber(to);

    // Deywuro API integration (using username/password auth)
    // According to: https://www.deywuro.com/NewUI/Landing/images/NPONTU_SMS_API_DOCUMENT_NEW.pdf
    const params = new URLSearchParams({
      username: settings.username,
      password: settings.password,
      destination: normalizedPhone,
      source: settings.senderId.substring(0, 11), // Max 11 characters
      message: message,
    });

    const response = await fetch(`${settings.apiUrl}?${params.toString()}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[SMS] Deywuro API HTTP error: ${response.status} - ${errorText}`);
      throw new Error(`Deywuro API HTTP error: ${response.status}`);
    }

    const data = await response.json();
    
    // Check response code (0 = success)
    if (data.code !== 0) {
      const errorMessage = data.message || `Deywuro API error code: ${data.code}`;
      console.error(`[SMS] Deywuro API error: ${data.code} - ${errorMessage}`);
      
      // Map response codes to meaningful errors
      switch (data.code) {
        case 401:
          throw new Error("Invalid Deywuro credentials. Please check your SMS settings.");
        case 403:
          throw new Error("Insufficient balance in Deywuro account");
        case 404:
          throw new Error("Phone number not routable");
        case 402:
          throw new Error("Missing required fields");
        case 500:
          throw new Error("Deywuro server error");
        default:
          throw new Error(errorMessage);
      }
    }

    // Success - return a reference ID
    const messageId = `deywuro_${Date.now()}_${normalizedPhone}`;
    console.log(`[SMS] Sent successfully to ${normalizedPhone}: ${data.message || "OK"}`);
    return messageId;
  } catch (error) {
    console.error(`[SMS] Failed to send via Deywuro to ${to}:`, error.message);
    
    // In development, if credentials not configured, fall back to mock
    if (process.env.NODE_ENV === "development" && !settings.username) {
      console.warn(`[SMS Dev Mode] SMS would be sent to ${to}: ${message}`);
      return `dev_ref_${Date.now()}`;
    }

    throw error;
  }
}

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow localhost on any port for development
    if (/^http:\/\/localhost:\d+$/.test(origin)) {
      return callback(null, true);
    }
    
    // Allow specific origins
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
    ];
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

app.get('/api/healthz', (req, res) => {
  res.json({ 
    status: 'ok', 
    database: 'connected', 
    timestamp: new Date().toISOString() 
  });
});

// Route verification endpoint
app.get('/api/debug/routes', (req, res) => {
  const routes = [];
  // Check if Files routes exist
  const hasFilesPresign = app._router?.stack?.some(layer => 
    layer.route?.path === '/api/files/presign' && 
    layer.route?.methods?.post
  );
  const hasFilesGet = app._router?.stack?.some(layer => 
    layer.route?.path === '/api/files' && 
    layer.route?.methods?.get
  );
  
  // Check integration settings routes
  const hasSmtpGet = app._router?.stack?.some(layer => 
    layer.route?.path === '/api/settings/integrations/smtp' && 
    layer.route?.methods?.get
  );
  const hasSmtpPatch = app._router?.stack?.some(layer => 
    layer.route?.path === '/api/settings/integrations/smtp' && 
    layer.route?.methods?.patch
  );
  const hasSmsGet = app._router?.stack?.some(layer => 
    layer.route?.path === '/api/settings/integrations/sms' && 
    layer.route?.methods?.get
  );
  const hasSmsPatch = app._router?.stack?.some(layer => 
    layer.route?.path === '/api/settings/integrations/sms' && 
    layer.route?.methods?.patch
  );
  
  res.json({
    filesPresignRoute: hasFilesPresign ? 'registered' : 'NOT FOUND',
    filesGetRoute: hasFilesGet ? 'registered' : 'NOT FOUND',
    smtpGetRoute: hasSmtpGet ? 'registered' : 'NOT FOUND',
    smtpPatchRoute: hasSmtpPatch ? 'registered' : 'NOT FOUND',
    smsGetRoute: hasSmsGet ? 'registered' : 'NOT FOUND',
    smsPatchRoute: hasSmsPatch ? 'registered' : 'NOT FOUND',
    timestamp: new Date().toISOString(),
    message: hasSmsPatch ? 'All routes loaded ✓' : 'Routes NOT loaded - restart required!'
  });
});

app.post('/api/auth/otp/request', (req, res) => {
  console.log('OTP request:', req.body);
  res.json({ ok: true });
});

app.post('/api/auth/otp/verify', (req, res) => {
  console.log('OTP verify:', req.body);
  res.json({ 
    token: 'fake-jwt-token',
    user: { id: '1', name: 'Test User', email: 'test@example.com', role: 'ADMIN' },
    org: { id: '1', name: 'Test Org' },
    role: 'ADMIN'
  });
});

app.get('/api/orgs/me', (req, res) => {
  console.log('Get user info:', req.headers.authorization);
  res.json({
    user: { 
      id: '1', 
      name: 'Test User', 
      email: 'test@example.com',
      role: 'ADMIN'
    },
    org: { 
      id: '1', 
      name: 'Test Organization' 
    }
  });
});

// Helper to get or create default org
async function getDefaultOrgId() {
  let org = await prisma.organization.findFirst();
  if (!org) {
    org = await prisma.organization.create({
      data: { name: 'Default Organization' }
    });
  }
  return org.id;
}

// Pools endpoints
app.get('/api/pools', async (req, res) => {
  try {
    const { clientId, query, page = '1', limit = '50' } = req.query;
    const orgId = await getDefaultOrgId();
    const where = {
      orgId,
    };

    if (clientId) {
      where.clientId = clientId;
    }

    if (query) {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { address: { contains: query, mode: 'insensitive' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [pools, total] = await Promise.all([
      prisma.pool.findMany({
        where,
        include: {
          client: {
            select: { id: true, name: true, email: true, phone: true }
          }
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.pool.count({ where }),
    ]);

    res.json({
      items: pools,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error('Pools list error:', error);
    res.status(500).json({ error: 'Failed to fetch pools' });
  }
});

app.get('/api/pools/:id', async (req, res) => {
  try {
    const pool = await prisma.pool.findUnique({
      where: { id: req.params.id },
      include: {
        client: {
          select: { id: true, name: true, email: true, phone: true, billingAddress: true }
        }
      },
    });

    if (!pool) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    res.json(pool);
  } catch (error) {
    console.error('Pool get error:', error);
    res.status(500).json({ error: 'Failed to fetch pool' });
  }
});

app.post('/api/pools', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const pool = await prisma.pool.create({
      data: {
        ...req.body,
        orgId,
      },
      include: {
        client: {
          select: { id: true, name: true, email: true, phone: true }
        }
      },
    });

    res.status(201).json(pool);
  } catch (error) {
    console.error('Pool create error:', error);
    res.status(500).json({ error: 'Failed to create pool', details: error.message });
  }
});

app.patch('/api/pools/:id', async (req, res) => {
  try {
    const pool = await prisma.pool.update({
      where: { id: req.params.id },
      data: req.body,
      include: {
        client: {
          select: { id: true, name: true, email: true, phone: true }
        }
      },
    });

    res.json(pool);
  } catch (error) {
    console.error('Pool update error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Pool not found' });
    }
    res.status(500).json({ error: 'Failed to update pool', details: error.message });
  }
});

app.delete('/api/pools/:id', async (req, res) => {
  try {
    await prisma.pool.delete({
      where: { id: req.params.id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Pool delete error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Pool not found' });
    }
    res.status(500).json({ error: 'Failed to delete pool', details: error.message });
  }
});

// Clients endpoints
app.get('/api/clients', async (req, res) => {
  try {
    const { query, tag, page = '1', limit = '50' } = req.query;
    const orgId = await getDefaultOrgId();
    const where = {
      orgId,
    };

    if (query) {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
        { phone: { contains: query, mode: 'insensitive' } },
        { billingAddress: { contains: query, mode: 'insensitive' } },
      ];
    }

    if (tag) {
      where.tags = { has: tag };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where,
        include: {
          _count: {
            select: { pools: true, invoices: true }
          }
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.client.count({ where }),
    ]);

    res.json({
      items: clients,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error('Clients list error:', error);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

app.get('/api/clients/:id', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const client = await prisma.client.findFirst({
      where: { 
        id: req.params.id,
        orgId 
      },
      include: {
        pools: {
          select: {
            id: true,
            name: true,
            address: true,
            volumeL: true,
            surfaceType: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: { pools: true, invoices: true, quotes: true }
        }
      },
    });

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json(client);
  } catch (error) {
    console.error('Client get error:', error);
    res.status(500).json({ error: 'Failed to fetch client' });
  }
});

app.post('/api/clients', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    // Filter out fields that don't exist in schema (notes, tags will be added later)
    const { notes, tags, ...clientData } = req.body;
    
    const client = await prisma.client.create({
      data: {
        ...clientData,
        orgId,
      },
    });

    res.status(201).json(client);
  } catch (error) {
    console.error('Client create error:', error);
    res.status(500).json({ error: 'Failed to create client', details: error.message });
  }
});

app.patch('/api/clients/:id', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    // Filter out fields that don't exist in schema (notes, tags will be added later)
    const { notes, tags, ...updateData } = req.body;
    
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: updateData,
    });

    // Verify client belongs to org
    if (client.orgId !== orgId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.json(client);
  } catch (error) {
    console.error('Client update error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.status(500).json({ error: 'Failed to update client', details: error.message });
  }
});

app.delete('/api/clients/:id', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    
    // Verify client belongs to org before deleting
    const client = await prisma.client.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    await prisma.client.delete({
      where: { id: req.params.id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Client delete error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.status(500).json({ error: 'Failed to delete client', details: error.message });
  }
});

// Carers endpoints
app.get('/api/carers', async (req, res) => {
  try {
    const { query, active, page = '1', limit = '50' } = req.query;
    const orgId = await getDefaultOrgId();
    const where = {
      orgId,
    };

    if (active !== undefined) {
      where.active = active === 'true';
    }

    if (query) {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { phone: { contains: query, mode: 'insensitive' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [carers, total] = await Promise.all([
      prisma.carer.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              phone: true,
              name: true,
            },
          },
          _count: {
            select: {
              assignedJobs: true,
            },
          },
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.carer.count({ where }),
    ]);

    res.json({
      items: carers,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error('Carers list error:', error);
    res.status(500).json({ error: 'Failed to fetch carers' });
  }
});

app.get('/api/carers/:id', async (req, res) => {
  try {
    const carer = await prisma.carer.findUnique({
      where: { id: req.params.id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            phone: true,
            name: true,
          },
        },
        _count: {
          select: {
            assignedJobs: true,
          },
        },
      },
    });

    if (!carer) {
      return res.status(404).json({ error: 'Carer not found' });
    }

    res.json(carer);
  } catch (error) {
    console.error('Carer get error:', error);
    res.status(500).json({ error: 'Failed to fetch carer' });
  }
});

// Get carer earnings (monthly and total)
app.get('/api/carers/:id/earnings', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const carerId = req.params.id;

    // Verify carer exists
    const carer = await prisma.carer.findFirst({
      where: { id: carerId, orgId },
    });

    if (!carer) {
      return res.status(404).json({ error: 'Carer not found' });
    }

    // Get all approved visits for this carer
    const visits = await prisma.visitEntry.findMany({
      where: {
        orgId,
        job: {
          assignedCarerId: carerId,
        },
        paymentStatus: 'approved',
      },
      select: {
        paymentAmountCents: true,
        approvedAt: true,
      },
    });

    // Calculate total earnings
    const totalEarningsCents = visits.reduce((sum, visit) => {
      return sum + (visit.paymentAmountCents || 0);
    }, 0);

    // Calculate monthly earnings (current month)
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyVisits = visits.filter((visit) => {
      if (!visit.approvedAt) return false;
      const approvedDate = new Date(visit.approvedAt);
      return approvedDate >= firstDayOfMonth;
    });

    const monthlyEarningsCents = monthlyVisits.reduce((sum, visit) => {
      return sum + (visit.paymentAmountCents || 0);
    }, 0);

    // Get pending visits (not yet approved)
    const pendingVisits = await prisma.visitEntry.findMany({
      where: {
        orgId,
        job: {
          assignedCarerId: carerId,
        },
        completedAt: { not: null },
        paymentStatus: { in: ['pending', null] },
      },
      include: {
        job: {
          include: {
            pool: {
              select: { name: true, address: true },
            },
          },
        },
      },
      orderBy: { completedAt: 'desc' },
      take: 10,
    });

    res.json({
      totalEarningsCents,
      monthlyEarningsCents,
      totalApprovedVisits: visits.length,
      monthlyApprovedVisits: monthlyVisits.length,
      pendingVisits: pendingVisits.map((v) => ({
        id: v.id,
        completedAt: v.completedAt,
        pool: v.job.pool.name || v.job.pool.address,
      })),
    });
  } catch (error) {
    console.error('Carer earnings error:', error);
    res.status(500).json({ error: 'Failed to fetch carer earnings', details: error.message });
  }
});

app.post('/api/carers', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const {
      userId,
      name,
      phone,
      homeBaseLat,
      homeBaseLng,
      active = true,
    } = req.body;

    // Validate userId exists (user must exist)
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
    } else {
      // If no userId, we need at least name and phone/email to create user
      if (!name || (!phone && !req.body.email)) {
        return res.status(400).json({ error: 'name and phone or email are required if userId is not provided' });
      }

      // For now, we'll require userId - in production, create user first
      return res.status(400).json({ error: 'userId is required. Please create user first or use existing user ID' });
    }

    const carer = await prisma.carer.create({
      data: {
        orgId,
        userId,
        name: name || null,
        phone: phone || null,
        homeBaseLat: homeBaseLat || null,
        homeBaseLng: homeBaseLng || null,
        active,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            phone: true,
            name: true,
          },
        },
      },
    });

    res.status(201).json(carer);
  } catch (error) {
    console.error('Carer create error:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Carer already exists for this user' });
    }
    res.status(500).json({ error: 'Failed to create carer', details: error.message });
  }
});

app.patch('/api/carers/:id', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const {
      name,
      phone,
      homeBaseLat,
      homeBaseLng,
      active,
    } = req.body;

    // Verify carer belongs to org
    const existing = await prisma.carer.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Carer not found' });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (homeBaseLat !== undefined) updateData.homeBaseLat = homeBaseLat;
    if (homeBaseLng !== undefined) updateData.homeBaseLng = homeBaseLng;
    if (active !== undefined) updateData.active = active;

    const carer = await prisma.carer.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            phone: true,
            name: true,
          },
        },
      },
    });

    res.json(carer);
  } catch (error) {
    console.error('Carer update error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Carer not found' });
    }
    res.status(500).json({ error: 'Failed to update carer', details: error.message });
  }
});

app.delete('/api/carers/:id', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();

    const carer = await prisma.carer.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!carer) {
      return res.status(404).json({ error: 'Carer not found' });
    }

    await prisma.carer.delete({
      where: { id: req.params.id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Carer delete error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Carer not found' });
    }
    res.status(500).json({ error: 'Failed to delete carer', details: error.message });
  }
});

// Visit Templates endpoints
app.get('/api/visit-templates', async (req, res) => {
  try {
    const { query, page = '1', limit = '50' } = req.query;
    const orgId = await getDefaultOrgId();
    const where = {
      orgId,
    };

    if (query) {
      where.name = { contains: query, mode: 'insensitive' };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [templates, total] = await Promise.all([
      prisma.visitTemplate.findMany({
        where,
        include: {
          _count: {
            select: {
              servicePlans: true,
              visits: true,
            },
          },
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.visitTemplate.count({ where }),
    ]);

    res.json({
      items: templates,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error('Visit templates list error:', error);
    res.status(500).json({ error: 'Failed to fetch visit templates' });
  }
});

app.get('/api/visit-templates/:id', async (req, res) => {
  try {
    const template = await prisma.visitTemplate.findUnique({
      where: { id: req.params.id },
      include: {
        _count: {
          select: {
            servicePlans: true,
            visits: true,
          },
        },
      },
    });

    if (!template) {
      return res.status(404).json({ error: 'Visit template not found' });
    }

    res.json(template);
  } catch (error) {
    console.error('Visit template get error:', error);
    res.status(500).json({ error: 'Failed to fetch visit template' });
  }
});

app.post('/api/visit-templates', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const {
      name,
      checklist,
      targets,
      serviceDurationMin = 45,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    if (!checklist || !Array.isArray(checklist) || checklist.length === 0) {
      return res.status(400).json({ error: 'checklist is required and must be a non-empty array' });
    }

    const template = await prisma.visitTemplate.create({
      data: {
        orgId,
        name,
        checklist: checklist,
        targets: targets || null,
        serviceDurationMin: serviceDurationMin || 45,
        version: 1,
      },
      include: {
        _count: {
          select: {
            servicePlans: true,
            visits: true,
          },
        },
      },
    });

    res.status(201).json(template);
  } catch (error) {
    console.error('Visit template create error:', error);
    res.status(500).json({ error: 'Failed to create visit template', details: error.message });
  }
});

app.patch('/api/visit-templates/:id', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const {
      name,
      checklist,
      targets,
      serviceDurationMin,
    } = req.body;

    // Verify template belongs to org
    const existing = await prisma.visitTemplate.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Visit template not found' });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (checklist !== undefined) {
      if (!Array.isArray(checklist) || checklist.length === 0) {
        return res.status(400).json({ error: 'checklist must be a non-empty array' });
      }
      updateData.checklist = checklist;
      // When checklist changes, increment version (create new version instead?)
      // For now, just update in place
    }
    if (targets !== undefined) updateData.targets = targets;
    if (serviceDurationMin !== undefined) updateData.serviceDurationMin = serviceDurationMin;

    const template = await prisma.visitTemplate.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        _count: {
          select: {
            servicePlans: true,
            visits: true,
          },
        },
      },
    });

    res.json(template);
  } catch (error) {
    console.error('Visit template update error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Visit template not found' });
    }
    res.status(500).json({ error: 'Failed to update visit template', details: error.message });
  }
});

app.delete('/api/visit-templates/:id', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();

    const template = await prisma.visitTemplate.findFirst({
      where: { id: req.params.id, orgId },
      include: {
        _count: {
          select: {
            servicePlans: true,
            visits: true,
          },
        },
      },
    });

    if (!template) {
      return res.status(404).json({ error: 'Visit template not found' });
    }

    // Check if template is in use
    if (template._count.servicePlans > 0 || template._count.visits > 0) {
      return res.status(400).json({
        error: 'Cannot delete template that is in use',
        details: `${template._count.servicePlans} service plan(s) and ${template._count.visits} visit(s) reference this template`,
      });
    }

    await prisma.visitTemplate.delete({
      where: { id: req.params.id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Visit template delete error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Visit template not found' });
    }
    res.status(500).json({ error: 'Failed to delete visit template', details: error.message });
  }
});

// Settings endpoints
app.get('/api/settings/org', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        name: true,
        createdAt: true,
      },
    });

    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // For now, return org with defaults. In production, this would come from OrgSetting table
    res.json({
      ...org,
      profile: {
        name: org.name,
        logoUrl: null,
        timezone: 'Africa/Accra',
        address: null,
        currency: 'GHS',
        supportEmail: null,
        supportPhone: null,
        locale: 'en',
      },
    });
  } catch (error) {
    console.error('Settings org get error:', error);
    res.status(500).json({ error: 'Failed to fetch organization settings' });
  }
});

app.patch('/api/settings/org', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const { profile } = req.body;

    // Update organization name if provided
    if (profile?.name) {
      await prisma.organization.update({
        where: { id: orgId },
        data: { name: profile.name },
      });
    }

    // In production, this would update OrgSetting table
    // For now, just update the name field
    
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        name: true,
        createdAt: true,
      },
    });

    res.json({
      ...org,
      profile: profile || {
        name: org.name,
        logoUrl: null,
        timezone: 'Africa/Accra',
        address: null,
        currency: 'GHS',
        supportEmail: null,
        supportPhone: null,
        locale: 'en',
      },
    });
  } catch (error) {
    console.error('Settings org update error:', error);
    res.status(500).json({ error: 'Failed to update organization settings' });
  }
});

app.get('/api/settings/tax', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    
    // In production, this would come from OrgSetting table
    // For now, return defaults
    res.json({
      defaultTaxPct: 0,
      taxName: 'VAT',
      invoiceNumbering: {
        prefix: 'INV-',
        next: 1,
        width: 4,
      },
      currency: 'GHS',
      showTaxOnItems: false,
    });
  } catch (error) {
    console.error('Settings tax get error:', error);
    res.status(500).json({ error: 'Failed to fetch tax settings' });
  }
});

app.patch('/api/settings/tax', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const taxSettings = req.body;

    // In production, this would update OrgSetting table
    // For now, just return the updated settings
    
    res.json({
      defaultTaxPct: taxSettings.defaultTaxPct || 0,
      taxName: taxSettings.taxName || 'VAT',
      invoiceNumbering: taxSettings.invoiceNumbering || {
        prefix: 'INV-',
        next: 1,
        width: 4,
      },
      currency: taxSettings.currency || 'GHS',
      showTaxOnItems: taxSettings.showTaxOnItems || false,
    });
  } catch (error) {
    console.error('Settings tax update error:', error);
    res.status(500).json({ error: 'Failed to update tax settings' });
  }
});

// Integration Settings endpoints
app.get('/api/settings/integrations/smtp', async (req, res) => {
  try {
    // Return stored settings if available, otherwise return defaults from environment
    const stored = integrationSettings.smtp;
    
    // If stored exists, return it but mask the password
    // If not stored, return defaults with empty password
    if (stored) {
      res.json({
        settings: {
          host: stored.host,
          port: stored.port,
          secure: stored.secure,
          user: stored.user,
          password: '', // Never return password
          from: stored.from,
          fromName: stored.fromName,
        },
      });
    } else {
      res.json({
        settings: {
          host: process.env.SMTP_HOST || 'smtp.hostinger.com',
          port: parseInt(process.env.SMTP_PORT || '465'),
          secure: process.env.SMTP_SECURE !== 'false',
          user: process.env.SMTP_USER || '',
          password: '', // Never return password
          from: process.env.SMTP_FROM || process.env.SMTP_USER || '',
          fromName: process.env.SMTP_FROM_NAME || 'PoolCare',
        },
      });
    }
  } catch (error) {
    console.error('Settings SMTP get error:', error);
    res.status(500).json({ error: 'Failed to fetch SMTP settings' });
  }
});

app.patch('/api/settings/integrations/smtp', async (req, res) => {
  try {
    const { settings } = req.body;

    // Store settings in memory (in production, save to database)
    // Preserve existing password if new one is not provided or empty
    const existingSettings = integrationSettings.smtp || {};
    
    integrationSettings.smtp = {
      host: settings.host || existingSettings.host || 'smtp.hostinger.com',
      port: settings.port !== undefined ? parseInt(settings.port) : (existingSettings.port || 465),
      secure: settings.secure !== undefined ? settings.secure : (existingSettings.secure !== undefined ? existingSettings.secure : true),
      user: settings.user || existingSettings.user || '',
      // Only update password if a new one was provided (not empty or undefined)
      password: settings.password !== undefined && settings.password !== null && settings.password.trim() !== '' 
        ? settings.password 
        : (existingSettings.password || ''),
      from: settings.from || existingSettings.from || settings.user || existingSettings.user || '',
      fromName: settings.fromName || existingSettings.fromName || 'PoolCare',
    };

    console.log('[SMTP Settings] Updated:', {
      host: integrationSettings.smtp.host,
      port: integrationSettings.smtp.port,
      secure: integrationSettings.smtp.secure,
      user: integrationSettings.smtp.user,
      password: integrationSettings.smtp.password ? '***' : '(not set)',
      passwordLength: integrationSettings.smtp.password ? integrationSettings.smtp.password.length : 0,
      from: integrationSettings.smtp.from,
      fromName: integrationSettings.smtp.fromName,
      receivedPassword: settings.password !== undefined && settings.password !== null && settings.password.trim() !== '' ? 'provided' : 'not provided',
    });

    // Return stored settings without password
    res.json({
      settings: {
        host: integrationSettings.smtp.host,
        port: integrationSettings.smtp.port,
        secure: integrationSettings.smtp.secure,
        user: integrationSettings.smtp.user,
        password: '', // Never return password
        from: integrationSettings.smtp.from,
        fromName: integrationSettings.smtp.fromName,
      },
    });
  } catch (error) {
    console.error('Settings SMTP update error:', error);
    res.status(500).json({ error: 'Failed to update SMTP settings' });
  }
});

app.get('/api/settings/integrations/sms', async (req, res) => {
  try {
    // Return stored settings if available, otherwise return defaults from environment
    const stored = integrationSettings.sms;
    res.json({
      settings: stored || {
        provider: process.env.SMS_PROVIDER || 'deywuro',
        username: process.env.DEYWURO_USERNAME || '',
        password: '', // Never return password
        senderId: process.env.SMS_SENDER_ID || 'PoolCare',
        apiUrl: process.env.DEYWURO_API_URL || 'https://deywuro.com/api/sms',
      },
    });
  } catch (error) {
    console.error('Settings SMS get error:', error);
    res.status(500).json({ error: 'Failed to fetch SMS settings' });
  }
});

app.patch('/api/settings/integrations/sms', async (req, res) => {
  try {
    const { settings } = req.body;

    // Store settings in memory (in production, save to database)
    // Preserve existing password if new one is not provided or empty
    const existingSettings = integrationSettings.sms || {};
    
    integrationSettings.sms = {
      provider: settings.provider || existingSettings.provider || 'deywuro',
      username: settings.username || existingSettings.username || '',
      // Only update password if a new one was provided (not empty or undefined)
      password: settings.password !== undefined && settings.password !== null && settings.password.trim() !== '' 
        ? settings.password 
        : (existingSettings.password || ''),
      senderId: settings.senderId || existingSettings.senderId || 'PoolCare',
      apiUrl: settings.apiUrl || existingSettings.apiUrl || 'https://deywuro.com/api/sms',
    };

    console.log('[SMS Settings] Updated:', {
      provider: integrationSettings.sms.provider,
      username: integrationSettings.sms.username,
      password: integrationSettings.sms.password ? '***' : '(not set)',
      senderId: integrationSettings.sms.senderId,
      apiUrl: integrationSettings.sms.apiUrl,
    });

    // Return stored settings without password
    res.json({
      settings: {
        provider: integrationSettings.sms.provider,
        username: integrationSettings.sms.username,
        password: '', // Never return password
        senderId: integrationSettings.sms.senderId,
        apiUrl: integrationSettings.sms.apiUrl,
      },
    });
  } catch (error) {
    console.error('Settings SMS update error:', error);
    res.status(500).json({ error: 'Failed to update SMS settings' });
  }
});

// Dashboard data endpoint
app.get('/api/dashboard', async (req, res) => {
  try {
    console.log('Fetching dashboard data...');
    
    // Get counts from database
    const [
      totalClients,
      activePools, 
      totalJobs,
      pendingQuotes,
      totalInvoices
    ] = await Promise.all([
      prisma.client.count(),
      prisma.pool.count(),
      prisma.job.count(),
      prisma.quote.count({ where: { status: 'pending' } }),
      prisma.invoice.count()
    ]);

    // Mock some data for now
    const dashboardData = {
      metrics: {
        todayJobs: Math.floor(Math.random() * 12) + 3,
        totalClients,
        activePools,
        pendingQuotes: pendingQuotes || Math.floor(Math.random() * 5) + 1,
        totalRevenue: 45000 + Math.floor(Math.random() * 10000),
        completionRate: 94 + Math.floor(Math.random() * 5)
      },
      recentJobs: [
        {
          id: '1',
          clientName: 'Adabraka Residence',
          poolName: 'Main Pool',
          status: 'completed',
          carerName: 'John Doe',
          scheduledAt: new Date().toISOString(),
          completedAt: new Date().toISOString()
        }
      ],
      upcomingJobs: [
        {
          id: '2', 
          clientName: 'East Legon Villa',
          poolName: 'Swimming Pool',
          status: 'scheduled',
          carerName: 'Jane Smith',
          scheduledAt: new Date(Date.now() + 24*60*60*1000).toISOString()
        }
      ],
      alerts: [
        {
          id: '1',
          type: 'warning',
          message: 'Pool chemical levels need attention at Tema Community',
          timestamp: new Date().toISOString()
        }
      ]
    };

    console.log('Dashboard data:', dashboardData);
    res.json(dashboardData);
  } catch (error) {
    console.error('Dashboard data error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// Service Plans endpoints
app.get('/api/service-plans', async (req, res) => {
  try {
    const { poolId, clientId, active, page = '1', limit = '50' } = req.query;
    const orgId = await getDefaultOrgId();
    const where = {
      orgId,
    };

    if (poolId) {
      where.poolId = poolId;
    }

    if (clientId) {
      where.pool = { clientId: clientId };
    }

    if (active !== undefined) {
      where.status = active === 'true' ? 'active' : { not: 'active' };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [plans, total] = await Promise.all([
      prisma.servicePlan.findMany({
        where,
        include: {
          pool: {
            include: {
              client: {
                select: { id: true, name: true, email: true, phone: true }
              }
            }
          },
          visitTemplate: {
            select: { id: true, name: true, version: true }
          },
          _count: {
            select: { jobs: true }
          }
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.servicePlan.count({ where }),
    ]);

    res.json({
      items: plans,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error('Service plans list error:', error);
    res.status(500).json({ error: 'Failed to fetch service plans' });
  }
});

app.get('/api/service-plans/:id', async (req, res) => {
  try {
    const plan = await prisma.servicePlan.findUnique({
      where: { id: req.params.id },
      include: {
        pool: {
          include: {
            client: {
              select: { id: true, name: true, email: true, phone: true, billingAddress: true }
            }
          }
        },
        visitTemplate: {
          select: { id: true, name: true, version: true }
        },
        windowOverrides: {
          orderBy: { date: 'asc' }
        },
        _count: {
          select: { jobs: true }
        }
      },
    });

    if (!plan) {
      return res.status(404).json({ error: 'Service plan not found' });
    }

    res.json(plan);
  } catch (error) {
    console.error('Service plan get error:', error);
    res.status(500).json({ error: 'Failed to fetch service plan' });
  }
});

app.post('/api/service-plans', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const {
      poolId,
      frequency,
      dow,
      dom,
      window,
      priceCents,
      currency = 'GHS',
      taxPct = 0,
      discountPct = 0,
      visitTemplateId,
      visitTemplateVersion,
      serviceDurationMin = 45,
      startsOn,
      endsOn,
      notes,
    } = req.body;

    // Validate pool belongs to org
    const pool = await prisma.pool.findFirst({
      where: { id: poolId, orgId },
    });

    if (!pool) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    // Calculate nextVisitAt (simplified)
    const nextVisitAt = calculateNextVisitDate(frequency, dow, dom, startsOn);

    const plan = await prisma.servicePlan.create({
      data: {
        orgId,
        poolId,
        frequency,
        dow,
        dom,
        windowStart: window?.start,
        windowEnd: window?.end,
        serviceDurationMin,
        visitTemplateId,
        visitTemplateVersion,
        priceCents,
        currency,
        taxPct,
        discountPct,
        startsOn: startsOn ? new Date(startsOn) : null,
        endsOn: endsOn ? new Date(endsOn) : null,
        status: 'active',
        nextVisitAt,
        notes,
      },
      include: {
        pool: {
          include: {
            client: {
              select: { id: true, name: true, email: true, phone: true }
            }
          }
        },
        visitTemplate: {
          select: { id: true, name: true, version: true }
        }
      },
    });

    res.status(201).json(plan);
  } catch (error) {
    console.error('Service plan create error:', error);
    res.status(500).json({ error: 'Failed to create service plan', details: error.message });
  }
});

app.patch('/api/service-plans/:id', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const {
      frequency,
      dow,
      dom,
      window,
      priceCents,
      taxPct,
      discountPct,
      visitTemplateId,
      visitTemplateVersion,
      serviceDurationMin,
      endsOn,
      notes,
    } = req.body;

    // Verify plan belongs to org
    const existing = await prisma.servicePlan.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Service plan not found' });
    }

    const plan = await prisma.servicePlan.update({
      where: { id: req.params.id },
      data: {
        frequency,
        dow,
        dom,
        windowStart: window?.start,
        windowEnd: window?.end,
        priceCents,
        taxPct,
        discountPct,
        visitTemplateId,
        visitTemplateVersion,
        serviceDurationMin,
        endsOn: endsOn ? new Date(endsOn) : null,
        notes,
      },
      include: {
        pool: {
          include: {
            client: {
              select: { id: true, name: true, email: true, phone: true }
            }
          }
        },
        visitTemplate: {
          select: { id: true, name: true, version: true }
        }
      },
    });

    res.json(plan);
  } catch (error) {
    console.error('Service plan update error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Service plan not found' });
    }
    res.status(500).json({ error: 'Failed to update service plan', details: error.message });
  }
});

app.post('/api/service-plans/:id/pause', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const plan = await prisma.servicePlan.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!plan) {
      return res.status(404).json({ error: 'Service plan not found' });
    }

    const updated = await prisma.servicePlan.update({
      where: { id: req.params.id },
      data: { status: 'paused' },
    });

    res.json(updated);
  } catch (error) {
    console.error('Service plan pause error:', error);
    res.status(500).json({ error: 'Failed to pause service plan' });
  }
});

app.post('/api/service-plans/:id/resume', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const plan = await prisma.servicePlan.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!plan) {
      return res.status(404).json({ error: 'Service plan not found' });
    }

    // Recalculate nextVisitAt
    const nextVisitAt = calculateNextVisitDate(plan.frequency, plan.dow, plan.dom, plan.startsOn);

    const updated = await prisma.servicePlan.update({
      where: { id: req.params.id },
      data: {
        status: 'active',
        nextVisitAt,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Service plan resume error:', error);
    res.status(500).json({ error: 'Failed to resume service plan' });
  }
});

app.post('/api/service-plans/:id/skip-next', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const plan = await prisma.servicePlan.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!plan) {
      return res.status(404).json({ error: 'Service plan not found' });
    }

    // Find and cancel next scheduled job if exists
    const nextJob = await prisma.job.findFirst({
      where: {
        planId: req.params.id,
        status: 'scheduled',
        windowStart: { gte: new Date() },
      },
      orderBy: { windowStart: 'asc' },
    });

    if (nextJob) {
      await prisma.job.update({
        where: { id: nextJob.id },
        data: { status: 'cancelled', cancelCode: 'SKIPPED_BY_PLAN' },
      });
    }

    // Recalculate nextVisitAt (skip one occurrence)
    const nextVisitAt = calculateNextVisitDate(plan.frequency, plan.dow, plan.dom, plan.nextVisitAt || plan.startsOn, true);

    const updated = await prisma.servicePlan.update({
      where: { id: req.params.id },
      data: { nextVisitAt },
    });

    res.json(updated);
  } catch (error) {
    console.error('Service plan skip-next error:', error);
    res.status(500).json({ error: 'Failed to skip next visit' });
  }
});

app.delete('/api/service-plans/:id', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();

    // Verify plan belongs to org before deleting
    const plan = await prisma.servicePlan.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!plan) {
      return res.status(404).json({ error: 'Service plan not found' });
    }

    await prisma.servicePlan.delete({
      where: { id: req.params.id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Service plan delete error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Service plan not found' });
    }
    res.status(500).json({ error: 'Failed to delete service plan', details: error.message });
  }
});

// Helper function to calculate next visit date
function calculateNextVisitDate(frequency, dow, dom, startsOn, skipOne = false) {
  if (!startsOn) {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return date;
  }

  const now = new Date();
  let nextDate = new Date(startsOn);

  if (skipOne) {
    if (frequency === 'weekly') {
      nextDate.setDate(nextDate.getDate() + 14); // Skip one week, add another
    } else if (frequency === 'biweekly') {
      nextDate.setDate(nextDate.getDate() + 28); // Skip one biweekly, add another
    } else if (frequency === 'monthly') {
      nextDate.setMonth(nextDate.getMonth() + 2); // Skip one month, add another
    }
  }

  // If the date is in the past, move it forward
  while (nextDate <= now) {
    if (frequency === 'weekly') {
      nextDate.setDate(nextDate.getDate() + 7);
    } else if (frequency === 'biweekly') {
      nextDate.setDate(nextDate.getDate() + 14);
    } else if (frequency === 'monthly') {
      nextDate.setMonth(nextDate.getMonth() + 1);
    }
  }

  return nextDate;
}

// Jobs endpoints
app.get('/api/jobs', async (req, res) => {
  try {
    const { date, status, carerId, clientId, page = '1', limit = '50' } = req.query;
    const orgId = await getDefaultOrgId();
    const where = {
      orgId,
    };

    if (date) {
      const dateStart = new Date(date);
      dateStart.setHours(0, 0, 0, 0);
      const dateEnd = new Date(dateStart);
      dateEnd.setDate(dateEnd.getDate() + 1);

      where.windowStart = {
        gte: dateStart,
        lt: dateEnd,
      };
    }

    if (status) {
      where.status = status;
    }

    if (carerId) {
      where.assignedCarerId = carerId;
    }

    if (clientId) {
      where.pool = { clientId: clientId };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        include: {
          pool: {
            include: {
              client: {
                select: { id: true, name: true, email: true, phone: true }
              }
            }
          },
          assignedCarer: {
            select: { id: true, name: true, phone: true }
          },
          plan: {
            select: { id: true, frequency: true }
          }
        },
        skip,
        take: parseInt(limit),
        orderBy: { windowStart: 'asc' },
      }),
      prisma.job.count({ where }),
    ]);

    res.json({
      items: jobs,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error('Jobs list error:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

app.get('/api/jobs/:id', async (req, res) => {
  try {
    const job = await prisma.job.findUnique({
      where: { id: req.params.id },
      include: {
        pool: {
          include: {
            client: {
              select: { id: true, name: true, email: true, phone: true, billingAddress: true }
            }
          }
        },
        assignedCarer: {
          select: { id: true, name: true, phone: true }
        },
        plan: {
          select: { id: true, frequency: true, dow: true, dom: true }
        }
      },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(job);
  } catch (error) {
    console.error('Job get error:', error);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

app.post('/api/jobs', async (req, res) => {
  try {
    console.log('Creating job with data:', req.body);
    const orgId = await getDefaultOrgId();
    const {
      poolId,
      planId,
      windowStart,
      windowEnd,
      assignedCarerId,
      status = 'scheduled',
      notes,
    } = req.body;

    // Validate required fields
    if (!poolId) {
      return res.status(400).json({ error: 'poolId is required' });
    }

    if (!windowStart || !windowEnd) {
      return res.status(400).json({ error: 'windowStart and windowEnd are required' });
    }

    // Validate pool belongs to org
    const pool = await prisma.pool.findFirst({
      where: { id: poolId, orgId },
    });

    if (!pool) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    // Validate dates
    const startDate = new Date(windowStart);
    const endDate = new Date(windowEnd);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    if (endDate <= startDate) {
      return res.status(400).json({ error: 'windowEnd must be after windowStart' });
    }

    const job = await prisma.job.create({
      data: {
        orgId,
        poolId,
        planId: planId || null,
        windowStart: startDate,
        windowEnd: endDate,
        assignedCarerId: assignedCarerId || null,
        status,
        notes: notes || null,
        slaMinutes: 120, // Default SLA
      },
      include: {
        pool: {
          include: {
            client: {
              select: { id: true, name: true, email: true, phone: true }
            }
          }
        },
        assignedCarer: {
          select: { id: true, name: true, phone: true }
        },
        plan: {
          select: { id: true, frequency: true }
        }
      },
    });

    console.log('Job created successfully:', job.id);
    res.status(201).json(job);
  } catch (error) {
    console.error('Job create error:', error);
    res.status(500).json({ 
      error: 'Failed to create job', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

app.patch('/api/jobs/:id', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const {
      windowStart,
      windowEnd,
      assignedCarerId,
      status,
      notes,
    } = req.body;

    // Verify job belongs to org
    const existing = await prisma.job.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const updateData = {};
    if (windowStart) updateData.windowStart = new Date(windowStart);
    if (windowEnd) updateData.windowEnd = new Date(windowEnd);
    if (assignedCarerId !== undefined) updateData.assignedCarerId = assignedCarerId || null;
    if (status) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;

    const job = await prisma.job.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        pool: {
          include: {
            client: {
              select: { id: true, name: true, email: true, phone: true }
            }
          }
        },
        assignedCarer: {
          select: { id: true, name: true, phone: true }
        },
        plan: {
          select: { id: true, frequency: true }
        }
      },
    });

    res.json(job);
  } catch (error) {
    console.error('Job update error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.status(500).json({ error: 'Failed to update job', details: error.message });
  }
});

app.post('/api/jobs/:id/assign', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const { carerId, sequence } = req.body;

    // Verify job belongs to org
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Verify carer belongs to org and is active
    if (carerId) {
      const carer = await prisma.carer.findFirst({
        where: { id: carerId, orgId, active: true },
      });

      if (!carer) {
        return res.status(404).json({ error: 'Carer not found or inactive' });
      }
    }

    const updated = await prisma.job.update({
      where: { id: req.params.id },
      data: {
        assignedCarerId: carerId || null,
        sequence: sequence || null,
      },
      include: {
        assignedCarer: {
          select: { id: true, name: true, phone: true }
        }
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Job assign error:', error);
    res.status(500).json({ error: 'Failed to assign job' });
  }
});

app.post('/api/jobs/:id/unassign', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();

    const job = await prisma.job.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const updated = await prisma.job.update({
      where: { id: req.params.id },
      data: {
        assignedCarerId: null,
        sequence: null,
        etaMinutes: null,
        distanceMeters: null,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Job unassign error:', error);
    res.status(500).json({ error: 'Failed to unassign job' });
  }
});

app.post('/api/jobs/:id/reschedule', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const { windowStart, windowEnd, reason } = req.body;

    const job = await prisma.job.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (!windowStart || !windowEnd) {
      return res.status(400).json({ error: 'windowStart and windowEnd are required' });
    }

    const updated = await prisma.job.update({
      where: { id: req.params.id },
      data: {
        windowStart: new Date(windowStart),
        windowEnd: new Date(windowEnd),
        notes: reason ? `${job.notes || ""}\nRescheduled: ${reason}`.trim() : job.notes,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Job reschedule error:', error);
    res.status(500).json({ error: 'Failed to reschedule job' });
  }
});

app.post('/api/jobs/:id/cancel', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const { code, reason } = req.body;

    const job = await prisma.job.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status === 'completed') {
      return res.status(400).json({ error: 'Cannot cancel completed job' });
    }

    const updated = await prisma.job.update({
      where: { id: req.params.id },
      data: {
        status: 'cancelled',
        cancelCode: code || 'OTHER',
        notes: reason ? `${job.notes || ""}\nCancelled: ${reason}`.trim() : job.notes,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Job cancel error:', error);
    res.status(500).json({ error: 'Failed to cancel job' });
  }
});

app.delete('/api/jobs/:id', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();

    const job = await prisma.job.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    await prisma.job.delete({
      where: { id: req.params.id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Job delete error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.status(500).json({ error: 'Failed to delete job', details: error.message });
  }
});

// Visits endpoints
app.get('/api/visits', async (req, res) => {
  try {
    const { jobId, clientId, poolId, completed, page = '1', limit = '50' } = req.query;
    const orgId = await getDefaultOrgId();
    const where = {
      orgId,
    };

    if (jobId) {
      where.jobId = jobId;
    }

    if (clientId) {
      where.job = {
        pool: { clientId: clientId }
      };
    }

    if (poolId) {
      where.job = { poolId: poolId };
    }

    if (completed !== undefined) {
      if (completed === 'true') {
        where.completedAt = { not: null };
      } else {
        where.completedAt = null;
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [visits, total] = await Promise.all([
      prisma.visitEntry.findMany({
        where,
        include: {
          job: {
            include: {
              pool: {
                include: {
                  client: {
                    select: { id: true, name: true, email: true, phone: true }
                  }
                }
              },
              assignedCarer: {
                select: { id: true, name: true, phone: true }
              }
            }
          },
          _count: {
            select: { readings: true, chemicals: true, photos: true }
          }
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.visitEntry.count({ where }),
    ]);

    res.json({
      items: visits,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error('Visits list error:', error);
    res.status(500).json({ error: 'Failed to fetch visits' });
  }
});

app.get('/api/visits/:id', async (req, res) => {
  try {
    const visit = await prisma.visitEntry.findUnique({
      where: { id: req.params.id },
      include: {
        job: {
          include: {
            plan: {
              select: { id: true, priceCents: true, currency: true }
            },
            pool: {
              include: {
                client: {
                  select: { id: true, name: true, email: true, phone: true, billingAddress: true }
                }
              }
            },
            assignedCarer: {
              select: { id: true, name: true, phone: true }
            }
          }
        },
        readings: {
          orderBy: { measuredAt: 'desc' }
        },
        chemicals: {
          orderBy: { createdAt: 'desc' }
        },
        photos: {
          orderBy: { takenAt: 'asc' }
        }
      },
    });

    if (!visit) {
      return res.status(404).json({ error: 'Visit not found' });
    }

    res.json(visit);
  } catch (error) {
    console.error('Visit get error:', error);
    res.status(500).json({ error: 'Failed to fetch visit' });
  }
});

app.post('/api/visits/:id/readings', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const {
      ph,
      chlorineFree,
      chlorineTotal,
      alkalinity,
      calciumHardness,
      cyanuricAcid,
      tempC,
      measuredAt,
    } = req.body;

    // Verify visit exists
    const visit = await prisma.visitEntry.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!visit) {
      return res.status(404).json({ error: 'Visit not found' });
    }

    const reading = await prisma.reading.create({
      data: {
        orgId,
        visitId: req.params.id,
        ph,
        chlorineFree,
        chlorineTotal,
        alkalinity,
        calciumHardness,
        cyanuricAcid,
        tempC,
        measuredAt: measuredAt ? new Date(measuredAt) : new Date(),
      },
    });

    res.status(201).json(reading);
  } catch (error) {
    console.error('Reading create error:', error);
    res.status(500).json({ error: 'Failed to add reading', details: error.message });
  }
});

app.post('/api/visits/:id/chemicals', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const {
      chemical,
      qty,
      unit,
      lotNo,
      costCents,
    } = req.body;

    // Verify visit exists
    const visit = await prisma.visitEntry.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!visit) {
      return res.status(404).json({ error: 'Visit not found' });
    }

    const chemicalRecord = await prisma.chemicalsUsed.create({
      data: {
        orgId,
        visitId: req.params.id,
        chemical,
        qty,
        unit,
        lotNo,
        costCents,
      },
    });

    res.status(201).json(chemicalRecord);
  } catch (error) {
    console.error('Chemical create error:', error);
    res.status(500).json({ error: 'Failed to add chemical', details: error.message });
  }
});

// Approve visit for payment
app.post('/api/visits/:id/approve', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const { paymentAmountCents, approvedBy } = req.body;

    // Get visit with job and assigned carer to determine payment amount
    const visit = await prisma.visitEntry.findFirst({
      where: { id: req.params.id, orgId },
      include: {
        job: {
          include: {
            plan: {
              select: { priceCents: true, currency: true },
            },
            assignedCarer: {
              select: { id: true, ratePerVisitCents: true, currency: true },
            },
          },
        },
      },
    });

    if (!visit) {
      return res.status(404).json({ error: 'Visit not found' });
    }

    if (!visit.completedAt) {
      return res.status(400).json({ error: 'Visit must be completed before approval' });
    }

    // Priority: provided amount > carer's fixed rate > service plan price
    // The carer data is already included in the visit query above
    const amountCents =
      paymentAmountCents ||
      visit.job.assignedCarer?.ratePerVisitCents ||
      visit.job.plan?.priceCents ||
      0;

    if (amountCents <= 0) {
      return res.status(400).json({ error: 'Payment amount must be greater than 0' });
    }

    const updated = await prisma.visitEntry.update({
      where: { id: req.params.id },
      data: {
        approvedAt: new Date(),
        approvedBy: approvedBy || null,
        paymentAmountCents: amountCents,
        paymentStatus: 'approved',
      },
      include: {
        job: {
          include: {
            assignedCarer: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Visit approve error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Visit not found' });
    }
    res.status(500).json({ error: 'Failed to approve visit', details: error.message });
  }
});

app.post('/api/visits/:id/complete', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const {
      signatureUrl,
      rating,
      feedback,
    } = req.body;

    // Verify visit exists
    const visit = await prisma.visitEntry.findFirst({
      where: { id: req.params.id, orgId },
      include: { job: true },
    });

    if (!visit) {
      return res.status(404).json({ error: 'Visit not found' });
    }

    if (visit.job.status !== 'on_site') {
      return res.status(400).json({ error: 'Job must be on_site to complete visit' });
    }

    // Update visit
    const updated = await prisma.visitEntry.update({
      where: { id: req.params.id },
      data: {
        completedAt: new Date(),
        clientSignatureUrl: signatureUrl,
        rating,
        feedback,
      },
      include: {
        job: true,
      },
    });

    // Update job status
    await prisma.job.update({
      where: { id: visit.jobId },
      data: { status: 'completed' },
    });

    // Update service plan lastVisitAt if applicable
    if (visit.job.planId) {
      await prisma.servicePlan.update({
        where: { id: visit.job.planId },
        data: { lastVisitAt: new Date() },
      });
    }

    res.json(updated);
  } catch (error) {
    console.error('Visit complete error:', error);
    res.status(500).json({ error: 'Failed to complete visit', details: error.message });
  }
});

// Issues endpoints
app.get('/api/issues', async (req, res) => {
  try {
    const { poolId, status, severity, query, page = '1', limit = '50' } = req.query;
    const orgId = await getDefaultOrgId();
    const where = {
      orgId,
    };

    if (poolId) {
      where.poolId = poolId;
    }

    if (status) {
      where.status = status;
    }

    if (severity) {
      where.severity = severity;
    }

    if (query) {
      where.OR = [
        { description: { contains: query, mode: 'insensitive' } },
        { type: { contains: query, mode: 'insensitive' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [issues, total] = await Promise.all([
      prisma.issue.findMany({
        where,
        include: {
          pool: {
            include: {
              client: {
                select: { id: true, name: true, email: true, phone: true }
              }
            }
          },
          visit: {
            select: { id: true, completedAt: true }
          },
          quote: {
            select: { id: true, status: true, totalCents: true }
          },
          _count: {
            select: { photos: true }
          }
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.issue.count({ where }),
    ]);

    res.json({
      items: issues,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error('Issues list error:', error);
    res.status(500).json({ error: 'Failed to fetch issues' });
  }
});

app.get('/api/issues/:id', async (req, res) => {
  try {
    const issue = await prisma.issue.findUnique({
      where: { id: req.params.id },
      include: {
        pool: {
          include: {
            client: {
              select: { id: true, name: true, email: true, phone: true, billingAddress: true }
            }
          }
        },
        visit: {
          include: {
            job: {
              include: {
                assignedCarer: {
                  select: { id: true, name: true }
                }
              }
            }
          }
        },
        quote: {
          include: {
            audits: {
              orderBy: { createdAt: 'desc' },
              take: 10
            }
          }
        },
        photos: {
          orderBy: { takenAt: 'asc' }
        }
      },
    });

    if (!issue) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    res.json(issue);
  } catch (error) {
    console.error('Issue get error:', error);
    res.status(500).json({ error: 'Failed to fetch issue' });
  }
});

app.post('/api/issues', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const {
      visitId,
      poolId,
      type,
      severity,
      description,
      requiresQuote,
      photos,
    } = req.body;

    // Validate pool belongs to org
    const pool = await prisma.pool.findFirst({
      where: { id: poolId, orgId },
    });

    if (!pool) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    const issue = await prisma.issue.create({
      data: {
        orgId,
        visitId: visitId || null,
        poolId,
        type,
        severity,
        description,
        requiresQuote: requiresQuote || false,
      },
      include: {
        pool: {
          include: {
            client: {
              select: { id: true, name: true, email: true, phone: true }
            }
          }
        }
      },
    });

    // Link photos if provided
    if (photos && photos.length > 0) {
      await prisma.photo.updateMany({
        where: {
          id: { in: photos },
          orgId,
        },
        data: {
          issueId: issue.id,
          label: 'issue',
        },
      });
    }

    res.status(201).json(issue);
  } catch (error) {
    console.error('Issue create error:', error);
    res.status(500).json({ error: 'Failed to create issue', details: error.message });
  }
});

app.patch('/api/issues/:id', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const {
      type,
      severity,
      description,
      status,
      requiresQuote,
    } = req.body;

    // Verify issue belongs to org
    const existing = await prisma.issue.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    const updateData = {};
    if (type) updateData.type = type;
    if (severity) updateData.severity = severity;
    if (description) updateData.description = description;
    if (status) updateData.status = status;
    if (requiresQuote !== undefined) updateData.requiresQuote = requiresQuote;

    const issue = await prisma.issue.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        pool: {
          include: {
            client: {
              select: { id: true, name: true, email: true, phone: true }
            }
          }
        }
      },
    });

    res.json(issue);
  } catch (error) {
    console.error('Issue update error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Issue not found' });
    }
    res.status(500).json({ error: 'Failed to update issue', details: error.message });
  }
});

// Quotes endpoints
app.get('/api/quotes', async (req, res) => {
  try {
    const { poolId, clientId, status, page = '1', limit = '50' } = req.query;
    const orgId = await getDefaultOrgId();
    const where = {
      orgId,
    };

    if (poolId) {
      where.poolId = poolId;
    }

    if (clientId) {
      where.clientId = clientId;
    }

    if (status) {
      where.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [quotes, total] = await Promise.all([
      prisma.quote.findMany({
        where,
        include: {
          pool: {
            include: {
              client: {
                select: { id: true, name: true, email: true, phone: true }
              }
            }
          },
          issue: {
            select: { id: true, type: true, severity: true, description: true }
          },
          _count: {
            select: { audits: true }
          }
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.quote.count({ where }),
    ]);

    res.json({
      items: quotes,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error('Quotes list error:', error);
    res.status(500).json({ error: 'Failed to fetch quotes' });
  }
});

app.get('/api/quotes/:id', async (req, res) => {
  try {
    const quote = await prisma.quote.findUnique({
      where: { id: req.params.id },
      include: {
        pool: {
          include: {
            client: {
              select: { id: true, name: true, email: true, phone: true, billingAddress: true }
            }
          }
        },
        issue: {
          include: {
            photos: {
              orderBy: { takenAt: 'asc' }
            }
          }
        },
        audits: {
          orderBy: { createdAt: 'desc' }
        }
      },
    });

    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    res.json(quote);
  } catch (error) {
    console.error('Quote get error:', error);
    res.status(500).json({ error: 'Failed to fetch quote' });
  }
});

app.post('/api/quotes', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const {
      issueId,
      poolId,
      currency = 'GHS',
      items,
      notes,
    } = req.body;

    // Validate required fields
    if (!poolId) {
      return res.status(400).json({ error: 'poolId is required' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array is required and must not be empty' });
    }

    // Validate pool belongs to org
    const pool = await prisma.pool.findFirst({
      where: { id: poolId, orgId },
      include: { client: true },
    });

    if (!pool) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    // Validate items have required fields
    for (const item of items) {
      if (!item.label || !item.label.trim()) {
        return res.status(400).json({ error: 'All items must have a label' });
      }
      if (!item.qty || item.qty <= 0) {
        return res.status(400).json({ error: 'All items must have a quantity greater than 0' });
      }
      if (!item.unitPriceCents && item.unitPriceCents !== 0) {
        return res.status(400).json({ error: 'All items must have a unit price' });
      }
    }

    // Calculate totals
    let subtotalCents = 0;
    let taxCents = 0;

    for (const item of items) {
      const lineTotal = item.qty * item.unitPriceCents;
      subtotalCents += lineTotal;
      taxCents += lineTotal * (item.taxPct || 0) / 100;
    }

    const totalCents = Math.round(subtotalCents + taxCents);

    // If issueId provided, update issue status
    if (issueId) {
      const issue = await prisma.issue.findFirst({
        where: { id: issueId, orgId, poolId },
      });

      if (!issue) {
        return res.status(404).json({ error: 'Issue not found' });
      }

      await prisma.issue.update({
        where: { id: issueId },
        data: { status: 'quoted' },
      });
    }

    const quote = await prisma.quote.create({
      data: {
        orgId,
        issueId: issueId || null,
        poolId,
        clientId: pool.clientId,
        currency,
        items: items,
        subtotalCents: Math.round(subtotalCents),
        taxCents: Math.round(taxCents),
        totalCents,
        notes,
      },
      include: {
        pool: {
          include: {
            client: {
              select: { id: true, name: true, email: true, phone: true }
            }
          }
        },
        issue: {
          select: { id: true, type: true, severity: true }
        }
      },
    });

    res.status(201).json(quote);
  } catch (error) {
    console.error('Quote create error:', error);
    res.status(500).json({ error: 'Failed to create quote', details: error.message });
  }
});

app.post('/api/quotes/:id/approve', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const quote = await prisma.quote.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    if (quote.status !== 'pending') {
      return res.status(400).json({ error: 'Quote is not pending approval' });
    }

    const updated = await prisma.quote.update({
      where: { id: req.params.id },
      data: {
        status: 'approved',
        approvedAt: new Date(),
      },
      include: {
        pool: {
          include: {
            client: {
              select: { id: true, name: true, email: true, phone: true }
            }
          }
        }
      },
    });

    // Update issue status if linked
    if (quote.issueId) {
      await prisma.issue.update({
        where: { id: quote.issueId },
        data: { status: 'scheduled' },
      });
    }

    res.json(updated);
  } catch (error) {
    console.error('Quote approve error:', error);
    res.status(500).json({ error: 'Failed to approve quote' });
  }
});

app.post('/api/quotes/:id/reject', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const { reason } = req.body;
    const quote = await prisma.quote.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    if (quote.status !== 'pending') {
      return res.status(400).json({ error: 'Quote is not pending' });
    }

    const updated = await prisma.quote.update({
      where: { id: req.params.id },
      data: {
        status: 'rejected',
        rejectedAt: new Date(),
        rejectionReason: reason,
      },
      include: {
        pool: {
          include: {
            client: {
              select: { id: true, name: true, email: true, phone: true }
            }
          }
        }
      },
    });

    // Update issue status if linked
    if (quote.issueId) {
      await prisma.issue.update({
        where: { id: quote.issueId },
        data: { status: 'open' },
      });
    }

    res.json(updated);
  } catch (error) {
    console.error('Quote reject error:', error);
    res.status(500).json({ error: 'Failed to reject quote' });
  }
});

app.patch('/api/quotes/:id', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const {
      currency,
      items,
      notes,
    } = req.body;

    // Verify quote belongs to org
    const existing = await prisma.quote.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    if (existing.status !== 'pending') {
      return res.status(400).json({ error: 'Can only update pending quotes' });
    }

    const updateData = {};
    if (currency) updateData.currency = currency;
    if (notes !== undefined) updateData.notes = notes;

    if (items) {
      // Recalculate totals
      let subtotalCents = 0;
      let taxCents = 0;

      for (const item of items) {
        const lineTotal = item.qty * item.unitPriceCents;
        subtotalCents += lineTotal;
        taxCents += lineTotal * (item.taxPct || 0) / 100;
      }

      updateData.items = items;
      updateData.subtotalCents = Math.round(subtotalCents);
      updateData.taxCents = Math.round(taxCents);
      updateData.totalCents = Math.round(subtotalCents + taxCents);
    }

    const quote = await prisma.quote.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        pool: {
          include: {
            client: {
              select: { id: true, name: true, email: true, phone: true }
            }
          }
        }
      },
    });

    res.json(quote);
  } catch (error) {
    console.error('Quote update error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Quote not found' });
    }
    res.status(500).json({ error: 'Failed to update quote', details: error.message });
  }
});

app.delete('/api/quotes/:id', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();

    const quote = await prisma.quote.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    await prisma.quote.delete({
      where: { id: req.params.id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Quote delete error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Quote not found' });
    }
    res.status(500).json({ error: 'Failed to delete quote', details: error.message });
  }
});

// Helper function to generate invoice number
async function generateInvoiceNumber(orgId) {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;

  const lastInvoice = await prisma.invoice.findFirst({
    where: {
      orgId,
      invoiceNumber: {
        startsWith: prefix,
      },
    },
    orderBy: { invoiceNumber: 'desc' },
  });

  if (!lastInvoice) {
    return `${prefix}0001`;
  }

  const lastNum = parseInt(lastInvoice.invoiceNumber.replace(prefix, ''));
  return `${prefix}${String(lastNum + 1).padStart(4, '0')}`;
}

// Helper function to calculate invoice totals
function calculateInvoiceTotals(items) {
  let subtotalCents = 0;
  let taxCents = 0;

  for (const item of items) {
    const lineTotal = item.qty * item.unitPriceCents;
    subtotalCents += lineTotal;
    taxCents += lineTotal * (item.taxPct || 0) / 100;
  }

  return {
    subtotalCents: Math.round(subtotalCents),
    taxCents: Math.round(taxCents),
    totalCents: Math.round(subtotalCents + taxCents),
  };
}

// Invoices endpoints
app.get('/api/invoices', async (req, res) => {
  try {
    const { clientId, poolId, status, visitId, quoteId, page = '1', limit = '50' } = req.query;
    const orgId = await getDefaultOrgId();
    const where = {
      orgId,
    };

    if (clientId) {
      where.clientId = clientId;
    }

    if (poolId) {
      where.poolId = poolId;
    }

    if (status) {
      where.status = status;
    }

    if (visitId) {
      where.visitId = visitId;
    }

    if (quoteId) {
      where.quoteId = quoteId;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          client: {
            select: { id: true, name: true, email: true, phone: true }
          },
          pool: {
            select: { id: true, name: true }
          },
          visit: {
            select: { id: true, completedAt: true }
          },
          quote: {
            select: { id: true, status: true, totalCents: true }
          },
          _count: {
            select: { payments: true }
          }
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.invoice.count({ where }),
    ]);

    res.json({
      items: invoices,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error('Invoices list error:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

app.get('/api/invoices/:id', async (req, res) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: {
        client: {
          select: { id: true, name: true, email: true, phone: true, billingAddress: true }
        },
        pool: {
          select: { id: true, name: true, address: true }
        },
        visit: {
          select: { id: true, completedAt: true }
        },
        quote: {
          select: { id: true, status: true, totalCents: true }
        },
        payments: {
          orderBy: { createdAt: 'desc' }
        }
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json(invoice);
  } catch (error) {
    console.error('Invoice get error:', error);
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

app.post('/api/invoices', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const {
      clientId,
      poolId,
      visitId,
      quoteId,
      currency = 'GHS',
      items,
      dueDate,
      notes,
    } = req.body;

    // Validate required fields
    if (!clientId) {
      return res.status(400).json({ error: 'clientId is required' });
    }

    // Verify client belongs to org
    const client = await prisma.client.findFirst({
      where: { id: clientId, orgId },
    });

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Verify pool if provided
    if (poolId) {
      const pool = await prisma.pool.findFirst({
        where: { id: poolId, orgId, clientId },
      });

      if (!pool) {
        return res.status(404).json({ error: 'Pool not found' });
      }
    }

    // If quote provided, copy items from quote
    let invoiceItems = items;
    if (quoteId && !items) {
      const quote = await prisma.quote.findFirst({
        where: { id: quoteId, orgId, status: 'approved' },
      });

      if (!quote) {
        return res.status(404).json({ error: 'Quote not found or not approved' });
      }

      invoiceItems = quote.items;
    }

    if (!invoiceItems || !Array.isArray(invoiceItems) || invoiceItems.length === 0) {
      return res.status(400).json({ error: 'items array is required and must not be empty' });
    }

    // Calculate totals
    const totals = calculateInvoiceTotals(invoiceItems);
    const invoiceNumber = await generateInvoiceNumber(orgId);

    const invoice = await prisma.invoice.create({
      data: {
        orgId,
        clientId,
        poolId: poolId || null,
        visitId: visitId || null,
        quoteId: quoteId || null,
        invoiceNumber,
        currency,
        items: invoiceItems,
        subtotalCents: totals.subtotalCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        paidCents: 0,
        dueDate: dueDate ? new Date(dueDate) : null,
        notes: notes || null,
        status: 'draft',
      },
      include: {
        client: {
          select: { id: true, name: true, email: true, phone: true }
        },
        pool: {
          select: { id: true, name: true }
        }
      },
    });

    res.status(201).json(invoice);
  } catch (error) {
    console.error('Invoice create error:', error);
    res.status(500).json({ error: 'Failed to create invoice', details: error.message });
  }
});

app.patch('/api/invoices/:id', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const {
      items,
      currency,
      dueDate,
      notes,
      status,
    } = req.body;

    // Verify invoice belongs to org
    const existing = await prisma.invoice.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Can't edit if already paid or cancelled
    if (existing.status === 'paid' || existing.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot edit paid or cancelled invoice' });
    }

    const updateData = {};
    if (currency) updateData.currency = currency;
    if (dueDate) updateData.dueDate = new Date(dueDate);
    if (notes !== undefined) updateData.notes = notes;
    if (status) updateData.status = status;

    if (items && Array.isArray(items) && items.length > 0) {
      // Recalculate totals
      const totals = calculateInvoiceTotals(items);
      updateData.items = items;
      updateData.subtotalCents = totals.subtotalCents;
      updateData.taxCents = totals.taxCents;
      updateData.totalCents = totals.totalCents;
    }

    const invoice = await prisma.invoice.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        client: {
          select: { id: true, name: true, email: true, phone: true }
        },
        pool: {
          select: { id: true, name: true }
        }
      },
    });

    res.json(invoice);
  } catch (error) {
    console.error('Invoice update error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    res.status(500).json({ error: 'Failed to update invoice', details: error.message });
  }
});

app.post('/api/invoices/:id/send', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();

    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (invoice.status !== 'draft') {
      return res.status(400).json({ error: 'Can only send draft invoices' });
    }

    const updated = await prisma.invoice.update({
      where: { id: req.params.id },
      data: {
        status: 'sent',
        issuedAt: new Date(),
      },
      include: {
        client: {
          select: { id: true, name: true, email: true, phone: true }
        }
      },
    });

    // TODO: Send notification to client (email/SMS/WhatsApp)

    res.json(updated);
  } catch (error) {
    console.error('Invoice send error:', error);
    res.status(500).json({ error: 'Failed to send invoice' });
  }
});

app.delete('/api/invoices/:id', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();

    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Can only delete draft invoices
    if (invoice.status !== 'draft') {
      return res.status(400).json({ error: 'Can only delete draft invoices' });
    }

    await prisma.invoice.delete({
      where: { id: req.params.id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Invoice delete error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    res.status(500).json({ error: 'Failed to delete invoice', details: error.message });
  }
});

// Auto-generate monthly invoices for all active service plans
// This should be called daily via cron job (runs at 2:00 AM)
app.post('/api/invoices/auto-generate-monthly', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    // Get previous month (last month we should bill for)
    const previousMonthEnd = new Date(firstDayOfMonth);
    previousMonthEnd.setDate(previousMonthEnd.getDate() - 1); // Last day of previous month
    const previousMonthStart = new Date(previousMonthEnd.getFullYear(), previousMonthEnd.getMonth(), 1);

    // Find all active service plans
    const plans = await prisma.servicePlan.findMany({
      where: {
        orgId,
        status: 'active',
      },
      include: {
        pool: {
          include: {
            client: true,
          },
        },
      },
    });

    const results = {
      generated: [],
      skipped: [],
      errors: [],
    };

    for (const plan of plans) {
      try {
        // Check if monthly invoice already exists
        const existing = await prisma.invoice.findFirst({
          where: {
            orgId,
            clientId: plan.pool.clientId,
            poolId: plan.poolId,
            metadata: {
              path: ['servicePlanId'],
              equals: plan.id,
            },
            createdAt: {
              gte: previousMonthStart,
              lte: previousMonthEnd,
            },
          },
        });

        if (existing) {
          results.skipped.push({ planId: plan.id, reason: 'Invoice already exists' });
          continue;
        }

        // Find completed visits for previous month
        const visits = await prisma.visitEntry.findMany({
          where: {
            orgId,
            completedAt: {
              gte: previousMonthStart,
              lte: previousMonthEnd,
            },
            job: {
              planId: plan.id,
              status: 'completed',
            },
          },
          orderBy: {
            completedAt: 'asc',
          },
        });

        if (visits.length === 0) {
          results.skipped.push({ planId: plan.id, reason: 'No completed visits' });
          continue;
        }

        // Generate invoice
        const items = visits.map((visit) => ({
          label: `Service Visit - ${new Date(visit.completedAt).toLocaleDateString()}`,
          qty: 1,
          unitPriceCents: plan.priceCents,
          taxPct: plan.taxPct || 0,
          visitId: visit.id,
          visitDate: visit.completedAt.toISOString(),
        }));

        const totals = calculateInvoiceTotals(items);
        const invoiceNumber = await generateInvoiceNumber(orgId);

        const dueDate = new Date(today);
        dueDate.setDate(dueDate.getDate() + 7); // Due in 7 days

        const invoice = await prisma.invoice.create({
          data: {
            orgId,
            clientId: plan.pool.clientId,
            poolId: plan.poolId,
            invoiceNumber,
            currency: plan.currency,
            items: items,
            subtotalCents: totals.subtotalCents,
            taxCents: totals.taxCents,
            totalCents: totals.totalCents,
            paidCents: 0,
            dueDate,
            notes: `Monthly maintenance for ${previousMonthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} - ${visits.length} visit(s)`,
            metadata: {
              servicePlanId: plan.id,
              periodStart: previousMonthStart.toISOString().split('T')[0],
              periodEnd: previousMonthEnd.toISOString().split('T')[0],
              visitCount: visits.length,
              billingType: 'monthly',
              autoGenerated: true,
            },
            status: 'sent', // Auto-send monthly invoices
            issuedAt: new Date(),
          },
        });

        results.generated.push({
          planId: plan.id,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          visitCount: visits.length,
          totalCents: invoice.totalCents,
        });
      } catch (error) {
        results.errors.push({
          planId: plan.id,
          error: error.message,
        });
      }
    }

    res.json({
      message: `Processed ${plans.length} service plans`,
      previousMonth: {
        start: previousMonthStart.toISOString().split('T')[0],
        end: previousMonthEnd.toISOString().split('T')[0],
      },
      results,
    });
  } catch (error) {
    console.error('Auto-generate monthly invoices error:', error);
    res.status(500).json({ error: 'Failed to auto-generate monthly invoices', details: error.message });
  }
});

// Monthly invoice generation endpoint (manual or for specific plan)
app.post('/api/invoices/generate-monthly', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const {
      servicePlanId,
      periodStart, // YYYY-MM-DD
      periodEnd,   // YYYY-MM-DD
      billingDate, // YYYY-MM-DD (when invoice should be sent)
    } = req.body;

    if (!servicePlanId || !periodStart || !periodEnd) {
      return res.status(400).json({ error: 'servicePlanId, periodStart, and periodEnd are required' });
    }

    // Get service plan
    const plan = await prisma.servicePlan.findFirst({
      where: { id: servicePlanId, orgId },
      include: {
        pool: {
          include: {
            client: true,
          },
        },
      },
    });

    if (!plan) {
      return res.status(404).json({ error: 'Service plan not found' });
    }

    // Find all completed visits for this plan in the period
    const periodStartDate = new Date(periodStart);
    periodStartDate.setHours(0, 0, 0, 0);
    const periodEndDate = new Date(periodEnd);
    periodEndDate.setHours(23, 59, 59, 999);

    const visits = await prisma.visitEntry.findMany({
      where: {
        orgId,
        completedAt: {
          gte: periodStartDate,
          lte: periodEndDate,
        },
        job: {
          planId: servicePlanId,
          status: 'completed',
        },
      },
      include: {
        job: {
          select: {
            windowStart: true,
            windowEnd: true,
          },
        },
      },
      orderBy: {
        completedAt: 'asc',
      },
    });

    if (visits.length === 0) {
      return res.status(400).json({ error: 'No completed visits found for this period' });
    }

    // Check if monthly invoice already exists for this period
    const existingInvoice = await prisma.invoice.findFirst({
      where: {
        orgId,
        clientId: plan.pool.clientId,
        poolId: plan.poolId,
        metadata: {
          path: ['servicePlanId'],
          equals: servicePlanId,
        },
        createdAt: {
          gte: periodStartDate,
          lte: periodEndDate,
        },
      },
    });

    if (existingInvoice) {
      return res.status(400).json({ error: 'Monthly invoice already exists for this period' });
    }

    // Create invoice items - one per visit or aggregate
    const items = visits.map((visit) => ({
      label: `Service Visit - ${new Date(visit.completedAt).toLocaleDateString()}`,
      qty: 1,
      unitPriceCents: plan.priceCents,
      taxPct: plan.taxPct || 0,
      visitId: visit.id,
      visitDate: visit.completedAt.toISOString(),
    }));

    // Calculate totals
    const totals = calculateInvoiceTotals(items);
    const invoiceNumber = await generateInvoiceNumber(orgId);

    // Calculate due date (billing date + 7 days default)
    const dueDate = billingDate
      ? new Date(billingDate)
      : new Date(periodEndDate);
    dueDate.setDate(dueDate.getDate() + 7);

    const invoice = await prisma.invoice.create({
      data: {
        orgId,
        clientId: plan.pool.clientId,
        poolId: plan.poolId,
        invoiceNumber,
        currency: plan.currency,
        items: items,
        subtotalCents: totals.subtotalCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        paidCents: 0,
        dueDate,
        notes: `Monthly maintenance for ${new Date(periodStart).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} - ${visits.length} visit(s)`,
        metadata: {
          servicePlanId,
          periodStart: periodStart,
          periodEnd: periodEnd,
          visitCount: visits.length,
          billingType: 'monthly',
          autoGenerated: false,
        },
        status: billingDate ? 'sent' : 'draft',
        issuedAt: billingDate ? new Date() : null,
      },
      include: {
        client: {
          select: { id: true, name: true, email: true, phone: true },
        },
        pool: {
          select: { id: true, name: true },
        },
      },
    });

    res.status(201).json(invoice);
  } catch (error) {
    console.error('Monthly invoice generation error:', error);
    res.status(500).json({ error: 'Failed to generate monthly invoice', details: error.message });
  }
});

// Get monthly invoice for a service plan
app.get('/api/service-plans/:id/monthly-invoice', async (req, res) => {
  try {
    const { periodStart, periodEnd } = req.query;
    const orgId = await getDefaultOrgId();

    if (!periodStart || !periodEnd) {
      return res.status(400).json({ error: 'periodStart and periodEnd query params are required' });
    }

    const invoice = await prisma.invoice.findFirst({
      where: {
        orgId,
        metadata: {
          path: ['servicePlanId'],
          equals: req.params.id,
        },
        createdAt: {
          gte: new Date(periodStart),
          lte: new Date(periodEnd),
        },
      },
      include: {
        client: true,
        pool: true,
        payments: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Monthly invoice not found for this period' });
    }

    res.json(invoice);
  } catch (error) {
    console.error('Get monthly invoice error:', error);
    res.status(500).json({ error: 'Failed to fetch monthly invoice' });
  }
});

// Payment endpoints (Paystack)
app.post('/api/invoices/:id/pay/paystack', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const { amountCents } = req.body;

    // Get invoice
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, orgId },
      include: {
        client: {
          select: { id: true, name: true, email: true, phone: true }
        }
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (invoice.status === 'paid') {
      return res.status(400).json({ error: 'Invoice is already fully paid' });
    }

    // Calculate amount to charge (default to balance, or use provided amount)
    const balanceCents = invoice.totalCents - invoice.paidCents;
    const chargeAmount = amountCents || balanceCents;

    if (chargeAmount <= 0) {
      return res.status(400).json({ error: 'No amount to charge' });
    }

    if (chargeAmount > balanceCents) {
      return res.status(400).json({ error: 'Amount exceeds outstanding balance' });
    }

    // Generate reference
    const reference = `INV-${invoice.invoiceNumber}-${Date.now()}`;

    // For now, return a mock Paystack initialization response
    // In production, this would call Paystack API:
    // const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({
    //     amount: chargeAmount,
    //     email: invoice.client.email || invoice.client.phone + '@poolcare.com',
    //     reference,
    //     metadata: {
    //       orgId,
    //       invoiceId: invoice.id,
    //       clientId: invoice.clientId,
    //     },
    //     callback_url: `${process.env.APP_URL}/invoices/${invoice.id}?payment=success`,
    //   }),
    // });

    // Mock response for development
    res.json({
      authorization_url: `https://paystack.com/pay/${reference}`,
      reference,
      amount: chargeAmount,
      currency: invoice.currency,
    });
  } catch (error) {
    console.error('Paystack init error:', error);
    res.status(500).json({ error: 'Failed to initialize payment', details: error.message });
  }
});

// Paystack webhook handler
app.post('/webhooks/paystack', async (req, res) => {
  try {
    // Verify signature (in production)
    // const signature = req.headers['x-paystack-signature'];
    // const hash = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    //   .update(JSON.stringify(req.body))
    //   .digest('hex');
    // if (hash !== signature) {
    //   return res.status(401).json({ error: 'Invalid signature' });
    // }

    const { event, data } = req.body;

    if (event === 'charge.success') {
      const { reference, amount, metadata, customer } = data;
      
      if (!metadata || !metadata.invoiceId) {
        return res.status(400).json({ error: 'Missing invoice metadata' });
      }

      const orgId = metadata.orgId || await getDefaultOrgId();
      
      // Check if payment already exists (idempotency)
      const existingPayment = await prisma.payment.findFirst({
        where: {
          providerRef: reference,
          orgId,
        },
      });

      if (existingPayment) {
        return res.json({ ok: true, message: 'Payment already processed' });
      }

      // Create payment record
      const invoice = await prisma.invoice.findFirst({
        where: { id: metadata.invoiceId, orgId },
      });

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      const payment = await prisma.payment.create({
        data: {
          orgId,
          invoiceId: metadata.invoiceId,
          method: data.channel || 'card',
          provider: 'paystack',
          providerRef: reference,
          amountCents: amount,
          currency: data.currency || 'GHS',
          status: 'completed',
          metadata: data,
          processedAt: new Date(),
        },
      });

      // Update invoice paid amount
      const totalPaid = await prisma.payment.aggregate({
        where: {
          invoiceId: metadata.invoiceId,
          status: 'completed',
        },
        _sum: {
          amountCents: true,
        },
      });

      const paidCents = totalPaid._sum.amountCents || 0;
      const balanceCents = invoice.totalCents - paidCents;

      // Update invoice status
      let newStatus = invoice.status;
      if (balanceCents <= 0) {
        newStatus = 'paid';
      } else if (paidCents > 0 && invoice.status === 'sent') {
        // Keep as 'sent' but balance will show remaining
      }

      await prisma.invoice.update({
        where: { id: metadata.invoiceId },
        data: {
          paidCents,
          status: newStatus,
          paidAt: balanceCents <= 0 ? new Date() : invoice.paidAt,
        },
      });

      // Auto-generate receipt
      try {
        const year = new Date().getFullYear();
        const prefix = `REC-${year}-`;
        const lastReceipt = await prisma.receipt.findFirst({
          where: {
            orgId,
            receiptNumber: {
              startsWith: prefix,
            },
          },
          orderBy: { receiptNumber: 'desc' },
        });

        const lastNum = lastReceipt 
          ? parseInt(lastReceipt.receiptNumber.replace(prefix, ''))
          : 0;
        const receiptNumber = `${prefix}${String(lastNum + 1).padStart(4, '0')}`;

        await prisma.receipt.create({
          data: {
            orgId,
            invoiceId: metadata.invoiceId,
            paymentId: payment.id,
            receiptNumber,
            issuedAt: new Date(),
          },
        });
      } catch (error) {
        console.error('Auto-generate receipt error:', error);
        // Don't fail payment if receipt generation fails
      }

      res.json({ ok: true, paymentId: payment.id });
    } else {
      res.json({ ok: true, message: 'Event not processed' });
    }
  } catch (error) {
    console.error('Paystack webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed', details: error.message });
  }
});

// Get payments list
app.get('/api/payments', async (req, res) => {
  try {
    const { invoiceId, clientId, status, method, from, to, page = '1', limit = '50' } = req.query;
    const orgId = await getDefaultOrgId();
    const where = {
      orgId,
    };

    if (invoiceId) {
      where.invoiceId = invoiceId;
    }

    if (status) {
      where.status = status;
    }

    if (method) {
      where.method = method;
    }

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = toDate;
      }
    }

    // If clientId provided, filter by invoice client
    if (clientId) {
      where.invoice = {
        clientId,
      };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              client: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.payment.count({ where }),
    ]);

    res.json({
      items: payments,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error('Payments list error:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// Manual payment endpoint (for cash/bank transfers)
app.post('/api/payments', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const {
      invoiceId,
      method,
      amountCents,
      currency = 'GHS',
      reference,
      processedAt,
    } = req.body;

    if (!invoiceId || !method || !amountCents) {
      return res.status(400).json({ error: 'invoiceId, method, and amountCents are required' });
    }

    // Verify invoice belongs to org
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, orgId },
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const outstandingBalance = invoice.totalCents - invoice.paidCents;
    if (amountCents > outstandingBalance) {
      return res.status(400).json({ error: 'Amount exceeds outstanding balance' });
    }

    // Create payment
    const payment = await prisma.payment.create({
      data: {
        orgId,
        invoiceId,
        method,
        amountCents,
        currency,
        providerRef: reference || null,
        status: 'completed',
        processedAt: processedAt ? new Date(processedAt) : new Date(),
      },
    });

    // Update invoice paid amount
    const totalPaid = await prisma.payment.aggregate({
      where: {
        invoiceId,
        status: 'completed',
      },
      _sum: {
        amountCents: true,
      },
    });

    const paidCents = totalPaid._sum.amountCents || 0;
    const newBalance = invoice.totalCents - paidCents;

    let newStatus = invoice.status;
    if (newBalance <= 0) {
      newStatus = 'paid';
    }

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        paidCents,
        status: newStatus,
        paidAt: newBalance <= 0 ? new Date() : invoice.paidAt,
      },
    });

    // Auto-generate receipt
    try {
      const year = new Date().getFullYear();
      const prefix = `REC-${year}-`;
      const lastReceipt = await prisma.receipt.findFirst({
        where: {
          orgId,
          receiptNumber: {
            startsWith: prefix,
          },
        },
        orderBy: { receiptNumber: 'desc' },
      });

      const lastNum = lastReceipt 
        ? parseInt(lastReceipt.receiptNumber.replace(prefix, ''))
        : 0;
      const receiptNumber = `${prefix}${String(lastNum + 1).padStart(4, '0')}`;

      await prisma.receipt.create({
        data: {
          orgId,
          invoiceId,
          paymentId: payment.id,
          receiptNumber,
          issuedAt: new Date(),
        },
      });
    } catch (error) {
      console.error('Auto-generate receipt error:', error);
      // Don't fail payment if receipt generation fails
    }

    res.status(201).json(payment);
  } catch (error) {
    console.error('Manual payment create error:', error);
    res.status(500).json({ error: 'Failed to record payment', details: error.message });
  }
});

// Inbox endpoints
// Get threads list
app.get('/api/threads', async (req, res) => {
  try {
    const { status, tag, clientId, page = '1', limit = '50' } = req.query;
    const orgId = await getDefaultOrgId();
    const where = {
      orgId,
    };

    if (status) {
      where.status = status;
    } else {
      where.status = 'open'; // Default to open threads
    }

    if (clientId) {
      where.clientId = clientId;
    }

    if (tag) {
      where.tags = {
        has: tag,
      };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [threads, total] = await Promise.all([
      prisma.thread.findMany({
        where,
        include: {
          client: {
            select: { id: true, name: true, email: true, phone: true },
          },
          _count: {
            select: { messages: true },
          },
        },
        skip,
        take: parseInt(limit),
        orderBy: { lastMessageAt: 'desc' },
      }),
      prisma.thread.count({ where }),
    ]);

    res.json({
      items: threads,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error('Threads list error:', error);
    res.status(500).json({ error: 'Failed to fetch threads' });
  }
});

// Get single thread with messages
app.get('/api/threads/:id', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const thread = await prisma.thread.findFirst({
      where: { id: req.params.id, orgId },
      include: {
        client: {
          select: { id: true, name: true, email: true, phone: true, billingAddress: true },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 100, // Limit to last 100 messages
        },
        links: {
          select: { id: true, targetType: true, targetId: true, createdAt: true },
        },
        participants: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    res.json(thread);
  } catch (error) {
    console.error('Thread get error:', error);
    res.status(500).json({ error: 'Failed to fetch thread' });
  }
});

// Create thread
app.post('/api/threads', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const {
      clientId,
      channelPrimary = 'whatsapp',
      subject,
      tags = [],
    } = req.body;

    const thread = await prisma.thread.create({
      data: {
        orgId,
        clientId: clientId || null,
        channelPrimary,
        subject: subject || null,
        tags: tags || [],
        status: 'open',
        unreadCount: 0,
      },
      include: {
        client: {
          select: { id: true, name: true, email: true, phone: true },
        },
      },
    });

    res.status(201).json(thread);
  } catch (error) {
    console.error('Thread create error:', error);
    res.status(500).json({ error: 'Failed to create thread', details: error.message });
  }
});

// Send message
app.post('/api/threads/:id/messages', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const {
      text,
      channel = 'inapp',
      senderRole = 'manager',
      attachments,
    } = req.body;

    if (!text && (!attachments || attachments.length === 0)) {
      return res.status(400).json({ error: 'Message text or attachments required' });
    }

    // Get thread
    const thread = await prisma.thread.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    // Create message
    const message = await prisma.message.create({
      data: {
        orgId,
        threadId: req.params.id,
        senderRole,
        channel,
        text: text || null,
        attachments: attachments || null,
        meta: {
          sentAt: new Date().toISOString(),
        },
      },
    });

    // Update thread lastMessageAt and unreadCount
    await prisma.thread.update({
      where: { id: req.params.id },
      data: {
        lastMessageAt: new Date(),
        unreadCount: senderRole === 'manager' ? 0 : thread.unreadCount + 1,
      },
    });

    res.status(201).json(message);
  } catch (error) {
    console.error('Message create error:', error);
    res.status(500).json({ error: 'Failed to send message', details: error.message });
  }
});

// Archive thread
app.patch('/api/threads/:id/archive', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();

    const thread = await prisma.thread.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    const updated = await prisma.thread.update({
      where: { id: req.params.id },
      data: { status: 'archived' },
    });

    res.json(updated);
  } catch (error) {
    console.error('Thread archive error:', error);
    res.status(500).json({ error: 'Failed to archive thread' });
  }
});

// Link thread to entity (invoice, quote, job, etc.)
app.post('/api/threads/:id/links', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const { targetType, targetId } = req.body;

    if (!targetType || !targetId) {
      return res.status(400).json({ error: 'targetType and targetId are required' });
    }

    // Verify thread exists
    const thread = await prisma.thread.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    // Create or find existing link
    const link = await prisma.threadLink.upsert({
      where: {
        threadId_targetType_targetId: {
          threadId: req.params.id,
          targetType,
          targetId,
        },
      },
      update: {},
      create: {
        orgId,
        threadId: req.params.id,
        targetType,
        targetId,
      },
    });

    res.status(201).json(link);
  } catch (error) {
    console.error('Thread link create error:', error);
    res.status(500).json({ error: 'Failed to link thread', details: error.message });
  }
});

// AI suggestions (mock for now)
app.post('/api/threads/:id/suggest-replies', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();

    const thread = await prisma.thread.findFirst({
      where: { id: req.params.id, orgId },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 5, // Last 5 messages for context
        },
        links: true,
      },
    });

    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    // Mock AI suggestions (in production, this would call AI service)
    const suggestions = [
      {
        id: 'suggest-1',
        text: 'Thank you for your message. How can I assist you today?',
        confidence: 0.8,
        intent: 'general',
      },
      {
        id: 'suggest-2',
        text: 'I\'ll look into that and get back to you shortly.',
        confidence: 0.7,
        intent: 'follow-up',
      },
      {
        id: 'suggest-3',
        text: 'Is there anything specific you\'d like to discuss?',
        confidence: 0.75,
        intent: 'clarification',
      },
    ];

    res.json({ suggestions });
  } catch (error) {
    console.error('Suggest replies error:', error);
    res.status(500).json({ error: 'Failed to generate suggestions' });
  }
});

// Analytics endpoints
// Get finance metrics
app.get('/api/analytics/finance', async (req, res) => {
  try {
    const { from, to } = req.query;
    const orgId = await getDefaultOrgId();

    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default 30 days
    const toDate = to ? new Date(to) : new Date();

    // Calculate revenue (paid invoices)
    const payments = await prisma.payment.aggregate({
      where: {
        orgId,
        status: 'completed',
        processedAt: {
          gte: fromDate,
          lte: toDate,
        },
      },
      _sum: {
        amountCents: true,
      },
      _count: {
        id: true,
      },
    });

    // Calculate invoiced (all invoices in period)
    const invoices = await prisma.invoice.aggregate({
      where: {
        orgId,
        createdAt: {
          gte: fromDate,
          lte: toDate,
        },
      },
      _sum: {
        totalCents: true,
      },
      _count: {
        id: true,
      },
    });

    // Calculate AR (unpaid invoices)
    const arInvoices = await prisma.invoice.findMany({
      where: {
        orgId,
        status: { in: ['sent', 'draft'] },
      },
      select: {
        totalCents: true,
        paidCents: true,
        dueDate: true,
      },
    });

    const arBalance = arInvoices.reduce((sum, inv) => sum + (inv.totalCents - inv.paidCents), 0);
    
    // Calculate aging buckets
    const today = new Date();
    const aging = {
      current: 0,
      days_1_30: 0,
      days_31_60: 0,
      days_61_90: 0,
      days_90_plus: 0,
    };

    arInvoices.forEach((inv) => {
      const balance = inv.totalCents - inv.paidCents;
      if (balance <= 0) return;

      if (inv.dueDate) {
        const daysOverdue = Math.floor((today - new Date(inv.dueDate)) / (1000 * 60 * 60 * 24));
        if (daysOverdue <= 0) {
          aging.current += balance;
        } else if (daysOverdue <= 30) {
          aging.days_1_30 += balance;
        } else if (daysOverdue <= 60) {
          aging.days_31_60 += balance;
        } else if (daysOverdue <= 90) {
          aging.days_61_90 += balance;
        } else {
          aging.days_90_plus += balance;
        }
      } else {
        aging.current += balance;
      }
    });

    // Calculate DSO (Days Sales Outstanding)
    const avgDailySales = invoices._sum.totalCents ? (invoices._sum.totalCents / 30) : 0;
    const dso = avgDailySales > 0 ? Math.round(arBalance / avgDailySales) : 0;

    // Payments by method
    const paymentsByMethod = await prisma.payment.groupBy({
      by: ['method'],
      where: {
        orgId,
        status: 'completed',
        processedAt: {
          gte: fromDate,
          lte: toDate,
        },
      },
      _sum: {
        amountCents: true,
      },
      _count: {
        id: true,
      },
    });

    res.json({
      period: {
        from: fromDate.toISOString().split('T')[0],
        to: toDate.toISOString().split('T')[0],
      },
      revenue: {
        totalCents: payments._sum.amountCents || 0,
        count: payments._count.id || 0,
      },
      invoiced: {
        totalCents: invoices._sum.totalCents || 0,
        count: invoices._count.id || 0,
      },
      ar: {
        balanceCents: arBalance,
        dso,
      },
      aging,
      paymentsByMethod: paymentsByMethod.map((p) => ({
        method: p.method,
        totalCents: p._sum.amountCents || 0,
        count: p._count.id || 0,
      })),
    });
  } catch (error) {
    console.error('Finance analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch finance analytics' });
  }
});

// Get operational metrics
app.get('/api/analytics/operations', async (req, res) => {
  try {
    const { from, to, carerId } = req.query;
    const orgId = await getDefaultOrgId();

    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();

    const where = {
      orgId,
      createdAt: {
        gte: fromDate,
        lte: toDate,
      },
    };

    if (carerId) {
      where.assignedCarerId = carerId;
    }

    // Jobs metrics
    const [totalJobs, completedJobs, failedJobs] = await Promise.all([
      prisma.job.count({
        where: {
          ...where,
        },
      }),
      prisma.job.count({
        where: {
          ...where,
          status: 'completed',
        },
      }),
      prisma.job.count({
        where: {
          ...where,
          status: 'failed',
        },
      }),
    ]);

    // Visits metrics
    const visits = await prisma.visitEntry.findMany({
      where: {
        orgId,
        createdAt: {
          gte: fromDate,
          lte: toDate,
        },
      },
      include: {
        job: {
          select: {
            windowEnd: true,
            assignedCarerId: true,
          },
        },
      },
    });

    const completedVisits = visits.filter((v) => v.completedAt);
    const onTimeVisits = completedVisits.filter((v) => {
      if (!v.completedAt || !v.job?.windowEnd) return false;
      return new Date(v.completedAt) <= new Date(v.job.windowEnd);
    });

    const onTimePercent = completedVisits.length > 0
      ? Math.round((onTimeVisits.length / completedVisits.length) * 100)
      : 0;

    // Average visit duration
    const visitDurations = completedVisits
      .map((v) => {
        if (!v.startedAt || !v.completedAt) return null;
        return (new Date(v.completedAt).getTime() - new Date(v.startedAt).getTime()) / (1000 * 60);
      })
      .filter((d) => d !== null);

    const avgDuration = visitDurations.length > 0
      ? Math.round(visitDurations.reduce((sum, d) => sum + (d || 0), 0) / visitDurations.length)
      : 0;

    // Carer performance
    const carerStats = await prisma.job.groupBy({
      by: ['assignedCarerId'],
      where: {
        ...where,
        status: 'completed',
      },
      _count: {
        id: true,
      },
    });

    res.json({
      period: {
        from: fromDate.toISOString().split('T')[0],
        to: toDate.toISOString().split('T')[0],
      },
      jobs: {
        total: totalJobs,
        completed: completedJobs,
        failed: failedJobs,
        completionRate: totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 0,
      },
      visits: {
        total: visits.length,
        completed: completedVisits.length,
        onTimePercent,
        avgDurationMinutes: avgDuration,
      },
      carerStats: carerStats.map((stat) => ({
        carerId: stat.assignedCarerId,
        jobsCompleted: stat._count.id,
      })),
    });
  } catch (error) {
    console.error('Operations analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch operations analytics' });
  }
});

// Get revenue trend (daily breakdown)
app.get('/api/analytics/revenue-trend', async (req, res) => {
  try {
    const { from, to, groupBy = 'day' } = req.query;
    const orgId = await getDefaultOrgId();

    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();

    // Get daily payments
    const payments = await prisma.payment.findMany({
      where: {
        orgId,
        status: 'completed',
        processedAt: {
          gte: fromDate,
          lte: toDate,
        },
      },
      select: {
        amountCents: true,
        processedAt: true,
      },
      orderBy: {
        processedAt: 'asc',
      },
    });

    // Group by day
    const dailyRevenue = {};
    payments.forEach((payment) => {
      if (payment.processedAt) {
        const dateKey = payment.processedAt.toISOString().split('T')[0];
        dailyRevenue[dateKey] = (dailyRevenue[dateKey] || 0) + payment.amountCents;
      }
    });

    const trend = Object.keys(dailyRevenue)
      .sort()
      .map((date) => ({
        date,
        revenueCents: dailyRevenue[date],
      }));

    res.json({
      period: {
        from: fromDate.toISOString().split('T')[0],
        to: toDate.toISOString().split('T')[0],
      },
      trend,
    });
  } catch (error) {
    console.error('Revenue trend error:', error);
    res.status(500).json({ error: 'Failed to fetch revenue trend' });
  }
});

// Get jobs completion trend
app.get('/api/analytics/jobs-trend', async (req, res) => {
  try {
    const { from, to } = req.query;
    const orgId = await getDefaultOrgId();

    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();

    // Get jobs grouped by day
    const jobs = await prisma.job.findMany({
      where: {
        orgId,
        createdAt: {
          gte: fromDate,
          lte: toDate,
        },
      },
      select: {
        status: true,
        createdAt: true,
      },
    });

    const dailyJobs = {};
    
    jobs.forEach((job) => {
      const dateKey = job.createdAt.toISOString().split('T')[0];
      if (!dailyJobs[dateKey]) {
        dailyJobs[dateKey] = { scheduled: 0, completed: 0, failed: 0 };
      }
      
      dailyJobs[dateKey].scheduled += 1;
      if (job.status === 'completed') {
        dailyJobs[dateKey].completed += 1;
      } else if (job.status === 'failed') {
        dailyJobs[dateKey].failed += 1;
      }
    });

    const trend = Object.keys(dailyJobs)
      .sort()
      .map((date) => ({
        date,
        ...dailyJobs[date],
      }));

    res.json({
      period: {
        from: fromDate.toISOString().split('T')[0],
        to: toDate.toISOString().split('T')[0],
      },
      trend,
    });
  } catch (error) {
    console.error('Jobs trend error:', error);
    res.status(500).json({ error: 'Failed to fetch jobs trend' });
  }
});

// Credit Notes endpoints
// Get credit notes list
app.get('/api/credit-notes', async (req, res) => {
  try {
    const { clientId, invoiceId, page = '1', limit = '50' } = req.query;
    const orgId = await getDefaultOrgId();
    const where = {
      orgId,
    };

    if (clientId) {
      where.clientId = clientId;
    }

    if (invoiceId) {
      where.invoiceId = invoiceId;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [creditNotes, total] = await Promise.all([
      prisma.creditNote.findMany({
        where,
        include: {
          client: {
            select: { id: true, name: true, email: true, phone: true },
          },
          invoice: {
            select: { id: true, invoiceNumber: true },
          },
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.creditNote.count({ where }),
    ]);

    res.json({
      items: creditNotes,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error('Credit notes list error:', error);
    res.status(500).json({ error: 'Failed to fetch credit notes' });
  }
});

// Get single credit note
app.get('/api/credit-notes/:id', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const creditNote = await prisma.creditNote.findFirst({
      where: { id: req.params.id, orgId },
      include: {
        client: {
          select: { id: true, name: true, email: true, phone: true },
        },
        invoice: {
          select: { id: true, invoiceNumber: true, totalCents: true, paidCents: true },
        },
      },
    });

    if (!creditNote) {
      return res.status(404).json({ error: 'Credit note not found' });
    }

    res.json(creditNote);
  } catch (error) {
    console.error('Credit note get error:', error);
    res.status(500).json({ error: 'Failed to fetch credit note' });
  }
});

// Create credit note
app.post('/api/invoices/:id/credit-notes', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const { reason, items, applyNow = false } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array is required and must not be empty' });
    }

    // Get invoice
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Calculate credit note total
    let totalCents = 0;
    items.forEach((item) => {
      const lineTotal = (item.qty || 1) * (item.unitPriceCents || 0);
      totalCents += lineTotal;
    });

    // Create credit note
    const creditNote = await prisma.creditNote.create({
      data: {
        orgId,
        clientId: invoice.clientId,
        invoiceId: invoice.id,
        reason: reason || null,
        items: items,
        amountCents: Math.abs(totalCents), // Always positive
        appliedAt: applyNow ? new Date() : null,
      },
      include: {
        client: {
          select: { id: true, name: true },
        },
        invoice: {
          select: { id: true, invoiceNumber: true },
        },
      },
    });

    // If applyNow, update invoice balance
    if (applyNow) {
      const balanceCents = invoice.totalCents - invoice.paidCents - Math.abs(totalCents);
      
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          balanceCents: Math.max(0, balanceCents), // Can't go negative
          status: balanceCents <= 0 ? 'paid' : invoice.status,
        },
      });
    }

    res.status(201).json(creditNote);
  } catch (error) {
    console.error('Credit note create error:', error);
    res.status(500).json({ error: 'Failed to create credit note', details: error.message });
  }
});

// Apply credit note to invoice
app.post('/api/credit-notes/:id/apply', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const { invoiceId } = req.body;

    const creditNote = await prisma.creditNote.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!creditNote) {
      return res.status(404).json({ error: 'Credit note not found' });
    }

    if (creditNote.appliedAt) {
      return res.status(400).json({ error: 'Credit note already applied' });
    }

    const targetInvoiceId = invoiceId || creditNote.invoiceId;
    if (!targetInvoiceId) {
      return res.status(400).json({ error: 'invoiceId is required' });
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id: targetInvoiceId, orgId },
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Apply credit note
    const newBalance = invoice.totalCents - invoice.paidCents - creditNote.amountCents;

    await prisma.invoice.update({
      where: { id: targetInvoiceId },
      data: {
        balanceCents: Math.max(0, newBalance),
        status: newBalance <= 0 ? 'paid' : invoice.status,
      },
    });

    await prisma.creditNote.update({
      where: { id: req.params.id },
      data: {
        invoiceId: targetInvoiceId,
        appliedAt: new Date(),
      },
    });

    res.json({ success: true, newBalance });
  } catch (error) {
    console.error('Apply credit note error:', error);
    res.status(500).json({ error: 'Failed to apply credit note', details: error.message });
  }
});

// Refunds endpoints
// Get refunds list
app.get('/api/refunds', async (req, res) => {
  try {
    const { paymentId, invoiceId, page = '1', limit = '50' } = req.query;
    const orgId = await getDefaultOrgId();
    const where = {
      orgId,
    };

    if (paymentId) {
      where.paymentId = paymentId;
    }

    if (invoiceId) {
      where.payment = {
        invoiceId,
      };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [refunds, total] = await Promise.all([
      prisma.refund.findMany({
        where,
        include: {
          payment: {
            include: {
              invoice: {
                select: { id: true, invoiceNumber: true, clientId: true },
              },
            },
          },
        },
        skip,
        take: parseInt(limit),
        orderBy: { refundedAt: 'desc' },
      }),
      prisma.refund.count({ where }),
    ]);

    res.json({
      items: refunds,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error('Refunds list error:', error);
    res.status(500).json({ error: 'Failed to fetch refunds' });
  }
});

// Create refund
app.post('/api/payments/:id/refund', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const { amountCents, reason } = req.body;

    // Get payment
    const payment = await prisma.payment.findFirst({
      where: { id: req.params.id, orgId },
      include: {
        invoice: true,
      },
    });

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (payment.status !== 'completed') {
      return res.status(400).json({ error: 'Can only refund completed payments' });
    }

    // Check if already refunded
    const existingRefund = await prisma.refund.findFirst({
      where: {
        paymentId: payment.id,
        orgId,
      },
    });

    if (existingRefund) {
      return res.status(400).json({ error: 'Payment already refunded' });
    }

    const refundAmount = amountCents || payment.amountCents;
    if (refundAmount > payment.amountCents) {
      return res.status(400).json({ error: 'Refund amount cannot exceed payment amount' });
    }

    // Create refund (mock - in production would call Paystack refund API)
    const refund = await prisma.refund.create({
      data: {
        orgId,
        paymentId: payment.id,
        amountCents: refundAmount,
        providerRef: `REF-${payment.providerRef || payment.id}-${Date.now()}`,
        refundedAt: new Date(),
        meta: {
          reason: reason || null,
          // In production, store Paystack refund response here
        },
      },
    });

    // Update payment status and invoice
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: refundAmount >= payment.amountCents ? 'refunded' : 'partially_refunded',
      },
    });

    // Recalculate invoice balance
    const totalPaid = await prisma.payment.aggregate({
      where: {
        invoiceId: payment.invoiceId,
        status: { in: ['completed', 'partially_refunded'] },
      },
      _sum: {
        amountCents: true,
      },
    });

    const totalRefunded = await prisma.refund.aggregate({
      where: {
        payment: {
          invoiceId: payment.invoiceId,
        },
      },
      _sum: {
        amountCents: true,
      },
    });

    const netPaid = (totalPaid._sum.amountCents || 0) - (totalRefunded._sum.amountCents || 0);
    const invoice = payment.invoice;
    const newBalance = invoice.totalCents - netPaid;

    await prisma.invoice.update({
      where: { id: payment.invoiceId },
      data: {
        paidCents: Math.max(0, netPaid),
        status: newBalance <= 0 ? 'paid' : invoice.status,
      },
    });

    res.status(201).json(refund);
  } catch (error) {
    console.error('Refund create error:', error);
    res.status(500).json({ error: 'Failed to create refund', details: error.message });
  }
});

// Files endpoints
// Presign upload URL
app.post('/api/files/presign', async (req, res) => {
  console.log('📁 Files presign request received:', { scope: req.body.scope, refId: req.body.refId });
  try {
    const orgId = await getDefaultOrgId();
    const { scope, refId, contentType, fileName, sizeBytes } = req.body;

    if (!scope || !refId || !contentType) {
      return res.status(400).json({ error: 'scope, refId, and contentType are required' });
    }

    // Validate content type
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'text/html',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
    ];
    if (!allowedTypes.includes(contentType)) {
      return res.status(400).json({ error: `Content type ${contentType} not allowed` });
    }

    // Generate file ID and storage key
    // Simple UUID v4 generator (fallback if uuid package not available)
    const generateUUID = () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    };
    
    const fileId = generateUUID();
    const ext = fileName?.split('.').pop() || contentType.split('/')[1];
    const key = `org/${orgId}/${scope}/${refId}/${fileId}.${ext}`;

    // For simple-server, return a mock presigned URL structure
    // In production, this would use MinIO presignedPostPolicy
    res.json({
      url: `http://localhost:9000/poolcare`,
      method: 'POST',
      fields: {
        key,
        'Content-Type': contentType,
      },
      key,
      fileId,
    });
  } catch (error) {
    console.error('Presign error:', error);
    res.status(500).json({ error: 'Failed to generate presigned URL' });
  }
});

// Commit file after upload
app.post('/api/files/commit', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const { key, scope, refId, contentType, sizeBytes, fileName } = req.body;

    if (!key || !scope || !refId) {
      return res.status(400).json({ error: 'key, scope, and refId are required' });
    }

    // Verify key belongs to org
    if (!key.startsWith(`org/${orgId}/`)) {
      return res.status(403).json({ error: 'Invalid key' });
    }

    // Create file record
    const file = await prisma.fileObject.create({
      data: {
        orgId,
        scope,
        refId,
        storageKey: key,
        storageBucket: 'poolcare',
        contentType: contentType || 'application/octet-stream',
        sizeBytes: sizeBytes || 0,
      },
    });

    res.status(201).json(file);
  } catch (error) {
    console.error('Commit error:', error);
    res.status(500).json({ error: 'Failed to commit file', details: error.message });
  }
});

// Get presigned download URL
app.post('/api/files/sign', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const { fileId, variant, ttlSec } = req.body;

    if (!fileId) {
      return res.status(400).json({ error: 'fileId is required' });
    }

    const file = await prisma.fileObject.findFirst({
      where: {
        id: fileId,
        orgId,
        deletedAt: null,
      },
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // For simple-server, return a mock URL
    // In production, this would use MinIO presignedGetObject
    const ttl = ttlSec || 300;
    const url = `http://localhost:9000/poolcare/${file.storageKey}?expires=${Date.now() + ttl * 1000}`;

    res.json({ url });
  } catch (error) {
    console.error('Sign error:', error);
    res.status(500).json({ error: 'Failed to generate download URL' });
  }
});

// Bulk sign (multiple files)
app.post('/api/files/bulk/sign', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const { fileIds, variant, ttlSec } = req.body;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({ error: 'fileIds array is required' });
    }

    const files = await prisma.fileObject.findMany({
      where: {
        id: { in: fileIds },
        orgId,
        deletedAt: null,
      },
    });

    if (files.length !== fileIds.length) {
      return res.status(404).json({ error: 'Some files not found' });
    }

    const ttl = ttlSec || 300;
    const urls = files.map((file) => ({
      fileId: file.id,
      url: `http://localhost:9000/poolcare/${file.storageKey}?expires=${Date.now() + ttl * 1000}`,
    }));

    res.json({ urls });
  } catch (error) {
    console.error('Bulk sign error:', error);
    res.status(500).json({ error: 'Failed to generate download URLs' });
  }
});

// Get files list
app.get('/api/files', async (req, res) => {
  try {
    const { scope, refId, page = '1', limit = '50' } = req.query;
    const orgId = await getDefaultOrgId();
    const where = {
      orgId,
      deletedAt: null,
    };

    if (scope) {
      where.scope = scope;
    }

    if (refId) {
      where.refId = refId;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [files, total] = await Promise.all([
      prisma.fileObject.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { uploadedAt: 'desc' },
      }),
      prisma.fileObject.count({ where }),
    ]);

    res.json({
      items: files,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error('Files list error:', error);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// Get single file
app.get('/api/files/:id', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const file = await prisma.fileObject.findFirst({
      where: {
        id: req.params.id,
        orgId,
        deletedAt: null,
      },
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json(file);
  } catch (error) {
    console.error('File get error:', error);
    res.status(500).json({ error: 'Failed to fetch file' });
  }
});

// Delete file
app.delete('/api/files/:id', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();

    const file = await prisma.fileObject.findFirst({
      where: {
        id: req.params.id,
        orgId,
        deletedAt: null,
      },
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Soft delete
    await prisma.fileObject.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('File delete error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Receipts endpoints
// Generate receipt for payment
app.post('/api/payments/:id/receipt', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    
    // Get payment
    const payment = await prisma.payment.findFirst({
      where: { id: req.params.id, orgId },
      include: {
        invoice: {
          include: {
            client: {
              select: { id: true, name: true, email: true, phone: true, billingAddress: true },
            },
            pool: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Check if receipt already exists
    const existingReceipt = await prisma.receipt.findFirst({
      where: { paymentId: payment.id, orgId },
    });

    if (existingReceipt) {
      return res.status(201).json(existingReceipt);
    }

    // Generate receipt number
    const year = new Date().getFullYear();
    const prefix = `REC-${year}-`;
    const lastReceipt = await prisma.receipt.findFirst({
      where: {
        orgId,
        receiptNumber: {
          startsWith: prefix,
        },
      },
      orderBy: { receiptNumber: 'desc' },
    });

    const lastNum = lastReceipt 
      ? parseInt(lastReceipt.receiptNumber.replace(prefix, ''))
      : 0;
    const receiptNumber = `${prefix}${String(lastNum + 1).padStart(4, '0')}`;

    // Create receipt
    const receipt = await prisma.receipt.create({
      data: {
        orgId,
        invoiceId: payment.invoiceId,
        paymentId: payment.id,
        receiptNumber,
        issuedAt: new Date(),
      },
      include: {
        invoice: {
          include: {
            client: true,
            pool: true,
          },
        },
        payment: true,
      },
    });

    res.status(201).json(receipt);
  } catch (error) {
    console.error('Receipt create error:', error);
    res.status(500).json({ error: 'Failed to create receipt', details: error.message });
  }
});

// Get receipts list
app.get('/api/receipts', async (req, res) => {
  try {
    const { invoiceId, paymentId, clientId, page = '1', limit = '50' } = req.query;
    const orgId = await getDefaultOrgId();
    const where = {
      orgId,
    };

    if (invoiceId) {
      where.invoiceId = invoiceId;
    }

    if (paymentId) {
      where.paymentId = paymentId;
    }

    if (clientId) {
      where.invoice = {
        clientId,
      };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [receipts, total] = await Promise.all([
      prisma.receipt.findMany({
        where,
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              client: {
                select: { id: true, name: true, email: true },
              },
            },
          },
          payment: {
            select: {
              id: true,
              amountCents: true,
              method: true,
              processedAt: true,
            },
          },
        },
        skip,
        take: parseInt(limit),
        orderBy: { issuedAt: 'desc' },
      }),
      prisma.receipt.count({ where }),
    ]);

    res.json({
      items: receipts,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error('Receipts list error:', error);
    res.status(500).json({ error: 'Failed to fetch receipts' });
  }
});

// Get single receipt
app.get('/api/receipts/:id', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const receipt = await prisma.receipt.findFirst({
      where: { id: req.params.id, orgId },
      include: {
        invoice: {
          include: {
            client: {
              select: { id: true, name: true, email: true, phone: true, billingAddress: true },
            },
            pool: {
              select: { id: true, name: true },
            },
            items: true,
          },
        },
        payment: {
          select: {
            id: true,
            amountCents: true,
            currency: true,
            method: true,
            providerRef: true,
            processedAt: true,
          },
        },
      },
    });

    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    res.json(receipt);
  } catch (error) {
    console.error('Receipt get error:', error);
    res.status(500).json({ error: 'Failed to fetch receipt' });
  }
});

// Get receipt HTML (for PDF generation)
app.get('/api/receipts/:id/html', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const receipt = await prisma.receipt.findFirst({
      where: { id: req.params.id, orgId },
      include: {
        invoice: {
          include: {
            client: {
              select: { id: true, name: true, email: true, phone: true, billingAddress: true },
            },
            pool: {
              select: { id: true, name: true },
            },
            items: true,
          },
        },
        payment: true,
        org: {
          select: { id: true, name: true },
        },
      },
    });

    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    // Generate HTML receipt (simplified - in production would use a template engine)
    const html = generateReceiptHTML(receipt);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    console.error('Receipt HTML error:', error);
    res.status(500).json({ error: 'Failed to generate receipt HTML' });
  }
});

// Helper function to generate receipt HTML
function generateReceiptHTML(receipt) {
  const formatCurrency = (cents, currency = 'GHS') => {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  };

  const org = receipt.org || { name: 'PoolCare' };
  const invoice = receipt.invoice;
  const client = invoice.client;
  const payment = receipt.payment;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Receipt ${receipt.receiptNumber}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
    .header { border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
    .header h1 { margin: 0; color: #333; }
    .receipt-info { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .section { margin-bottom: 30px; }
    .section h2 { font-size: 18px; margin-bottom: 10px; color: #555; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background-color: #f5f5f5; }
    .total { font-size: 18px; font-weight: bold; margin-top: 20px; text-align: right; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${org.name}</h1>
    <p>Receipt</p>
  </div>
  
  <div class="receipt-info">
    <div>
      <p><strong>Receipt Number:</strong> ${receipt.receiptNumber}</p>
      <p><strong>Date:</strong> ${new Date(receipt.issuedAt).toLocaleDateString()}</p>
    </div>
    <div>
      <p><strong>Invoice:</strong> ${invoice.invoiceNumber}</p>
      <p><strong>Payment Method:</strong> ${payment.method}</p>
    </div>
  </div>

  <div class="section">
    <h2>Client Information</h2>
    <p><strong>${client.name}</strong></p>
    ${client.email ? `<p>${client.email}</p>` : ''}
    ${client.phone ? `<p>${client.phone}</p>` : ''}
    ${client.billingAddress ? `<p>${client.billingAddress}</p>` : ''}
  </div>

  <div class="section">
    <h2>Payment Details</h2>
    <table>
      <tr>
        <th>Amount Paid</th>
        <td>${formatCurrency(payment.amountCents, payment.currency)}</td>
      </tr>
      <tr>
        <th>Payment Method</th>
        <td>${payment.method}</td>
      </tr>
      <tr>
        <th>Transaction Reference</th>
        <td>${payment.providerRef || '-'}</td>
      </tr>
      <tr>
        <th>Date</th>
        <td>${payment.processedAt ? new Date(payment.processedAt).toLocaleString() : '-'}</td>
      </tr>
    </table>
  </div>

  <div class="section">
    <h2>Invoice Items</h2>
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th>Quantity</th>
          <th>Price</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${Array.isArray(invoice.items) ? invoice.items.map(item => `
          <tr>
            <td>${item.label}</td>
            <td>${item.qty}</td>
            <td>${formatCurrency(item.unitPriceCents, invoice.currency)}</td>
            <td>${formatCurrency(item.qty * item.unitPriceCents, invoice.currency)}</td>
          </tr>
        `).join('') : ''}
      </tbody>
    </table>
    <div class="total">
      <p>Total: ${formatCurrency(invoice.totalCents, invoice.currency)}</p>
      <p>Paid: ${formatCurrency(payment.amountCents, payment.currency)}</p>
      <p>Outstanding Balance: ${formatCurrency(invoice.totalCents - invoice.paidCents, invoice.currency)}</p>
    </div>
  </div>

  <div class="footer">
    <p>Thank you for your payment!</p>
    <p>Receipt Number: ${receipt.receiptNumber}</p>
  </div>
</body>
</html>
  `;
}

// Auto-generate receipt when payment is completed (update payment handler)
// Update the manual payment endpoint to auto-generate receipt
const originalPaymentHandler = async (invoiceId, paymentData) => {
  // ... existing payment creation code ...
  
  // After payment is created, auto-generate receipt
  try {
    const payment = await prisma.payment.findFirst({
      where: { invoiceId, status: 'completed' },
      orderBy: { createdAt: 'desc' },
    });
    
    if (payment) {
      // Generate receipt
      const year = new Date().getFullYear();
      const prefix = `REC-${year}-`;
      const lastReceipt = await prisma.receipt.findFirst({
        where: {
          orgId: await getDefaultOrgId(),
          receiptNumber: {
            startsWith: prefix,
          },
        },
        orderBy: { receiptNumber: 'desc' },
      });

      const lastNum = lastReceipt 
        ? parseInt(lastReceipt.receiptNumber.replace(prefix, ''))
        : 0;
      const receiptNumber = `${prefix}${String(lastNum + 1).padStart(4, '0')}`;

      await prisma.receipt.create({
        data: {
          orgId: await getDefaultOrgId(),
          invoiceId,
          paymentId: payment.id,
          receiptNumber,
          issuedAt: new Date(),
        },
      });
    }
  } catch (error) {
    console.error('Auto-generate receipt error:', error);
    // Don't fail payment if receipt generation fails
  }
};

// Notifications endpoints
// Get notifications outbox
app.get('/api/notifications', async (req, res) => {
  try {
    const { status, channel, recipientType, page = '1', limit = '50', from, to } = req.query;
    const orgId = await getDefaultOrgId();
    const where = {
      orgId,
    };

    if (status) {
      where.status = status;
    }

    if (channel) {
      where.channel = channel;
    }

    if (recipientType) {
      where.recipientType = recipientType;
    }

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where }),
    ]);

    // Fetch recipient details separately if needed
    const notificationsWithRecipients = await Promise.all(
      notifications.map(async (notification) => {
        if (notification.recipientId && notification.recipientType === 'client') {
          const client = await prisma.client.findFirst({
            where: { id: notification.recipientId, orgId },
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          });
          return { ...notification, recipient: client };
        }
        return notification;
      })
    );

    res.json({
      items: notificationsWithRecipients,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error('Notifications list error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Get single notification
app.get('/api/notifications/:id', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const notification = await prisma.notification.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    // Fetch recipient details if needed
    let recipient = null;
    if (notification.recipientId && notification.recipientType === 'client') {
      recipient = await prisma.client.findFirst({
        where: { id: notification.recipientId, orgId },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
        },
      });
    }

    if (recipient) {
      notification.recipient = recipient;
    }

    res.json(notification);
  } catch (error) {
    console.error('Notification get error:', error);
    res.status(500).json({ error: 'Failed to fetch notification' });
  }
});

// Resend notification
app.post('/api/notifications/:id/resend', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const notification = await prisma.notification.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    // Reset to pending
    await prisma.notification.update({
      where: { id: req.params.id },
      data: {
        status: 'pending',
      },
    });

    res.json({ success: true, message: 'Notification queued for resend' });
  } catch (error) {
    console.error('Notification resend error:', error);
    res.status(500).json({ error: 'Failed to resend notification' });
  }
});

// Cancel notification
app.post('/api/notifications/:id/cancel', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const notification = await prisma.notification.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    if (notification.status === 'sent' || notification.status === 'delivered') {
      return res.status(400).json({ error: 'Cannot cancel already sent notification' });
    }

    await prisma.notification.update({
      where: { id: req.params.id },
      data: {
        status: 'canceled',
      },
    });

    res.json({ success: true, message: 'Notification canceled' });
  } catch (error) {
    console.error('Notification cancel error:', error);
    res.status(500).json({ error: 'Failed to cancel notification' });
  }
});

// Get notification templates (placeholder - would need NotifyTemplate model)
app.get('/api/notification-templates', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    // For now, return mock templates
    res.json({
      items: [
        {
          id: '1',
          key: 'job_reminder_T24',
          channel: 'sms',
          subject: null,
          body: 'Hi {client.firstName}, reminder: your pool service is scheduled for {job.window}. Reply STOP to opt out.',
          isActive: true,
        },
        {
          id: '2',
          key: 'job_reminder_T1',
          channel: 'whatsapp',
          subject: null,
          body: 'Hi {client.firstName}, your pool service technician will arrive in about 1 hour (ETA: {job.eta}).',
          isActive: true,
        },
        {
          id: '3',
          key: 'invoice_sent',
          channel: 'email',
          subject: '[PoolCare] Invoice #{invoice.number}',
          body: 'Hi {client.firstName}, your invoice of {invoice.total} is ready. Pay here: {invoice.link}',
          isActive: true,
        },
        {
          id: '4',
          key: 'visit_completed',
          channel: 'push',
          subject: null,
          body: 'Your pool service visit is complete! View report: {visit.report.link}',
          isActive: true,
        },
      ],
      total: 4,
    });
  } catch (error) {
    console.error('Templates list error:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Get client notification preferences
app.get('/api/clients/:id/notification-preferences', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const client = await prisma.client.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // For now, return default preferences (would be in NotifyPreference model)
    res.json({
      primaryChannel: 'whatsapp',
      fallbackChannels: ['sms', 'email'],
      quietHours: {
        start: '21:00',
        end: '07:00',
      },
      optOut: {
        sms: false,
        whatsapp: false,
        email: false,
        push: false,
      },
    });
  } catch (error) {
    console.error('Preferences get error:', error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

// Update client notification preferences
app.patch('/api/clients/:id/notification-preferences', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const client = await prisma.client.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const { primaryChannel, fallbackChannels, quietHours, optOut } = req.body;

    // For now, just return success (would update NotifyPreference model)
    res.json({
      success: true,
      message: 'Preferences updated',
      preferences: {
        primaryChannel: primaryChannel || 'whatsapp',
        fallbackChannels: fallbackChannels || ['sms', 'email'],
        quietHours: quietHours || { start: '21:00', end: '07:00' },
        optOut: optOut || {
          sms: false,
          whatsapp: false,
          email: false,
          push: false,
        },
      },
    });
  } catch (error) {
    console.error('Preferences update error:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// Notifications endpoints
// Get notifications outbox (sent notifications)
app.get('/api/notifications', async (req, res) => {
  try {
    const { status, channel, recipientType, from, to, page = '1', limit = '50' } = req.query;
    const orgId = await getDefaultOrgId();
    const where = {
      orgId,
    };

    if (status) {
      where.status = status;
    }

    if (channel) {
      where.channel = channel;
    }

    if (recipientType) {
      where.recipientType = recipientType;
    }

    if (from || to) {
      where.createdAt = {};
      if (from) {
        where.createdAt.gte = new Date(from);
      }
      if (to) {
        where.createdAt.lte = new Date(to);
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where }),
    ]);

    // Fetch recipient details for notifications with recipientId
    const notificationsWithRecipients = await Promise.all(
      notifications.map(async (notif) => {
        if (notif.recipientId && notif.recipientType === 'client') {
          try {
            const client = await prisma.client.findFirst({
              where: { id: notif.recipientId, orgId },
              select: { id: true, name: true, email: true, phone: true },
            });
            return { ...notif, recipient: client };
          } catch (e) {
            return { ...notif, recipient: null };
          }
        }
        return { ...notif, recipient: null };
      })
    );

    res.json({
      items: notificationsWithRecipients,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error('Notifications list error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Get single notification
app.get('/api/notifications/:id', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const notification = await prisma.notification.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    // Fetch recipient if exists
    let recipient = null;
    if (notification.recipientId && notification.recipientType === 'client') {
      try {
        recipient = await prisma.client.findFirst({
          where: { id: notification.recipientId, orgId },
          select: { id: true, name: true, email: true, phone: true },
        });
      } catch (e) {
        // Ignore
      }
    }

    res.json({ ...notification, recipient });
  } catch (error) {
    console.error('Notification get error:', error);
    res.status(500).json({ error: 'Failed to fetch notification' });
  }
});

// Resend failed notification
app.post('/api/notifications/:id/resend', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const notification = await prisma.notification.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    if (notification.status === 'sent' || notification.status === 'delivered') {
      return res.status(400).json({ error: 'Notification already sent' });
    }

    // Update status to pending (will be picked up by worker)
    const updated = await prisma.notification.update({
      where: { id: req.params.id },
      data: {
        status: 'pending',
        scheduledFor: new Date(),
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Notification resend error:', error);
    res.status(500).json({ error: 'Failed to resend notification' });
  }
});

// Cancel pending notification
app.post('/api/notifications/:id/cancel', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const notification = await prisma.notification.findFirst({
      where: { id: req.params.id, orgId },
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    if (notification.status !== 'pending') {
      return res.status(400).json({ error: 'Can only cancel pending notifications' });
    }

    const updated = await prisma.notification.update({
      where: { id: req.params.id },
      data: {
        status: 'canceled',
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Notification cancel error:', error);
    res.status(500).json({ error: 'Failed to cancel notification' });
  }
});

// Get notification templates (simplified - using Notification table with template field)
app.get('/api/notifications/templates', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    // Group notifications by template key to get unique templates
    const notifications = await prisma.notification.findMany({
      where: {
        orgId,
        template: { not: null },
      },
      select: {
        template: true,
        channel: true,
        subject: true,
        body: true,
      },
      distinct: ['template', 'channel'],
      orderBy: { createdAt: 'desc' },
    });

    // Group by template key
    const templates = {};
    notifications.forEach((n) => {
      if (!templates[n.template]) {
        templates[n.template] = {
          key: n.template,
          channels: [],
        };
      }
      templates[n.template].channels.push({
        channel: n.channel,
        subject: n.subject,
        body: n.body,
      });
    });

    res.json({
      items: Object.values(templates),
      total: Object.keys(templates).length,
    });
  } catch (error) {
    console.error('Templates list error:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Test send notification
app.post('/api/notifications/test', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const { channel, recipientId, recipientType, template, subject, body } = req.body;

    if (!channel || !body) {
      return res.status(400).json({ error: 'channel and body are required' });
    }

    // Create test notification
    const notification = await prisma.notification.create({
      data: {
        orgId,
        recipientId: recipientId || null,
        recipientType: recipientType || 'user',
        channel,
        template: template || null,
        subject: subject || null,
        body,
        status: 'pending',
        scheduledFor: new Date(),
        metadata: { test: true },
      },
    });

    res.status(201).json(notification);
  } catch (error) {
    console.error('Test notification error:', error);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

// Get client notification preferences
app.get('/api/clients/:id/notification-preferences', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    // For now, return default preferences (would be stored in Client model in full implementation)
    res.json({
      primaryChannel: 'whatsapp',
      fallbackChannels: ['sms', 'email'],
      quietHours: {
        start: '21:00',
        end: '07:00',
      },
      optOut: {
        sms: false,
        whatsapp: false,
        email: false,
        push: false,
      },
    });
  } catch (error) {
    console.error('Get preferences error:', error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

// Update client notification preferences
app.patch('/api/clients/:id/notification-preferences', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const { primaryChannel, fallbackChannels, quietHours, optOut } = req.body;

    // For now, just return success (would update Client model in full implementation)
    res.json({
      primaryChannel: primaryChannel || 'whatsapp',
      fallbackChannels: fallbackChannels || ['sms', 'email'],
      quietHours: quietHours || { start: '21:00', end: '07:00' },
      optOut: optOut || {
        sms: false,
        whatsapp: false,
        email: false,
        push: false,
      },
    });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// Send SMS endpoint
app.post('/api/sms/send', async (req, res) => {
  try {
    const { to, message, clientId } = req.body;

    if (!to || !message) {
      return res.status(400).json({ error: 'to and message are required' });
    }

    console.log('[SMS] Sending SMS:', {
      to,
      message: message.substring(0, 50) + '...',
      clientId,
    });

    let messageId;
    let status = 'sent';
    let errorMessage = null;

    try {
      // Try to send via Deywuro using stored settings
      messageId = await sendSmsViaDeywuro(to, message);
    } catch (error) {
      // If sending fails, mark as failed but still store in history
      status = 'failed';
      errorMessage = error.message;
      messageId = `sms_failed_${Date.now()}_${to.replace(/\D/g, '')}`;
      console.error('[SMS] Failed to send:', error.message);
    }

    const sentAt = new Date().toISOString();

    // Store the SMS in history (even if failed, for tracking)
    const smsRecord = {
      id: messageId,
      to,
      message,
      status,
      sentAt,
      clientId: clientId || null,
      error: errorMessage || null,
    };
    messageHistory.sms.unshift(smsRecord); // Add to beginning of array

    // Keep only last 100 messages to prevent memory issues
    if (messageHistory.sms.length > 100) {
      messageHistory.sms = messageHistory.sms.slice(0, 100);
    }

    // Optionally create a notification record
    if (clientId) {
      try {
        const orgId = await getDefaultOrgId();
        // Would create Notification record here in full implementation
      } catch (err) {
        console.error('Failed to create notification record:', err);
      }
    }

    // If sending failed, return error
    if (status === 'failed') {
      return res.status(500).json({
        error: errorMessage || 'Failed to send SMS',
        messageId,
        to,
        sentAt,
      });
    }

    res.json({
      success: true,
      messageId,
      to,
      sentAt,
    });
  } catch (error) {
    console.error('Send SMS error:', error);
    res.status(500).json({ error: error.message || 'Failed to send SMS' });
  }
});

// Get SMS history
app.get('/api/sms', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const { clientId, limit = 50, offset = 0 } = req.query;

    // Get stored SMS history
    let smsList = [...messageHistory.sms];

    // Filter by clientId if provided
    if (clientId) {
      smsList = smsList.filter(sms => sms.clientId === clientId);
    }

    // Apply pagination
    const total = smsList.length;
    const start = parseInt(offset);
    const end = start + parseInt(limit);
    const paginatedSms = smsList.slice(start, end);

    res.json({
      items: paginatedSms,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    console.error('Get SMS history error:', error);
    res.status(500).json({ error: 'Failed to fetch SMS history' });
  }
});

// Send Email endpoint
app.post('/api/email/send', async (req, res) => {
  try {
    const { to, subject, text, html, clientId } = req.body;

    if (!to || !subject || (!text && !html)) {
      return res.status(400).json({ error: 'to, subject, and text or html are required' });
    }

    console.log('[Email] Sending Email:', {
      to,
      subject,
      text: text ? text.substring(0, 50) + '...' : undefined,
      html: html ? html.substring(0, 50) + '...' : undefined,
      clientId,
    });

    let messageId;
    let status = 'sent';
    let errorMessage = null;

    try {
      // Try to send via SMTP using stored settings
      messageId = await sendEmailViaSmtp(to, subject, text, html);
    } catch (error) {
      // If sending fails, mark as failed but still store in history
      status = 'failed';
      errorMessage = error.message;
      messageId = `email_failed_${Date.now()}_${to.replace(/[^a-zA-Z0-9]/g, '')}`;
      console.error('[Email] Failed to send:', error.message);
    }

    const sentAt = new Date().toISOString();

    // Store the email in history (even if failed, for tracking)
    const emailRecord = {
      id: messageId,
      to,
      subject,
      text: text || null,
      html: html || null,
      status,
      sentAt,
      clientId: clientId || null,
      error: errorMessage || null,
    };
    messageHistory.email.unshift(emailRecord); // Add to beginning of array

    // Keep only last 100 emails to prevent memory issues
    if (messageHistory.email.length > 100) {
      messageHistory.email = messageHistory.email.slice(0, 100);
    }

    // Optionally create a notification record
    if (clientId) {
      try {
        const orgId = await getDefaultOrgId();
        // Would create Notification record here in full implementation
      } catch (err) {
        console.error('Failed to create notification record:', err);
      }
    }

    // If sending failed, return error
    if (status === 'failed') {
      return res.status(500).json({
        error: errorMessage || 'Failed to send email',
        messageId,
        to,
        sentAt,
      });
    }

    res.json({
      success: true,
      messageId,
      to,
      sentAt,
    });
  } catch (error) {
    console.error('Send Email error:', error);
    res.status(500).json({ error: error.message || 'Failed to send email' });
  }
});

// Get Email history
app.get('/api/email', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const { clientId, limit = 50, offset = 0 } = req.query;

    // Get stored email history
    let emailList = [...messageHistory.email];

    // Filter by clientId if provided
    if (clientId) {
      emailList = emailList.filter(email => email.clientId === clientId);
    }

    // Apply pagination
    const total = emailList.length;
    const start = parseInt(offset);
    const end = start + parseInt(limit);
    const paginatedEmails = emailList.slice(start, end);

    res.json({
      items: paginatedEmails,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    console.error('Get Email history error:', error);
    res.status(500).json({ error: 'Failed to fetch email history' });
  }
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`✅ Simple API server running on http://localhost:${port}/api`);
});
