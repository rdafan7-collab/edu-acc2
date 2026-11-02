/* ========================================================================
   EDU_Acc — patches.js
   4 تحديثات: تعديل القيود المرن + إضافة أصل + مركز الطباعة + التبويبات
   ======================================================================== */
(function(){
'use strict';

function init(){
  if(typeof window.tab !== 'function' || typeof window.renderAll !== 'function'){
    setTimeout(init, 200);
    return;
  }
  console.log('✅ EDU_Acc patches loaded');
  const $ = id => document.getElementById(id);

  /* ===== PATCH 1: تعديل القيد — إضافة حسابات جديدة ===== */
  window.edOpts = function(sel){
    const list = (typeof sortedAcc === 'function' ? sortedAcc() : accounts).slice();
    if(sel && !list.includes(sel)) list.push(sel);
    let h = `<option value="">اختر الحساب...</option>`;
    h += list.map(a => `<option value="${esc(a)}" ${a===sel?'selected':''}>${a}</option>`).join('');
    h += `<option value="__new_ed__" style="font-weight:bold;color:#4f46e5">➕ إضافة حساب جديد...</option>`;
    return h;
  };
  window.edRow = function(side, x){
    const container = $(side === 'd' ? 'edD' : 'edC');
    const div = document.createElement('div');
    div.className = 'flex gap-2 items-center';
    div.innerHTML =
      `<select class="flex-1 min-w-0 p-2 rounded border bg-white" onchange="window._edSelChange(this)">${window.edOpts(x && x.a)}</select>
       <input type="number" min="0" step="0.01" placeholder="المبلغ" class="em w-28 p-2 rounded border" value="${x ? x.m : ''}" oninput="edCalc()">
       <button type="button" onclick="edDel(this)" class="text-slate-400 hover:text-red-600 px-1">🗑</button>`;
    container.appendChild(div);
  };
  window._edSelChange = function(sel){
    if(sel.value === '__new_ed__'){
      const name = prompt('📝 اكتب اسم الحساب الجديد:');
      if(!name || !name.trim()){ sel.value = ''; return; }
      const cleanName = name.trim();
      if(accounts.includes(cleanName)){
        sel.innerHTML = window.edOpts(cleanName);
        sel.value = cleanName; edCalc(); return;
      }
      const t = prompt('⚙️ نوع الحساب:\n1) أصول\n2) خصوم\n3) حقوق ملكية\n4) إيرادات\n5) مصروفات\n\nاكتب الرقم:', '1');
      const typeMap = {'1':'A','2':'L','3':'E','4':'R','5':'X'};
      const tc = typeMap[t] || 'A';
      accounts.push(cleanName);
      types[cleanName] = tc;
      codes[cleanName] = autoCode({A:'11',L:'21',E:'3',R:'4',X:'5'}[tc] || '11');
      store.set('acc_list', accounts);
      store.set('acc_types', types);
      store.set('acc_codes', codes);
      sel.innerHTML = window.edOpts(cleanName);
      sel.value = cleanName;
      edCalc();
      if(typeof refreshSelects === 'function') refreshSelects();
    } else { edCalc(); }
  };

  /* ===== PATCH 2: قسم الإهلاك — زر إضافة أصل ===== */
  function injectAddAssetButton(){
    const dpOut = $('dpOut'); if(!dpOut || $('dpAddAssetBtn')) return;
    const depParent = dpOut.closest('details'); if(!depParent) return;
    const btn = document.createElement('button');
    btn.id = 'dpAddAssetBtn';
    btn.className = 'bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded font-bold mt-3';
    btn.innerHTML = '➕ إضافة أصل جديد';
    btn.onclick = window.openAssetForm;
    const formGrid = depParent.querySelector('.grid.md\\:grid-cols-3');
    if(formGrid && formGrid.parentElement) formGrid.parentElement.insertBefore(btn, formGrid);
    else depParent.appendChild(btn);
  }
  window.openAssetForm = function(){
    let modal = $('assetOv');
    if(!modal){
      modal = document.createElement('div');
      modal.id = 'assetOv';
      modal.style.cssText = 'position:fixed;inset:0;z-index:10045;background:rgba(15,23,42,.8);overflow:auto;display:none';
      modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-xl max-w-lg mx-auto my-8 p-5 space-y-3">
          <div class="flex justify-between items-center">
            <h3 class="text-lg font-bold">🏭 إضافة أصل جديد</h3>
            <button type="button" onclick="window.closeAssetForm()" class="text-slate-400 text-2xl leading-none">✕</button>
          </div>
          <p class="text-xs text-slate-600">سيتم إنشاء الأصل كحساب أصول ثابتة وتوليد جدول الإهلاك تلقائياً.</p>
          <div class="grid gap-2">
            <label class="text-sm font-semibold">اسم الأصل<input id="assetName" class="w-full p-2 rounded border mt-1" placeholder="مثال: سيارة نقل"></label>
            <label class="text-sm font-semibold">التكلفة (ج.م)<input id="assetCost" type="number" min="0" step="0.01" class="w-full p-2 rounded border mt-1"></label>
            <div class="grid grid-cols-2 gap-2">
              <label class="text-sm font-semibold">قيمة الخردة<input id="assetSalvage" type="number" min="0" step="0.01" value="0" class="w-full p-2 rounded border mt-1"></label>
              <label class="text-sm font-semibold">العمر (سنوات)<input id="assetLife" type="number" min="1" max="50" value="5" class="w-full p-2 rounded border mt-1"></label>
            </div>
            <label class="text-sm font-semibold">طريقة الإهلاك<select id="assetMethod" class="w-full p-2 rounded border bg-white mt-1"><option value="sl">القسط الثابت</option><option value="db">القسط المتناقص</option></select></label>
            <label class="text-sm font-semibold">نسبة المتناقص % (اختياري)<input id="assetRate" type="number" min="0" max="100" step="0.1" class="w-full p-2 rounded border mt-1" placeholder="2 ÷ العمر"></label>
            <label class="text-sm font-semibold">تاريخ البدء<input id="assetDate" type="date" class="w-full p-2 rounded border mt-1"></label>
          </div>
          <div class="flex gap-2 justify-end pt-3 border-t">
            <button type="button" onclick="window.closeAssetForm()" class="bg-slate-200 px-4 py-2 rounded">إلغاء</button>
            <button type="button" onclick="window.submitAssetForm()" class="bg-indigo-600 text-white px-4 py-2 rounded font-bold">💾 إنشاء الأصل</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
    }
    modal.style.display = 'block';
    setTimeout(() => { const d = $('assetDate'); if(d && !d.value) d.valueAsDate = new Date(); }, 50);
  };
  window.closeAssetForm = function(){ const m = $('assetOv'); if(m) m.style.display = 'none'; };
  window.submitAssetForm = function(){
    const name = ($('assetName').value || '').trim();
    const cost = parseFloat($('assetCost').value) || 0;
    const salv = parseFloat($('assetSalvage').value) || 0;
    const life = parseInt($('assetLife').value) || 0;
    const method = $('assetMethod').value;
    let rate = (parseFloat($('assetRate').value) || 0) / 100;
    const startDate = $('assetDate').value;
    if(!name) return alert('⚠️ اكتب اسم الأصل');
    if(cost <= 0) return alert('⚠️ اكتب تكلفة أكبر من صفر');
    if(life < 1 || life > 50) return alert('⚠️ العمر بين 1 و50 سنة');
    if(salv < 0 || salv >= cost) return alert('⚠️ قيمة الخردة أقل من التكلفة');
    if(method === 'db' && !rate) rate = 2 / life;
    if(method === 'db' && (rate <= 0 || rate > 1)) return alert('⚠️ نسبة الإهلاك بين 0 و100%');
    if(!accounts.includes(name)){
      accounts.push(name); types[name] = 'A'; codes[name] = autoCode('12');
      store.set('acc_list', accounts); store.set('acc_types', types); store.set('acc_codes', codes);
      if(typeof refreshSelects === 'function') refreshSelects();
    }
    if(typeof dpFill === 'function') dpFill();
    const s = id => $(id);
    if(s('dpA')) s('dpA').value = name;
    if(s('dpC')) s('dpC').value = cost;
    if(s('dpS')) s('dpS').value = salv;
    if(s('dpL')) s('dpL').value = life;
    if(s('dpM')) s('dpM').value = method;
    if(s('dpR') && method === 'db') s('dpR').value = (rate * 100).toFixed(1);
    if(s('dpY') && startDate) s('dpY').value = new Date(startDate).getFullYear();
    window.closeAssetForm();
    if(typeof dpBuild === 'function') dpBuild();
    setTimeout(() => { const out = $('dpOut'); if(out) out.scrollIntoView({behavior:'smooth',block:'center'}); }, 200);
  };
  setInterval(injectAddAssetButton, 1500);

  /* ===== PATCH 3: مركز الطباعة الموحد ===== */
  window.openPrintCenter = function(){
    let modal = $('printOv');
    if(!modal){
      modal = document.createElement('div');
      modal.id = 'printOv';
      modal.style.cssText = 'position:fixed;inset:0;z-index:10045;background:rgba(15,23,42,.8);overflow:auto;display:none';
      modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-xl max-w-2xl mx-auto my-8 p-5 space-y-3">
          <div class="flex justify-between items-center">
            <h3 class="text-xl font-bold">🖨️ مركز الطباعة الموحد</h3>
            <button onclick="window.closePrintCenter()" class="text-slate-400 text-2xl">✕</button>
          </div>
          <p class="text-sm text-slate-600">اختر الأقسام التي تريد طباعتها:</p>
          <div class="border-t pt-3">
            <div class="text-xs text-slate-500 font-bold mb-2">التقارير المحاسبية</div>
            <div class="grid md:grid-cols-2 gap-2">
              <label class="flex items-center gap-2 p-2 border rounded hover:bg-slate-50 cursor-pointer"><input type="checkbox" class="pcb" value="journal"><span>📒 دفتر اليومية</span></label>
              <label class="flex items-center gap-2 p-2 border rounded hover:bg-slate-50 cursor-pointer"><input type="checkbox" class="pcb" value="ledger"><span>📚 دفتر الأستاذ</span></label>
              <label class="flex items-center gap-2 p-2 border rounded hover:bg-slate-50 cursor-pointer"><input type="checkbox" class="pcb" value="trial"><span>⚖️ ميزان المراجعة</span></label>
              <label class="flex items-center gap-2 p-2 border rounded hover:bg-slate-50 cursor-pointer"><input type="checkbox" class="pcb" value="fin"><span>📊 القوائم المالية</span></label>
            </div>
          </div>
          <div class="border-t pt-3">
            <div class="text-xs text-slate-500 font-bold mb-2">تقارير أخرى</div>
            <div class="grid md:grid-cols-2 gap-2">
              <label class="flex items-center gap-2 p-2 border rounded hover:bg-slate-50 cursor-pointer"><input type="checkbox" class="pcb" value="dash"><span>📈 المؤشرات المالية</span></label>
              <label class="flex items-center gap-2 p-2 border rounded hover:bg-slate-50 cursor-pointer"><input type="checkbox" class="pcb" value="tables"><span>📋 الجداول المخصصة</span></label>
            </div>
          </div>
          <div class="border-t pt-3">
            <label class="flex items-center gap-2 mb-2"><input type="checkbox" class="pcb" value="withHeader" checked><span class="text-sm">إضافة ترويسة (اسم المنصة + التاريخ + اسم الطالب)</span></label>
            <label class="flex items-center gap-2"><input type="checkbox" class="pcb" value="landscape"><span class="text-sm">وضع أفقي (Landscape)</span></label>
          </div>
          <div class="flex gap-2 justify-end pt-3 border-t">
            <button onclick="window.closePrintCenter()" class="bg-slate-200 px-4 py-2 rounded">إلغاء</button>
            <button onclick="window.doPrintSelected()" class="bg-indigo-600 text-white px-4 py-2 rounded font-bold">🖨️ طباعة المحدد</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
    }
    modal.style.display = 'block';
  };
  window.closePrintCenter = function(){ const m = $('printOv'); if(m) m.style.display = 'none'; };
  window.doPrintSelected = function(){
    const selected = [...document.querySelectorAll('.pcb:checked')].map(c => c.value);
    const includeHeader = selected.includes('withHeader');
    const landscape = selected.includes('landscape');
    const sections = selected.filter(s => s !== 'withHeader' && s !== 'landscape');
    if(!sections.length) return alert('⚠️ اختر قسماً واحداً على الأقل');
    const profile = (typeof getProfile === 'function') ? getProfile() : null;
    const dateStr = new Date().toLocaleString('ar-EG');
    let html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>EDU_Acc</title>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
      <style>
        body{font-family:'Cairo',sans-serif;padding:20px;color:#1e293b;background:#fff}
        h1{font-size:24px;text-align:center;margin:0 0 6px;color:#4f46e5}
        h2{font-size:18px;color:#4f46e5;border-bottom:2px solid #4f46e5;padding-bottom:6px;margin-top:30px;page-break-before:always}
        h2:first-of-type{page-break-before:auto;margin-top:10px}
        h3{font-size:15px;margin:12px 0 6px}
        table{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px}
        th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:right}
        th{background:#f1f5f9;font-weight:700;color:#334155}
        tr.sum td{background:#e2e8f0;font-weight:700}
        .header-bar{text-align:center;border-bottom:3px double #4f46e5;padding-bottom:14px;margin-bottom:20px}
        .header-bar .meta{font-size:12px;color:#64748b;margin-top:4px}
        .muted{color:#64748b;font-size:12px;font-style:italic}
        .two-col{display:flex;gap:20px;flex-wrap:wrap}
        .two-col > div{flex:1;min-width:280px}
        @page{size:${landscape?'A4 landscape':'A4 portrait'};margin:12mm}
      </style></head><body>`;
    if(includeHeader){
      html += `<div class="header-bar"><h1>EDU_Acc — منصة المحاسبة المالية التعليمية</h1><div class="meta">📅 ${dateStr}</div>`;
      if(profile && profile.role === 'student') html += `<div class="meta">👤 ${esc(profile.name)} — 🆔 ${esc(profile.code)}</div>`;
      html += `</div>`;
    }
    const R = {
      journal: () => { if(!entries.length) return '<p class="muted">لا توجد قيود.</p>';
        let h = '<table><thead><tr><th>#</th><th>التاريخ</th><th>الحساب</th><th>مدين</th><th>دائن</th></tr></thead><tbody>';
        entries.forEach((e,i) => {
          const rows = [];
          e.debits.forEach(x => rows.push({a:x.a,d:fmt(x.m),c:''}));
          e.credits.forEach(x => rows.push({a:x.a,d:'',c:fmt(x.m)}));
          rows.forEach((r,k) => { h += `<tr><td>${k===0?i+1:''}</td><td>${k===0?esc(e.date):''}</td><td>${esc(r.a)}</td><td>${r.d}</td><td>${r.c}</td></tr>`; });
          h += `<tr><td colspan="5" class="muted">( ${esc(e.desc)} )</td></tr>`;
        });
        return h + '</tbody></table>';
      },
      ledger: () => { const u = usedAccounts(); if(!u.length) return '<p class="muted">لا توجد بيانات.</p>';
        let h = '<table><thead><tr><th>الحساب</th><th>مجموع المدين</th><th>مجموع الدائن</th><th>الرصيد</th></tr></thead><tbody>';
        u.forEach(a => { const t = totals(a);
          const bal = t.bal > 0 ? fmt(t.bal) + ' مدين' : t.bal < 0 ? fmt(-t.bal) + ' دائن' : '0';
          h += `<tr><td>${esc(a)}</td><td>${fmt(t.d)}</td><td>${fmt(t.c)}</td><td>${bal}</td></tr>`;
        });
        return h + '</tbody></table>';
      },
      trial: () => { const u = usedAccounts(); if(!u.length) return '<p class="muted">لا توجد بيانات.</p>';
        let sd=0, sc=0;
        let h = '<table><thead><tr><th>الحساب</th><th>رصيد مدين</th><th>رصيد دائن</th></tr></thead><tbody>';
        u.forEach(a => { const b = totals(a).bal, d = b>0?b:0, c = b<0?-b:0; sd += d; sc += c;
          h += `<tr><td>${esc(a)}</td><td>${d?fmt(d):'—'}</td><td>${c?fmt(c):'—'}</td></tr>`;
        });
        h += `<tr class="sum"><td>الإجمالي</td><td>${fmt(sd)}</td><td>${fmt(sc)}</td></tr>`;
        h += `<tr><td colspan="3" style="text-align:center;font-weight:700">${Math.abs(sd-sc)<0.005?'✅ متوازن':'❌ غير متوازن — الفرق ' + fmt(Math.abs(sd-sc))}</td></tr>`;
        return h + '</tbody></table>';
      },
      fin: () => { if(!usedAccounts().length) return '<p class="muted">لا توجد بيانات.</p>';
        const by = {A:[],L:[],E:[],R:[],X:[]};
        usedAccounts().forEach(a => { const t = types[a]; if(!by[t]) return;
          const b = totals(a).bal; by[t].push([a, (t==='A'||t==='X') ? b : -b]); });
        const tot = k => by[k].reduce((p,x) => p + x[1], 0);
        const rows = k => by[k].map(([a,v]) => `<tr><td>${esc(a)}</td><td>${fmt(v)}</td></tr>`).join('');
        const sec = (t,k) => `<tr class="sum"><td colspan="2">${t}</td></tr>${rows(k)}<tr class="sum"><td>إجمالي ${t}</td><td>${fmt(tot(k))}</td></tr>`;
        const ni = tot('R') - tot('X');
        let h = '<div class="two-col"><div><h3>📄 قائمة الدخل</h3><table>' + sec('الإيرادات','R') + sec('المصروفات','X') +
          `<tr class="sum"><td>${ni>=0?'صافي الربح':'صافي الخسارة'}</td><td>${fmt(Math.abs(ni))}</td></tr></table></div>`;
        h += '<div><h3>📊 المركز المالي</h3><table>' + sec('الأصول','A') + sec('الخصوم','L') + sec('حقوق الملكية','E') + '</table></div></div>';
        return h;
      },
      dash: () => { const f = finCalc();
        const cur = f.cl ? (f.ca/f.cl).toFixed(2) : '—';
        const qk = f.cl ? (f.qa/f.cl).toFixed(2) : '—';
        const mar = f.sales ? ((f.ni/f.sales)*100).toFixed(1)+'%' : '—';
        const exr = f.R ? ((f.X/f.R)*100).toFixed(1)+'%' : '—';
        return `<table><tr><th>نسبة التداول</th><td>${cur}</td></tr><tr><th>السيولة السريعة</th><td>${qk}</td></tr><tr><th>هامش صافي الربح</th><td>${mar}</td></tr><tr><th>المصروفات ÷ الإيرادات</th><td>${exr}</td></tr><tr class="sum"><th>صافي الربح</th><td>${fmt(f.ni)}</td></tr></table>`;
      },
      tables: () => { if(!customTables || !customTables.length) return '<p class="muted">لا توجد جداول مخصصة.</p>';
        return customTables.map(t => {
          const cols = t.columns || [];
          let h = `<h3>${esc(t.title)}</h3><table><thead><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>`;
          (t.rows||[]).forEach(r => { h += '<tr>' + cols.map((_,i)=>`<td>${esc(r[i]||'')}</td>`).join('') + '</tr>'; });
          return h + '</tbody></table>';
        }).join('');
      }
    };
    const labels = {journal:'📒 دفتر اليومية', ledger:'📚 دفتر الأستاذ', trial:'⚖️ ميزان المراجعة', fin:'📊 القوائم المالية', dash:'📈 المؤشرات المالية', tables:'📋 الجداول المخصصة'};
    sections.forEach(sec => { if(R[sec]) html += `<h2>${labels[sec]}</h2>` + R[sec](); });
    html += '</body></html>';
    const w = window.open('', '_blank');
    if(!w){ alert('⚠️ المتصفح منع فتح النافذة'); return; }
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => { try{ w.print(); }catch(e){} }, 600);
    window.closePrintCenter();
  };

  /* ===== PATCH 4: التبويبات المتعددة (Scenarios) ===== */
  let scenarios = [];
  try { scenarios = JSON.parse(localStorage.getItem('acc_scenarios') || '[]'); } catch(e) { scenarios = []; }
  let activeScenario = parseInt(localStorage.getItem('acc_active_scenario') || '0', 10) || 0;

  function saveLS(){
    try {
      localStorage.setItem('acc_scenarios', JSON.stringify(scenarios));
      localStorage.setItem('acc_active_scenario', String(activeScenario));
    } catch(e){}
  }
  window.saveCurrentScenario = function(){
    if(!scenarios[activeScenario]) return;
    scenarios[activeScenario].entries = JSON.parse(JSON.stringify(entries));
    scenarios[activeScenario].accounts = [...accounts];
    scenarios[activeScenario].types = {...types};
    scenarios[activeScenario].codes = {...codes};
    saveLS();
  };
  window.loadScenario = function(i){
    if(i === activeScenario) return;
    window.saveCurrentScenario();
    activeScenario = i;
    const s = scenarios[i]; if(!s) return;
    entries = JSON.parse(JSON.stringify(s.entries || []));
    accounts = [...(s.accounts || [])];
    types = {...(s.types || {})};
    codes = {...(s.codes || {})};
    try {
      localStorage.setItem('acc_entries', JSON.stringify(entries));
      localStorage.setItem('acc_list', JSON.stringify(accounts));
      localStorage.setItem('acc_types', JSON.stringify(types));
      localStorage.setItem('acc_codes', JSON.stringify(codes));
      localStorage.setItem('acc_active_scenario', String(activeScenario));
    } catch(e){}
    if(typeof refreshSelects === 'function') refreshSelects();
    if(typeof renderAll === 'function') renderAll();
    renderScenarioTabs();
  };
  window.newScenario = function(){
    window.saveCurrentScenario();
    const name = prompt('📑 اسم الشيت الجديد:', 'السيناريو ' + (scenarios.length + 1));
    if(name === null) return;
    scenarios.push({
      id: 's'+Date.now(),
      name: (name||'').trim() || ('السيناريو '+(scenarios.length+1)),
      entries: [], accounts: [...DEF], types: {...DT}, codes: {...DC}
    });
    saveLS();
    window.loadScenario(scenarios.length - 1);
  };
  window.renameScenario = function(i){
    const n = prompt('📝 اسم الشيت:', scenarios[i].name);
    if(n && n.trim()){ scenarios[i].name = n.trim().slice(0,30); saveLS(); renderScenarioTabs(); }
  };
  window.deleteScenario = function(i){
    if(scenarios.length <= 1){ alert('⚠️ لا يمكن حذف آخر شيت'); return; }
    if(!confirm('🗑 حذف الشيت "'+scenarios[i].name+'"؟')) return;
    scenarios.splice(i,1);
    if(activeScenario >= scenarios.length) activeScenario = scenarios.length - 1;
    saveLS();
    window.loadScenario(activeScenario);
  };
  window.renderScenarioTabs = function(){
    let box = $('scenarioTabs');
    if(!box){
      const appRoot = $('appRoot'); if(!appRoot) return;
      const bar = document.createElement('div');
      bar.id = 'scenarioTabs';
      bar.className = 'bg-slate-100 rounded-xl p-2 shadow flex flex-wrap gap-1 items-center no-print';
      bar.style.cssText = 'margin-bottom:8px;overflow-x:auto';
      const header = appRoot.querySelector('header');
      if(header) appRoot.insertBefore(bar, header.nextSibling);
      else appRoot.insertBefore(bar, appRoot.firstChild);
      box = bar;
    }
    let html = '<span class="text-xs text-slate-600 font-bold mx-1 shrink-0">📑 الشيتات:</span>';
    html += scenarios.map((s,i) => {
      const cnt = (s.entries||[]).length;
      const act = i === activeScenario;
      return `<button onclick="window.loadScenario(${i})" ondblclick="window.renameScenario(${i})" class="px-3 py-1 text-sm rounded-t border shrink-0 ${act?'bg-white font-bold text-indigo-700 border-indigo-400 shadow':'bg-slate-200 border-slate-300 text-slate-600 hover:bg-slate-300'}" title="دبل كليك لإعادة التسمية">${esc(s.name)} <span class="text-xs ${act?'text-indigo-500':'text-slate-400'}">(${cnt})</span></button>`;
    }).join('');
    html += `<button onclick="window.newScenario()" class="px-3 py-1 text-sm bg-indigo-100 rounded-t border border-indigo-300 text-indigo-700 font-bold shrink-0">＋ شيت جديد</button>`;
    if(scenarios.length > 1)
      html += `<button onclick="window.deleteScenario(${activeScenario})" class="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded mr-auto shrink-0">🗑 حذف الشيت</button>`;
    box.innerHTML = html;
  };
  const _origSet = store.set.bind(store);
  store.set = function(k, v){
    _origSet(k, v);
    if(['acc_entries','acc_list','acc_types','acc_codes'].includes(k)){
      try { window.saveCurrentScenario();
        clearTimeout(window._scTabTimer);
        window._scTabTimer = setTimeout(window.renderScenarioTabs, 400);
      } catch(e){}
    }
  };

  function initScenarios(){
    if(!scenarios.length){
      scenarios = [{id:'s'+Date.now(), name:'السيناريو 1', entries: JSON.parse(JSON.stringify(entries)), accounts: [...accounts], types: {...types}, codes: {...codes}}];
      activeScenario = 0; saveLS();
    } else {
      activeScenario = Math.min(activeScenario, scenarios.length - 1);
      const s = scenarios[activeScenario];
      entries = JSON.parse(JSON.stringify(s.entries || []));
      accounts = [...(s.accounts || [])];
      types = {...(s.types || {})};
      codes = {...(s.codes || {})};
      try {
        localStorage.setItem('acc_entries', JSON.stringify(entries));
        localStorage.setItem('acc_list', JSON.stringify(accounts));
        localStorage.setItem('acc_types', JSON.stringify(types));
        localStorage.setItem('acc_codes', JSON.stringify(codes));
      } catch(e){}
      if(typeof refreshSelects === 'function') refreshSelects();
      if(typeof renderAll === 'function') renderAll();
    }
    window.renderScenarioTabs();
  }

  /* ===== أزرار القائمة الجانبية ===== */
  function addSidebarButtons(){
    const nav = $('sbNav'); if(!nav || $('sbPrintBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'sbPrintBtn';
    btn.className = 'navBtn w-full text-right px-3 py-2.5 rounded-lg font-bold transition text-slate-700 hover:bg-slate-100';
    btn.innerHTML = '🖨️ مركز الطباعة';
    btn.onclick = function(){ window.openPrintCenter(); if(typeof closeSidebar === 'function') closeSidebar(); };
    const tools = $('t-tools');
    if(tools && tools.parentNode) tools.parentNode.insertBefore(btn, tools.nextSibling);
    else nav.appendChild(btn);
  }

  initScenarios();
  addSidebarButtons();
  injectAddAssetButton();

  const _origTab = window.tab;
  window.tab = function(n){
    if(typeof _origTab === 'function') _origTab.call(this, n);
    setTimeout(function(){ addSidebarButtons(); injectAddAssetButton(); }, 100);
  };
  document.addEventListener('toggle', function(ev){
    if(ev.target && ev.target.tagName === 'DETAILS') setTimeout(injectAddAssetButton, 100);
  }, true);
  console.log('✅ EDU_Acc patches ready');
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();