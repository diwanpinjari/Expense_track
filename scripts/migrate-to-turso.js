import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../db.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const localPath = process.env.LOCAL_DB || join(root, 'data', 'expenses.db');
const url = process.env.TURSO_DATABASE_URL?.trim();
const authToken = process.env.TURSO_AUTH_TOKEN?.trim();

if (!url || !authToken) {
  console.error('Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN before running the migration.');
  process.exit(1);
}

const local = await openDatabase({ path: localPath });
const remote = await openDatabase({ url, authToken });

try {
  const existing = await remote.prepare('SELECT COUNT(*) count FROM users').get();
  if (Number(existing.count) > 0) {
    throw new Error('The Turso database already has accounts. The migration was stopped so no records are overwritten.');
  }

  const users = await local.prepare('SELECT * FROM users ORDER BY id').all();
  const transactions = await local.prepare('SELECT * FROM transactions ORDER BY id').all();
  const budgets = await local.prepare('SELECT * FROM budgets ORDER BY id').all();

  if (users.length === 0) {
    console.log('The local database has no accounts, so there is nothing to copy.');
  } else {
    const statements = [
      ...users.map(row => ({
        sql: 'INSERT INTO users(id,name,email,password_hash,created_at) VALUES(?,?,?,?,?)',
        args: [row.id, row.name, row.email, row.password_hash, row.created_at]
      })),
      ...transactions.map(row => ({
        sql: 'INSERT INTO transactions(id,user_id,category_id,kind,amount_paise,occurred_on,note,created_at) VALUES(?,?,?,?,?,?,?,?)',
        args: [row.id, row.user_id, row.category_id, row.kind, row.amount_paise, row.occurred_on, row.note, row.created_at]
      })),
      ...budgets.map(row => ({
        sql: 'INSERT INTO budgets(id,user_id,category_id,kind,month,limit_paise) VALUES(?,?,?,?,?,?)',
        args: [row.id, row.user_id, row.category_id, row.kind, row.month, row.limit_paise]
      }))
    ];

    await remote.batch(statements);

    const copied = {
      accounts: Number((await remote.prepare('SELECT COUNT(*) count FROM users').get()).count),
      transactions: Number((await remote.prepare('SELECT COUNT(*) count FROM transactions').get()).count),
      budgets: Number((await remote.prepare('SELECT COUNT(*) count FROM budgets').get()).count)
    };
    console.log(`Copied ${copied.accounts} account(s), ${copied.transactions} transaction(s) and ${copied.budgets} budget(s) to Turso.`);
    console.log('Your local database was not changed. Sign in on the deployed website with your existing email and password.');
  }
} finally {
  local.close();
  remote.close();
}
