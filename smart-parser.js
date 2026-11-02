/* ========================================================================
   EDU_Acc — smart-parser.js (نسخة الذكاء الاصطناعي المتقدمة AI-Parser)
   ======================================================================== */
(function(){
'use strict';

/* ===== 1. قواميس المعرفة المحاسبية المتقدمة (Knowledge Base) ===== */
const KNOWLEDGE = {
  assets: {
    words: ['أثاث','مفروشات','سيارة','سيارات','عربية','أرض','أراضي','مبنى','مباني','عقار','عقارات','معدات','تجهيزات','أجهزة','جهاز','آلات','ماكينة','حاسب','كمبيوتر','لابتوب'],
    rule: 'الأصول بطبيعتها مدينة، تزيد بالمدين وتنقص بالدائن.'
  },
  goods: {
    words: ['بضاعة','بضائع','صنف','أصناف','مخزون'],
    rule: 'البضاعة عند الشراء تُسجل مشتريات (مدين)، وعند البيع تُسجل مبيعات (دائن).'
  },
  expenses: {
    words: ['أجور','مرتبات','رواتب','إيجار','ايجار','كهرباء','مياه','ماء','تليفون','هاتف','اتصالات','إنترنت','انترنت','صيانة','نقل','مواصلات','إعلان','اعلان','دعاية','تأمين','قرطاسية','أدوات مكتبية','فوائد مدينة','مصروف','مصاريف'],
    rule: 'المصروفات بطبيعتها مدينة دائماً، وتُمثل عبئاً على المنشأة.'
  },
  revenues: {
    words: ['عمولة','عموله','عمولات','إيراد','ايراد','إيرادات','خدمة','خدمات','فوائد دائنة','استشارات'],
    rule: 'الإيرادات بطبيعتها دائنة دائماً، وتُمثل مكاسب للمنشأة.'
  },
  liabilities: {
    words: ['مورد','موردين','دائنون','قرض','سلفه','كمبيالة','أوراق دفع'],
    rule: 'الالتزامات بطبيعتها دائنة، تزيد بالدائن وتنقص (عند السداد) بالمدين.'
  },
  customers: {
    words: ['عميل','عملاء','مدينون'],
    rule: 'العملاء أصل (مدين)، يزيد عند البيع الآجل، وينقص عند التحصيل منهم.'
  }
};

/* ===== 2. محرك المعالجة اللغوية (NLP Engine) ===== */
function normalize(text){
  return text.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
             .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0));
}

function extractAmount(text){
  const t = normalize(text);
  // استخراج الأرقام حتى لو احتوت على فواصل أو كسور
  const matches = t.match(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g);
  if(!matches || !matches.length) return null;
  const nums = matches.map(x => parseFloat(x.replace(/,/g, ''))).filter(n => !isNaN(n) && n > 0);
  if(!nums.length) return null;
  
  let max = Math.max(...nums); // نأخذ أكبر رقم كونه غالباً قيمة القيد
  const idx = t.indexOf(String(max));
  if(idx >= 0){
    const around = t.substring(Math.max(0, idx - 15), Math.min(t.length, idx + String(max).length + 15));
    if(/ألف|الف/.test(around)) max *= 1000;
    else if(/مليون/.test(around)) max *= 1000000;
  }
  return max;
}

function detectEntity(text){
  for (let key in KNOWLEDGE) {
    for (let word of KNOWLEDGE[key].words) {
      if (text.includes(word)) {
        // ترتيب الاسم المحاسبي
        let accName = word;
        if(key === 'assets') accName = word;
        else if(key === 'expenses') accName = text.includes('مصروف') ? word : 'مصروف ' + word;
        else if(key === 'revenues') accName = text.includes('إيراد') ? word : 'إيراد ' + word;
        return { type: key, rawWord: word, accountName: accName, rule: KNOWLEDGE[key].rule };
      }
    }
  }
  return null;
}

/* ===== 3. المحرك المنطقي للاستنتاج (Inference Logic) ===== */
function smartParse(rawText){
  const text = (rawText || '').trim();
  if(!text) return {error:'✍️ يرجى كتابة وصف العملية أولاً للبدء في التحليل.'};
  const amount = extractAmount(text);
  if(!amount) return {error:'❓ الذكاء الاصطناعي: لم أتمكن من العثور على مبلغ مالي واضح في الجملة. يرجى كتابة الأرقام بوضوح.'};

  // 1. تحديد طريقة الدفع / التحصيل
  const isBank = /شيك|بالبنك|من البنك|في البنك|ف البنك|تحويل|فيز|أودع|ايداع|بنكي/.test(text);
  const isCash = /نقدا|نقداً|كاش|الخزينة|صندوق|خزنة/.test(text);
  const isCredit = /على الحساب|بالأجل|على حساب|أجل|آجل|بالاجل|على النوتة/.test(text);
  
  let moneyAcc = isBank ? 'البنك' : (isCash ? 'النقدية' : (isCredit ? null : 'النقدية')); // افتراضي نقدية إذا لم يذكر
  let moneyReason = isBank ? 'تم ذكر بنك/شيك/إيداع' : (isCash ? 'تم ذكر كاش/نقداً' : 'لم تُذكر وسيلة دفع فتم افتراض النقدية');

  // 2. تحديد الفعل الأساسي (Action)
  const isBuy = /شراء|اشترى|اشترت|أشترى|بتشتري|مشتريات/.test(text);
  const isSell = /بيع|باع|باعت|بيعت|مبيعات/.test(text);
  const isPay = /دفع|سدد|سداد|سـدد|دفعت|صرف/.test(text);
  const isCollect = /حصل|حصّل|استلم|تحصيل|قبض/.test(text);
  const isCapital = /رأس المال|رأس مال|بدأ|بدء|افتتح|تأسيس|استثمر/.test(text);

  // 3. تحليل الكيان المتأثر (البضاعة، الأصل، المصروف، الإيراد)
  const entity = detectEntity(text);
  
  const debit = [], credit = [], aiThoughts = [];

  // ================= سيناريوهات الذكاء الاصطناعي ================= //

  /* سيناريو 1: التأسيس وبدء النشاط */
  if (isCapital) {
    debit.push({a: moneyAcc, m: amount});
    credit.push({a:'رأس المال', m: amount});
    aiThoughts.push(`🧠 استنتجت أنها **عملية تأسيس أو زيادة استثمار** لوجود كلمات (رأس مال/بدأ).`);
    aiThoughts.push(`🟢 **المدين:** حساب (${moneyAcc}) زاد، والأصول عند زيادتها تكون مدينة. (${moneyReason}).`);
    aiThoughts.push(`🔴 **الدائن:** حساب (رأس المال) زاد، وحقوق الملكية بطبيعتها دائنة.`);
    return {debits: debit, credits: credit, notes: aiThoughts};
  }

  /* سيناريو 2: عمليات الشراء */
  if (isBuy) {
    aiThoughts.push(`🧠 استنتجت أنها **عملية شراء** لوجود كلمة تفيد ذلك.`);
    if (entity && entity.type === 'assets') {
      debit.push({a: entity.accountName, m: amount});
      aiThoughts.push(`🟢 **المدين:** تم شراء أصل (${entity.accountName})، و[${entity.rule}] لذلك زاد في الطرف المدين.`);
    } else {
      debit.push({a: 'المشتريات', m: amount});
      aiThoughts.push(`🟢 **المدين:** تم شراء بضاعة فتسجل (المشتريات). المصروفات بطبيعتها مدينة.`);
    }

    if (isCredit || (entity && entity.type === 'liabilities')) {
      credit.push({a: 'الموردون', m: amount});
      aiThoughts.push(`🔴 **الدائن:** العملية تمت (بالأجل)، فنشأ التزام على المنشأة لصالح (الموردين). الالتزامات تزيد بالدائن.`);
    } else {
      credit.push({a: moneyAcc, m: amount});
      aiThoughts.push(`🔴 **الدائن:** تم السداد من (${moneyAcc}). الأصول عندما تنقص تصبح دائنة. (${moneyReason}).`);
    }
    return {debits: debit, credits: credit, notes: aiThoughts};
  }

  /* سيناريو 3: عمليات البيع */
  if (isSell) {
    aiThoughts.push(`🧠 استنتجت أنها **عملية بيع** لوجود كلمة تفيد ذلك.`);
    if (isCredit) {
      debit.push({a: 'العملاء', m: amount});
      aiThoughts.push(`🟢 **المدين:** البيع تم (بالأجل)، فزادت مديونية (العملاء). والعملاء أصل يزيد بالمدين.`);
    } else {
      debit.push({a: moneyAcc, m: amount});
      aiThoughts.push(`🟢 **المدين:** تم التحصيل في (${moneyAcc}) فزاد الأصل (مدين). (${moneyReason}).`);
    }

    if (entity && entity.type === 'assets') {
      credit.push({a: entity.accountName, m: amount});
      aiThoughts.push(`🔴 **الدائن:** تم بيع أصل (${entity.accountName}) ونقص من المنشأة. الأصول عندما تنقص تُسجل دائن.`);
    } else {
      credit.push({a: 'المبيعات', m: amount});
      aiThoughts.push(`🔴 **الدائن:** الإيراد تحقق من بيع البضاعة وسُجل (المبيعات). الإيرادات بطبيعتها دائنة.`);
    }
    return {debits: debit, credits: credit, notes: aiThoughts};
  }

  /* سيناريو 4: دفع المصروفات أو سداد الديون */
  if (isPay) {
    aiThoughts.push(`🧠 استنتجت أنها **عملية سداد مالي أو دفع مصروف**.`);
    if (entity && entity.type === 'liabilities') {
      debit.push({a: 'الموردون', m: amount});
      aiThoughts.push(`🟢 **المدين:** تم سداد التزام للموردين فنقص الالتزام. الالتزامات عندما تنقص تصبح مدينة.`);
    } else if (entity && entity.type === 'expenses') {
      debit.push({a: entity.accountName, m: amount});
      aiThoughts.push(`🟢 **المدين:** إثبات مصروف (${entity.accountName}). [${entity.rule}].`);
    } else {
      debit.push({a: 'مصروفات عمومية', m: amount});
      aiThoughts.push(`🟢 **المدين:** لم يتم تحديد نوع المصروف بدقة، فتم افتراضه (مصروفات عمومية).`);
    }
    
    credit.push({a: moneyAcc, m: amount});
    aiThoughts.push(`🔴 **الدائن:** تم خروج الأموال من (${moneyAcc}). الأصول عندما تنقص تُسجل دائن.`);
    return {debits: debit, credits: credit, notes: aiThoughts};
  }

  /* سيناريو 5: تحصيل الإيرادات أو تحصيل الديون */
  if (isCollect) {
    aiThoughts.push(`🧠 استنتجت أنها **عملية تحصيل أموال**.`);
    debit.push({a: moneyAcc, m: amount});
    aiThoughts.push(`🟢 **المدين:** دخلت الأموال في (${moneyAcc}) فزاد الأصل (مدين). (${moneyReason}).`);

    if (entity && entity.type === 'revenues') {
      credit.push({a: entity.accountName, m: amount});
      aiThoughts.push(`🔴 **الدائن:** تحقق إيراد (${entity.accountName}). [${entity.rule}].`);
    } else if (entity && (entity.type === 'customers' || text.includes('من'))) {
      credit.push({a: 'العملاء', m: amount});
      aiThoughts.push(`🔴 **الدائن:** تم التحصيل من العملاء فنقصت مديونيتهم. الأصول (العملاء) تنقص بالدائن.`);
    } else {
      credit.push({a: 'إيرادات متنوعة', m: amount});
      aiThoughts.push(`🔴 **الدائن:** لم يُحدد نوع الإيراد، فتم افتراضه (إيرادات متنوعة).`);
    }
    return {debits: debit, credits: credit, notes: aiThoughts};
  }

  // إذا لم يتمكن من فهم الجملة نهائياً
  return {error:'🤖 **عذراً!** صيغة العملية معقدة أو غير مألوفة. يرجى استخدام كلمات واضحة مثل (شراء، بيع، سداد مصروف، تحصيل إيراد، إيداع).'};
}

/* ===== 4. إدارة الحسابات والعرض (UI Rendering) ===== */
function ensureAccount(name){
  if(!name || typeof accounts === 'undefined') return;
  if(accounts.includes(name)) return;
  accounts.push(name);
  try{ store.set('acc_list', accounts); }catch(e){}
}

function compare(user, smart){
  const uD = user.debits.map(x => x.a + ':' + (+x.m).toFixed(2)).sort().join('|');
  const uC = user.credits.map(x => x.a + ':' + (+x.m).toFixed(2)).sort().join('|');
  const sD = smart.debits.map(x => x.a + ':' + (+x.m).toFixed(2)).sort().join('|');
  const sC = smart.credits.map(x => x.a + ':' + (+x.m).toFixed(2)).sort().join('|');
  
  if(!user.debits.length && !user.credits.length) return {status:'empty', msg:'لم تكتب قيداً بعد — راجع مقترح الذكاء الاصطناعي 👇'};
  if(uD === sD && uC === sC) return {status:'perfect', msg:'🎉 ممتاز! قيدك يطابق تماماً تفكير الذكاء الاصطناعي والمبادئ المحاسبية.'};
  if(uD === sC && uC === sD) return {status:'swapped', msg:'⚠️ تحذير: الأطراف صحيحة لكنك عكست المدين والدائن.'};
  return {status:'diff', msg:'❌ القيد غير متطابق — راجع التفسير أدناه لتعرف لماذا.'};
}

window._lastSuggestion = null;

function showResult(res){
  const box = document.getElementById('verifyResult');
  if(!box) return;
  if(res.error){
    box.className = 'mt-3 text-right rounded-xl p-4 bg-rose-50 border-2 border-rose-300 text-rose-800 text-sm shadow-inner no-print';
    box.innerHTML = res.error;
    box.classList.remove('hidden');
    return;
  }
  const {parsed, user, cmp} = res;
  const colorMap = {
    perfect:'bg-emerald-50 border-emerald-400 text-emerald-900',
    swapped:'bg-amber-50 border-amber-400 text-amber-900',
    diff   :'bg-rose-50 border-rose-400 text-rose-900',
    empty  :'bg-indigo-50 border-indigo-400 text-indigo-900'
  };
  const cls = colorMap[cmp.status] || 'bg-slate-50 border-slate-300';
  const fmtNum = n => n.toLocaleString('ar-EG');
  const fmtLines = list => list.map(x => `<div class="flex justify-between py-1 border-b border-dashed border-gray-200 last:border-0"><span class="font-bold text-gray-700">حـ/ ${x.a}</span><span class="font-mono font-bold">${fmtNum(x.m)}</span></div>`).join('');

  box.className = `mt-4 text-right rounded-xl p-5 border-2 ${cls} shadow-sm no-print transition-all`;
  box.classList.remove('hidden');
  
  // بناء قسم "تفكير الذكاء الاصطناعي"
  const aiThinkingHTML = parsed.notes ? `
    <div class="mt-4 p-4 bg-white rounded-lg border border-gray-200 shadow-inner">
      <div class="font-bold text-indigo-800 mb-2 flex items-center gap-2">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
        كيف استنتجت هذا القيد؟ (تحليل السياق)
      </div>
      <div class="space-y-2 text-sm text-gray-700 leading-relaxed">
        ${parsed.notes.map(note => `<div class="p-2 rounded hover:bg-gray-50">${note}</div>`).join('')}
      </div>
    </div>
  ` : '';

  box.innerHTML = `
    <div class="font-bold mb-4 text-lg border-b pb-2 flex items-center gap-2">
      ${cmp.status === 'perfect' ? '🏆' : (cmp.status === 'empty' ? '🤖' : '⚠️')} ${cmp.msg}
    </div>
    
    <div class="grid md:grid-cols-2 gap-4 text-sm">
      <div class="bg-white rounded-xl p-4 border border-indigo-100 shadow-sm relative overflow-hidden">
        <div class="absolute top-0 right-0 bg-indigo-600 text-white text-xs px-2 py-1 rounded-bl-lg">اقتراح AI</div>
        <div class="text-emerald-700 font-bold mb-2 mt-2">من حـ/ (الطرف المدين)</div>
        ${fmtLines(parsed.debits)}
        <div class="text-rose-700 font-bold mt-4 mb-2">إلى حـ/ (الطرف الدائن)</div>
        ${fmtLines(parsed.credits)}
      </div>
      
      ${(user.debits.length || user.credits.length) ? `
      <div class="bg-gray-50 rounded-xl p-4 border border-gray-200 shadow-sm relative">
        <div class="absolute top-0 right-0 bg-gray-400 text-white text-xs px-2 py-1 rounded-bl-lg">قيدك أنت</div>
        <div class="text-emerald-700 font-bold mb-2 mt-2">من حـ/ (الطرف المدين)</div>
        ${fmtLines(user.debits)}
        <div class="text-rose-700 font-bold mt-4 mb-2">إلى حـ/ (الطرف الدائن)</div>
        ${fmtLines(user.credits)}
      </div>` : ''}
    </div>
    
    ${aiThinkingHTML}
    
    <div class="flex flex-wrap gap-3 mt-4 pt-4 border-t border-gray-200">
      <button type="button" onclick="window.applySuggestion()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2 rounded-lg shadow transition-colors flex items-center gap-2">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
        اعتماد هذا القيد في الدفتر
      </button>
      <button type="button" onclick="window.closeSmartResult()" class="bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold px-6 py-2 rounded-lg transition-colors">إغلاق</button>
    </div>
  `;
}

window.closeSmartResult = function(){
  const box = document.getElementById('verifyResult');
  if(box){ box.classList.add('hidden'); box.innerHTML = ''; }
};

window.checkEntrySmart = function(){
  const descEl = document.getElementById('desc');
  const desc = (descEl && descEl.value || '').trim();
  if(!desc){ showResult({error:'✍️ اكتب وصف العملية في حقل «البيان» أولاً حتى أستطيع تحليلها.'}); return; }
  
  const parsed = smartParse(desc);
  if(parsed.error){ showResult({error: parsed.error}); return; }
  
  let userDebits = [], userCredits = [];
  try{
    if(typeof readRows === 'function'){
      userDebits  = readRows('d');
      userCredits = readRows('c');
    }
  }catch(e){}
  
  const cmp = compare({debits:userDebits, credits:userCredits}, parsed);
  window._lastSuggestion = parsed;
  showResult({parsed, user:{debits:userDebits, credits:userCredits}, cmp});
};

window.applySuggestion = function(){
  const p = window._lastSuggestion;
  if(!p) return;
  [...p.debits, ...p.credits].forEach(x => ensureAccount(x.a));
  if(typeof refreshSelects === 'function') refreshSelects();

  const dBox = document.getElementById('dRows');
  const cBox = document.getElementById('cRows');
  if(!dBox || !cBox || typeof addRow !== 'function') return;
  dBox.innerHTML = ''; cBox.innerHTML = '';

  p.debits.forEach(item => {
    addRow('d');
    const rows = dBox.querySelectorAll('.row');
    const sel = rows[rows.length - 1].querySelector('select');
    const amt = rows[rows.length - 1].querySelector('.amt');
    sel.value = item.a; amt.value = item.m;
  });
  p.credits.forEach(item => {
    addRow('c');
    const rows = cBox.querySelectorAll('.row');
    const sel = rows[rows.length - 1].querySelector('select');
    const amt = rows[rows.length - 1].querySelector('.amt');
    sel.value = item.a; amt.value = item.m;
  });
  if(typeof calc === 'function') calc();
  closeSmartResult();
};

function injectVerifyButton(){
  const form = document.getElementById('f');
  if(!form || document.getElementById('verifyBtn')) return;
  const saveBtn = form.querySelector('button.w-full') || form.querySelector('button[type="submit"]');
  const wrap = document.createElement('div');
  wrap.className = 'space-y-2 w-full mt-4';
  wrap.innerHTML = `
    <div class="text-center no-print">
      <button type="button" id="verifyBtn" onclick="window.checkEntrySmart()"
        class="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold px-8 py-3 rounded-xl shadow-lg inline-flex items-center gap-2 transform transition hover:scale-105 w-full md:w-auto justify-center">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
        تحليل القيد بالذكاء الاصطناعي (AI)
      </button>
      <span class="block text-xs text-gray-500 mt-2">اكتب العملية واضغط هنا، وسيقوم المحرك بشرح خطوات الحل لك.</span>
    </div>
    <div id="verifyResult" class="hidden"></div>
  `;
  if(saveBtn && saveBtn.parentNode) saveBtn.parentNode.insertBefore(wrap, saveBtn);
  else form.appendChild(wrap);
}

function init(){
  if(typeof window.addRow !== 'function' || typeof window.readRows !== 'function'){
    setTimeout(init, 250); return;
  }
  injectVerifyButton();
}
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();