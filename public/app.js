const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={
  grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  list:'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  target:'M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 12l8-8M16 4h4v4',
  chart:'M4 4v16h17M9 16v-5M14 16V7M19 16v-9',
  plus:'M12 5v14M5 12h14', arrow:'M7 17 17 7M7 7h10v10',down:'M7 7l10 10M7 17h10V7',
  chevron:'m9 5 7 7-7 7', calendar:'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2z',
  search:'M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16M17 17l4 4',
  download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',logout:'M9 4H4v16h5M9 12h12m-4-4 4 4-4 4',
  close:'m6 6 12 12M6 18 18 6', edit:'m15 5 4 4M4 20l4-1L20 7a2 2 0 0 0-4-4L4 15z',trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  wallet:'M20 8V5H4a2 2 0 0 0 0 4h17v11H4a2 2 0 0 1-2-2V7M21 12h-5v5h5M17 14h.01',
  utensils:'M4 3v7m4-7v7M2 3v6a4 4 0 0 0 8 0V3M6 13v8M19 3c-4 4-4 9 0 9V3v18',
  car:'m5 5-2 7v7h3v-3h12v3h3v-7l-2-7zM3 12h18M6 14h1M17 14h1',
  bag:'M4 7h16l1 14H3zM8 8V6a4 4 0 0 1 8 0v2',
  book:'M12 5v16M12 5C8 2 4 3 2 4v15c4-1 7-1 10 2 3-3 6-3 10-2V4c-2-1-6-2-10 1z',
  bolt:'m13 2-9 12h7l-1 8 10-13h-7z',heart:'M12 21 3 12C-3 4 7-2 12 5c5-7 15-1 9 7z',
  play:'M9 6v12l10-6z',dots:'M5 12h.01M12 12h.01M19 12h.01',briefcase:'M8 6V3h8v3M3 6h18v14H3zM3 11c6 5 12 5 18 0M10 12h4',
  laptop:'M4 3h16v13H4zM2 20h20l-2-4H4z', shield:'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6zM8 12l3 3 5-6',menu:'M4 6h16M4 12h16M4 18h16', spark:'m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z',check:'m5 12 4 4L19 6'
};
function icon(name,cls='') { return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.wallet}"/></svg>`; }
const today = () => {const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const currency = value => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:2,maximumFractionDigits:2}).format((value||0)/100);
const shortMoney = value => '₹'+new Intl.NumberFormat('en-IN',{maximumFractionDigits:0}).format((value||0)/100);
const dateLabel = date => new Date(date+'T12:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
const monthLabel = month => new Date(month+'-01T12:00:00').toLocaleDateString('en-IN',{month:'long',year:'numeric'});
const state={user:null,csrf:'',categories:[],month:today().slice(0,7),view:'dashboard',summary:null,transactions:[],kind:'',category:'',q:'',page:1,request:0};
let toastTimer;
function toast(text,error=false) {const el=$('#toast');el.textContent=text;el.className='visible'+(error?' error':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.className='',4200);}
async function api(path,options={}) {
  const response=await fetch('/api'+path,{...options,headers:{'Content-Type':'application/json','X-CSRF-Token':state.csrf,...options.headers}});
  const data=await response.json();
  if(!response.ok) {if(response.status===401&&state.user){state.user=null;$('#modal').close();renderAuth();}throw new Error(data.error||'Something went wrong.');}
  return data;
}
const brand=()=>`<div class="brand"><img src="/favicon.svg" alt="" width="38" height="38"><div>expense<span>PERSONAL FINANCE</span></div></div>`;

function renderAuth(register=false) {
  document.title='Welcome · Personal Expense Tracker';
  $('#app').innerHTML=`<main class="auth-layout">
    <section class="auth-story">${brand()}
      <div class="story-body">
        <div class="eyebrow">A LITTLE CLARITY. A LOT MORE CONTROL.</div>
        <h1>Make room for<br>what matters.</h1>
        <p>Your daily spending, monthly plans and bigger picture.<br> Finally, together in one calm space.</p>
        <div class="auth-features">
          <div>${icon('wallet')}<div><strong>Keep your money organised</strong><p>Record income and expenses as they happen.</p></div></div>
          <div>${icon('target')}<div><strong>Plan with intention</strong><p>Set your own monthly spending limits.</p></div></div>
          <div>${icon('chart')}<div><strong>Understand your habits</strong><p>See insights based on the entries you save.</p></div></div>
        </div>
        <div class="story-benefits"><span>${icon('check')} Your records</span><span>${icon('check')} Your plans</span><span>${icon('check')} Your pace</span></div>
      </div>
      <footer>${icon('shield')} Your money story stays yours.</footer>
    </section>
    <section class="auth-form-side"><div class="auth-form-wrap">
      <div class="eyebrow">PERSONAL EXPENSE TRACKER</div>
      <h2>${register?'A fresh start for your money.':'Welcome back.'}</h2>
      <p class="muted">${register?'Create your private account and start with a clean slate.':'Sign in and get a clearer picture of your finances.'}</p>
      <form id="auth-form">
        ${register?'<label>Full name<input name="name" autocomplete="name" placeholder="Your name" minlength="2" maxlength="60" required></label>':''}
        <label>Email address<input name="email" type="email" autocomplete="email" placeholder="Enter your email address" maxlength="150" required></label>
        <label>Password<div class="password-field"><input name="password" type="password" autocomplete="${register?'new-password':'current-password'}" placeholder="${register?'At least 8 characters':'Enter your password'}" ${register?'minlength="8"':''} maxlength="128" required><button type="button" id="show-password">Show</button></div></label>
        <p id="auth-error" class="form-error" role="alert"></p>
        <button class="btn primary auth-submit">${register?'Create account':'Sign in'} ${icon('arrow')}</button>
      </form>
      <p class="auth-switch">${register?'Already have an account?':'New here?'} <button id="auth-switch" class="text-button">${register?'Sign in':'Create an account'}</button></p>
      <div class="auth-note">Made for mindful spending. Built for you.</div>
    </div></section>
  </main>`;
  $('#auth-switch').onclick=()=>renderAuth(!register);
  $('#show-password').onclick=event=>{const input=$('[name=password]');input.type=input.type==='password'?'text':'password';event.target.textContent=input.type==='password'?'Show':'Hide';};
  const submit=async values=>{
    const button=$('.auth-submit');button.disabled=true;button.textContent=register?'Creating account…':'Signing in…';$('#auth-error').textContent='';
    try {const result=await api(register?'/register':'/login',{method:'POST',body:JSON.stringify(values)});state.user=result.user;state.csrf=result.csrf;state.categories=await api('/categories');state.view='dashboard';state.month=today().slice(0,7);resetFilters();shell();await refresh();}
    catch(error){if($('#auth-error'))$('#auth-error').textContent=error.message;button.disabled=false;button.textContent=register?'Create account':'Sign in';}
  };
  $('#auth-form').onsubmit=event=>{event.preventDefault();submit(Object.fromEntries(new FormData(event.target)));};
}
function resetFilters(){state.kind='';state.category='';state.q='';state.page=1;}
const titles={dashboard:'Overview',transactions:'Transactions',budgets:'Budgets',reports:'Reports'};
function shell() {
  $('#app').innerHTML=`<div class="app-shell"><aside class="sidebar">${brand()}<div class="nav-label">YOUR WORKSPACE</div><nav aria-label="Main navigation">${[['dashboard','grid','Overview'],['transactions','list','Transactions'],['budgets','target','Budgets'],['reports','chart','Reports']].map(([v,i,t])=>`<button data-view="${v}" class="nav-item ${state.view===v?'active':''}">${icon(i)}${t}${v===state.view?'<span class="active-dot"></span>':''}</button>`).join('')}</nav><div class="sidebar-note"><span class="note-icon">${icon('spark')}</span><strong>Small habits.<br>Big possibilities.</strong><p>A little awareness today makes a difference tomorrow.</p></div><div class="user-panel"><div class="avatar">${esc(state.user.name.split(' ').map(n=>n[0]).slice(0,2).join(''))}</div><div class="user-info"><strong>${esc(state.user.name)}</strong><span>Personal account</span></div><button class="icon-btn" id="logout" title="Sign out" aria-label="Sign out">${icon('logout')}</button></div></aside><div id="sidebar-shade"></div><div class="workspace"><header class="topbar"><div class="breadcrumb"><button class="icon-btn mobile-menu" aria-label="Open menu" id="menu">${icon('menu')}</button><span>My workspace</span>${icon('chevron')}<strong id="breadcrumb-view">${titles[state.view]}</strong></div><div class="topbar-right"><span class="private-label">${icon('shield')} Private workspace</span><span class="avatar small">${esc(state.user.name[0])}</span></div></header><main id="content" tabindex="-1"><div class="loading">Loading your overview…</div></main><footer class="app-footer"><span>Personal Expense Tracker <span class="footer-dot">·</span> A clearer picture, every day.</span><span>All amounts in INR</span></footer></div></div>`;
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>navigate(b.dataset.view));
  $('#logout').onclick=async()=>{try{await api('/logout',{method:'POST'});state.user=null;state.request++;renderAuth();}catch(e){toast(e.message,true);}};
  $('#menu').onclick=()=>$('.app-shell').classList.toggle('menu-open');
  $('#sidebar-shade').onclick=()=>$('.app-shell').classList.remove('menu-open');
}
function navigate(view){state.view=view;resetFilters();shell();refresh();}
function query(filtered=true){return new URLSearchParams({month:state.month,...(filtered?{kind:state.kind,category:state.category,q:state.q}:{})}).toString();}
async function refresh(){
  const request=++state.request;
  try {const [summary,transactions]=await Promise.all([api('/summary?month='+state.month),api('/transactions?'+query(state.view==='transactions'))]);if(request!==state.request||!state.user)return;state.summary=summary;state.transactions=transactions;renderContent();}
  catch(e){if(request===state.request&&state.user){$('#content').innerHTML=`<div class="empty"><h2>We couldn't load your records.</h2><p>${esc(e.message)}</p><button class="btn primary" id="retry">Try again</button></div>`;$('#retry').onclick=refresh;}}
}
function heading(){
  const copy={dashboard:[`Your money, at a glance.`,`Here's how your finances are shaping up this month.`],transactions:['Every little detail.','A home for everything coming in and going out.'],budgets:['Give your money a plan.','Set thoughtful limits. Make space for what matters.'],reports:['See the bigger picture.','Turn your everyday spending into useful insights.']}[state.view];
  return `<div class="page-heading"><div><div class="eyebrow">${state.view==='dashboard'?'YOUR FINANCIAL SNAPSHOT':titles[state.view].toUpperCase()}</div><h1>${copy[0]}</h1><p>${copy[1]}</p></div><div class="heading-actions"><label class="month-picker">${icon('calendar')}<input id="month" type="month" aria-label="Select month" value="${state.month}" min="1900-01" max="2199-12"></label><button id="primary-action" class="btn primary">${icon(state.view==='reports'?'download':'plus')}${state.view==='budgets'?'Set budget':state.view==='reports'?'Export CSV':'Add transaction'}</button></div></div>`;
}
function stats(){const s=state.summary;const rate=s.income?Math.round(s.balance/s.income*100):0;return `<div class="stats-grid"><article class="stat-card balance"><div class="stat-title">Net balance <span>${icon('wallet')}</span></div><div class="stat-value">${currency(s.balance)}</div><div class="stat-sub">${icon('spark')} Income minus spending this month</div></article><article class="stat-card"><div class="stat-title">Total income <span class="income-icon">${icon('down')}</span></div><div class="stat-value">${currency(s.income)}</div><div class="stat-sub"><span class="status-dot green"></span> Money coming in</div></article><article class="stat-card"><div class="stat-title">Total expenses <span class="expense-icon">${icon('arrow')}</span></div><div class="stat-value">${currency(s.expense)}</div><div class="stat-sub"><span class="status-dot orange"></span> Across ${s.breakdown.length} spending categories</div></article><article class="stat-card"><div class="stat-title">Savings rate <span>${icon('target')}</span></div><div class="stat-value">${s.income?rate+'%':'—'}</div><div class="stat-sub">${s.income?(rate>=20?'A little more room for tomorrow.':rate>=0?'Every small step counts.':'Spending is above this month’s income.'):'Add income to see your savings rate.'}</div></article></div>`;}
function empty(title,detail,action=''){return `<div class="empty"><div class="empty-symbol">${icon('wallet')}</div><h3>${title}</h3><p>${detail}</p>${action}</div>`;}
function breakdown(){
  const {breakdown:rows,expense}=state.summary;
  if(!rows.length)return empty('A fresh start.','Your spending breakdown will appear after your first expense.');
  let position=0;const stops=rows.map(r=>{const start=position;position+=r.amount/expense*100;return `${r.color} ${start}% ${position}%`;}).join(',');
  return `<div class="breakdown-layout"><div class="donut" style="background:conic-gradient(${stops})" role="img" aria-label="Category spending chart; amounts listed alongside"><div><span>Total spent</span><strong>${shortMoney(expense)}</strong><small>${monthLabel(state.month)}</small></div></div><div class="legend">${rows.map(r=>`<div class="legend-row"><span class="legend-label"><i style="background:${r.color}"></i>${esc(r.name)}</span><strong>${shortMoney(r.amount)}</strong><small>${Math.round(r.amount/expense*100)}%</small></div>`).join('')}</div></div>`;
}
function trend(){
  if(!state.summary.count)return empty('Your cash flow starts here.','Add income or expenses to see your weekly totals.');
  const s=state.summary;const weeks=Array.from({length:5},()=>({income:0,expense:0}));for(const day of s.daily){const w=Math.min(4,Math.floor((Number(day.date.slice(8))-1)/7));weeks[w].income+=day.income;weeks[w].expense+=day.expense;}
  const max=Math.max(...weeks.flatMap(w=>[w.income,w.expense]),10000);const tick=n=>shortMoney(max*n);
  return `<div class="chart-key"><span><i class="key-income"></i> Income</span><span><i class="key-expense"></i> Expenses</span></div><div class="bar-chart"><div class="chart-axis"><span>${tick(1)}</span><span>${tick(.5)}</span><span>₹0</span></div><div class="chart-columns">${weeks.map((w,i)=>`<div class="chart-column"><div class="bar-pair"><div class="bar income-bar" style="height:${w.income/max*100}%" title="Week ${i+1} income: ${currency(w.income)}"></div><div class="bar expense-bar" style="height:${w.expense/max*100}%" title="Week ${i+1} expenses: ${currency(w.expense)}"></div></div><span>Week ${i+1}</span></div>`).join('')}</div></div><div class="chart-foot">${icon('calendar')} Weekly totals for ${monthLabel(state.month)}</div>`;
}
function transactionsTable(rows,actions=true){
  if(!rows.length)return empty('Nothing here just yet.',state.q||state.kind||state.category?'Try a different search or clear your filters.':'Add your first transaction for this month.');
  return `<div class="table-scroll"><table><thead><tr><th>Description</th><th>Category</th><th>Date</th><th class="amount-cell">Amount</th>${actions?'<th class="actions-heading">Actions</th>':''}</tr></thead><tbody>${rows.map(t=>`<tr><td><div class="transaction-description"><span class="category-icon" style="color:${t.color};background:${t.color}18">${icon(t.icon)}</span><div><strong>${esc(t.note||t.category)}</strong><small>${t.kind==='income'?'Money in':'Money out'}</small></div></div></td><td><span class="category-pill">${esc(t.category)}</span></td><td class="date-cell">${dateLabel(t.occurred_on)}</td><td class="amount-cell ${t.kind==='income'?'positive':''}">${t.kind==='income'?'+':'−'}${currency(t.amount_paise)}</td>${actions?`<td><div class="row-actions"><button class="icon-btn" data-edit="${t.id}" aria-label="Edit ${esc(t.note||t.category)}">${icon('edit')}</button><button class="icon-btn delete-btn" data-delete="${t.id}" aria-label="Delete ${esc(t.note||t.category)}">${icon('trash')}</button></div></td>`:''}</tr>`).join('')}</tbody></table></div>`;
}
function budgetCard(b,compact=false){const percent=Math.round(b.spent/b.limit_paise*100), remaining=b.limit_paise-b.spent;return `<article class="budget-card ${compact?'compact':''}"><div class="budget-title"><span class="category-icon" style="color:${b.color};background:${b.color}18">${icon(b.icon)}</span><strong>${esc(b.name)}</strong>${!compact?`<button class="icon-btn" data-budget-edit="${b.id}" aria-label="Edit ${esc(b.name)} budget">${icon('edit')}</button><button class="icon-btn delete-btn" data-budget-delete="${b.id}" aria-label="Remove ${esc(b.name)} budget">${icon('trash')}</button>`:`<span class="budget-percent ${remaining<0?'over':''}">${percent}%</span>`}</div><div class="budget-amount"><strong>${currency(b.spent)}</strong><span>of ${currency(b.limit_paise)}</span></div><div class="progress-track"><div style="width:${Math.min(percent,100)}%;background:${remaining<0?'#cb655c':b.color}"></div></div><div class="budget-status ${remaining<0?'over':''}">${remaining<0?`${currency(-remaining)} over budget`:remaining===0?'Spending limit reached':`${currency(remaining)} left to spend`}${!compact?`<span>${percent}% used</span>`:''}</div></article>`;}
function panel(title,subtitle,body,link=''){return `<section class="panel"><div class="panel-heading"><div><h2>${title}</h2>${subtitle?`<p>${subtitle}</p>`:''}</div>${link}</div>${body}</section>`;}
function dashboard(){const budgets=state.summary.budgets;return `${stats()}<div class="two-columns">${panel('Where your money goes','A breakdown of this month’s expenses',breakdown())}${panel('The monthly rhythm','Money in, money out',trend())}</div>${panel('Recent transactions','The latest chapters in your money story',transactionsTable(state.transactions.slice(0,5)),`<button class="text-button" data-link="transactions">View all ${icon('chevron')}</button>`)}<div class="section-title"><div><h2>Keeping your plans on track</h2><p>A quick look at your monthly budgets</p></div><button class="text-button" data-link="budgets">Manage budgets ${icon('chevron')}</button></div>${budgets.length?`<div class="budget-grid">${budgets.slice(0,3).map(b=>budgetCard(b,true)).join('')}</div>`:panel('','',empty('A plan starts with one category.','Set your first monthly spending limit.',`<button class="btn secondary" id="first-budget">Set a budget</button>`))}`;}
function ledger(){const pageSize=12,start=(state.page-1)*pageSize,rows=state.transactions.slice(start,start+pageSize);return `<div class="ledger-toolbar"><div class="search-input">${icon('search')}<input id="search" type="search" placeholder="Search descriptions or categories…" aria-label="Search transactions" value="${esc(state.q)}"></div><select id="kind-filter" aria-label="Filter by type"><option value="">All types</option><option value="expense" ${state.kind==='expense'?'selected':''}>Expenses</option><option value="income" ${state.kind==='income'?'selected':''}>Income</option></select><select id="category-filter" aria-label="Filter by category"><option value="">All categories</option>${state.categories.filter(c=>!state.kind||c.kind===state.kind).map(c=>`<option value="${c.id}" ${String(c.id)===state.category?'selected':''}>${esc(c.name)}</option>`).join('')}</select><button class="btn secondary" id="clear-filters">Reset</button><button class="btn secondary" id="export">${icon('download')} Export</button></div>${panel('Your transactions',`${state.transactions.length} ${state.transactions.length===1?'entry':'entries'} in ${monthLabel(state.month)}`,transactionsTable(rows))}<div class="pagination"><span>${state.transactions.length?`${start+1}–${Math.min(start+pageSize,state.transactions.length)} of ${state.transactions.length}`:'0 entries'}</span><div><button class="btn secondary" id="prev-page" ${state.page===1?'disabled':''}>Previous</button><button class="btn secondary" id="next-page" ${start+pageSize>=state.transactions.length?'disabled':''}>Next</button></div></div>`;}
function budgetsPage(){const rows=state.summary.budgets;const limit=rows.reduce((sum,b)=>sum+b.limit_paise,0),spent=rows.reduce((sum,b)=>sum+b.spent,0);return `<div class="budget-banner"><div><span class="eyebrow">YOUR MONTHLY PLAN</span><h2>${rows.length?'Intentions, meet everyday life.':'A little planning goes a long way.'}</h2><p>Limits guide your spending. You can always record an expense, even when you go over.</p></div><div><span>Planned spending</span><strong>${currency(limit)}</strong><small>${currency(spent)} spent in budgeted categories</small></div></div>${rows.length?`<div class="budget-grid full">${rows.map(b=>budgetCard(b)).join('')}<button class="add-budget-card" id="new-budget">${icon('plus')}<strong>Make another plan</strong><span>Set a category budget</span></button></div>`:panel('','',empty('Start with what matters most.','Pick a category and give it a monthly spending limit.',`<button class="btn primary" id="new-budget">${icon('plus')} Set your first budget</button>`))}<p class="help-note">${icon('shield')} Budgets belong to the selected month. Editing a limit never changes your recorded expenses.</p>`;}
function reportsPage(){const s=state.summary;return `${stats()}<div class="two-columns">${panel('Spending by category','Understand the shape of your spending',breakdown())}${panel('Income & expenses','Compare your weekly cash flow',trend())}</div>${panel('The numbers behind the picture','A category-by-category view of '+monthLabel(state.month),s.breakdown.length?`<div class="table-scroll"><table><thead><tr><th>Category</th><th>Share of spending</th><th class="amount-cell">Total spent</th></tr></thead><tbody>${s.breakdown.map(r=>`<tr><td><div class="transaction-description"><span class="category-icon" style="color:${r.color};background:${r.color}18">${icon(r.icon)}</span><strong>${esc(r.name)}</strong></div></td><td><div class="share-cell"><div class="progress-track"><div style="width:${r.amount/s.expense*100}%;background:${r.color}"></div></div><span>${(r.amount/s.expense*100).toFixed(1)}%</span></div></td><td class="amount-cell">${currency(r.amount)}</td></tr>`).join('')}</tbody><tfoot><tr><th>Total expenses</th><th>100%</th><th class="amount-cell">${currency(s.expense)}</th></tr></tfoot></table></div>`:empty('Your story is still beginning.','Add expenses to see a detailed report.'),`<button class="text-button" id="export">${icon('download')} Download statement</button>`)}<p class="help-note">${icon('book')} Net balance reflects recorded activity for this month, not your bank account balance.</p>`;}
function renderContent(){
  document.title=titles[state.view]+' · Personal Expense Tracker';
  $('#content').innerHTML=heading()+({dashboard,transactions:ledger,budgets:budgetsPage,reports:reportsPage}[state.view])();
  $('#month').onchange=e=>{if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)){e.target.value=state.month;return;}state.month=e.target.value;state.page=1;refresh();};
  $('#primary-action').onclick=()=>state.view==='budgets'?budgetModal():state.view==='reports'?exportCsv():transactionModal();
  document.querySelectorAll('[data-link]').forEach(b=>b.onclick=()=>navigate(b.dataset.link));
  document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>transactionModal(state.transactions.find(t=>t.id===Number(b.dataset.edit))));
  document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>deleteModal('transaction',Number(b.dataset.delete)));
  document.querySelectorAll('[data-budget-edit]').forEach(b=>b.onclick=()=>budgetModal(state.summary.budgets.find(t=>t.id===Number(b.dataset.budgetEdit))));
  document.querySelectorAll('[data-budget-delete]').forEach(b=>b.onclick=()=>deleteModal('budget',Number(b.dataset.budgetDelete)));
  if($('#export'))$('#export').onclick=exportCsv;
  if($('#first-budget'))$('#first-budget').onclick=()=>budgetModal();
  if($('#new-budget'))$('#new-budget').onclick=()=>budgetModal();
  if($('#kind-filter'))$('#kind-filter').onchange=e=>{state.kind=e.target.value;state.category='';state.page=1;refresh();};
  if($('#category-filter'))$('#category-filter').onchange=e=>{state.category=e.target.value;state.page=1;refresh();};
  if($('#search')){let timer;$('#search').oninput=e=>{const value=e.target.value;clearTimeout(timer);timer=setTimeout(async()=>{state.q=value;state.page=1;await refresh();if($('#search')){$('#search').focus();}},350);};}
  if($('#clear-filters'))$('#clear-filters').onclick=()=>{resetFilters();refresh();};
  if($('#prev-page'))$('#prev-page').onclick=()=>{state.page--;renderContent();};
  if($('#next-page'))$('#next-page').onclick=()=>{state.page++;renderContent();};
}
function openModal(content){const modal=$('#modal');modal.innerHTML=content;modal.showModal();modal.querySelector('[data-close]').onclick=()=>modal.close();modal.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=()=>modal.close());}
function modalHeader(title,subtitle){return `<div class="modal-heading"><div><h2 id="modal-title">${title}</h2><p>${subtitle}</p></div><button class="icon-btn" data-close aria-label="Close dialog">${icon('close')}</button></div>`;}
function transactionModal(transaction){
  const initialDate=state.month===today().slice(0,7)?today():state.month+'-01';
  openModal(`${modalHeader(transaction?'Edit transaction':'Add a transaction','The little details make the bigger picture.')}<form id="entry-form"><div class="type-toggle"><label><input type="radio" name="kind" value="expense" ${(transaction?.kind||'expense')==='expense'?'checked':''}><span>${icon('arrow')} Expense</span></label><label><input type="radio" name="kind" value="income" ${transaction?.kind==='income'?'checked':''}><span>${icon('down')} Income</span></label></div><label>Amount (INR)<div class="amount-input"><span>₹</span><input name="amount" aria-label="Amount in rupees" inputmode="decimal" placeholder="0.00" pattern="[0-9]{1,9}(\.[0-9]{1,2})?" value="${transaction?(transaction.amount_paise/100).toFixed(2):''}" required></div></label><div class="form-row"><label>Category<select name="category" required></select></label><label>Date<input type="date" name="date" value="${transaction?.occurred_on||initialDate}" min="1900-01-01" max="2199-12-31" required></label></div><label>Description <span class="optional">optional</span><input name="note" maxlength="200" placeholder="What was it for?" value="${esc(transaction?.note||'')}"></label><p class="form-error" id="modal-error" role="alert"></p><div class="modal-actions"><button type="button" data-cancel class="btn secondary">Cancel</button><button class="btn primary">${icon('check')} ${transaction?'Save changes':'Save transaction'}</button></div></form>`);
  const fill=()=>{const kind=$('#entry-form [name=kind]:checked').value;$('#entry-form [name=category]').innerHTML='<option value="">Choose a category</option>'+state.categories.filter(c=>c.kind===kind).map(c=>`<option value="${c.id}" ${c.id===transaction?.category_id?'selected':''}>${esc(c.name)}</option>`).join('');};fill();
  document.querySelectorAll('#entry-form [name=kind]').forEach(r=>r.onchange=fill);
  $('#entry-form').onsubmit=async event=>{event.preventDefault();const form=event.target,values=Object.fromEntries(new FormData(form));const button=form.querySelector('button[type=submit],button:not([type])');button.disabled=true;
    try {await api('/transactions'+(transaction?'/'+transaction.id:''),{method:transaction?'PUT':'POST',body:JSON.stringify(values)});$('#modal').close();state.month=values.date.slice(0,7);state.page=1;await refresh();toast(transaction?'Transaction updated.':'Transaction added. A little more clarity.');}
    catch(e){$('#modal-error').textContent=e.message;button.disabled=false;}
  };
}
function budgetModal(budget){
  openModal(`${modalHeader(budget?'Adjust your budget':'Set a monthly budget',monthLabel(state.month)+' · A plan, not a restriction.')}<form id="budget-form"><label>Spending category<select name="category" required ${budget?'disabled':''}><option value="">Choose a category</option>${state.categories.filter(c=>c.kind==='expense').map(c=>`<option value="${c.id}" ${c.id===budget?.category_id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><label>Monthly limit (INR)<div class="amount-input"><span>₹</span><input name="amount" aria-label="Monthly limit in rupees" inputmode="decimal" pattern="[0-9]{1,9}(\.[0-9]{1,2})?" placeholder="0.00" value="${budget?(budget.limit_paise/100).toFixed(2):''}" required></div></label><div class="form-tip">${icon('target')} Already have a plan for this category? Saving updates its limit for the selected month.</div><p id="modal-error" class="form-error" role="alert"></p><div class="modal-actions"><button type="button" data-cancel class="btn secondary">Cancel</button><button class="btn primary">Save budget ${icon('check')}</button></div></form>`);
  $('#budget-form').onsubmit=async e=>{e.preventDefault();const values=Object.fromEntries(new FormData(e.target));values.month=state.month;if(budget)values.category=budget.category_id;const button=e.target.querySelector('button:not([type])');button.disabled=true;try{await api('/budgets',{method:'POST',body:JSON.stringify(values)});$('#modal').close();await refresh();toast('Your spending plan is saved.');}catch(error){$('#modal-error').textContent=error.message;button.disabled=false;}};
}
function deleteModal(type,id){
  openModal(`${modalHeader(`Delete this ${type}?`,type==='transaction'?'Your totals will update automatically.':'Your recorded transactions will stay exactly as they are.')}<p class="delete-copy">This ${type==='transaction'?'entry':'spending limit'} will be permanently removed.</p><p id="modal-error" class="form-error" role="alert"></p><div class="modal-actions"><button data-cancel class="btn secondary">Keep it</button><button id="confirm-delete" class="btn danger">${icon('trash')} Delete ${type}</button></div>`);
  $('#confirm-delete').onclick=async e=>{e.target.disabled=true;try{await api('/'+(type==='transaction'?'transactions':'budgets')+'/'+id,{method:'DELETE'});$('#modal').close();state.page=1;await refresh();toast(`${type==='transaction'?'Transaction':'Budget'} deleted.`);}catch(error){$('#modal-error').textContent=error.message;e.target.disabled=false;}};
}
async function exportCsv(){try{const response=await fetch('/api/export?'+query(state.view==='transactions'));if(!response.ok)throw new Error((await response.json()).error);const url=URL.createObjectURL(await response.blob());const link=document.createElement('a');link.href=url;link.download=`expense-statement-${state.month}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Your statement is ready.');}catch(error){toast(error.message,true);}}
async function init(){try{const session=await api('/session');if(session.user){state.user=session.user;state.csrf=session.csrf;state.categories=await api('/categories');shell();await refresh();}else renderAuth();}catch(error){$('#app').innerHTML=`<div class="empty"><h1>Let's reconnect.</h1><p>${esc(error.message)}</p><button id="reload" class="btn primary">Try again</button></div>`;$('#reload').onclick=init;}}
init();
