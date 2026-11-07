import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.js';
import { money, validDate, monthRange, csvCell, otpCode, otpHash, otpMatches } from '../lib.js';

let db, server, base, alice, bob;
const sentCodes = new Map();
async function request(path,{user,method='GET',data,headers={}}={}) {
  const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(user?{Cookie:user.cookie,'X-CSRF-Token':user.csrf}:{}),...headers},body:data===undefined?undefined:JSON.stringify(data)});
  const body=response.headers.get('content-type')?.includes('json')?await response.json():await response.text();
  return {status:response.status,body,response};
}
async function requestOtp(name,email) {
  const r=await request('/api/register/request-otp',{method:'POST',data:{name,email,password:'TestPassword123!'}});
  assert.equal(r.status,200);
  return sentCodes.get(email.trim().toLowerCase());
}
async function register(name,email) {
  const otp=await requestOtp(name,email);
  const r=await request('/api/register/verify-otp',{method:'POST',data:{email,otp}});
  assert.equal(r.status,200);return {cookie:r.response.headers.get('set-cookie').split(';')[0],csrf:r.body.csrf,id:r.body.user.id};
}
before(async()=>{
  const app=await createApp({
    database:':memory:',
    otpSecret:'a-test-only-secret',
    otpCooldownMs:0,
    otpSender:async({to,code})=>{sentCodes.set(to,code);return {delivery:'console'};}
  });db=app.db;
  server=app.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  base=`http://127.0.0.1:${server.address().port}`;
  alice=await register('Alice','alice@example.com');bob=await register('Bob','bob@example.com');
});
after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();});

test('money is exact and rejects invalid amounts',()=>{
  assert.equal(money('125.50'),12550);assert.equal(money('0.01'),1);assert.equal(money('12.1'),1210);
  for(const value of ['0','-1','12.001','Infinity','1e4','',null,'1000000000'])assert.throws(()=>money(value));
});
test('dates and month boundaries include leap years',()=>{
  assert.equal(validDate('2024-02-29'),true);assert.equal(validDate('2026-02-29'),false);assert.equal(validDate('2026-04-31'),false);
  assert.deepEqual(monthRange('2026-12'),['2026-12-01','2027-01-01']);assert.throws(()=>monthRange('2026-13'));
});
test('CSV quoting neutralises formulas and keeps commas',()=>{
  assert.equal(csvCell('=1+1'),'"\'=1+1"');assert.equal(csvCell('  @SUM(A1)'),'"\'  @SUM(A1)"');assert.equal(csvCell('coffee, "large"'),'"coffee, ""large"""');
});
test('OTP codes are six digits and can only be checked with the server secret',()=>{
  const code=otpCode();assert.match(code,/^\d{6}$/);
  const stored=otpHash(code,'secret-one');
  assert.equal(otpMatches(code,stored,'secret-one'),true);
  assert.equal(otpMatches(code,stored,'secret-two'),false);
  assert.equal(otpMatches('000000',stored,'secret-one'),false);
});
test('private endpoints require sign in',async()=>assert.equal((await request('/api/transactions')).status,401));
test('fresh installation and newly registered accounts have no financial data',async()=>{
  const fresh=await createApp({database:':memory:'});
  try {
    for(const name of ['users','transactions','budgets','sessions','registration_otps']) assert.equal((await fresh.db.prepare(`SELECT COUNT(*) count FROM ${name}`).get()).count,0);
  } finally {fresh.db.close();}
  const summary=(await request('/api/summary?month=2026-11',{user:alice})).body;
  assert.equal(summary.income,0);assert.equal(summary.expense,0);assert.equal(summary.balance,0);assert.equal(summary.count,0);
  assert.deepEqual(summary.breakdown,[]);assert.deepEqual(summary.budgets,[]);assert.deepEqual(summary.daily,[]);
});
test('account is not created until the emailed code is verified',async()=>{
  const email='pending@example.com';
  const otp=await requestOtp('Pending Person',email);
  assert.match(otp,/^\d{6}$/);
  assert.equal(await db.prepare('SELECT id FROM users WHERE email=?').get(email),undefined);
  const pending=await db.prepare('SELECT * FROM registration_otps WHERE email=?').get(email);
  assert.ok(pending);assert.notEqual(pending.password_hash,'TestPassword123!');assert.notEqual(pending.otp_hash,otp);
  const wrong=await request('/api/register/verify-otp',{method:'POST',data:{email,otp:String((Number(otp)+1)%1000000).padStart(6,'0')}});
  assert.equal(wrong.status,401);assert.match(wrong.body.error,/4 attempts remaining/);
  assert.equal(await db.prepare('SELECT id FROM users WHERE email=?').get(email),undefined);
  const verified=await request('/api/register/verify-otp',{method:'POST',data:{email,otp}});
  assert.equal(verified.status,200);assert.equal(verified.body.user.email,email);
  assert.equal(await db.prepare('SELECT email FROM registration_otps WHERE email=?').get(email),undefined);
  assert.equal((await request('/api/register/verify-otp',{method:'POST',data:{email,otp}})).status,400);
});
test('resending replaces the old code and expired codes are rejected',async()=>{
  const email='resend@example.com';
  const first=await requestOtp('Resend Person',email);
  const resent=await request('/api/register/resend-otp',{method:'POST',data:{email}});
  assert.equal(resent.status,200);assert.match(resent.body.delivery,/^(email|console)$/);
  const second=sentCodes.get(email);assert.notEqual(first,second);
  assert.equal((await request('/api/register/verify-otp',{method:'POST',data:{email,otp:first}})).status,401);
  await db.prepare('UPDATE registration_otps SET expires_at=? WHERE email=?').run(Date.now()-1,email);
  assert.equal((await request('/api/register/verify-otp',{method:'POST',data:{email,otp:second}})).status,410);
  assert.equal((await request('/api/register/resend-otp',{method:'POST',data:{email}})).status,404);
});
test('five incorrect attempts invalidate the code',async()=>{
  const email='attempts@example.com';
  await requestOtp('Attempt Person',email);
  for(let attempt=1;attempt<=4;attempt++) {
    const r=await request('/api/register/verify-otp',{method:'POST',data:{email,otp:'000000'}});
    assert.equal(r.status,401);
  }
  const last=await request('/api/register/verify-otp',{method:'POST',data:{email,otp:'000000'}});
  assert.equal(last.status,429);assert.match(last.body.error,/Too many incorrect attempts/);
  assert.equal(await db.prepare('SELECT email FROM registration_otps WHERE email=?').get(email),undefined);
});
test('duplicate registration is rejected case insensitively',async()=>{
  const r=await request('/api/register/request-otp',{method:'POST',data:{name:'Another Alice',email:'ALICE@example.com',password:'TestPassword123!'}});assert.equal(r.status,409);
});
test('sign in verifies password and sets HTTP-only cookie',async()=>{
  assert.equal((await request('/api/login',{method:'POST',data:{email:'alice@example.com',password:'wrong'}})).status,401);
  const r=await request('/api/login',{method:'POST',data:{email:'alice@example.com',password:'TestPassword123!'}});
  assert.equal(r.status,200);assert.match(r.response.headers.get('set-cookie'),/HttpOnly/);assert.match(r.response.headers.get('set-cookie'),/SameSite=Lax/);
});
test('write operations reject missing CSRF and foreign origins',async()=>{
  assert.equal((await request('/api/transactions',{user:alice,method:'POST',headers:{'X-CSRF-Token':''},data:{}})).status,403);
  assert.equal((await request('/api/register/request-otp',{method:'POST',headers:{Origin:'https://another-site.example'},data:{}})).status,403);
});
test('transaction type, amount and date validation',async()=>{
  const values={kind:'expense',category:1,amount:'25.00',date:'2026-10-15',note:'Lunch'};
  for(const change of [{category:9},{amount:'-3'},{date:'2026-02-30'},{kind:'transfer'}]) {
    assert.equal((await request('/api/transactions',{user:alice,method:'POST',data:{...values,...change}})).status,400);
  }
});
test('ledger operations stay private and monthly summaries stay accurate',async()=>{
  const make=async(user,kind,category,amount,date,note)=>{
    const r=await request('/api/transactions',{user,method:'POST',data:{kind,category,amount,date,note}});assert.equal(r.status,201);return r.body.id;
  };
  const id=await make(alice,'expense',1,'125.50','2026-10-01','Lunch');
  await make(alice,'income',10,'1000.00','2026-10-31','Allowance');
  await make(alice,'expense',1,'200.00','2026-11-01','Next month');
  await make(bob,'expense',1,'999.00','2026-10-01','Private entry');
  const initial=(await request('/api/summary?month=2026-10',{user:alice})).body;
  assert.equal(initial.expense,12550);assert.equal(initial.income,100000);assert.equal(initial.balance,87450);assert.equal(initial.count,2);
  const list=(await request('/api/transactions?month=2026-10',{user:alice})).body;assert.equal(list.length,2);assert.ok(list.every(t=>t.user_id===alice.id));
  const edit={kind:'expense',category:1,amount:'150.00',date:'2026-10-02',note:'Updated lunch'};
  assert.equal((await request('/api/transactions/'+id,{user:bob,method:'PUT',data:edit})).status,404);
  assert.equal((await request('/api/transactions/'+id,{user:bob,method:'DELETE'})).status,404);
  assert.equal((await request('/api/transactions/'+id,{user:alice,method:'PUT',data:edit})).status,200);
  assert.equal((await request('/api/summary?month=2026-10',{user:alice})).body.expense,15000);
  assert.equal((await request('/api/transactions?month=2026-10&q=Updated&kind=expense&category=1',{user:alice})).body.length,1);
  assert.equal((await request('/api/transactions?month=2026-10&q=%25',{user:alice})).body.length,0);
  assert.equal((await request('/api/transactions/'+id,{user:alice,method:'DELETE'})).status,200);
  assert.equal((await request('/api/summary?month=2026-10',{user:alice})).body.expense,0);
});
test('budgets upsert, count only matching expenses and report overspending',async()=>{
  const save=amount=>request('/api/budgets',{user:alice,method:'POST',data:{category:2,month:'2026-09',amount}});
  assert.equal((await save('100')).status,200);assert.equal((await save('120')).status,200);
  await request('/api/transactions',{user:alice,method:'POST',data:{category:2,kind:'expense',amount:'150',date:'2026-09-10',note:'Bus'}});
  await request('/api/transactions',{user:alice,method:'POST',data:{category:1,kind:'expense',amount:'50',date:'2026-09-10',note:'Food'}});
  const s=(await request('/api/summary?month=2026-09',{user:alice})).body;
  assert.equal(s.budgets.length,1);assert.equal(s.budgets[0].spent,15000);assert.equal(s.budgets[0].limit_paise-s.budgets[0].spent,-3000);
  assert.equal((await request('/api/summary?month=2026-09',{user:bob})).body.budgets.length,0);
  assert.equal((await request('/api/budgets/'+s.budgets[0].id,{user:bob,method:'DELETE'})).status,404);
  assert.equal((await request('/api/budgets/'+s.budgets[0].id,{user:alice,method:'DELETE'})).status,200);
  assert.equal((await request('/api/summary?month=2026-09',{user:alice})).body.expense,20000);
});
test('CSV exports only the selected user and filters and escapes notes',async()=>{
  await request('/api/transactions',{user:alice,method:'POST',data:{category:1,kind:'expense',amount:'11.25',date:'2026-08-01',note:'=SUM(A1:A2)'}});
  const r=await request('/api/export?month=2026-08&kind=expense',{user:alice});
  assert.equal(r.status,200);assert.match(r.body,/'=SUM/);assert.match(r.body,/11\.25/);assert.doesNotMatch(r.body,/Private entry/);
  assert.equal((await request('/api/export?month=2026-08&kind=income',{user:alice})).body.trim().split('\r\n').length,1);
});
test('database constraints reject mismatched categories and non-integer money',async()=>{
  await assert.rejects(()=>db.prepare('INSERT INTO transactions(user_id,category_id,kind,amount_paise,occurred_on) VALUES(?,?,?,?,?)').run(alice.id,9,'expense',100,'2026-10-01'));
  await assert.rejects(()=>db.prepare('INSERT INTO transactions(user_id,category_id,kind,amount_paise,occurred_on) VALUES(?,?,?,?,?)').run(alice.id,1,'expense',10.5,'2026-10-01'));
});
test('logout invalidates the stored session',async()=>{
  const user=await register('Log Out','logout@example.com');
  assert.equal((await request('/api/logout',{user,method:'POST'})).status,200);
  assert.equal((await request('/api/summary?month=2026-10',{user})).status,401);
});
