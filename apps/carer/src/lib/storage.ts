import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";

const DB_NAME = "poolcare_carer.db";

// Initialize database
export async function initDatabase() {
  const db = await SQLite.openDatabaseAsync(DB_NAME);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS m_user (
      id TEXT PRIMARY KEY,
      orgId TEXT NOT NULL,
      name TEXT,
      role TEXT,
      token TEXT,
      tokenExp INTEGER,
      updatedAt INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS m_job (
      id TEXT PRIMARY KEY,
      orgId TEXT NOT NULL,
      poolId TEXT,
      windowStart TEXT,
      windowEnd TEXT,
      status TEXT,
      templateId TEXT,
      assignedTo TEXT,
      lastLocalEdit INTEGER DEFAULT (strftime('%s', 'now')),
      updatedAt INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS m_pool (
      id TEXT PRIMARY KEY,
      orgId TEXT NOT NULL,
      clientId TEXT,
      name TEXT,
      address TEXT,
      lat REAL,
      lng REAL,
      accessNotes TEXT,
      updatedAt INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS m_visit (
      id TEXT PRIMARY KEY,
      orgId TEXT NOT NULL,
      jobId TEXT,
      startedAt INTEGER,
      arrivedAt INTEGER,
      completedAt INTEGER,
      notes TEXT,
      lastLocalEdit INTEGER DEFAULT (strftime('%s', 'now')),
      updatedAt INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS m_reading (
      id TEXT PRIMARY KEY,
      orgId TEXT NOT NULL,
      visitId TEXT,
      ph REAL,
      chlorineFree REAL,
      alkalinity REAL,
      measuredAt INTEGER,
      updatedAt INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS m_chemical (
      id TEXT PRIMARY KEY,
      orgId TEXT NOT NULL,
      visitId TEXT,
      chemical TEXT,
      qty REAL,
      unit TEXT,
      updatedAt INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS m_photo (
      id TEXT PRIMARY KEY,
      orgId TEXT NOT NULL,
      visitId TEXT,
      label TEXT,
      filePath TEXT,
      remoteUrl TEXT,
      takenAt INTEGER,
      uploadState TEXT DEFAULT 'queued',
      retryCount INTEGER DEFAULT 0,
      updatedAt INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS m_queue (
      id TEXT PRIMARY KEY,
      method TEXT,
      path TEXT,
      body TEXT,
      occurredAt INTEGER,
      attempts INTEGER DEFAULT 0,
      lastError TEXT,
      dedupeKey TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_job_org ON m_job(orgId);
    CREATE INDEX IF NOT EXISTS idx_visit_job ON m_visit(jobId);
    CREATE INDEX IF NOT EXISTS idx_photo_visit ON m_photo(visitId);
    CREATE INDEX IF NOT EXISTS idx_photo_upload ON m_photo(uploadState);
  `);

  return db;
}

// Secure storage for tokens
export async function storeToken(token: string) {
  await SecureStore.setItemAsync("auth_token", token);
}

export async function getToken(): Promise<string | null> {
  return await SecureStore.getItemAsync("auth_token");
}

export async function clearToken() {
  await SecureStore.deleteItemAsync("auth_token");
}

