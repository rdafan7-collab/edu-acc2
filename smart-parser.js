/* ========================================================================
   EDU_Acc — smart-parser.js (النسخة المتقدمة V3 - Compound Entries)
   ======================================================================== */
(function(){
'use strict';

/* ===== 1. أدوات مساعدة ===== */
function normalize(text){
  return text.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
             .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0));
}

// استخراج كل الأرقام من النص
function extractAmounts(text){
  const t = normalize(text);
  const matches = t.match(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g);
  if(!matches) return [];
  return matches.map(x => parseFloat(x.replace(/,/g, ''))).filter(n => !isNaN(n) && n > 0);
}

/* ===== 2. المحرك المنطقي (Inference Engine) ===== */
function smartParse(rawText){
  const text = (rawText || '').trim();
  if(!text) return {error:'✍️ يرجى كتابة وصف العملية أولاً للبدء في التحليل.'};
  
  const amounts = extractAmounts(text);
  if(!amounts.length) return {error:'❓ لم أتمكن من العثور على أرقام في الجملة. يرجى كتابة المبالغ بوضوح.'};

  // ترتيب المبالغ تنازلياً (الإجمالي غالباً الأكبر، ثم المدفوع، ثم الخصم)
  amounts.sort((a, b) => b - a);
  const maxAmount = amounts[0];
  const secondAmount = amounts[1] || null;
  const thirdAmount = amounts[2] || null;

  // تحديد الأطراف الأساسية
  const isBank = /شيك|بالبنك|من البنك|في البنك|ف البنك|تحويل|فيز|أودع|ايداع|بنكي/.test(text);
  const isCash = /نقدا|نقداً|كاش|الخزينة|صندوق|خزنة/.test(text);
  const isCredit = /على الحساب|بالأجل|على حساب|أجل|آجل|بالاجل|على النوتة|الباقي/.test(text);
  
  let moneyAcc = isBank ? 'البنك' : (isCash ? 'النقدية' : (isCredit ? null : 'النقدية'));

  // تحديد الفعل
  const isBuy = /شراء|اشترى|اشترت|أشترى|بتشتري|مشتريات/.test(text);
  const isSell = /بيع|باع|باعت|بيعت|مبيعات/.test(text);
  const isPay = /دفع|سدد|سداد|سـدد|دفعت|صرف/.test(text);
  const isCollect = /حصل|حصّل|استلم|تحصيل|قبض/.test(text);
  const isCapital = /رأس المال|رأس مال|بدأ|بدء|افتتح|تأسيس|استثمر/.test(text);
  
  // خصومات
  const isDiscount = /خصم/.test(text);
  const isDiscountReceived = /حصل.*خصم|خصم.*مكتسب|خصم.*حصل/.test(text);
  const isDiscountAllowed = /سمح.*خصم|خصم.*مسموح|خصم.*سمح/.test(text);

  // أنواع الحسابات
  const isSupplier = /مورد|موردين/.test(text);
  const isCustomer = /عميل|عملاء/.test(text);
  
  let expenseWord = 'مصروفات عمومية';
  if(/أجور|مرتبات|رواتب/.test(text)) expenseWord = 'مصروف الأجور';
  else if(/إيجار|ايجار/.test(text)) expenseWord = 'مصروف الإيجار';
  else if(/كهرباء/.test(text)) expenseWord = 'مصروف الكهرباء';
  else if(/مياه|ماء/.test(text)) expenseWord = 'مصروف المياه';
  else if(/تليفون|هاتف/.test(text)) expenseWord = 'مصروف الهاتف';
  else if(/صيانة/.test(text)) expenseWord = 'مصروف الصيانة';
  else if(/نقل|مواصلات/.test(text)) expenseWord = 'مصروف النقل';
  else if(/إعلان|اعلان|دعاية/.test(text)) expenseWord = 'مصروف الإعلان';
  
  let assetWord = 'الأصول';
  if(/أثاث|مفروشات/.test(text)) assetWord = 'الأثاث';
  else if(/سيارة|سيارات/.test(text)) assetWord = 'السيارات';
  else if(/أرض|أراضي/.test(text)) assetWord = 'الأراضي';
  else if(/مبنى|مباني|عقار/.test(text)) assetWord = 'المباني';
  else if(/أجهزة|حاسب|كمبيوتر|لابتوب/.test(text)) assetWord = 'الأجهزة';
  
  let revenueWord = 'إيرادات متنوعة';
  if(/خدمة|خدمات/.test(text)) revenueWord = 'إيراد الخدمات';

  const debit = [], credit = [], notes = [];

  // ================= سيناريوهات القيود المركبة ================= //

  /* 1. سداد للموردين مع خصم مكتسب */
  if (isPay && isSupplier && isDiscount) {
    // الإجمالي الأكبر هو الدين، المبلغ الأصغر هو المدفوع، والفرق هو الخصم
    const totalDebt = maxAmount;
    const paidCash = secondAmount || totalDebt;
    const discount = totalDebt - paidCash;

    debit.push({a: 'الموردون', m: totalDebt});
    credit.push({a: moneyAcc || 'النقدية', m: paidCash});
    credit.push({a: 'خصم مكتسب', m: discount});

    notes.push(`🧠 **تحليل العملية:** وجدت مبالغ متعددة (إجمالي، مدفوع، خصم). العملية هي سداد لمورد.`);
    notes.push(`🟢 **المدين:** حساب (الموردون) بـ ${totalDebt}، لأن سداد الدين يُنقص الالتزام، والالتزامات تنقص بالمدين.`);
    notes.push(`🔴 **الدائن:** حساب (${moneyAcc || 'النقدية'}) بـ ${paidCash}، لأن هذا هو المبلغ الذي خرج فعلياً.`);
    notes.push(`🔴 **الدائن:** حساب (خصم مكتسب) بـ ${discount}، لأن الخصم الذي حصلنا عليه يعتبر إيراداً يزيد بالدائن.`);
    return {debits: debit, credits: credit, notes: notes};
  }

  /* 2. تحصيل من العملاء مع خصم مسموح به */
  if (isCollect && isCustomer && isDiscount) {
    const totalDebt = maxAmount;
    const receivedCash = secondAmount || totalDebt;
    const discount = totalDebt - receivedCash;

    debit.push({a: moneyAcc || 'النقدية', m: receivedCash});
    debit.push({a: 'خصم مسموح به', m: discount});
    credit.push({a: 'العملاء', m: totalDebt});

    notes.push(`🧠 **تحليل العملية:** تحصيل من عميل مع منحه خصم.`);
    notes.push(`🟢 **المدين:** (${moneyAcc || 'النقدية'}) بـ ${receivedCash}، لأن الأموال دخلت. و (خصم مسموح به) بـ ${discount}، لأنه مصروف يزيد بالمدين.`);
    notes.push(`🔴 **الدائن:** (العملاء) بـ ${totalDebt}، لإقفال كامل مديونية العميل.`);
    return {debits: debit, credits: credit, notes: notes};
  }

  /* 3. شراء مع دفع جزء والباقي على الحساب */
  if (isBuy && isCredit && secondAmount) {
    const total = maxAmount;
    const paid = secondAmount;
    const remaining = total - paid;
    const isAsset = /أثاث|سيارة|أرض|مبنى|أجهزة/.test(text);
    const debitAcc = isAsset ? assetWord : 'المشتريات';

    debit.push({a: debitAcc, m: total});
    credit.push({a: moneyAcc || 'النقدية', m: paid});
    if (remaining > 0) credit.push({a: 'الموردون', m: remaining});

    notes.push(`🧠 **تحليل العملية:** شراء بقيمة إجمالية، مع دفع جزء نقداً وتأجيل الباقي.`);
    notes.push(`🟢 **المدين:** (${debitAcc}) بـ ${total}، لأن الأصل أو البضاعة دخلت بالكامل.`);
    notes.push(`🔴 **الدائن:** (${moneyAcc || 'النقدية'}) بـ ${paid} للمدفوع، و (الموردون) بـ ${remaining} للباقي الآجل.`);
    return {debits: debit, credits: credit, notes: notes};
  }

  /* 4. شراء مع دفع نقداً وشيك */
  if (isBuy && /نقدا|كاش/.test(text) && /شيك|بنك/.test(text) && secondAmount) {
    const total = maxAmount;
    // افتراض أن المبلغ الأصغر هو الشيك والنقدية
    debit.push({a: /أثاث|سيارة|أرض|مبنى|أجهزة/.test(text) ? assetWord : 'المشتريات', m: total});
    credit.push({a: 'النقدية', m: secondAmount});
    credit.push({a: 'البنك', m: total - secondAmount});

    notes.push(`🧠 **تحليل العملية:** شراء تم سداده بوسيلتين (نقدية وشيك).`);
    notes.push(`🟢 **المدين:** (${/أثاث|سيارة|أرض/.test(text) ? assetWord : 'المشتريات'}) بالتكلفة الإجمالية ${total}.`);
    notes.push(`🔴 **الدائن:** (النقدية) بـ ${secondAmount}، و (البنك) بـ ${total - secondAmount}.`);
    return {debits: debit, credits: credit, notes: notes};
  }

  /* 5. مردودات المشتريات (رد بضاعة) */
  if (/رد|مرتجع|إرجاع/.test(text) && (isBuy || isSupplier)) {
    debit.push({a: 'الموردون', m: maxAmount});
    credit.push({a: 'مردودات المشتريات', m: maxAmount});
    notes.push(`🧠 **تحليل العملية:** إرجاع بضاعة إلى مورد.`);
    notes.push(`🟢 **المدين:** (الموردون) لأن دينهم قل بسبب الإرجاع.`);
    notes.push(`🔴 **الدائن:** (مردودات المشتريات) لتخفيض تكلفة المشتريات.`);
    return {debits: debit, credits: credit, notes: notes};
  }

  /* 6. مردودات المبيعات */
  if (/رد|مرتجع|إرجاع/.test(text) && (isSell || isCustomer)) {
    debit.push({a: 'مردودات المبيعات', m: maxAmount});
    credit.push({a: 'العملاء', m: maxAmount});
    notes.push(`🧠 **تحليل العملية:** إرجاع بضاعة من عميل.`);
    notes.push(`🟢 **المدين:** (مردودات المبيعات) لتخفيض الإيراد.`);
    notes.push(`🔴 **الدائن:** (العملاء) لأن مديونيتهم انخفضت.`);
    return {debits: debit, credits: credit, notes: notes};
  }

  /* 7. المصروفات */
  if (isPay && !isSupplier) {
    debit.push({a: expenseWord, m: maxAmount});
    credit.push({a: moneyAcc || 'النقدية', m: maxAmount});
    notes.push(`🧠 **تحليل العملية:** دفع مصروف (${expenseWord}).`);
    notes.push(`🟢 **المدين:** حساب المصروف يزيد بالمدين.`);
    notes.push(`🔴 **الدائن:** (${moneyAcc || 'النقدية'}) لأن الأموال خرجت.`);
    return {debits: debit, credits: credit, notes: notes};
  }

  /* 8. التأسيس */
  if (isCapital) {
    debit.push({a: moneyAcc || 'النقدية', m: maxAmount});
    credit.push({a: 'رأس المال', m: maxAmount});
    notes.push(`🧠 **تحليل العملية:** قيد افتتاحي وتأسيس.`);
    notes.push(`🟢 **المدين:** الأصول المقدمة من المالك.`);
    notes.push(`🔴 **الدائن:** (رأس المال) حقوق الملكية تزيد بالدائن.`);
    return {debits: debit, credits: credit, notes: notes};
  }

  /* 9. شراء عادي (نقدي أو آجل) */
  if (isBuy) {
    const acc = /أثاث|سيارة|أرض|مبنى|أجهزة/.test(text) ? assetWord : 'المشتريات';
    debit.push({a: acc, m: maxAmount});
    credit.push({a: isCredit ? 'الموردون' : (moneyAcc || 'النقدية'), m: maxAmount});
    notes.push(`🧠 **تحليل العملية:** شراء ${acc}.`);
    notes.push(`🟢 **المدين:** (${acc}) زاد.`);
    notes.push(`🔴 **الدائن:** (${isCredit ? 'الموردون' : (moneyAcc || 'النقدية')}) ${isCredit ? 'لأن الشراء آجل.' : 'لأن الدفع تم نقداً.'}`);
    return {debits: debit, credits: credit, notes: notes};
  }

  /* 10. بيع عادي */
  if (isSell) {
    debit.push({a: isCredit ? 'العملاء' : (moneyAcc || 'النقدية'), m: maxAmount});
    credit.push({a: 'المبيعات', m: maxAmount});
    notes.push(`🧠 **تحليل العملية:** عملية بيع.`);
    notes.push(`🟢 **المدين:** (${isCredit ? 'العملاء' : (moneyAcc || 'النقدية')}) ${isCredit ? 'لأن البيع آجل.' : 'لأن التحصيل نقدي.'}`);
    notes.push(`🔴 **الدائن:** (المبيعات) إيراد يزيد بالدائن.`);
    return {debits: debit, credits: credit, notes: notes};
  }

  /* 11. تحصيل عادي من عميل */
  if (isCollect) {
    debit.push({a: moneyAcc || 'النقدية', m: maxAmount});
    credit.push({a: isCustomer ? 'العملاء' : revenueWord, m: maxAmount});
    notes.push(`🧠 **تحليل العملية:** تحصيل مبالغ.`);
    return {debits: debit, credits: credit, notes: notes};
  }

  return {error:'🤖 **عذراً!** الجملة معقدة جداً ولم أفهم العلاقة بين الأرقام. يرجى تبسيطها (مثال: شراء أثاث بـ 5000 نقداً).'};
}

/* ===== 3. العرض والمقارنة (UI) ===== */
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
  if(uD === sD && uC === sC) return {status:'perfect', msg:'🎉 ممتاز! قيدك يطابق تماماً تفكير الذكاء الاصطناعي.'};
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
        تحليل القيد بالذكاء الاصطناعي (AI V3)
      </button>
      <span class="block text-xs text-gray-500 mt-2">اكتب العملية (حتى لو مركبة أو بها خصم)، وسيقوم المحرك بشرح خطوات الحل لك.</span>
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
