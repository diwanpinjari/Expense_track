import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
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
  `);
  const categories = [
    ['Food & dining','expense','#e9aa4b','utensils'],['Transport','expense','#7996df','car'],
    ['Shopping','expense','#b18bd2','bag'],['Education','expense','#54aaa0','book'],
    ['Bills & utilities','expense','#e28285','bolt'],['Health','expense','#83a970','heart'],
    ['Entertainment','expense','#d88cae','play'],['Other expenses','expense','#929aa8','dots'],
    ['Salary','income','#327e69','briefcase'],['Allowance','income','#63a18a','wallet'],
    ['Freelance','income','#637eaa','laptop'],['Other income','income','#939d6c','plus']
  ];
  const insert = db.prepare('INSERT OR IGNORE INTO categories(id,name,kind,color,icon) VALUES(?,?,?,?,?)');
  categories.forEach((c,i) => insert.run(i+1,...c));
  return db;
}
