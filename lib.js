import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

export function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function passwordMatches(password, stored) {
  const [salt, hash] = stored.split(':');
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(hash, 'hex'));
}
export const digest = value => createHash('sha256').update(value).digest('hex');
export function money(value) {
  const text = String(value ?? '').trim();
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(text)) throw new Error('Enter a positive amount with up to two decimal places.');
  const [whole, fraction = ''] = text.split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (amount <= 0) throw new Error('Amount must be greater than zero.');
  return amount;
}
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= '1900-01-01' && value <= '2199-12-31';
}
export function monthRange(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month ?? '') || month < '1900-01' || month > '2199-12') throw new Error('Choose a valid month.');
  const [y, m] = month.split('-').map(Number);
  return [month + '-01', `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`];
}
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
