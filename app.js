// ===== CONFIG =====
const SHEET_ID = '1OUk4L1PIcgqZL7pKUCP541qFEq8tkmci_OP-HxdgA20';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;
const CAT_COLORS = {
  'Food':'#f97316','Travel':'#06b6d4','Shopping':'#a855f7','Entertainment':'#ec4899',
  'Health':'#10b981','Utilities':'#f59e0b','Rent':'#6366f1','Education':'#3b82f6',
  'Personal':'#8b5cf6','Family Medical':'#ef4444','Personal Medical':'#14b8a6',
  'Online Spending':'#eab308','Gift':'#f43f5e','Other':'#64748b'
};
const BANK_COLORS = ['#6366f1','#f97316','#06b6d4','#10b981','#a855f7','#f59e0b'];
const SUPPORTED_BANKS = ['SBI Bank', 'Axis Bank', 'HDFC Bank', 'Cash'];

let transactions = [];
let currentPage = 1;
const PER_PAGE = 15;
let weeklyChartInst, donutChartInst, monthlyChartInst, analyticsDonutInst, dailyChartInst;

// ===== STORAGE =====
function loadLocal() {
  try { return JSON.parse(localStorage.getItem('expenses') || '[]'); } catch { return []; }
}
function saveLocal(data) {
  localStorage.setItem('expenses', JSON.stringify(data));
}
function getSettings() {
  return JSON.parse(localStorage.getItem('expSettings') || '{}');
}
function saveSettings(s) {
  localStorage.setItem('expSettings', JSON.stringify(s));
}
function loadCategories() {
  const defaultCats = [
    'Food', 'Travel', 'Shopping', 'Entertainment', 'Health', 
    'Utilities', 'Rent', 'Education', 'Personal', 'Family Medical', 
    'Personal Medical', 'Online Spending', 'Gift', 'Other'
  ];
  try { return JSON.parse(localStorage.getItem('customCategories')) || defaultCats; } catch { return defaultCats; }
}
function saveCategories(cats) {
  localStorage.setItem('customCategories', JSON.stringify(cats));
}

const CAT_EMOJIS = {
  'Food': '🍕', 'Travel': '✈️', 'Shopping': '🛍️', 'Entertainment': '🎬', 'Health': '💊',
  'Utilities': '💡', 'Rent': '🏠', 'Education': '📚', 'Personal': '💄', 'Family Medical': '🏥',
  'Personal Medical': '💊', 'Online Spending': '🛒', 'Gift': '🎁', 'Other': '📦'
};

function populateCategoriesSelect() {
  const select = document.getElementById('expCategory');
  if (!select) return;
  const cats = loadCategories();
  
  let html = '<option value="">Select category</option>';
  cats.forEach(c => {
    const emoji = CAT_EMOJIS[c] || '🏷️';
    html += `<option value="${c}">${emoji} ${c}</option>`;
  });
  html += '<option value="__ADD_NEW_CATEGORY__" style="color: #6366f1; font-weight: bold;">➕ Add New Category...</option>';
  select.innerHTML = html;
}

async function handleCategorySelectChange(e) {
  if (e.target.value === '__ADD_NEW_CATEGORY__') {
    const newCat = prompt('Enter the name of the new category:');
    if (newCat && newCat.trim()) {
      const trimmed = newCat.trim();
      const cats = loadCategories();
      if (cats.includes(trimmed)) {
        alert('This category already exists.');
        e.target.value = trimmed;
        return;
      }
      cats.push(trimmed);
      saveCategories(cats);
      populateCategoriesSelect();
      e.target.value = trimmed;
      toast(`✓ Added new category: ${trimmed}`);
    } else {
      e.target.value = ''; // Reset selection
    }
  }
}

// ===== TOAST =====
function toast(msg, type='success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  setTimeout(() => t.className = 'toast', 3000);
}

// ===== FETCH FROM SHEET =====
async function fetchFromSheet() {
  const cfg = getSettings();
  
  // 1. Try to fetch from Apps Script Web App if configured (handles private/unshared sheets)
  if (cfg.appsScriptUrl) {
    try {
      const r = await fetch(cfg.appsScriptUrl);
      const res = await r.json();
      if (res.status === 'success' && Array.isArray(res.data)) {
        return res.data.map(cols => {
          if (!cols[0] || cols[4] === undefined) return null;
          return {
            date: cols[0],
            title: cols[1] || '',
            category: cols[2] || 'Other',
            bank: cols[3] || 'Cash',
            amount: parseFloat(cols[4]) || 0
          };
        }).filter(Boolean);
      }
    } catch(e) {
      console.warn('Apps Script fetch failed, falling back to public CSV URL', e);
    }
  }

  // 2. Fallback to public CSV URL
  try {
    const r = await fetch(SHEET_URL);
    const csv = await r.text();
    const rows = csv.trim().split('\n').slice(1);
    const remote = rows.map(row => {
      const cols = row.split(',').map(c => c.trim().replace(/^"|"$/g,''));
      if (!cols[0] || !cols[4]) return null;
      return {
        date: cols[0],
        title: cols[1]||'',
        category: cols[2]||'Other',
        bank: cols[3]||'Cash',
        amount: parseFloat(cols[4])||0
      };
    }).filter(Boolean);
    return remote;
  } catch(e) { 
    console.error('Sheet fetch error', e); 
    return []; 
  }
}

// ===== SYNC =====
async function syncData() {
  const btn = document.getElementById('syncBtn');
  if (btn) btn.textContent = '⟳ Syncing…';
  const remote = await fetchFromSheet();
  
  const newExpenses = [];
  const newHistory = [];
  
  remote.forEach(r => {
    if (r.category === 'Add Balance' || r.category === 'Transfer') {
      newHistory.push({
        id: `bal_${r.date}_${r.title}_${r.amount}_${Math.random().toString(36).substring(2,5)}`,
        date: r.date,
        bank: r.bank,
        amount: r.amount,
        remark: r.title,
        type: r.category
      });
    } else {
      newExpenses.push({
        id: `exp_${r.date}_${r.title}_${r.amount}_${Math.random().toString(36).substring(2,5)}`,
        date: r.date,
        title: r.title,
        category: r.category,
        bank: r.bank,
        amount: r.amount
      });
    }
  });

  const localExpenses = loadLocal();
  const localHistory = loadBalanceHistory();

  const getMatchKey = (item) => `${item.date}_${item.title || item.remark}_${item.bank}_${item.amount}_${item.category || item.type}`;
  const remoteKeys = new Set(remote.map(r => `${r.date}_${r.title}_${r.bank}_${r.amount}_${r.category}`));

  const localOnlyExpenses = localExpenses.filter(l => !remoteKeys.has(getMatchKey({ ...l, category: l.category })));
  const localOnlyHistory = localHistory.filter(h => !remoteKeys.has(getMatchKey({ ...h, title: h.remark, category: h.type })));

  transactions = [...newExpenses, ...localOnlyExpenses].sort((a,b)=>new Date(b.date)-new Date(a.date));
  const combinedHistory = [...newHistory, ...localOnlyHistory].sort((a,b)=>new Date(b.date)-new Date(a.date));

  saveLocal(transactions);
  saveBalanceHistory(combinedHistory);

  const base = {};
  combinedHistory.forEach(item => {
    if (item.type === 'Add Balance') {
      base[item.bank] = (base[item.bank] || 0) + item.amount;
    } else if (item.type === 'Transfer') {
      const [fromBank, toBank] = item.bank.split(' → ');
      if (fromBank && toBank) {
        base[fromBank] = (base[fromBank] || 0) - item.amount;
        base[toBank] = (base[toBank] || 0) + item.amount;
      }
    }
  });
  saveBaseBalances(base);

  if (btn) btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 4v5h5M20 20v-5h-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M20.49 9A9 9 0 005.64 5.64L4 4m15.36 14.36A9 9 0 014 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Sync`;
  toast(`Synced ${transactions.length + combinedHistory.length} total entries`);
  renderAll();
}

// ===== POST ALL TO APPS SCRIPT =====
async function postAllToSheet() {
  const cfg = getSettings();
  if (!cfg.appsScriptUrl) return;
  
  const expenses = transactions.map(t => [t.date, t.title, t.category, t.bank, t.amount]);
  const history = loadBalanceHistory().map(h => [h.date, h.remark, h.type, h.bank, h.amount]);
  const combined = [...expenses, ...history].sort((a, b) => new Date(a[0]) - new Date(b[0]));
  
  try {
    await fetch(cfg.appsScriptUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'clearAndSync', rows: combined })
    });
  } catch (e) {
    console.warn('Sheet write error', e);
  }
}

// ===== HELPERS =====
function fmt(n) { return '₹' + Math.abs(n).toLocaleString('en-IN', {minimumFractionDigits:0}); }
function isThisMonth(d) {
  const now = new Date(), dt = new Date(d);
  return dt.getMonth()===now.getMonth() && dt.getFullYear()===now.getFullYear();
}
function isThisWeek(d) {
  const now = new Date(), dt = new Date(d);
  const start = new Date(now); start.setDate(now.getDate()-6); start.setHours(0,0,0,0);
  return dt >= start;
}
function getLast7() {
  const days = [];
  for(let i=6;i>=0;i--) { const d=new Date(); d.setDate(d.getDate()-i); days.push(d.toISOString().slice(0,10)); }
  return days;
}
const CUSTOM_COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#06b6d4', '#f97316'];
function catColor(c) {
  if (CAT_COLORS[c]) return CAT_COLORS[c];
  let hash = 0;
  for (let i = 0; i < c.length; i++) {
    hash = c.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % CUSTOM_COLORS.length;
  return CUSTOM_COLORS[idx];
}
function uniqueBanks() { return [...new Set(transactions.map(t=>t.bank))]; }
function uniqueCats() { return [...new Set(transactions.map(t=>t.category))]; }

// ===== RENDER ALL =====
function renderAll() {
  renderBalanceCard();
  renderBanks();
  renderContacts();
  renderBorrowed();
  renderLent();
  renderStats();
  renderWeeklyChart();
  renderDonut();
  renderRecentTx();
  renderAllTx();
  renderAnalytics();
  populateFilters();
}

function loadBaseBalances() {
  try { return JSON.parse(localStorage.getItem('baseBalances') || '{}'); } catch { return {}; }
}
function saveBaseBalances(balances) {
  localStorage.setItem('baseBalances', JSON.stringify(balances));
}
function getBankBalances() {
  const base = loadBaseBalances();
  const balances = {};
  SUPPORTED_BANKS.forEach(b => { balances[b] = base[b] || 0; });
  transactions.forEach(t => {
    if (balances[t.bank] !== undefined) {
      balances[t.bank] -= t.amount;
    } else {
      balances[t.bank] = (base[t.bank] || 0) - t.amount;
    }
  });
  return balances;
}

// ===== BORROWED LOGIC =====
function loadBorrowedBalances() {
  const defaultBorrowed = {
    'Bhuvaji': 30000,
    'Badi Mummy': 20000,
    'Honey': 30000,
    'Tini': 10000
  };
  try {
    const stored = localStorage.getItem('borrowedBalances');
    if (!stored) {
      localStorage.setItem('borrowedBalances', JSON.stringify(defaultBorrowed));
      return defaultBorrowed;
    }
    return JSON.parse(stored);
  } catch {
    return defaultBorrowed;
  }
}
function saveBorrowedBalances(balances) {
  localStorage.setItem('borrowedBalances', JSON.stringify(balances));
}

function renderBorrowed() {
  const el = document.getElementById('borrowedList');
  if (!el) return;
  const balances = loadBorrowedBalances();
  const entries = Object.entries(balances);
  
  if(!entries.length) { el.innerHTML='<p style="color:#475569;font-size:0.8rem;text-align:center;padding:12px">No borrowings logged yet</p>'; return; }
  
  el.innerHTML = entries.map(([name,amt], i)=>`
    <div class="contact-item" style="border-bottom: 1px solid rgba(255,255,255,0.02); padding-bottom: 8px;">
      <div class="contact-left">
        <div class="contact-avatar" style="background:#fbbf2422;color:#fbbf24">👤</div>
        <div>
          <span class="contact-name" style="font-size:0.82rem;font-weight:600">${name}</span>
          <small style="color:#64748b;display:block;font-size:0.72rem">Borrowed Balance</small>
        </div>
      </div>
      <span class="contact-amount" style="color:${amt === 0 ? '#10b981' : '#fbbf24'};font-size:0.82rem">${fmt(amt)}</span>
    </div>`).join('');
}

// ===== LENT LOGIC =====
function loadLentBalances() {
  const defaultLent = {
    'Mama': 30000,
    'Renu Mosi': 35000,
    'Ranjana Kaki': 20000
  };
  try {
    const stored = localStorage.getItem('lentBalances');
    if (!stored) {
      localStorage.setItem('lentBalances', JSON.stringify(defaultLent));
      return defaultLent;
    }
    return JSON.parse(stored);
  } catch {
    return defaultLent;
  }
}
function saveLentBalances(balances) {
  localStorage.setItem('lentBalances', JSON.stringify(balances));
}

function renderLent() {
  const el = document.getElementById('lentList');
  if (!el) return;
  const balances = loadLentBalances();
  const entries = Object.entries(balances);
  
  if(!entries.length) { el.innerHTML='<p style="color:#475569;font-size:0.8rem;text-align:center;padding:12px">No lent amounts logged yet</p>'; return; }
  
  el.innerHTML = entries.map(([name,amt], i)=>`
    <div class="contact-item" style="border-bottom: 1px solid rgba(255,255,255,0.02); padding-bottom: 8px;">
      <div class="contact-left">
        <div class="contact-avatar" style="background:#10b98122;color:#10b981">👤</div>
        <div>
          <span class="contact-name" style="font-size:0.82rem;font-weight:600">${name}</span>
          <small style="color:#64748b;display:block;font-size:0.72rem">Lent Balance</small>
        </div>
      </div>
      <span class="contact-amount" style="color:${amt === 0 ? '#10b981' : '#10b981'};font-size:0.82rem">${fmt(amt)}</span>
    </div>`).join('');
}

// ===== BALANCE CARD =====
function renderBalanceCard() {
  const total = transactions.reduce((s,t)=>s+t.amount,0);
  const bankBalances = getBankBalances();
  const totalAvailable = Object.values(bankBalances).reduce((s,v)=>s+v,0);
  
  const borrowedMap = loadBorrowedBalances();
  const totalBorrowed = Object.values(borrowedMap).reduce((s,v)=>s+v,0);

  const lentMap = loadLentBalances();
  const totalLent = Object.values(lentMap).reduce((s,v)=>s+v,0);
  
  document.getElementById('balanceAmount').textContent = fmt(totalAvailable);
  document.getElementById('totalSpending').textContent = fmt(total);
  document.getElementById('borrowedAmount').textContent = fmt(totalBorrowed);
  document.getElementById('lentAmount').textContent = fmt(totalLent);
}

// ===== BANKS =====
function renderBanks() {
  const el = document.getElementById('banksList');
  const balances = getBankBalances();
  const banks = Object.entries(balances);
  
  el.innerHTML = banks.map(([name,amt],i)=>`
    <div class="bank-item">
      <div class="bank-left">
        <div class="bank-dot" style="background:${BANK_COLORS[i%BANK_COLORS.length]}22;color:${BANK_COLORS[i%BANK_COLORS.length]}">${name.charAt(0)}</div>
        <span class="bank-name">${name}</span>
      </div>
      <span class="bank-amount" style="color:${amt < 0 ? '#f87171' : '#e2e8f0'}">${fmt(amt)}</span>
    </div>`).join('');
}

function loadBalanceHistory() {
  try {
    let history = JSON.parse(localStorage.getItem('balanceHistory') || '[]');
    let changed = false;
    history = history.map(item => {
      if (!item.id) {
        item.id = 'bal_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
        changed = true;
      }
      return item;
    });
    if (changed) {
      localStorage.setItem('balanceHistory', JSON.stringify(history));
    }
    return history;
  } catch {
    return [];
  }
}
function saveBalanceHistory(history) {
  localStorage.setItem('balanceHistory', JSON.stringify(history));
}

// ===== CONTACTS (BALANCE LOG) =====
function renderContacts() {
  const el = document.getElementById('contactsList');
  const history = loadBalanceHistory().slice(0, 4);
  if(!history.length) { el.innerHTML='<p style="color:#475569;font-size:0.8rem;text-align:center;padding:12px">No deposits or transfers logged yet</p>'; return; }
  
  const colors = { 'Add Balance': '#10b981', 'Transfer': '#38bdf8' };
  
  el.innerHTML = history.map(item => `
    <div class="contact-item" style="border-bottom: 1px solid rgba(255,255,255,0.02); padding-bottom: 8px; justify-content: space-between; display: flex; align-items: center; width: 100%;">
      <div class="contact-left" style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
        <div class="contact-avatar" style="background:${colors[item.type] || '#6366f1'}22;color:${colors[item.type] || '#6366f1'}; flex-shrink: 0;">
          ${item.type === 'Transfer' ? '⇄' : '↓'}
        </div>
        <div style="min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          <span class="contact-name" style="font-size:0.82rem;font-weight:600; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.bank}</span>
          <small style="color:#64748b;display:block;font-size:0.72rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.remark}</small>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0; margin-left: 8px;">
        <span class="contact-amount" style="color:${item.type === 'Transfer' ? '#38bdf8' : '#4ade80'};font-size:0.82rem; font-weight: 600;">${fmt(item.amount)}</span>
        <button class="edit-btn" onclick="editBalanceLog('${item.id}')" style="background:none; border:none; cursor:pointer; font-size:0.9rem; opacity:0.6; padding: 2px;" title="Edit">✏️</button>
        <button class="delete-btn" onclick="deleteBalanceLog('${item.id}')" style="background:none; border:none; cursor:pointer; font-size:0.8rem; opacity:0.6; padding: 2px; color: #ef4444;" title="Delete">✕</button>
      </div>
    </div>`).join('');
}

// ===== STATS =====
function renderStats() {
  const monthTotal = transactions.filter(t=>isThisMonth(t.date)).reduce((s,t)=>s+t.amount,0);
  const weekTotal = transactions.filter(t=>isThisWeek(t.date)).reduce((s,t)=>s+t.amount,0);
  document.getElementById('thisMonthTotal').textContent = fmt(monthTotal);
  document.getElementById('categoryCount').textContent = uniqueCats().length;
  document.getElementById('totalRecords').textContent = transactions.length;
  document.getElementById('last7Days').textContent = fmt(weekTotal);
}

// ===== WEEKLY CHART =====
function renderWeeklyChart() {
  const days = getLast7();
  const labels = days.map(d=>{ const dt=new Date(d); return dt.toLocaleDateString('en',{weekday:'short'}); });
  const data = days.map(d=>transactions.filter(t=>t.date===d).reduce((s,t)=>s+t.amount,0));
  const weekTotal = data.reduce((s,v)=>s+v,0);
  document.getElementById('weekTotal').textContent = fmt(weekTotal);
  const prev = data.slice(0,3).reduce((s,v)=>s+v,0)||1;
  const curr = data.slice(4).reduce((s,v)=>s+v,0);
  document.getElementById('trendPct').textContent = (((curr-prev)/prev)*100).toFixed(1)+'%';
  const ctx = document.getElementById('weeklyChart').getContext('2d');
  if(weeklyChartInst) weeklyChartInst.destroy();
  weeklyChartInst = new Chart(ctx,{
    type:'bar',
    data:{labels,datasets:[{data,backgroundColor:days.map((_,i)=>i===days.length-1?'#6366f1':'rgba(99,102,241,0.25)'),borderRadius:6,borderSkipped:false}]},
    options:{responsive:true,plugins:{legend:{display:false},tooltip:{callbacks:{label:v=>'₹'+v.raw.toLocaleString('en-IN')}}},scales:{x:{grid:{display:false},ticks:{color:'#475569',font:{size:11}}},y:{display:false}}}
  });
}

// ===== DONUT =====
function renderDonut() {
  const map = {};
  transactions.filter(t=>isThisMonth(t.date)).forEach(t=>{ map[t.category]=(map[t.category]||0)+t.amount; });
  const cats = Object.entries(map).sort((a,b)=>b[1]-a[1]);
  const total = cats.reduce((s,[,v])=>s+v,0);
  document.getElementById('donutCenter').querySelector('.donut-val').textContent = fmt(total);
  const ctx = document.getElementById('donutChart').getContext('2d');
  if(donutChartInst) donutChartInst.destroy();
  if(!cats.length) { document.getElementById('categoryLegend').innerHTML=''; return; }
  donutChartInst = new Chart(ctx,{
    type:'doughnut',
    data:{labels:cats.map(([c])=>c),datasets:[{data:cats.map(([,v])=>v),backgroundColor:cats.map(([c])=>catColor(c)),borderWidth:0,hoverOffset:4}]},
    options:{cutout:'72%',plugins:{legend:{display:false},tooltip:{callbacks:{label:v=>`${v.label}: ₹${v.raw.toLocaleString('en-IN')}`}}}}
  });
  document.getElementById('categoryLegend').innerHTML = cats.slice(0,5).map(([c,v])=>`
    <div class="cat-legend-item">
      <div class="cat-dot" style="background:${catColor(c)}"></div>
      <span class="cat-legend-name">${c}</span>
      <span class="cat-legend-pct">${total?((v/total)*100).toFixed(0):0}%</span>
    </div>`).join('');
}

function getCombinedActivities() {
  const expenses = transactions.map(t => ({
    id: t.id,
    date: t.date,
    title: t.title,
    category: t.category,
    bank: t.bank,
    amount: t.amount,
    isExpense: true,
    type: 'Expense'
  }));

  const history = loadBalanceHistory().map(h => ({
    id: h.id,
    date: h.date,
    title: h.remark,
    category: h.type, // 'Add Balance' or 'Transfer'
    bank: h.bank,
    amount: h.amount,
    isExpense: false,
    type: h.type
  }));

  return [...expenses, ...history];
}

// ===== RECENT TX (dashboard) =====
function renderRecentTx(filter='') {
  let data = getCombinedActivities().filter(t=>isThisMonth(t.date));
  if(filter) data = data.filter(t=>t.category===filter);
  
  // Sort descending by date
  data.sort((a,b)=>new Date(b.date)-new Date(a.date));
  
  data = data.slice(0,8);
  const tbody = document.getElementById('txBody');
  if(!data.length) { tbody.innerHTML='<tr class="empty-row"><td colspan="5">No activities this month</td></tr>'; return; }
  tbody.innerHTML = data.map(t=> {
    let amtStr = '';
    if (t.isExpense) {
      amtStr = `<span class="tx-amount" style="color: #f87171;">-${fmt(t.amount)}</span>`;
    } else if (t.type === 'Add Balance') {
      amtStr = `<span class="tx-amount" style="color: #4ade80;">+${fmt(t.amount)}</span>`;
    } else { // Transfer
      amtStr = `<span class="tx-amount" style="color: #38bdf8;">${fmt(t.amount)}</span>`;
    }
    
    let editFn = t.isExpense ? `editTransaction('${t.id}')` : `editBalanceLog('${t.id}')`;
    let delFn = t.isExpense ? `deleteTransaction('${t.id}')` : `deleteBalanceLog('${t.id}')`;
    let catBadgeColor = t.isExpense ? catColor(t.category) : (t.type === 'Add Balance' ? '#10b981' : '#38bdf8');
    
    return `
      <tr>
        <td><span class="cat-badge" style="background:${catBadgeColor}22;color:${catBadgeColor}">${t.category}</span><br><small style="color:#64748b">${t.title}</small></td>
        <td>${t.bank}</td>
        <td class="tx-date">${new Date(t.date).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}</td>
        <td>${amtStr}</td>
        <td>
          <button class="edit-btn" onclick="${editFn}" style="background:none; border:none; cursor:pointer; margin-right:8px; font-size:1rem; opacity:0.7;" title="Edit">✏️</button>
          <button class="delete-btn" onclick="${delFn}" title="Delete">✕</button>
        </td>
      </tr>`;
  }).join('');
}

// ===== ALL TX TABLE =====
function renderAllTx() {
  const search = (document.getElementById('txSearch')||{value:''}).value.toLowerCase();
  const catF = (document.getElementById('txCategoryFilter')||{value:''}).value;
  const bankF = (document.getElementById('txBankFilter')||{value:''}).value;
  const sort = (document.getElementById('txSortFilter')||{value:'date-desc'}).value;
  
  let data = getCombinedActivities();
  if(search) data = data.filter(t=>t.title.toLowerCase().includes(search)||t.category.toLowerCase().includes(search)||t.bank.toLowerCase().includes(search));
  if(catF) data = data.filter(t=>t.category===catF);
  if(bankF) data = data.filter(t=>t.bank===bankF);
  
  if(sort==='date-asc') data.sort((a,b)=>new Date(a.date)-new Date(b.date));
  else if(sort==='amount-desc') data.sort((a,b)=>b.amount-a.amount);
  else if(sort==='amount-asc') data.sort((a,b)=>a.amount-b.amount);
  else data.sort((a,b)=>new Date(b.date)-new Date(a.date));
  
  const total = data.length;
  const pages = Math.ceil(total/PER_PAGE)||1;
  if(currentPage>pages) currentPage=1;
  const slice = data.slice((currentPage-1)*PER_PAGE, currentPage*PER_PAGE);
  const tbody = document.getElementById('allTxBody');
  if(!slice.length) { tbody.innerHTML='<tr class="empty-row"><td colspan="6">No transactions found</td></tr>'; }
  else {
    tbody.innerHTML = slice.map(t=> {
      let amtStr = '';
      if (t.isExpense) {
        amtStr = `<span class="tx-amount" style="color: #f87171;">-${fmt(t.amount)}</span>`;
      } else if (t.type === 'Add Balance') {
        amtStr = `<span class="tx-amount" style="color: #4ade80;">+${fmt(t.amount)}</span>`;
      } else { // Transfer
        amtStr = `<span class="tx-amount" style="color: #38bdf8;">${fmt(t.amount)}</span>`;
      }
      
      let editFn = t.isExpense ? `editTransaction('${t.id}')` : `editBalanceLog('${t.id}')`;
      let delFn = t.isExpense ? `deleteTransaction('${t.id}')` : `deleteBalanceLog('${t.id}')`;
      let catBadgeColor = t.isExpense ? catColor(t.category) : (t.type === 'Add Balance' ? '#10b981' : '#38bdf8');
      
      return `
        <tr>
          <td class="tx-date">${new Date(t.date).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</td>
          <td>${t.title}</td>
          <td><span class="cat-badge" style="background:${catBadgeColor}22;color:${catBadgeColor}">${t.category}</span></td>
          <td>${t.bank}</td>
          <td>${amtStr}</td>
          <td>
            <button class="edit-btn" onclick="${editFn}" style="background:none; border:none; cursor:pointer; margin-right:8px; font-size:1rem; opacity:0.7;" title="Edit">✏️</button>
            <button class="delete-btn" onclick="${delFn}" title="Delete">✕</button>
          </td>
        </tr>`;
    }).join('');
  }
  // pagination
  const pag = document.getElementById('pagination');
  pag.innerHTML = '';
  for(let i=1;i<=pages;i++) {
    const b = document.createElement('button');
    b.className='page-btn'+(i===currentPage?' active':'');
    b.textContent=i; b.onclick=()=>{ currentPage=i; renderAllTx(); };
    pag.appendChild(b);
  }
}

// ===== ANALYTICS =====
function renderAnalytics() {
  // Monthly
  const months=[]; const now=new Date();
  for(let i=5;i>=0;i--){ const d=new Date(now.getFullYear(),now.getMonth()-i,1); months.push({label:d.toLocaleDateString('en',{month:'short',year:'2-digit'}),m:d.getMonth(),y:d.getFullYear()}); }
  const mData = months.map(({m,y})=>transactions.filter(t=>{ const d=new Date(t.date); return d.getMonth()===m&&d.getFullYear()===y; }).reduce((s,t)=>s+t.amount,0));
  const mCtx = document.getElementById('monthlyChart').getContext('2d');
  if(monthlyChartInst) monthlyChartInst.destroy();
  monthlyChartInst = new Chart(mCtx,{type:'line',data:{labels:months.map(m=>m.label),datasets:[{data:mData,borderColor:'#6366f1',backgroundColor:'rgba(99,102,241,0.1)',fill:true,tension:0.4,pointBackgroundColor:'#6366f1',pointRadius:4}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#475569'}},y:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#475569',callback:v=>'₹'+v.toLocaleString('en-IN')}}}}});
  // Analytics donut
  const map={};
  transactions.forEach(t=>{ map[t.category]=(map[t.category]||0)+t.amount; });
  const cats=Object.entries(map).sort((a,b)=>b[1]-a[1]);
  const adCtx=document.getElementById('analyticsDonut').getContext('2d');
  if(analyticsDonutInst) analyticsDonutInst.destroy();
  if(cats.length) analyticsDonutInst=new Chart(adCtx,{type:'doughnut',data:{labels:cats.map(([c])=>c),datasets:[{data:cats.map(([,v])=>v),backgroundColor:cats.map(([c])=>catColor(c)),borderWidth:0}]},options:{cutout:'65%',plugins:{legend:{position:'right',labels:{color:'#94a3b8',font:{size:11},boxWidth:12}}}}});
  // Daily
  const days30=[]; for(let i=29;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i); days30.push(d.toISOString().slice(0,10)); }
  const dData=days30.map(d=>transactions.filter(t=>t.date===d).reduce((s,t)=>s+t.amount,0));
  const dCtx=document.getElementById('dailyChart').getContext('2d');
  if(dailyChartInst) dailyChartInst.destroy();
  dailyChartInst=new Chart(dCtx,{type:'bar',data:{labels:days30.map(d=>new Date(d).toLocaleDateString('en',{day:'2-digit',month:'short'})),datasets:[{data:dData,backgroundColor:'rgba(99,102,241,0.5)',borderRadius:4}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:'#475569',maxRotation:45,font:{size:10}}},y:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#475569',callback:v=>'₹'+v.toLocaleString('en-IN')}}}}});
}

// ===== POPULATE FILTERS =====
function populateFilters() {
  const cats = uniqueCats();
  const banks = uniqueBanks();
  ['categoryFilter','txCategoryFilter'].forEach(id=>{
    const el=document.getElementById(id); if(!el) return;
    const cur=el.value;
    el.innerHTML='<option value="">All Categories</option>'+cats.map(c=>`<option value="${c}"${c===cur?' selected':''}>${c}</option>`).join('');
  });
  const bf=document.getElementById('txBankFilter'); if(bf){ const cur=bf.value; bf.innerHTML='<option value="">All Banks</option>'+banks.map(b=>`<option value="${b}"${b===cur?' selected':''}>${b}</option>`).join(''); }
}

// ===== DELETE =====
window.deleteTransaction = function(id) {
  if(!confirm('Delete this transaction?')) return;
  transactions = transactions.filter(t=>t.id!==id);
  saveLocal(transactions);
  renderAll();
  toast('Transaction deleted','error');
  postAllToSheet();
};

let editingTxId = null;

// ===== EDIT =====
window.editTransaction = function(id) {
  const tx = transactions.find(t => t.id === id);
  if (!tx) return;
  editingTxId = id;
  document.getElementById('expDate').value = tx.date;
  document.getElementById('expTitle').value = tx.title;
  document.getElementById('expCategory').value = tx.category;
  document.getElementById('expBank').value = tx.bank;
  document.getElementById('expAmount').value = tx.amount;
  document.querySelector('.btn-text').textContent = 'Update Expense';
  document.getElementById('modalOverlay').classList.add('open');
};

// ===== ADD / EDIT EXPENSE =====
function addExpense(e) {
  e.preventDefault();
  const status=document.getElementById('modalStatus');
  const date=document.getElementById('expDate').value;
  const title=document.getElementById('expTitle').value.trim();
  const category=document.getElementById('expCategory').value;
  const bank=document.getElementById('expBank').value;
  const amount=parseFloat(document.getElementById('expAmount').value);
  if(!date||!title||!category||!bank||isNaN(amount)||amount<=0){
    status.className='modal-status error';
    status.textContent='Please fill all fields correctly.'; return;
  }
  status.className='modal-status'; status.textContent='';
  const tx = { date, title, category, bank, amount, id: editingTxId || `${date}_${title}_${amount}_${Date.now()}` };
  
  if (editingTxId) {
    const idx = transactions.findIndex(t => t.id === editingTxId);
    if (idx !== -1) transactions[idx] = tx;
    toast('✓ Transaction updated!');
  } else {
    transactions.unshift(tx);
    toast('✓ Expense added!');
  }
  
  saveLocal(transactions);
  closeModal();
  renderAll();
  postAllToSheet();
}

// ===== MODAL =====
function openModal() {
  document.getElementById('modalOverlay').classList.add('open');
  if(!editingTxId) {
    document.getElementById('expenseForm').reset();
    document.getElementById('expDate').value = new Date().toISOString().slice(0, 10);
    document.querySelector('.btn-text').textContent = 'Add Expense';
  }
}
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.getElementById('modalStatus').textContent='';
  editingTxId = null;
  document.querySelector('.btn-text').textContent = 'Add Expense';
}

// ===== NAVIGATION =====
function switchView(view) {
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('view-'+view).classList.add('active');
  document.getElementById('nav-'+view)?.classList.add('active');
  if(view==='analytics') renderAnalytics();
}

// ===== SETTINGS =====
function loadSettingsUI() {
  const cfg=getSettings();
  if(cfg.appsScriptUrl) document.getElementById('appsScriptUrl').value=cfg.appsScriptUrl;
  if(cfg.displayName) document.getElementById('displayName').value=cfg.displayName;
  if(cfg.monthlyBudget) document.getElementById('monthlyBudget').value=cfg.monthlyBudget;
}

// ===== ADD BALANCE MODAL =====
let editingBalanceLogId = null;

function reverseHistoryBalances(item, base) {
  if (item.type === 'Add Balance') {
    base[item.bank] = (base[item.bank] || 0) - item.amount;
  } else if (item.type === 'Transfer') {
    const [fromBank, toBank] = item.bank.split(' → ');
    if (fromBank && toBank) {
      base[fromBank] = (base[fromBank] || 0) + item.amount;
      base[toBank] = (base[toBank] || 0) - item.amount;
    }
  }
}

window.editBalanceLog = function(id) {
  const history = loadBalanceHistory();
  const item = history.find(h => h.id === id);
  if (!item) return;

  editingBalanceLogId = id;
  if (item.type === 'Add Balance') {
    document.getElementById('balBank').value = item.bank;
    document.getElementById('balAmount').value = item.amount;
    document.getElementById('balDate').value = item.date;
    document.getElementById('balRemark').value = item.remark;
    // Change submit button text
    document.querySelector('#addBalanceForm .btn-submit').textContent = 'Update Balance';
    document.getElementById('addBalanceModalOverlay').classList.add('open');
  } else if (item.type === 'Transfer') {
    const [fromBank, toBank] = item.bank.split(' → ');
    document.getElementById('txFromBank').value = fromBank || '';
    document.getElementById('txToBank').value = toBank || '';
    document.getElementById('txTransferAmount').value = item.amount;
    document.getElementById('txTransferDate').value = item.date;
    document.getElementById('balTransferRemark').value = item.remark;
    // Change submit button text
    document.querySelector('#transferForm .btn-submit').textContent = 'Update Transfer';
    document.getElementById('transferModalOverlay').classList.add('open');
  }
};

window.deleteBalanceLog = function(id) {
  if (!confirm('Delete this balance log entry? This will reverse the balance adjustment.')) return;
  const history = loadBalanceHistory();
  const idx = history.findIndex(h => h.id === id);
  if (idx === -1) return;

  const item = history[idx];
  const base = loadBaseBalances();
  reverseHistoryBalances(item, base);
  saveBaseBalances(base);

  history.splice(idx, 1);
  saveBalanceHistory(history);
  renderAll();
  toast('✓ Balance log entry deleted & reversed!', 'error');
  postAllToSheet();
};

function openAddBalanceModal() {
  document.getElementById('addBalanceModalOverlay').classList.add('open');
  if (!editingBalanceLogId) {
    document.getElementById('addBalanceForm').reset();
    document.getElementById('balDate').value = new Date().toISOString().slice(0, 10);
    document.querySelector('#addBalanceForm .btn-submit').textContent = 'Add Balance';
  }
}
function closeAddBalanceModal() {
  document.getElementById('addBalanceModalOverlay').classList.remove('open');
  editingBalanceLogId = null;
  document.querySelector('#addBalanceForm .btn-submit').textContent = 'Add Balance';
}

// ===== TRANSFER MODAL =====
function openTransferModal() {
  document.getElementById('transferModalOverlay').classList.add('open');
  if (!editingBalanceLogId) {
    document.getElementById('transferForm').reset();
    document.getElementById('txTransferDate').value = new Date().toISOString().slice(0, 10);
    document.querySelector('#transferForm .btn-submit').textContent = 'Transfer';
  }
}
function closeTransferModal() {
  document.getElementById('transferModalOverlay').classList.remove('open');
  editingBalanceLogId = null;
  document.querySelector('#transferForm .btn-submit').textContent = 'Transfer';
}

async function submitAddBalance(e) {
  e.preventDefault();
  const bank = document.getElementById('balBank').value;
  const amount = parseFloat(document.getElementById('balAmount').value);
  const date = document.getElementById('balDate').value || new Date().toISOString().slice(0, 10);
  const remark = document.getElementById('balRemark').value.trim() || 'Direct Deposit';
  if (!bank || isNaN(amount) || amount <= 0) {
    alert('Please select a bank and enter a valid amount.');
    return;
  }

  const base = loadBaseBalances();
  const history = loadBalanceHistory();

  if (editingBalanceLogId) {
    const idx = history.findIndex(h => h.id === editingBalanceLogId);
    if (idx !== -1) {
      // Reverse old
      reverseHistoryBalances(history[idx], base);
      // Update entry
      history[idx] = {
        id: editingBalanceLogId,
        date: date,
        bank: bank,
        amount: amount,
        remark: remark,
        type: 'Add Balance'
      };
      // Apply new
      base[bank] = (base[bank] || 0) + amount;
      toast('✓ Balance entry updated!');
    }
  } else {
    // Apply new
    base[bank] = (base[bank] || 0) + amount;
    // Add new
    history.unshift({
      id: 'bal_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now(),
      date: date,
      bank: bank,
      amount: amount,
      remark: remark,
      type: 'Add Balance'
    });
    toast(`✓ Added ${fmt(amount)} to ${bank}`);
  }

  saveBaseBalances(base);
  saveBalanceHistory(history);
  closeAddBalanceModal();
  renderAll();
  postAllToSheet();
}

async function submitTransfer(e) {
  e.preventDefault();
  const fromBank = document.getElementById('txFromBank').value;
  const toBank = document.getElementById('txToBank').value;
  const amount = parseFloat(document.getElementById('txTransferAmount').value);
  const date = document.getElementById('txTransferDate').value || new Date().toISOString().slice(0, 10);
  const remark = document.getElementById('balTransferRemark').value.trim() || 'Internal Transfer';
  if (!fromBank || !toBank || isNaN(amount) || amount <= 0) {
    alert('Please select banks and enter a valid amount.');
    return;
  }
  if (fromBank === toBank) {
    alert('Source and destination banks must be different.');
    return;
  }

  const base = loadBaseBalances();
  const history = loadBalanceHistory();

  if (editingBalanceLogId) {
    const idx = history.findIndex(h => h.id === editingBalanceLogId);
    if (idx !== -1) {
      // Reverse old
      reverseHistoryBalances(history[idx], base);
      // Update entry
      history[idx] = {
        id: editingBalanceLogId,
        date: date,
        bank: `${fromBank} → ${toBank}`,
        amount: amount,
        remark: remark,
        type: 'Transfer'
      };
      // Apply new
      base[fromBank] = (base[fromBank] || 0) - amount;
      base[toBank] = (base[toBank] || 0) + amount;
      toast('✓ Transfer entry updated!');
    }
  } else {
    // Apply new
    base[fromBank] = (base[fromBank] || 0) - amount;
    base[toBank] = (base[toBank] || 0) + amount;
    // Add new
    history.unshift({
      id: 'bal_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now(),
      date: date,
      bank: `${fromBank} → ${toBank}`,
      amount: amount,
      remark: remark,
      type: 'Transfer'
    });
    toast(`✓ Transferred ${fmt(amount)} from ${fromBank} to ${toBank}`);
  }

  saveBaseBalances(base);
  saveBalanceHistory(history);
  closeTransferModal();
  renderAll();
  postAllToSheet();
}

// ===== BORROW MODAL =====
function openBorrowModal() {
  document.getElementById('borrowModalOverlay').classList.add('open');
  document.getElementById('borrowForm').reset();
  document.getElementById('borDate').value = new Date().toISOString().slice(0, 10);
}
function closeBorrowModal() {
  document.getElementById('borrowModalOverlay').classList.remove('open');
}

async function submitBorrow(e) {
  e.preventDefault();
  const name = document.getElementById('borPerson').value.trim();
  const action = document.getElementById('borAction').value;
  const amount = parseFloat(document.getElementById('borAmount').value);
  const date = document.getElementById('borDate').value || new Date().toISOString().slice(0, 10);
  const remark = document.getElementById('borRemark').value.trim() || (action === 'borrow' ? 'Borrowed' : 'Repaid');
  
  if (!name || isNaN(amount) || amount <= 0) {
    alert('Please enter a valid name and amount.');
    return;
  }
  
  const balances = loadBorrowedBalances();
  if (action === 'borrow') {
    balances[name] = (balances[name] || 0) + amount;
    toast(`✓ Borrowed ${fmt(amount)} from ${name}`);
  } else {
    balances[name] = Math.max(0, (balances[name] || 0) - amount);
    toast(`✓ Repaid ${fmt(amount)} to ${name}`);
  }
  
  saveBorrowedBalances(balances);
  closeBorrowModal();
  renderAll();
}

// ===== LENT MODAL =====
function openLentModal() {
  document.getElementById('lentModalOverlay').classList.add('open');
  document.getElementById('lentForm').reset();
  document.getElementById('lenDate').value = new Date().toISOString().slice(0, 10);
}
function closeLentModal() {
  document.getElementById('lentModalOverlay').classList.remove('open');
}

async function submitLent(e) {
  e.preventDefault();
  const name = document.getElementById('lenPerson').value.trim();
  const action = document.getElementById('lenAction').value;
  const amount = parseFloat(document.getElementById('lenAmount').value);
  const date = document.getElementById('lenDate').value || new Date().toISOString().slice(0, 10);
  const remark = document.getElementById('lenRemark').value.trim() || (action === 'lend' ? 'Lent' : 'Recovered');
  
  if (!name || isNaN(amount) || amount <= 0) {
    alert('Please enter a valid name and amount.');
    return;
  }
  
  const balances = loadLentBalances();
  if (action === 'lend') {
    balances[name] = (balances[name] || 0) + amount;
    toast(`✓ Lent ${fmt(amount)} to ${name}`);
  } else {
    balances[name] = Math.max(0, (balances[name] || 0) - amount);
    toast(`✓ Recovered ${fmt(amount)} from ${name}`);
  }
  
  saveLentBalances(balances);
  closeLentModal();
  renderAll();
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async ()=>{
  // Load Chart.js
  const script=document.createElement('script');
  script.src='https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
  document.head.appendChild(script);
  script.onload = async ()=>{
    Chart.defaults.color='#94a3b8';
    Chart.defaults.font.family='Inter,sans-serif';
    // Load local first for instant render
    transactions = loadLocal();
    populateCategoriesSelect();
    renderAll();
    // Then sync from sheet
    await syncData();
  };

  // Nav
  document.querySelectorAll('.nav-item').forEach(item=>{
    item.addEventListener('click',e=>{ e.preventDefault(); switchView(item.dataset.view); });
  });

  // Modal triggers
  document.getElementById('openAddExpenseModal').addEventListener('click', openModal);
  document.getElementById('openAddExpenseModal2')?.addEventListener('click', openModal);
  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('cancelModal').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', e=>{ if(e.target===e.currentTarget) closeModal(); });
  document.getElementById('expenseForm').addEventListener('submit', addExpense);
  document.getElementById('expCategory').addEventListener('change', handleCategorySelectChange);

  // Add Balance triggers
  document.getElementById('openAddBalanceBtn').addEventListener('click', openAddBalanceModal);
  document.getElementById('closeAddBalanceModal').addEventListener('click', closeAddBalanceModal);
  document.getElementById('cancelAddBalanceModal').addEventListener('click', closeAddBalanceModal);
  document.getElementById('addBalanceModalOverlay').addEventListener('click', e=>{ if(e.target===e.currentTarget) closeAddBalanceModal(); });
  document.getElementById('addBalanceForm').addEventListener('submit', submitAddBalance);

  // Transfer triggers
  document.getElementById('openTransferBtn').addEventListener('click', openTransferModal);
  document.getElementById('closeTransferModal').addEventListener('click', closeTransferModal);
  document.getElementById('cancelTransferModal').addEventListener('click', closeTransferModal);
  document.getElementById('transferModalOverlay').addEventListener('click', e=>{ if(e.target===e.currentTarget) closeTransferModal(); });
  document.getElementById('transferForm').addEventListener('submit', submitTransfer);

  // Clear Balance History triggers
  document.getElementById('clearBalanceLogBtn').addEventListener('click', e => {
    e.preventDefault();
    if(confirm('Clear all balance log entries?')) {
      saveBalanceHistory([]);
      renderContacts();
      toast('Balance log cleared', 'error');
    }
  });

  // Borrow / Repay triggers
  document.getElementById('openBorrowBtn').addEventListener('click', openBorrowModal);
  document.getElementById('closeBorrowModal').addEventListener('click', closeBorrowModal);
  document.getElementById('cancelBorrowModal').addEventListener('click', closeBorrowModal);
  document.getElementById('borrowModalOverlay').addEventListener('click', e=>{ if(e.target===e.currentTarget) closeBorrowModal(); });
  document.getElementById('borrowForm').addEventListener('submit', submitBorrow);

  // Lent / Recover triggers
  document.getElementById('openLentBtn').addEventListener('click', openLentModal);
  document.getElementById('closeLentModal').addEventListener('click', closeLentModal);
  document.getElementById('cancelLentModal').addEventListener('click', closeLentModal);
  document.getElementById('lentModalOverlay').addEventListener('click', e=>{ if(e.target===e.currentTarget) closeLentModal(); });
  document.getElementById('lentForm').addEventListener('submit', submitLent);

  // Sync button
  document.getElementById('syncBtn').addEventListener('click', async () => {
    await syncData();
    await postAllToSheet();
  });

  // View all
  document.getElementById('viewAllBtn').addEventListener('click', ()=>switchView('transactions'));

  // Filters
  document.getElementById('categoryFilter').addEventListener('change', e=>renderRecentTx(e.target.value));
  ['txSearch','txCategoryFilter','txBankFilter','txSortFilter'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.addEventListener('input',()=>{ currentPage=1; renderAllTx(); });
  });

  // Global search
  document.getElementById('globalSearch').addEventListener('input', e=>{
    const q=e.target.value.toLowerCase();
    if(!q) { renderRecentTx(); return; }
    const tbody=document.getElementById('txBody');
    const res=getCombinedActivities().filter(t=>t.title.toLowerCase().includes(q)||t.category.toLowerCase().includes(q)).slice(0,8);
    if(!res.length){ tbody.innerHTML='<tr class="empty-row"><td colspan="5">No results</td></tr>'; return; }
    tbody.innerHTML=res.map(t=>{
      let amtStr = '';
      if (t.isExpense) {
        amtStr = `<span class="tx-amount" style="color: #f87171;">-${fmt(t.amount)}</span>`;
      } else if (t.type === 'Add Balance') {
        amtStr = `<span class="tx-amount" style="color: #4ade80;">+${fmt(t.amount)}</span>`;
      } else { // Transfer
        amtStr = `<span class="tx-amount" style="color: #94a3b8;">${fmt(t.amount)}</span>`;
      }
      
      let editFn = t.isExpense ? `editTransaction('${t.id}')` : `editBalanceLog('${t.id}')`;
      let delFn = t.isExpense ? `deleteTransaction('${t.id}')` : `deleteBalanceLog('${t.id}')`;
      let catBadgeColor = t.isExpense ? catColor(t.category) : (t.type === 'Add Balance' ? '#10b981' : '#38bdf8');
      
      return `<tr>
        <td><span class="cat-badge" style="background:${catBadgeColor}22;color:${catBadgeColor}">${t.category}</span><br><small style="color:#64748b">${t.title}</small></td>
        <td>${t.bank}</td>
        <td class="tx-date">${new Date(t.date).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}</td>
        <td>${amtStr}</td>
        <td>
          <button class="edit-btn" onclick="${editFn}" style="background:none; border:none; cursor:pointer; margin-right:8px; font-size:1rem; opacity:0.7;" title="Edit">✏️</button>
          <button class="delete-btn" onclick="${delFn}" title="Delete">✕</button>
        </td>
      </tr>`;
    }).join('');
  });

  // Mobile menu
  document.getElementById('menuToggle').addEventListener('click', ()=>document.getElementById('sidebar').classList.toggle('open'));

  // Settings save
  document.getElementById('saveSettings').addEventListener('click', async ()=>{
    const url=document.getElementById('appsScriptUrl').value.trim();
    const statusEl = document.getElementById('settingsStatus');
    
    if (url && (!url.includes('/macros/s/') || !url.split('?')[0].endsWith('/exec'))) {
      statusEl.style.color = '#ef4444';
      statusEl.textContent = '❌ Invalid URL! Make sure to copy the full Web App URL ending with /exec';
      toast('Invalid Apps Script URL', 'error');
      return;
    }
    
    statusEl.style.color = '#10b981';
    const cfg=getSettings(); cfg.appsScriptUrl=url; saveSettings(cfg);
    statusEl.textContent = '✓ Settings saved!';
    toast('Settings saved');
    if (url) {
      await syncData();
      await postAllToSheet();
    }
  });

  // Profile save
  document.getElementById('saveProfile').addEventListener('click', ()=>{
    const cfg=getSettings();
    cfg.displayName=document.getElementById('displayName').value;
    cfg.monthlyBudget=document.getElementById('monthlyBudget').value;
    saveSettings(cfg); renderBalanceCard(); toast('Profile saved');
  });

  loadSettingsUI();
});
