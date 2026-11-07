import express from 'express';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { openDatabase } from './db.js';
import { money, validDate, monthRange, passwordHash, passwordMatches, digest, csvCell, localDate, otpCode, otpHash, otpMatches } from './lib.js';
import { sendOtpEmail, emailIsConfigured } from './mailer.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const asyncRoute = handler => (req,res,next) => Promise.resolve(handler(req,res,next)).catch(next);

export async function createApp({
  database,
  otpSender = sendOtpEmail,
  otpSecret = process.env.OTP_SECRET || randomBytes(32).toString('hex'),
  otpCooldownMs = 60_000,
  otpTtlMs = 10 * 60_000
} = {}) {
  const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
  const tursoToken = process.env.TURSO_AUTH_TOKEN?.trim();
  if (process.env.VERCEL === '1' && !database && !tursoUrl) {
    throw new Error('TURSO_DATABASE_URL is required on Vercel. Connect a Turso database to this project.');
  }
  if (tursoUrl && !tursoToken) {
    throw new Error('TURSO_AUTH_TOKEN is required when TURSO_DATABASE_URL is set.');
  }
  const db = await openDatabase(database
    ? { path: database }
    : { path: join(root,'data','expenses.db'), url: tursoUrl, authToken: tursoToken });
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((req,res,next) => {
    res.set({ 'X-Content-Type-Options':'nosniff', 'X-Frame-Options':'DENY', 'Referrer-Policy':'same-origin',
      'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" });
    if(req.path.startsWith('/api')) res.set('Cache-Control','no-store');
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.headers.origin && req.headers.origin !== `${req.protocol}://${req.get('host')}`) return res.status(403).json({error:'This request is not allowed.'});
    next();
  });
  app.use(express.json({limit:'16kb'}));
  app.use('/api', asyncRoute(async (req,res,next) => {
    const token = (req.headers.cookie || '').split(';').map(s=>s.trim()).find(s=>s.startsWith('pet_session='))?.slice(12);
    if (token) req.session = await db.prepare(`SELECT s.*, u.name, u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=? AND expires_at>?`).get(digest(token),Date.now());
    next();
  }));
  const throttle = new Map();
  function authLimit(req,res,next) {
    const key = req.ip; const now=Date.now();
    for (const [ip,entry] of throttle) if(now>entry.until) throttle.delete(ip);
    const entry=throttle.get(key)||{count:0,until:now+15*60*1000}; entry.count++; throttle.set(key,entry);
    if(entry.count>60) return res.status(429).json({error:'Too many attempts. Please try again in 15 minutes.'});
    next();
  }
  async function establish(user,req,res) {
    if(req.session) await db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.session.token_hash);
    await db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());
    const token = randomBytes(32).toString('hex'), csrf=randomBytes(24).toString('hex');
    await db.prepare('INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES(?,?,?,?)').run(digest(token),user.id,csrf,Date.now()+8*60*60*1000);
    res.cookie('pet_session',token,{httpOnly:true,sameSite:'lax',secure:req.secure,maxAge:8*60*60*1000,path:'/'});
    res.json({user:{id:user.id,name:user.name,email:user.email},csrf});
  }
  function registrationDetails(body) {
    const {name,email,password} = body;
    if(typeof name!=='string'||name.trim().length<2||name.trim().length>60) throw new Error('Enter a name between 2 and 60 characters.');
    if(typeof email!=='string'||email.length>150||!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid email address.');
    if(typeof password!=='string'||password.length<8||password.length>128) throw new Error('Use a password between 8 and 128 characters.');
    return { name:name.trim(), email:email.trim().toLowerCase(), passwordHash:passwordHash(password) };
  }
  function secondsUntilResend(pending) {
    if(!pending) return 0;
    return Math.max(0, Math.ceil((pending.sent_at + otpCooldownMs - Date.now()) / 1000));
  }
  function otpResponse(email,delivery) {
    return { email, delivery, expiresIn: Math.round(otpTtlMs / 1000), resendAfter: Math.round(otpCooldownMs / 1000) };
  }
  app.post('/api/register/request-otp',authLimit,asyncRoute(async(req,res) => {
    let email = '';
    let codeHash = '';
    try {
      const details = registrationDetails(req.body);
      email = details.email;
      await db.prepare('DELETE FROM registration_otps WHERE expires_at<?').run(Date.now());
      if(await db.prepare('SELECT id FROM users WHERE email=?').get(email)) return res.status(409).json({error:'This email is already registered. Please sign in.'});
      const pending = await db.prepare('SELECT * FROM registration_otps WHERE email=?').get(email);
      const wait = secondsUntilResend(pending);
      if(wait > 0) return res.status(429).json({error:`A code was sent recently. Please wait ${wait} seconds before requesting another.`,retryAfter:wait});
      const code = otpCode();
      codeHash = otpHash(code,otpSecret);
      const now = Date.now();
      await db.prepare(`INSERT INTO registration_otps(email,name,password_hash,otp_hash,expires_at,attempts,sent_at)
        VALUES(?,?,?,?,?,0,?)
        ON CONFLICT(email) DO UPDATE SET name=excluded.name,password_hash=excluded.password_hash,
        otp_hash=excluded.otp_hash,expires_at=excluded.expires_at,attempts=0,sent_at=excluded.sent_at`)
        .run(email,details.name,details.passwordHash,codeHash,now+otpTtlMs,now);
      const { delivery } = await otpSender({ to: email, name: details.name, code });
      res.json(otpResponse(email,delivery));
    } catch(error) {
      if(email) await db.prepare('DELETE FROM registration_otps WHERE email=? AND otp_hash=?').run(email,codeHash);
      if(['Enter a name between 2 and 60 characters.','Enter a valid email address.','Use a password between 8 and 128 characters.'].includes(error.message)) return res.status(400).json({error:error.message});
      console.error('Could not send the verification code:', error.message);
      res.status(502).json({error:'We could not send the verification code. Please try again.'});
    }
  }));
  app.post('/api/register/verify-otp',authLimit,asyncRoute(async(req,res) => {
    try {
      const email = typeof req.body.email==='string' ? req.body.email.trim().toLowerCase() : '';
      const code = typeof req.body.otp==='string' ? req.body.otp.trim() : '';
      if(!/^\d{6}$/.test(code)) return res.status(400).json({error:'Enter the 6-digit code from your email.'});
      const pending = await db.prepare('SELECT * FROM registration_otps WHERE email=?').get(email);
      if(!pending) return res.status(400).json({error:'This code is no longer valid. Start the account creation again.'});
      if(pending.expires_at <= Date.now()) {
        await db.prepare('DELETE FROM registration_otps WHERE email=?').run(email);
        return res.status(410).json({error:'That code has expired. Request a new one.'});
      }
      if(pending.attempts >= 5) {
        await db.prepare('DELETE FROM registration_otps WHERE email=?').run(email);
        return res.status(429).json({error:'Too many incorrect attempts. Request a new code.'});
      }
      if(!otpMatches(code,pending.otp_hash,otpSecret)) {
        const attempts = pending.attempts + 1;
        if(attempts >= 5) {
          await db.prepare('DELETE FROM registration_otps WHERE email=?').run(email);
          return res.status(429).json({error:'Too many incorrect attempts. Request a new code.'});
        }
        await db.prepare('UPDATE registration_otps SET attempts=? WHERE email=?').run(attempts,email);
        return res.status(401).json({error:`That code is not correct. ${5-attempts} ${5-attempts===1?'attempt':'attempts'} remaining.`});
      }
      if(await db.prepare('SELECT id FROM users WHERE email=?').get(email)) {
        await db.prepare('DELETE FROM registration_otps WHERE email=?').run(email);
        return res.status(409).json({error:'This email is already registered. Please sign in.'});
      }
      const [created] = await db.batch([
        { sql:'INSERT INTO users(name,email,password_hash) VALUES(?,?,?)', args:[pending.name,email,pending.password_hash] },
        { sql:'DELETE FROM registration_otps WHERE email=?', args:[email] }
      ]);
      if(created.lastInsertRowid === undefined) throw new Error('The new account number was not returned.');
      await establish({id:created.lastInsertRowid,name:pending.name,email},req,res);
    } catch(error) {
      console.error('Could not verify the account code:', error.stack || error.message);
      res.status(500).json({error:'We could not create your account. Please try again.'});
    }
  }));
  app.post('/api/register/resend-otp',authLimit,asyncRoute(async(req,res) => {
    const email = typeof req.body.email==='string' ? req.body.email.trim().toLowerCase() : '';
    try {
      const pending = await db.prepare('SELECT * FROM registration_otps WHERE email=?').get(email);
      if(!pending) return res.status(404).json({error:'Start the account creation again to request a new code.'});
      const wait = secondsUntilResend(pending);
      if(wait > 0) return res.status(429).json({error:`Please wait ${wait} seconds before requesting another code.`,retryAfter:wait});
      if(await db.prepare('SELECT id FROM users WHERE email=?').get(email)) {
        await db.prepare('DELETE FROM registration_otps WHERE email=?').run(email);
        return res.status(409).json({error:'This email is already registered. Please sign in.'});
      }
      const code = otpCode();
      const codeHash = otpHash(code,otpSecret);
      const now = Date.now();
      await db.prepare('UPDATE registration_otps SET otp_hash=?,expires_at=?,attempts=0,sent_at=? WHERE email=?').run(codeHash,now+otpTtlMs,now,email);
      try { const { delivery } = await otpSender({ to: email, name: pending.name, code }); res.json(otpResponse(email,delivery)); }
      catch(error) { await db.prepare('DELETE FROM registration_otps WHERE email=? AND otp_hash=?').run(email,codeHash); throw error; }
    } catch(error) {
      console.error('Could not resend the verification code:', error.message);
      res.status(502).json({error:'We could not send the code. Please try again.'});
    }
  }));
  app.post('/api/login',authLimit,asyncRoute(async(req,res) => {
    const {email,password}=req.body;
    if(typeof email!=='string'||typeof password!=='string'||password.length>128) return res.status(400).json({error:'Enter your email and password.'});
    const user=await db.prepare('SELECT * FROM users WHERE email=?').get(email.trim().toLowerCase());
    if(!user||!passwordMatches(password,user.password_hash)) return res.status(401).json({error:'Email or password is incorrect.'});
    await establish(user,req,res);
  }));
  app.get('/api/session',(req,res) => res.json(req.session?{user:{id:req.session.user_id,name:req.session.name,email:req.session.email},csrf:req.session.csrf}:{user:null}));
  app.use('/api',(req,res,next) => {
    if(!req.session) return res.status(401).json({error:'Please sign in to continue.'});
    if(!['GET','HEAD'].includes(req.method)&&req.get('X-CSRF-Token')!==req.session.csrf) return res.status(403).json({error:'Your session could not be verified. Refresh and try again.'});
    next();
  });
  app.post('/api/logout',asyncRoute(async(req,res) => {
    await db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.session.token_hash);
    res.clearCookie('pet_session',{path:'/'}).json({ok:true});
  }));
  app.get('/api/categories',asyncRoute(async(req,res)=>res.json(await db.prepare('SELECT * FROM categories').all())));
  function filters(req) {
    const [start,end]=monthRange(req.query.month || localDate().slice(0,7));
    const values=[req.session.user_id,start,end];
    let where='t.user_id=? AND t.occurred_on>=? AND t.occurred_on<?';
    if(req.query.kind) { if(!['income','expense'].includes(req.query.kind)) throw new Error('Choose a valid transaction type.'); where+=' AND t.kind=?'; values.push(req.query.kind); }
    if(req.query.category) { where+=' AND t.category_id=?'; values.push(Number(req.query.category)); }
    if(req.query.q) { where+=" AND (t.note LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\')"; const term='%'+String(req.query.q).slice(0,100).replace(/[\\%_]/g,'\\$&')+'%'; values.push(term,term); }
    return {where,values};
  }
  async function list(req) {
    const {where,values}=filters(req);
    return db.prepare(`SELECT t.*,c.name category,c.color,c.icon FROM transactions t JOIN categories c ON c.id=t.category_id WHERE ${where} ORDER BY t.occurred_on DESC,t.id DESC`).all(...values);
  }
  app.get('/api/transactions',asyncRoute(async(req,res)=>{try { res.json(await list(req)); } catch(e) {res.status(400).json({error:e.message});}}));
  async function entry(body) {
    if(!['income','expense'].includes(body.kind)) throw new Error('Choose income or expense.');
    if(!validDate(body.date)) throw new Error('Choose a valid calendar date between 1900 and 2199.');
    const category=await db.prepare('SELECT * FROM categories WHERE id=? AND kind=?').get(Number(body.category),body.kind);
    if(!category) throw new Error('Choose a category that matches the entry type.');
    if(typeof body.note!=='string'||body.note.trim().length>200) throw new Error('Keep the description under 200 characters.');
    return [category.id,body.kind,money(body.amount),body.date,body.note.trim()];
  }
  app.post('/api/transactions',asyncRoute(async(req,res) => {
    try { const values=await entry(req.body); const result=await db.prepare('INSERT INTO transactions(user_id,category_id,kind,amount_paise,occurred_on,note) VALUES(?,?,?,?,?,?)').run(req.session.user_id,...values); res.status(201).json({id:Number(result.lastInsertRowid)}); }
    catch(e) { res.status(400).json({error:e.message}); }
  }));
  app.put('/api/transactions/:id',asyncRoute(async(req,res)=>{
    try { const values=await entry(req.body); const result=await db.prepare('UPDATE transactions SET category_id=?,kind=?,amount_paise=?,occurred_on=?,note=? WHERE id=? AND user_id=?').run(...values,req.params.id,req.session.user_id); if(!result.changes) return res.status(404).json({error:'Transaction not found.'}); res.json({ok:true}); }
    catch(e) {res.status(400).json({error:e.message});}
  }));
  app.delete('/api/transactions/:id',asyncRoute(async(req,res)=>{
    const result=await db.prepare('DELETE FROM transactions WHERE id=? AND user_id=?').run(req.params.id,req.session.user_id);
    res.status(result.changes?200:404).json(result.changes?{ok:true}:{error:'Transaction not found.'});
  }));
  app.get('/api/summary',asyncRoute(async(req,res)=>{
    try {
      const month=req.query.month||localDate().slice(0,7); const [start,end]=monthRange(month); const uid=req.session.user_id;
      const totals=await db.prepare(`SELECT COALESCE(SUM(CASE WHEN kind='income' THEN amount_paise ELSE 0 END),0) income, COALESCE(SUM(CASE WHEN kind='expense' THEN amount_paise ELSE 0 END),0) expense,COUNT(*) count FROM transactions WHERE user_id=? AND occurred_on>=? AND occurred_on<?`).get(uid,start,end);
      const breakdown=await db.prepare(`SELECT c.id,c.name,c.color,c.icon,SUM(t.amount_paise) amount FROM transactions t JOIN categories c ON c.id=t.category_id WHERE t.user_id=? AND t.kind='expense' AND t.occurred_on>=? AND t.occurred_on<? GROUP BY c.id ORDER BY amount DESC`).all(uid,start,end);
      const budgets=await db.prepare(`SELECT b.id,b.category_id,b.limit_paise,c.name,c.color,c.icon,COALESCE((SELECT SUM(t.amount_paise) FROM transactions t WHERE t.user_id=b.user_id AND t.category_id=b.category_id AND t.kind='expense' AND t.occurred_on>=? AND t.occurred_on<?),0) spent FROM budgets b JOIN categories c ON c.id=b.category_id WHERE b.user_id=? AND b.month=? ORDER BY c.id`).all(start,end,uid,month);
      const daily=await db.prepare(`SELECT occurred_on date, SUM(CASE WHEN kind='income' THEN amount_paise ELSE 0 END) income,SUM(CASE WHEN kind='expense' THEN amount_paise ELSE 0 END) expense FROM transactions WHERE user_id=? AND occurred_on>=? AND occurred_on<? GROUP BY occurred_on`).all(uid,start,end);
      res.json({...totals,balance:totals.income-totals.expense,breakdown,budgets,daily});
    } catch(e) {res.status(400).json({error:e.message});}
  }));
  app.post('/api/budgets',asyncRoute(async(req,res)=>{
    try {
      monthRange(req.body.month); const amount=money(req.body.amount), cat=Number(req.body.category);
      if(!await db.prepare("SELECT id FROM categories WHERE id=? AND kind='expense'").get(cat)) throw new Error('Choose an expense category.');
      await db.prepare('INSERT INTO budgets(user_id,category_id,month,limit_paise) VALUES(?,?,?,?) ON CONFLICT(user_id,category_id,month) DO UPDATE SET limit_paise=excluded.limit_paise').run(req.session.user_id,cat,req.body.month,amount);
      res.json({ok:true});
    } catch(e) {res.status(400).json({error:e.message});}
  }));
  app.delete('/api/budgets/:id',asyncRoute(async(req,res)=>{
    const result=await db.prepare('DELETE FROM budgets WHERE id=? AND user_id=?').run(req.params.id,req.session.user_id);
    res.status(result.changes?200:404).json(result.changes?{ok:true}:{error:'Budget not found.'});
  }));
  app.get('/api/export',asyncRoute(async(req,res)=>{
    try {
      const rows=await list(req); const csv=[['Date','Description','Type','Category','Amount (INR)'],...rows.map(t=>[t.occurred_on,t.note,t.kind,t.category,(t.amount_paise/100).toFixed(2)])].map(row=>row.map(csvCell).join(',')).join('\r\n');
      res.type('text/csv').set('Content-Disposition','attachment; filename="expense-tracker-statement.csv"').send('\uFEFF'+csv);
    } catch(e) {res.status(400).json({error:e.message});}
  }));
  app.use('/api',(req,res)=>res.status(404).json({error:'This endpoint does not exist.'}));
  app.use(express.static(join(root,'public')));
  app.use((error,req,res,next)=>{ console.error(error.message); res.status(error.status||500).json({error:error.type==='entity.parse.failed'?'Invalid request data.':'Something went wrong. Please try again.'}); });
  return {app,db};
}

export function createLazyApp() {
  const app = express();
  let ready;
  app.use((req,res,next) => {
    ready ??= createApp();
    ready.then(({app: inner}) => inner(req,res,next)).catch(next);
  });
  app.use((error,req,res,next) => {
    console.error('Could not start the application:', error.message);
    if(res.headersSent) return next(error);
    res.status(500).json({error:'The application could not start. Please try again shortly.'});
  });
  return app;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain && process.env.VERCEL !== '1') {
  const {app,db}=await createApp(); const port=Number(process.env.PORT)||3100;
  const server=app.listen(port,'127.0.0.1',()=>console.log(`\nPersonal Expense Tracker\nOpen http://localhost:${port}\nCreate your account to start tracking your finances.\n${emailIsConfigured()?'OTP delivery: email configured.':'OTP delivery: not configured - codes will appear in this window.'}\n${db.kind==='remote'?'Data is saved in your Turso cloud database.':`Data is saved in ${join(root,'data','expenses.db')}`}\n`));
  server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Port ${port} is in use. Close the other app or set PORT to another number.`:error);db.close();process.exitCode=1;});
}

export default process.env.VERCEL === '1' ? createLazyApp() : undefined;
