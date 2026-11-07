import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createClient } from '@tursodatabase/serverless/compat';

const TABLES = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('income','expense')),
    color TEXT NOT NULL, icon TEXT NOT NULL, UNIQUE(id,kind));
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('income','expense')),
    amount_paise INTEGER NOT NULL CHECK(typeof(amount_paise)='integer' AND amount_paise>0),
    occurred_on TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(category_id,kind) REFERENCES categories(id,kind));
  CREATE INDEX IF NOT EXISTS idx_owner_date ON transactions(user_id,occurred_on);
  CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL, kind TEXT NOT NULL DEFAULT 'expense' CHECK(kind='expense'),
    month TEXT NOT NULL, limit_paise INTEGER NOT NULL CHECK(typeof(limit_paise)='integer' AND limit_paise>0),
    FOREIGN KEY(category_id,kind) REFERENCES categories(id,kind), UNIQUE(user_id,category_id,month));
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS registration_otps (
    email TEXT PRIMARY KEY, name TEXT NOT NULL, password_hash TEXT NOT NULL,
    otp_hash TEXT NOT NULL, expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0, sent_at INTEGER NOT NULL);
`;

const CATEGORIES = [
  ['Food & dining','expense','#e9aa4b','utensils'],['Transport','expense','#7996df','car'],
  ['Shopping','expense','#b18bd2','bag'],['Education','expense','#54aaa0','book'],
  ['Bills & utilities','expense','#e28285','bolt'],['Health','expense','#83a970','heart'],
  ['Entertainment','expense','#d88cae','play'],['Other expenses','expense','#929aa8','dots'],
  ['Salary','income','#327e69','briefcase'],['Allowance','income','#63a18a','wallet'],
  ['Freelance','income','#637eaa','laptop'],['Other income','income','#939d6c','plus']
];

const CATEGORY_STATEMENTS = CATEGORIES.map((category, index) => ({
  sql: 'INSERT OR IGNORE INTO categories(id,name,kind,color,icon) VALUES(?,?,?,?,?)',
  args: [index + 1, ...category]
}));

function normalizeRun(result) {
  return {
    changes: Number(result.changes ?? 0),
    lastInsertRowid: result.lastInsertRowid === undefined || result.lastInsertRowid === null
      ? undefined
      : Number(result.lastInsertRowid)
  };
}

function normalizeResult(result) {
  return {
    changes: Number(result.rowsAffected ?? 0),
    lastInsertRowid: result.lastInsertRowid === undefined || result.lastInsertRowid === null
      ? undefined
      : Number(result.lastInsertRowid)
  };
}

function addRemoteContext(error, label) {
  const wrapped = new Error(`${error.message} [${label}]`);
  wrapped.cause = error;
  return wrapped;
}

class LocalDatabase {
  constructor(raw) {
    this.raw = raw;
    this.kind = 'local';
  }

  prepare(sql) {
    return {
      get: async (...args) => this.raw.prepare(sql).get(...args),
      all: async (...args) => this.raw.prepare(sql).all(...args),
      run: async (...args) => normalizeRun(this.raw.prepare(sql).run(...args))
    };
  }

  async exec(sql) {
    this.raw.exec(sql);
  }

  async batch(statements) {
    this.raw.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map(statement => normalizeRun(
        this.raw.prepare(statement.sql).run(...(statement.args || []))
      ));
      this.raw.exec('COMMIT');
      return results;
    } catch (error) {
      try { this.raw.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  close() {
    this.raw.close();
  }
}

class TursoDatabase {
  constructor(client) {
    this.client = client;
    this.kind = 'remote';
  }

  async retryAfterStaleSession(action) {
    try {
      return await action();
    } catch (error) {
      if (!String(error?.message || '').includes('HTTP error! status: 404')) throw error;
      this.client.reconnect();
      return action();
    }
  }

  prepare(sql) {
    return {
      get: async (...args) => {
        try {
          return await this.retryAfterStaleSession(async () => (await this.client.batch([{ sql, args }], 'read'))[0].rows[0]);
        } catch (error) { throw addRemoteContext(error, `get ${sql.trim().slice(0, 50)}`); }
      },
      all: async (...args) => {
        try {
          return await this.retryAfterStaleSession(async () => (await this.client.batch([{ sql, args }], 'read'))[0].rows);
        } catch (error) { throw addRemoteContext(error, `all ${sql.trim().slice(0, 50)}`); }
      },
      run: async (...args) => {
        try {
          return await this.retryAfterStaleSession(async () => normalizeResult((await this.client.batch([{ sql, args }], 'write'))[0]));
        } catch (error) { throw addRemoteContext(error, `run ${sql.trim().slice(0, 50)}`); }
      }
    };
  }

  async exec(sql) {
    try {
      await this.retryAfterStaleSession(() => this.client.executeMultiple(sql));
    } catch (error) { throw addRemoteContext(error, 'exec schema'); }
  }

  async batch(statements) {
    try {
      const results = await this.retryAfterStaleSession(() => this.client.batch(
        statements.map(statement => ({ sql: statement.sql, args: statement.args || [] }))
      ));
      return results.map(normalizeResult);
    } catch (error) {
      throw addRemoteContext(error, `batch ${statements.map(statement => statement.sql.trim().slice(0, 35)).join(' | ')}`);
    }
  }

  close() {
    this.client.close();
  }
}

export async function openDatabase({ path, url, authToken } = {}) {
  if (url) {
    const client = createClient({ url, authToken });
    const db = new TursoDatabase(client);
    try { await db.exec('PRAGMA foreign_keys=ON'); } catch {}
    await db.exec(TABLES);
    await db.batch(CATEGORY_STATEMENTS);
    return db;
  }

  if (!path) throw new Error('A database path or a Turso database URL is required.');
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const { DatabaseSync } = await import('node:sqlite');
  const db = new LocalDatabase(new DatabaseSync(path));
  await db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  await db.exec(TABLES);
  await db.batch(CATEGORY_STATEMENTS);
  return db;
}
