import nodemailer from 'nodemailer';

function settings() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  const from = process.env.OTP_FROM?.trim() || user;
  if (!host || !user || !pass || !from) return null;
  const port = Number(process.env.SMTP_PORT) || 587;
  return {
    host, port, from, user, pass,
    secure: process.env.SMTP_SECURE === 'true' || port === 465
  };
}

let transporter;
let transporterKey = '';

export function emailIsConfigured() {
  return Boolean(settings());
}

function getTransport(config) {
  const key = `${config.host}:${config.port}:${config.user}:${config.pass.length}`;
  if (!transporter || key !== transporterKey) {
    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000
    });
    transporterKey = key;
  }
  return transporter;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

export async function sendOtpEmail({ to, name, code }) {
  const config = settings();
  if (!config) {
    console.log(`\n  ┌────────────────────────────────────────────┐`);
    console.log(`  │  ACCOUNT VERIFICATION CODE                  │`);
    console.log(`  │  ${code}  ·  expires in 10 minutes           │`);
    console.log(`  │  ${to.padEnd(40).slice(0, 40)}  │`);
    console.log(`  └────────────────────────────────────────────┘\n`);
    console.log('  Email delivery is not configured. Enter this code on the website.');
    console.log('  To send real email, add the SMTP settings shown in .env.example.\n');
    return { delivery: 'console' };
  }

  const safeName = escapeHtml(name);
  await getTransport(config).sendMail({
    from: config.from,
    to,
    subject: `${code} is your Personal Expense Tracker code`,
    text: `Hello ${name},\n\nYour account verification code is ${code}. It expires in 10 minutes.\n\nIf you did not request this account, you can ignore this email.\n\nPersonal Expense Tracker`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#24332c;line-height:1.6">
      <h2 style="color:#214f43">Verify your email</h2>
      <p>Hello ${safeName},</p>
      <p>Use this code to finish creating your Personal Expense Tracker account:</p>
      <div style="font-size:32px;letter-spacing:8px;font-weight:bold;background:#f2f7ef;border-radius:10px;padding:18px 22px;text-align:center;color:#214f43">${code}</div>
      <p>The code expires in 10 minutes. If you did not request this account, you can ignore this email.</p>
      <p style="color:#7d8b82;font-size:12px">Personal Expense Tracker</p>
    </div>`
  });
  return { delivery: 'email' };
}
