/* ============================================================================
   EDU_Acc — pro-modules.js  v1.0   (وحدات مود الاحتراف الأربع + التكليفات)
   ----------------------------------------------------------------------------
   ملحق خارجي يُحمَّل بعد pro-mode.js (لا يعدّل أي كود في النواة أو في pro-mode.js):
       <script src="pro-mode.js"></script>
       <script src="pro-modules.js"></script>
   يضيف:
     ١) المحاسبة المالية: قيد يومية يدوي (مركّب ومتزن).
     ٢) محاسبة التكاليف: مخازن (وارد/صادر بـ FIFO أو المتوسط المرجح) + أوامر التشغيل.
     ٣) المنشآت المتخصصة: عقود المقاولات والمستخلصات والمحتجز ونسبة الإنجاز.
     ٤) المحاسبة الضريبية: الخصم والإضافة (نموذج 41) بجانب إقرار القيمة المضافة.
     ✦ اللوحة المجمعة: أثر كل عملية على الأصول والخصوم وحقوق الملكية والربح بالرسوم.
     ✦ شريط التكليف أعلى مساحة العمل: سحب تكليف، معطيات التمرين، تسليم الإجابة للمعلم
       (مربوط بنظام الشيتات والتسليمات الموجود أصلًا في المنصة / Supabase).
   كل عملية تُنتج قيدًا حقيقيًا في acc_entries فتظهر في الأستاذ والميزان والقوائم.
   ============================================================================ */
(function () {
  'use strict';
  var P = window.ProMode;
  if (!P || !P.api || !P.register) { console.warn('[pro-modules] حمّل pro-mode.js قبل هذا الملف.'); return; }
  if (P.modulesLoaded) return; P.modulesLoaded = true;

  var A = P.api, E = A.E, N = A.N, R2 = A.R2, pad = A.pad, today = A.today, uid = A.uid, $ = A.$, $$ = A.$$, grid = A.grid, toast = A.toast, S = A.S,
    ensureAcc = A.ensureAcc, subAcc = A.subAcc, postEntry = A.postEntry, removeEntry = A.removeEntry, afterChange = A.afterChange;

  /* ------------------------------------------------------------ البيانات */
  var K = { cost: 'pro_cost', con: 'pro_contracts', wh: 'pro_wh', prob: 'pro_problem' };
  [K.cost, K.con, K.wh].forEach(A.syncKey);
  var COST, CON, WH, sel = { item: null, job: null, con: null }, barOpen = false, barRes = '';
  function load() {
    COST = S.get(K.cost, null); if (!COST || !COST.items) COST = { items: [], jobs: [], oh: [], cfg: { ohRate: 50 } };
    COST.oh = COST.oh || []; COST.cfg = COST.cfg || { ohRate: 50 };
    CON = S.get(K.con, null); if (!CON || !CON.list) CON = { list: [] };
    WH = S.get(K.wh, null); if (!WH || !WH.docs) WH = { docs: [], rates: null, threshold: 300 };
    if (!WH.rates) WH.rates = [{ id: 'g', name: 'توريدات ومقاولات (بضائع)', rate: 1 }, { id: 's', name: 'خدمات', rate: 3 }, { id: 'c', name: 'عمولات وسمسرة وأتعاب مهنية', rate: 5 }];
    if (WH.threshold == null) WH.threshold = 300;
  }
  var save = { cost: function () { S.set(K.cost, COST); }, con: function () { S.set(K.con, CON); }, wh: function () { S.set(K.wh, WH); } };
  load();

  /* مزامنة السجلات مع القيود: لو اتحذف قيد (من المنصة أو شيت جديد) تتشال السجلات المرتبطة به */
  function reconcile() {
    load();
    var ids = {}; A.entries().forEach(function (e) { ids[e.id] = 1; });
    var ok = function (x) { return !x.entryId || ids[x.entryId]; }, c1 = false, c2 = false, c3 = false;
    var keep = function (arr) { var n = arr.length, r = arr.filter(ok); if (r.length !== n) c1 = true; return r; };
    COST.items.forEach(function (it) { it.moves = keep(it.moves); });
    COST.oh = keep(COST.oh);
    COST.jobs.forEach(function (j) {
      j.mats = keep(j.mats); j.labor = keep(j.labor); j.labor.forEach(function (l) { if (l.ohEntryId && !ids[l.ohEntryId]) { l.ohEntryId = null; l.oh = 0; c1 = true; } });
      if (j.doneEntry && !ids[j.doneEntry]) { j.doneEntry = null; if (j.status !== 'open') j.status = 'open'; c1 = true; }
      if (j.soldEntry && !ids[j.soldEntry]) { j.soldEntry = null; if (j.status === 'sold') j.status = 'done'; c1 = true; }
    });
    CON.list.forEach(function (c) {
      var n = c.costs.length + c.certs.length + c.rels.length;
      c.costs = c.costs.filter(ok); c.certs = c.certs.filter(ok); c.rels = c.rels.filter(ok);
      if (n !== c.costs.length + c.certs.length + c.rels.length) c2 = true;
      if (c.provEntries) { var m = c.provEntries.length; c.provEntries = c.provEntries.filter(function (x) { return ids[x.id]; }); if (m !== c.provEntries.length) { c.prov = c.provEntries.reduce(function (s, x) { return s + x.amt; }, 0); c2 = true; } }
    });
    var w = WH.docs.length; WH.docs = WH.docs.filter(ok); if (w !== WH.docs.length) c3 = true;
    if (c1) save.cost(); if (c2) save.con(); if (c3) save.wh();
  }

  /* ------------------------------------------------------------ أدوات واجهة */
  var lab = function (t, h) { return '<label>' + t + h + '</label>'; };
  var num = function (id, v, ph, extra) { return '<input class="pm-in" type="number" step="any" min="0" id="' + id + '"' + (v != null ? ' value="' + v + '"' : '') + (ph ? ' placeholder="' + ph + '"' : '') + (extra || '') + '>'; };
  var txt = function (id, ph, extra) { return '<input class="pm-in" id="' + id + '"' + (ph ? ' placeholder="' + E(ph) + '"' : '') + (extra || '') + '>'; };
  var dateF = function (id) { return '<input class="pm-in" type="date" id="' + id + '" value="' + today() + '">'; };
  var PAYO = '<option value="cash">نقدي (خزينة)</option><option value="bank">بنك</option><option value="credit">آجل (على الحساب)</option>';
  var val = function (id) { var e = $('#' + id); return e ? e.value : ''; };
  var nv = function (id) { return +val(id) || 0; };
  var btn = function (act, label, cls, attrs) { return '<button class="pm-b ' + (cls || '') + '" data-act="' + act + '"' + (attrs || '') + '>' + label + '</button>'; };
  function payAcc(method, party, base, t) {
    if (method === 'cash') { ensureAcc('النقدية', 'A', '11'); return 'النقدية'; }
    if (method === 'bank') { ensureAcc('البنك', 'A', '11'); return 'البنك'; }
    return subAcc(base || 'الموردون', party, t || 'L');
  }
  var statusB = function (s) { return ({ open: '<span class="pm-badge w">مفتوح</span>', done: '<span class="pm-badge ok">تام الصنع</span>', sold: '<span class="pm-badge e">سُلِّم / بِيع</span>' })[s] || s; };
  var pctBar = function (p, col) { p = Math.max(0, Math.min(100, p)); return '<div style="background:#ece6f5;border-radius:999px;height:12px;overflow:hidden"><div style="width:' + p + '%;height:100%;background:' + (col || '#6d1f9c') + '"></div></div>'; };

  /* ============================================================ ١) قيد يومية يدوي */
  function jvRow() {
    return '<tr class="jv-r"><td><input class="pm-in" list="jvAcc" data-f="a" data-inp="jvCalc" placeholder="اسم الحساب"></td><td style="width:140px"><input class="pm-in" type="number" step="any" min="0" data-f="d" data-inp="jvCalc" placeholder="مدين"></td><td style="width:140px"><input class="pm-in" type="number" step="any" min="0" data-f="c" data-inp="jvCalc" placeholder="دائن"></td><td style="width:40px"><button class="pm-b s r" data-act="jvDel">✕</button></td></tr>';
  }
  function pJv() {
    var recent = A.entries().map(function (e, i) { return { e: e, no: i + 1 }; }).filter(function (x) { return x.e.src === 'pro-jv'; }).slice(-8).reverse();
    return '<div class="pm-card"><h3>قيد يومية يدوي (بسيط أو مركّب)</h3><div id="pmJv"><div class="pm-grid"><label>التاريخ<input class="pm-in" type="date" id="jvDate" value="' + today() + '"></label><label style="grid-column:span 2">البيان<input class="pm-in" id="jvDesc" placeholder="مثال: إثبات مصروف دعاية مدفوع نقدًا"></label></div>' +
      '<datalist id="jvAcc">' + A.accounts().map(function (a) { return '<option value="' + E(a) + '">'; }).join('') + '</datalist>' +
      '<div class="pm-tw" style="margin-top:10px"><table class="pm-t"><thead><tr><th>الحساب</th><th>مدين</th><th>دائن</th><th></th></tr></thead><tbody id="jvRows">' + jvRow() + jvRow() + '</tbody></table></div>' +
      '<div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button class="pm-b o" data-act="jvAdd">+ سطر</button><span style="flex:1"></span><span>إجمالي المدين: <b id="jvD">0.00</b> &nbsp; إجمالي الدائن: <b id="jvC">0.00</b> &nbsp; <span id="jvOk" class="pm-badge w">غير متزن</span></span></div>' +
      '<div style="margin-top:10px">' + btn('jvSave', '💾 ترحيل القيد', 'p') + '</div><p class="pm-note">اكتب اسم حساب جديد وسيعرض النظام إنشاءه وتصنيفه تلقائيًا. القيد لازم يكون متزنًا ولا يتكرر فيه نفس الحساب في الطرفين.</p></div></div>' +
      '<div class="pm-card"><h3>آخر القيود اليدوية</h3>' + grid(['رقم القيد', 'التاريخ', 'البيان', 'المبلغ', 'إجراء'], recent.map(function (x) { return [String(x.no), x.e.date, x.e.desc, (x.e.debits || []).reduce(function (s, d) { return s + (+d.m || 0); }, 0), { h: btn('jvDelE', 'حذف', 's r', ' data-id="' + x.e.id + '"') }]; })) + '</div>';
  }
  function jvRead() {
    return $$('.jv-r').map(function (tr) { return { a: $('[data-f=a]', tr).value.trim(), d: +$('[data-f=d]', tr).value || 0, c: +$('[data-f=c]', tr).value || 0 }; });
  }
  function jvCalc() {
    var r = jvRead(), d = 0, c = 0; r.forEach(function (x) { d += x.d; c += x.c; });
    $('#jvD').textContent = N(d); $('#jvC').textContent = N(c);
    var ok = d > 0 && Math.abs(d - c) < 0.005, b = $('#jvOk'); b.textContent = ok ? 'متزن ✅' : 'غير متزن (الفرق ' + N(Math.abs(d - c)) + ')'; b.className = 'pm-badge ' + (ok ? 'ok' : 'w');
  }
  function jvSave() {
    var rows = jvRead().filter(function (x) { return x.a || x.d || x.c; }), D = [], C = [];
    if (rows.length < 2) return alert('القيد لازم يحتوي على سطرين على الأقل.');
    for (var i = 0; i < rows.length; i++) {
      var x = rows[i];
      if (!x.a) return alert('في سطر بدون اسم حساب.');
      if ((x.d > 0) === (x.c > 0)) return alert('السطر «' + x.a + '»: اكتب مبلغًا في المدين أو الدائن (وليس الاثنين ولا لا شيء).');
      if (A.accounts().indexOf(x.a) < 0) {
        if (!confirm('الحساب «' + x.a + '» غير موجود. هل تريد إنشاءه؟ (تصنيفه المقترح: ' + A.TN[A.guessType(x.a, '')] + ')')) return;
        ensureAcc(x.a, A.guessType(x.a, ''));
      }
      (x.d > 0 ? D : C).push([x.a, x.d > 0 ? x.d : x.c]);
    }
    var sd = D.reduce(function (s, x) { return s + x[1]; }, 0), sc = C.reduce(function (s, x) { return s + x[1]; }, 0);
    if (Math.abs(sd - sc) >= 0.005) return alert('القيد غير متزن: المدين ' + N(sd) + ' والدائن ' + N(sc) + '.');
    var id = postEntry(val('jvDesc').trim() || 'قيد يومية', D, C, val('jvDate') || today(), { src: 'pro-jv' });
    if (id == null) return alert('تعذر الترحيل: تأكد أن نفس الحساب ليس في الطرفين.');
    afterChange(); toast('تم ترحيل القيد ✅');
  }

  /* ============================================================ ٢) محاسبة التكاليف */
  var RM = 'مخزون مواد خام', WIP = 'إنتاج تحت التشغيل', FG = 'مخزون إنتاج تام', COGS = 'تكلفة البضاعة المباعة', OHA = 'تكاليف صناعية غير مباشرة فعلية', OHP = 'تكاليف صناعية محملة', ACCW = 'أجور مستحقة';
  function ensureCostAccs() { ensureAcc(RM, 'A', '11'); ensureAcc(WIP, 'A', '11'); ensureAcc(FG, 'A', '11'); ensureAcc(COGS, 'X', '5'); ensureAcc(OHA, 'X', '5'); ensureAcc(OHP, 'X', '5'); ensureAcc(ACCW, 'L', '21'); }
  var itemById = function (id) { return COST.items.find(function (x) { return x.id === id; }); };
  var jobById = function (id) { return COST.jobs.find(function (x) { return x.id === id; }); };
  function replay(it) {
    var q = 0, v = 0, layers = [];
    it.moves.forEach(function (m) {
      if (m.type === 'in') { q += m.qty; v += m.total; layers.push({ q: m.qty, u: m.total / m.qty }); }
      else { q -= m.qty; v -= m.total; var r = m.qty; while (r > 1e-9 && layers.length) { var L = layers[0], t = Math.min(L.q, r); L.q -= t; r -= t; if (L.q <= 1e-9) layers.shift(); } }
    });
    return { q: q, v: v, layers: layers };
  }
  function issueCost(it, qty) {
    var s = replay(it); if (!(qty > 0) || qty > s.q + 1e-9) return null;
    if (it.method === 'fifo') { var r = qty, c = 0; for (var i = 0; i < s.layers.length && r > 1e-9; i++) { var t = Math.min(s.layers[i].q, r); c += t * s.layers[i].u; r -= t; } return R2(c); }
    return R2(qty * (s.q ? s.v / s.q : 0));
  }
  function jobCost(j) {
    var m = j.mats.reduce(function (s, x) { return s + x.cost; }, 0), l = j.labor.reduce(function (s, x) { return s + x.amount; }, 0), o = j.labor.reduce(function (s, x) { return s + (x.oh || 0); }, 0);
    return { m: R2(m), l: R2(l), o: R2(o), t: R2(m + l + o) };
  }
  var methName = function (m) { return m === 'fifo' ? 'الوارد أولًا صادر أولًا (FIFO)' : 'المتوسط المرجح'; };

  function pcStock() {
    var rows = COST.items.map(function (it) {
      var s = replay(it);
      return [it.name, it.unit, methName(it.method), s.q, s.v, s.q > 0 ? R2(s.v / s.q) : 0, { h: btn('itCard', 'بطاقة الصنف', 's o', ' data-id="' + it.id + '"') + ' ' + btn('itDel', 'حذف', 's r', ' data-id="' + it.id + '"') }];
    });
    var opts = COST.items.map(function (it) { return '<option value="' + it.id + '"' + (it.id === sel.item ? ' selected' : '') + '>' + E(it.name) + '</option>'; }).join('');
    var cur = itemById(sel.item), card = '';
    if (cur) {
      var q = 0, v = 0, rr = cur.moves.map(function (m, i) {
        if (m.type === 'in') { q += m.qty; v += m.total; } else { q -= m.qty; v -= m.total; }
        return [m.date, m.ref + (m.type === 'in' ? '' : ''), m.type === 'in' ? m.qty : null, m.type === 'in' ? m.total : null, m.type === 'out' ? m.qty : null, m.type === 'out' ? m.total : null, q, R2(v), i === cur.moves.length - 1 ? { h: btn('mvDel', 'حذف آخر حركة', 's r', ' data-id="' + cur.id + '"') } : ''];
      });
      card = '<div class="pm-card" id="pmRep"><h3>بطاقة صنف: ' + E(cur.name) + ' — ' + methName(cur.method) + '</h3>' + A.setRep('بطاقة صنف: ' + cur.name, methName(cur.method), ['التاريخ', 'البيان', 'وارد (كمية)', 'وارد (قيمة)', 'صادر (كمية)', 'صادر (قيمة)', 'رصيد (كمية)', 'رصيد (قيمة)', ''], rr) +
        '<div style="margin-top:10px">' + btn('xlsx', '📊 Excel', 'g') + ' ' + btn('print', '📄 PDF / طباعة', 'r') + '</div></div>';
    }
    return '<div class="pm-card"><h3>إضافة صنف مخزني</h3><div class="pm-grid">' + lab('اسم الصنف', txt('itName', 'مثال: خشب زان')) + lab('الوحدة', txt('itUnit', 'متر / كجم / قطعة')) +
      lab('طريقة تقييم الصادر', '<select class="pm-in" id="itMeth"><option value="avg">المتوسط المرجح</option><option value="fifo">الوارد أولًا صادر أولًا (FIFO)</option></select>') + '</div><div style="margin-top:10px">' + btn('itAdd', '+ إضافة الصنف', 'p') + '</div></div>' +
      '<div class="pm-card"><h3>استلام مواد (وارد)</h3>' + (COST.items.length ? '<div class="pm-grid">' + lab('الصنف', '<select class="pm-in" id="rcItem">' + opts + '</select>') + lab('التاريخ', dateF('rcDate')) + lab('الكمية', num('rcQty')) + lab('تكلفة الوحدة', num('rcCost')) +
        lab('طريقة الدفع', '<select class="pm-in" id="rcPay">' + PAYO + '</select>') + lab('المورد (للآجل)', txt('rcParty', 'اسم المورد')) + '</div><div style="margin-top:10px">' + btn('itRecv', '📥 ترحيل الاستلام', 'g') + '</div>' +
        '<p class="pm-note">القيد: من حـ/ ' + RM + ' إلى حـ/ (النقدية أو البنك أو الموردين). ضريبة القيمة المضافة على المشتريات تُسجَّل من «فاتورة شراء».</p>' : '<p class="pm-note">أضف صنفًا أولًا.</p>') + '</div>' +
      '<div class="pm-card"><h3>أرصدة المخازن</h3>' + grid(['الصنف', 'الوحدة', 'طريقة التقييم', 'الكمية', 'القيمة', 'متوسط تكلفة الوحدة', 'إجراءات'], rows) + '</div>' + card;
  }
  function pcJobs() {
    var rows = COST.jobs.map(function (j) { var c = jobCost(j); return [j.no, j.name, j.qty, { h: statusB(j.status) }, c.t, j.qty ? R2(c.t / j.qty) : 0, { h: btn('jobOpen', 'فتح', 's o', ' data-id="' + j.id + '"') }]; });
    var j = jobById(sel.job), detail = '';
    if (j) {
      var c = jobCost(j), open = j.status === 'open';
      var lines = j.mats.map(function (m) { return [m.date, 'مواد: ' + m.name + ' × ' + m.qty, m.cost, null, null, m.cost]; }).concat(
        j.labor.map(function (l) { return [l.date, 'أجور ' + l.hours + ' ساعة × ' + l.rate + (l.desc ? ' — ' + l.desc : '') + ' (+ تحميل ' + COST.cfg.ohRate + '%)', null, l.amount, l.oh, R2(l.amount + l.oh)]; }));
      lines.push({ cls: 'pm-tot', cells: ['', 'إجمالي تكلفة الأمر', c.m, c.l, c.o, c.t] }); lines.push({ cls: 'pm-sub', cells: ['', 'تكلفة الوحدة (' + j.qty + ' وحدة)', null, null, null, j.qty ? R2(c.t / j.qty) : 0] });
      detail = '<div class="pm-card" id="pmRep"><div class="pm-h"><h3 style="margin:0">قائمة تكلفة أمر التشغيل ' + E(j.no) + ' — ' + E(j.name) + ' ' + statusB(j.status) + '</h3><div style="display:flex;gap:6px;flex-wrap:wrap">' + btn('xlsx', '📊 Excel', 'g s') + btn('print', '📄 طباعة', 'r s') + btn('jobDel', 'حذف الأمر', 'r s', ' data-id="' + j.id + '"') + '</div></div>' +
        A.setRep('قائمة تكلفة أمر التشغيل ' + j.no + ' — ' + j.name, 'الحالة: ' + ({ open: 'مفتوح', done: 'تام الصنع', sold: 'مُسلَّم' })[j.status], ['التاريخ', 'البيان', 'مواد مباشرة', 'أجور مباشرة', 'تكاليف غير مباشرة محملة', 'الإجمالي'], lines) + '</div>';
      if (open) {
        detail += '<div class="pm-card"><h3>صرف مواد خام لأمر التشغيل</h3>' + (COST.items.length ? '<div class="pm-grid">' + lab('الصنف', '<select class="pm-in" id="jmItem" data-inp="jmCalc" data-chg="jmCalc">' + COST.items.map(function (it) { var s = replay(it); return '<option value="' + it.id + '">' + E(it.name) + ' (متاح ' + N(s.q) + ' ' + E(it.unit) + ')</option>'; }).join('') + '</select>') + lab('التاريخ', dateF('jmDate')) + lab('الكمية', num('jmQty', null, null, ' data-inp="jmCalc"')) + '</div><div class="pm-prev" id="jmPrev">اختر الكمية لعرض تكلفة الصرف.</div><div style="margin-top:10px">' + btn('jobIssue', '📤 صرف المواد', 'p') + '</div>' : '<p class="pm-note">أضف أصناف المخازن أولًا.</p>') + '</div>' +
          '<div class="pm-card"><h3>أجور مباشرة (مع تحميل التكاليف غير المباشرة تلقائيًا)</h3><div class="pm-grid">' + lab('التاريخ', dateF('jlDate')) + lab('عدد الساعات', num('jlHours')) + lab('أجر الساعة', num('jlRate')) + lab('بيان', txt('jlDesc', 'مثال: عمال التجميع')) +
          lab('الدفع', '<select class="pm-in" id="jlPay"><option value="cash">نقدًا</option><option value="bank">بنك</option><option value="accr">أجور مستحقة</option></select>') + '</div><div style="margin-top:10px">' + btn('jobLabor', '👷 ترحيل الأجور', 'p') + '</div>' +
          '<p class="pm-note">القيد 1: من حـ/ ' + WIP + ' إلى حـ/ (النقدية/البنك/' + ACCW + ').  القيد 2: من حـ/ ' + WIP + ' إلى حـ/ ' + OHP + ' بمعدل التحميل.</p></div>' +
          '<div class="pm-card"><h3>إنهاء الأمر</h3>' + btn('jobDone', '✅ إتمام الصنع (إلى مخزون إنتاج تام)', 'g') + '<p class="pm-note">القيد: من حـ/ ' + FG + ' إلى حـ/ ' + WIP + ' بإجمالي التكلفة.</p></div>';
      } else if (j.status === 'done') {
        detail += '<div class="pm-card"><h3>تسليم / بيع الأمر</h3>' + btn('jobSold', '🚚 إثبات تكلفة المبيعات', 'p') + '<p class="pm-note">القيد: من حـ/ ' + COGS + ' إلى حـ/ ' + FG + '. سجّل إيراد البيع من «فاتورة بيع» في المحاسبة المالية.</p></div>';
      }
    }
    var actual = A.bal(OHA), applied = -A.bal(OHP);
    return '<div class="pm-card"><h3>أمر تشغيل جديد</h3><div class="pm-grid">' + lab('اسم المنتج / الأمر', txt('jbName', 'مثال: 50 مكتب خشب')) + lab('الكمية المنتجة', num('jbQty', 1)) + lab('تاريخ البدء', dateF('jbDate')) +
      lab('معدل تحميل التكاليف غير المباشرة (% من الأجور المباشرة)', '<input class="pm-in" type="number" step="any" min="0" id="jbOh" value="' + COST.cfg.ohRate + '" data-chg="ohRate">') + '</div><div style="margin-top:10px">' + btn('jobNew', '+ إنشاء أمر تشغيل', 'p') + '</div></div>' +
      '<div class="pm-card"><h3>أوامر التشغيل</h3>' + grid(['الأمر', 'المنتج', 'الكمية', 'الحالة', 'التكلفة', 'تكلفة الوحدة', ''], rows) + '</div>' + detail +
      '<div class="pm-card"><h3>التكاليف الصناعية غير المباشرة (الفعلية) وتسوية الفرق</h3><div class="pm-grid">' + lab('التاريخ', dateF('ohDate')) + lab('المبلغ', num('ohAmt')) + lab('البيان', txt('ohDesc', 'إيجار المصنع / كهرباء...')) + lab('الدفع', '<select class="pm-in" id="ohPay">' + PAYO + '</select>') + lab('المورد (للآجل)', txt('ohParty')) + '</div>' +
      '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">' + btn('ohPost', '+ تسجيل تكلفة فعلية', 'p') + btn('ohSettle', '⚖️ تسوية فرق التحميل مع تكلفة المبيعات', 'g') + '</div>' +
      '<p class="pm-note">الفعلي: <b>' + N(actual) + '</b> — المحمَّل على الأوامر: <b>' + N(applied) + '</b> — الفرق: <b>' + N(actual - applied) + '</b> (' + (actual > applied ? 'تحميل ناقص' : actual < applied ? 'تحميل زائد' : 'لا فرق') + '). التسوية تقفل الحسابين وتحمّل الفرق على تكلفة البضاعة المباعة.</p></div>';
  }
  function itAdd() {
    var n = val('itName').trim(); if (!n) return alert('اكتب اسم الصنف.'); if (COST.items.some(function (x) { return x.name === n; })) return alert('الصنف موجود بالفعل.');
    var it = { id: uid(), name: n, unit: val('itUnit').trim() || 'وحدة', method: val('itMeth'), moves: [] }; COST.items.push(it); sel.item = it.id; save.cost(); A.renderPage(); toast('تمت إضافة الصنف ✅');
  }
  function itRecv() {
    var it = itemById(val('rcItem')); if (!it) return; var qty = nv('rcQty'), uc = nv('rcCost'), date = val('rcDate'), pay = val('rcPay'), party = val('rcParty').trim();
    if (!(qty > 0) || !(uc > 0)) return alert('اكتب الكمية وتكلفة الوحدة.'); if (!date) return alert('اختر التاريخ.');
    ensureCostAccs(); var cr = payAcc(pay, party, 'الموردون', 'L'), total = R2(qty * uc);
    var id = postEntry('استلام مواد خام: ' + it.name + ' (' + qty + ' ' + it.unit + ')' + (party ? ' — ' + party : ''), [[RM, total]], [[cr, total]], date, { src: 'pro-cost' }); if (id == null) return alert('تعذر إنشاء القيد.');
    it.moves.push({ id: uid(), date: date, type: 'in', qty: qty, unit: uc, total: total, ref: 'استلام' + (party ? ' من ' + party : ''), entryId: id }); sel.item = it.id; save.cost(); afterChange(); toast('تم الاستلام وترحيل القيد ✅');
  }
  function jobNew() {
    var n = val('jbName').trim(); if (!n) return alert('اكتب اسم المنتج.'); var q = nv('jbQty'); if (!(q > 0)) return alert('اكتب كمية أكبر من صفر.');
    var j = { id: uid(), no: 'J-' + pad(COST.jobs.length + 1, 3), name: n, qty: q, date: val('jbDate'), status: 'open', mats: [], labor: [] }; COST.jobs.push(j); sel.job = j.id; save.cost(); A.renderPage(); toast('تم إنشاء أمر التشغيل ' + j.no);
  }
  function jmCalc() {
    var it = itemById(val('jmItem')), q = nv('jmQty'), p = $('#jmPrev'); if (!p || !it) return;
    var c = issueCost(it, q); p.innerHTML = !q ? 'اختر الكمية لعرض تكلفة الصرف.' : c == null ? '⚠️ الكمية أكبر من المتاح في المخزن.' : 'تكلفة الصرف بطريقة <b>' + methName(it.method) + '</b>: <b>' + N(c) + '</b> (متوسط ' + N(c / q) + ' للوحدة)';
  }
  function jobIssue() {
    var j = jobById(sel.job), it = itemById(val('jmItem')); if (!j || !it) return; var qty = nv('jmQty'), c = issueCost(it, qty);
    if (!(qty > 0)) return alert('اكتب الكمية.'); if (c == null) return alert('الكمية أكبر من المتاح في المخزن.'); if (!(c > 0)) return alert('تكلفة الصرف صفر. تأكد من أسعار الوارد.');
    ensureCostAccs(); var date = val('jmDate') || today();
    var id = postEntry('صرف مواد خام لأمر التشغيل ' + j.no + ': ' + it.name + ' × ' + qty, [[WIP, c]], [[RM, c]], date, { src: 'pro-cost' }); if (id == null) return alert('تعذر إنشاء القيد.');
    it.moves.push({ id: uid(), date: date, type: 'out', qty: qty, unit: R2(c / qty), total: c, ref: 'أمر ' + j.no, entryId: id, job: j.id }); j.mats.push({ date: date, item: it.id, name: it.name, qty: qty, cost: c, entryId: id });
    save.cost(); afterChange(); toast('تم صرف المواد وترحيل القيد ✅');
  }
  function jobLabor() {
    var j = jobById(sel.job); if (!j) return; var h = nv('jlHours'), r = nv('jlRate'), amt = R2(h * r), oh = R2(amt * (+COST.cfg.ohRate || 0) / 100), pay = val('jlPay'), date = val('jlDate') || today(), desc = val('jlDesc').trim();
    if (!(amt > 0)) return alert('اكتب الساعات وأجر الساعة.'); ensureCostAccs();
    var cr = pay === 'accr' ? ACCW : payAcc(pay, '', '', 'L');
    var id = postEntry('أجور مباشرة لأمر التشغيل ' + j.no + (desc ? ' — ' + desc : ''), [[WIP, amt]], [[cr, amt]], date, { src: 'pro-cost' }); if (id == null) return alert('تعذر إنشاء القيد.');
    var oid = oh > 0 ? postEntry('تحميل تكاليف صناعية غير مباشرة على أمر التشغيل ' + j.no + ' (' + COST.cfg.ohRate + '% من الأجور)', [[WIP, oh]], [[OHP, oh]], date, { src: 'pro-cost' }) : null;
    j.labor.push({ date: date, hours: h, rate: r, amount: amt, oh: oid ? oh : 0, entryId: id, ohEntryId: oid, desc: desc }); save.cost(); afterChange(); toast('تم ترحيل الأجور والتكاليف المحملة ✅');
  }
  function jobDone() {
    var j = jobById(sel.job); if (!j) return; var c = jobCost(j); if (!(c.t > 0)) return alert('لا توجد تكاليف على هذا الأمر بعد.');
    var id = postEntry('إتمام صنع أمر التشغيل ' + j.no + ' — ' + j.name, [[FG, c.t]], [[WIP, c.t]], today(), { src: 'pro-cost' }); if (id == null) return alert('تعذر إنشاء القيد.');
    j.status = 'done'; j.doneEntry = id; j.doneCost = c.t; save.cost(); afterChange(); toast('تم نقل التكلفة إلى مخزون الإنتاج التام ✅');
  }
  function jobSold() {
    var j = jobById(sel.job); if (!j || j.status !== 'done') return;
    var id = postEntry('تكلفة المبيعات — أمر التشغيل ' + j.no + ' — ' + j.name, [[COGS, j.doneCost]], [[FG, j.doneCost]], today(), { src: 'pro-cost' }); if (id == null) return alert('تعذر إنشاء القيد.');
    j.status = 'sold'; j.soldEntry = id; save.cost(); afterChange(); toast('تم إثبات تكلفة المبيعات ✅');
  }
  function ohPost() {
    var amt = R2(nv('ohAmt')), date = val('ohDate') || today(), pay = val('ohPay'), party = val('ohParty').trim(), d = val('ohDesc').trim();
    if (!(amt > 0)) return alert('اكتب المبلغ.'); ensureCostAccs(); var cr = payAcc(pay, party, 'الموردون', 'L');
    var id = postEntry('تكاليف صناعية غير مباشرة فعلية' + (d ? ': ' + d : ''), [[OHA, amt]], [[cr, amt]], date, { src: 'pro-cost' }); if (id == null) return alert('تعذر إنشاء القيد.');
    COST.oh.push({ date: date, desc: d, amount: amt, entryId: id }); save.cost(); afterChange(); toast('تم تسجيل التكلفة الفعلية ✅');
  }
  function ohSettle() {
    var actual = A.bal(OHA), applied = R2(-A.bal(OHP)); if (!actual && !applied) return alert('لا توجد تكاليف صناعية غير مباشرة لتسويتها.');
    ensureCostAccs(); var D = [], C = [], diff = R2(actual - applied);
    if (applied > 0) D.push([OHP, applied]); if (actual > 0) C.push([OHA, actual]);
    if (diff > 0) D.push([COGS, diff]); else if (diff < 0) C.push([COGS, -diff]);
    if (!confirm('سيُقفل الحسابان بتحميل ' + (diff > 0 ? 'ناقص' : diff < 0 ? 'زائد' : 'متعادل') + ' قدره ' + N(Math.abs(diff)) + ' على تكلفة البضاعة المباعة. متابعة؟')) return;
    var id = postEntry('تسوية فرق التكاليف الصناعية غير المباشرة (الفعلي مقابل المحمَّل)', D, C, today(), { src: 'pro-cost' }); if (id == null) return alert('تعذر إنشاء القيد.');
    afterChange(); toast('تمت التسوية ✅');
  }

  /* ============================================================ ٣) المقاولات */
  var conById = function (id) { return CON.list.find(function (x) { return x.id === id; }); };
  var cAcc = function (c) { return { cost: 'تكاليف عقد - ' + c.name, rev: 'إيرادات عقد - ' + c.name }; };
  var RETA = 'محتجز ضمان أعمال لدى العملاء', PROV = 'مخصص خسائر عقود', VATO = 'ضريبة مبيعات مستحقة';
  function cStats(c) {
    var cost = R2(c.costs.reduce(function (s, x) { return s + x.amount; }, 0)), cert = R2(c.certs.reduce(function (s, x) { return s + x.gross; }, 0));
    var retHeld = R2(c.certs.reduce(function (s, x) { return s + x.retention; }, 0) - c.rels.reduce(function (s, x) { return s + x.amount; }, 0));
    var pct = c.estCost > 0 ? cost / c.estCost * 100 : 0, estP = R2(c.price - c.estCost), totalLoss = Math.max(0, R2(c.estCost - c.price)), recLoss = Math.max(0, R2(cost - cert));
    return { cost: cost, cert: cert, retHeld: retHeld, pct: pct, certPct: c.price > 0 ? cert / c.price * 100 : 0, estP: estP, toDate: R2(cert - cost), totalLoss: totalLoss, provNeed: Math.max(0, R2(totalLoss - recLoss - (c.prov || 0))), earnedByPct: R2(c.price * pct / 100) };
  }
  function pCon() {
    var rows = CON.list.map(function (c) { var s = cStats(c); return [c.no, c.name, c.client, c.price, c.estCost, s.cost, { h: s.pct.toFixed(1) + '%' }, { h: btn('conOpen', 'فتح', 's o', ' data-id="' + c.id + '"') }]; });
    var c = conById(sel.con), detail = '';
    if (c) {
      var s = cStats(c), mv = [];
      c.costs.forEach(function (x) { mv.push({ d: x.date, r: [x.date, x.desc, x.amount, null, null, null, null] }); });
      c.certs.forEach(function (x) { mv.push({ d: x.date, r: [x.date, 'مستخلص رقم ' + x.no, null, x.gross, x.retention, x.vat, null] }); });
      c.rels.forEach(function (x) { mv.push({ d: x.date, r: [x.date, 'تحصيل محتجز الضمان', null, null, null, null, x.amount] }); });
      mv.sort(function (x, y) { return x.d < y.d ? -1 : x.d > y.d ? 1 : 0; });
      var lines = mv.map(function (x) { return x.r; });
      lines.push({ cls: 'pm-tot', cells: ['', 'الإجمالي', s.cost, s.cert, R2(c.certs.reduce(function (t, x) { return t + x.retention; }, 0)), R2(c.certs.reduce(function (t, x) { return t + x.vat; }, 0)), R2(c.rels.reduce(function (t, x) { return t + x.amount; }, 0))] });
      detail = '<div class="pm-kpi"><div class="pm-k"><small>نسبة الإنجاز (التكلفة ÷ التقديرية)</small><b>' + s.pct.toFixed(1) + '%</b>' + pctBar(s.pct) + '</div><div class="pm-k g"><small>الأعمال المعتمدة بالمستخلصات</small><b>' + N(s.cert) + '</b>' + pctBar(s.certPct, '#16a34a') + '<small>' + s.certPct.toFixed(1) + '% من قيمة العقد</small></div>' +
        '<div class="pm-k o"><small>المحتجز لدى العميل</small><b>' + N(s.retHeld) + '</b></div><div class="pm-k ' + (s.estP >= 0 ? 'b' : 'r') + '"><small>' + (s.estP >= 0 ? 'الربح التقديري للعقد' : 'الخسارة التقديرية للعقد') + '</small><b>' + N(Math.abs(s.estP)) + '</b></div><div class="pm-k ' + (s.toDate >= 0 ? 'g' : 'r') + '"><small>نتيجة العقد حتى تاريخه (مستخلصات − تكاليف)</small><b>' + N(s.toDate) + '</b></div></div>' +
        '<div class="pm-card" id="pmRep"><div class="pm-h"><h3 style="margin:0">حساب العقد: ' + E(c.name) + ' (' + E(c.no) + ')</h3><div style="display:flex;gap:6px;flex-wrap:wrap">' + btn('xlsx', '📊 Excel', 'g s') + btn('print', '📄 طباعة', 'r s') + btn('conDel', 'حذف العقد', 'r s', ' data-id="' + c.id + '"') + '</div></div>' +
        A.setRep('حساب العقد: ' + c.name, 'العميل: ' + c.client + ' | قيمة العقد ' + N(c.price) + ' | تكلفة تقديرية ' + N(c.estCost), ['التاريخ', 'البيان', 'تكاليف العقد', 'أعمال معتمدة (مستخلصات)', 'محتجز ضمان', 'ضريبة مضافة', 'محتجز محصَّل'], lines) + '</div>' +
        (s.totalLoss > 0 ? '<div class="pm-card" style="border-color:#e11d48"><h3 style="color:#be123c">⚠️ عقد خاسر</h3><p>التكلفة التقديرية تزيد عن قيمة العقد بـ <b>' + N(s.totalLoss) + '</b>. وفق مبدأ الحيطة تُثبَّت الخسارة المتوقعة بالكامل فورًا. المطلوب تكوينه الآن: <b>' + N(s.provNeed) + '</b> (بعد خصم ما استُنفد من خسائر فعلية ومخصص سابق ' + N(c.prov || 0) + ').</p>' + (s.provNeed > 0 ? btn('conProv', 'تكوين مخصص الخسارة المتوقعة', 'r') : '<span class="pm-badge ok">المخصص مكتمل</span>') + '</div>' : '') +
        '<div class="pm-card"><h3>تسجيل تكلفة على العقد</h3><div class="pm-grid">' + lab('التاريخ', dateF('ccDate')) + lab('البيان', txt('ccDesc', 'خرسانة / عمالة / مقاول باطن')) + lab('المبلغ', num('ccAmt')) + lab('الدفع', '<select class="pm-in" id="ccPay">' + PAYO + '</select>') + lab('المورد (للآجل)', txt('ccParty')) + '</div><div style="margin-top:10px">' + btn('conCost', '+ ترحيل التكلفة', 'p') + '</div>' +
        '<p class="pm-note">القيد: من حـ/ ' + E(cAcc(c).cost) + ' إلى حـ/ (النقدية / البنك / الموردين).</p></div>' +
        '<div class="pm-card"><h3>مستخلص جديد</h3><div class="pm-grid">' + lab('التاريخ', dateF('cvDate')) + lab('قيمة الأعمال المنفذة في المستخلص', num('cvGross', null, null, ' data-inp="cvCalc"')) + lab('نسبة المحتجز %', '<input class="pm-in" type="number" step="any" min="0" id="cvRet" value="' + c.ret + '" data-inp="cvCalc">') +
        lab('ضريبة القيمة المضافة', '<select class="pm-in" id="cvVat" data-chg="cvCalc"><option value="0">بدون</option><option value="1"' + (c.vat ? ' selected' : '') + '>شاملة ' + (+A.DB.settings.vat || 0) + '%</option></select>') + '</div><div class="pm-prev" id="cvPrev">أدخل قيمة الأعمال لعرض القيد.</div><div style="margin-top:10px">' + btn('conCert', '🧾 ترحيل المستخلص', 'g') + '</div></div>' +
        '<div class="pm-card"><h3>صرف المحتجز من العميل</h3><div class="pm-grid">' + lab('التاريخ', dateF('crDate')) + lab('المبلغ (المتاح ' + N(s.retHeld) + ')', num('crAmt')) + lab('الوسيلة', '<select class="pm-in" id="crMeth"><option value="bank">بنك</option><option value="cash">خزينة</option></select>') + '</div><div style="margin-top:10px">' + btn('conRel', '💰 تحصيل المحتجز', 'p') + '</div>' +
        '<p class="pm-note">تحصيل صافي المستخلصات نفسه يتم من «سند قبض» على حساب العملاء - ' + E(c.client) + '.</p></div>';
    }
    return '<div class="pm-card"><h3>عقد مقاولات جديد</h3><div class="pm-grid">' + lab('اسم المشروع / العقد', txt('ctName', 'مثال: عمارة النور')) + lab('العميل (المالك)', txt('ctClient', 'اسم العميل')) + lab('قيمة العقد', num('ctPrice')) + lab('التكلفة التقديرية الإجمالية', num('ctEst')) + lab('نسبة المحتجز الافتراضية %', num('ctRet', 5)) + lab('تاريخ البدء', dateF('ctStart')) +
      lab('الضريبة في المستخلصات', '<select class="pm-in" id="ctVat"><option value="0">بدون ضريبة</option><option value="1">مع ضريبة القيمة المضافة</option></select>') + '</div><div style="margin-top:10px">' + btn('conNew', '+ إنشاء العقد', 'p') + '</div></div>' +
      '<div class="pm-card"><h3>العقود</h3>' + grid(['الرقم', 'العقد', 'العميل', 'قيمة العقد', 'التكلفة التقديرية', 'التكلفة حتى الآن', 'الإنجاز', ''], rows) + '</div>' + detail;
  }
  function conNew() {
    var n = val('ctName').trim(), cl = val('ctClient').trim(), p = nv('ctPrice'), e = nv('ctEst'); if (!n || !cl) return alert('اكتب اسم العقد والعميل.'); if (!(p > 0) || !(e > 0)) return alert('اكتب قيمة العقد والتكلفة التقديرية.');
    if (CON.list.some(function (x) { return x.name === n; })) return alert('يوجد عقد بنفس الاسم.');
    var c = { id: uid(), no: 'C-' + pad(CON.list.length + 1, 3), name: n, client: cl, price: p, estCost: e, ret: nv('ctRet'), start: val('ctStart'), vat: val('ctVat') === '1', costs: [], certs: [], rels: [], prov: 0, provEntries: [] };
    ensureAcc(cAcc(c).cost, 'X', '5'); ensureAcc(cAcc(c).rev, 'R'); CON.list.push(c); sel.con = c.id; save.con(); afterChange(); toast('تم إنشاء العقد ' + c.no);
  }
  function conCost() {
    var c = conById(sel.con); if (!c) return; var amt = R2(nv('ccAmt')), d = val('ccDesc').trim(), pay = val('ccPay'), party = val('ccParty').trim(), date = val('ccDate') || today(); if (!(amt > 0)) return alert('اكتب المبلغ.');
    var cr = payAcc(pay, party, 'الموردون', 'L'); ensureAcc(cAcc(c).cost, 'X', '5');
    var id = postEntry('تكلفة عقد ' + c.name + (d ? ': ' + d : ''), [[cAcc(c).cost, amt]], [[cr, amt]], date, { src: 'pro-con' }); if (id == null) return alert('تعذر إنشاء القيد.');
    c.costs.push({ date: date, desc: d || 'تكلفة', amount: amt, entryId: id }); save.con(); afterChange(); toast('تم ترحيل التكلفة ✅');
  }
  function cvVals() { var c = conById(sel.con), g = R2(nv('cvGross')), rp = nv('cvRet'), ret = R2(g * rp / 100), vat = val('cvVat') === '1' ? R2(g * (+A.DB.settings.vat || 0) / 100) : 0; return { c: c, g: g, ret: ret, vat: vat, net: R2(g + vat - ret) }; }
  function cvCalc() {
    var v = cvVals(), p = $('#cvPrev'); if (!p || !v.c) return;
    p.innerHTML = !v.g ? 'أدخل قيمة الأعمال لعرض القيد.' : 'من مذكورين: العملاء - ' + E(v.c.client) + ' <b>' + N(v.net) + '</b> — ' + RETA + ' <b>' + N(v.ret) + '</b><br>إلى مذكورين: ' + E(cAcc(v.c).rev) + ' <b>' + N(v.g) + '</b>' + (v.vat ? ' — ' + VATO + ' <b>' + N(v.vat) + '</b>' : '');
  }
  function conCert() {
    var v = cvVals(), c = v.c; if (!c) return; if (!(v.g > 0)) return alert('اكتب قيمة الأعمال.');
    var cust = subAcc('العملاء', c.client, 'A'); ensureAcc(RETA, 'A', '11'); ensureAcc(cAcc(c).rev, 'R'); if (v.vat) ensureAcc(VATO, 'L', '21'); var no = c.certs.length + 1, date = val('cvDate') || today();
    var id = postEntry('مستخلص رقم ' + no + ' — عقد ' + c.name, [[cust, v.net], [RETA, v.ret]], [[cAcc(c).rev, v.g], [VATO, v.vat]], date, { src: 'pro-con' }); if (id == null) return alert('تعذر إنشاء القيد.');
    c.certs.push({ no: no, date: date, gross: v.g, retention: v.ret, vat: v.vat, net: v.net, entryId: id }); save.con(); afterChange(); toast('تم ترحيل المستخلص رقم ' + no + ' ✅');
  }
  function conRel() {
    var c = conById(sel.con); if (!c) return; var s = cStats(c), amt = R2(nv('crAmt')); if (!(amt > 0)) return alert('اكتب المبلغ.'); if (amt > s.retHeld + 0.005) return alert('المبلغ أكبر من المحتجز المتاح (' + N(s.retHeld) + ').');
    var dr = payAcc(val('crMeth'), '', '', 'A'), date = val('crDate') || today();
    var id = postEntry('تحصيل محتجز ضمان أعمال — عقد ' + c.name, [[dr, amt]], [[RETA, amt]], date, { src: 'pro-con' }); if (id == null) return alert('تعذر إنشاء القيد.');
    c.rels.push({ date: date, amount: amt, entryId: id }); save.con(); afterChange(); toast('تم تحصيل المحتجز ✅');
  }
  function conProv() {
    var c = conById(sel.con); if (!c) return; var s = cStats(c); if (!(s.provNeed > 0)) return;
    ensureAcc('خسائر متوقعة عقود', 'X', '5'); ensureAcc(PROV, 'L', '21');
    var id = postEntry('تكوين مخصص خسارة متوقعة — عقد ' + c.name, [['خسائر متوقعة عقود', s.provNeed]], [[PROV, s.provNeed]], today(), { src: 'pro-con' }); if (id == null) return alert('تعذر إنشاء القيد.');
    c.provEntries = c.provEntries || []; c.provEntries.push({ id: id, amt: s.provNeed }); c.prov = R2((c.prov || 0) + s.provNeed); save.con(); afterChange(); toast('تم تكوين المخصص ✅');
  }

  /* ============================================================ ٤) الخصم والإضافة */
  var WHP = 'ضريبة الخصم والإضافة المستحقة', WHC = 'ضريبة خصم وإضافة تحت حساب الضريبة (مدينة)';
  var rateOf = function (id) { var r = WH.rates.find(function (x) { return x.id === id; }); return r ? +r.rate : 0; };
  function pWh() {
    A.readF(); var f = A.state.F, docs = WH.docs.filter(function (d) { return A.inR(d.date, f.from, f.to); });
    var pay = docs.filter(function (d) { return d.type === 'pay'; }), col = docs.filter(function (d) { return d.type === 'col'; });
    var sum = function (arr, k) { return R2(arr.reduce(function (s, x) { return s + x[k]; }, 0)); };
    var byCat = WH.rates.map(function (r) { var a = pay.filter(function (d) { return d.cat === r.id; }); return [r.name, r.rate + '%', sum(a, 'base'), sum(a, 'wh')]; });
    byCat.push({ cls: 'pm-tot', cells: ['الإجمالي', '', sum(pay, 'base'), sum(pay, 'wh')] });
    var due = R2(-A.bal(WHP)), credit = A.bal(WHC);
    var expOpts = '<option value="المشتريات">المشتريات (توريدات)</option>' + A.accounts().filter(function (a) { return A.typeOf(a) === 'X' && a !== 'المشتريات'; }).map(function (a) { return '<option value="' + E(a) + '">' + E(a) + '</option>'; }).join('');
    var catOpts = WH.rates.map(function (r) { return '<option value="' + r.id + '">' + E(r.name) + ' — ' + r.rate + '%</option>'; }).join('');
    var allRows = docs.slice().reverse().map(function (d) { return [d.type === 'pay' ? 'خصم من مورد' : 'خصم من عميل', d.date, d.party || '—', d.catName, d.base, d.vat, d.wh, d.net, { h: btn('whDel', 'حذف', 's r', ' data-id="' + d.id + '"') }]; });
    return '<div class="pm-card"><h3>نسب الخصم والإضافة (تدريبية قابلة للتعديل)</h3><div class="pm-grid">' + WH.rates.map(function (r) { return lab(E(r.name) + ' %', '<input class="pm-in" type="number" step="any" min="0" value="' + r.rate + '" data-chg="whRate" data-id="' + r.id + '">'); }).join('') + lab('حد الخصم (جنيه): لا يُخصم على أقل منه', '<input class="pm-in" type="number" step="any" min="0" value="' + WH.threshold + '" data-chg="whThr">') + '</div>' +
      '<p class="pm-note">النسب الافتراضية المستخدمة للتدريب: 1% توريدات ومقاولات، 3% خدمات، 5% عمولات وأتعاب مهنية، وبدون خصم على ما يقل عن 300 جنيه. تختلف المصادر وقد تتغير القرارات، فراجع آخر تعليمات مصلحة الضرائب وعدّل النسب لتطابق تمرينك.</p></div>' +
      '<div class="pm-card"><h3>أ) نحن نخصم من المورد / مقدم الخدمة</h3><div class="pm-grid" id="pmWhA">' + lab('التاريخ', dateF('waDate')) + lab('المورد', txt('waParty', 'اسم المورد')) + lab('نوع التعامل', '<select class="pm-in" id="waCat" data-chg="waCalc">' + catOpts + '</select>') + lab('حساب المشتريات / المصروف', '<select class="pm-in" id="waExp">' + expOpts + '</select>') +
      lab('القيمة قبل الضريبة', num('waBase', null, null, ' data-inp="waCalc"')) + lab('ضريبة القيمة المضافة %', num('waVat', +A.DB.settings.vat || 0, null, ' data-inp="waCalc"')) + lab('طريقة الدفع', '<select class="pm-in" id="waPay">' + PAYO + '</select>') + '</div><div class="pm-prev" id="waPrev">أدخل القيمة لعرض الحساب والقيد.</div><div style="margin-top:10px">' + btn('whPayPost', '✂️ ترحيل (خصم من المورد)', 'p') + '</div></div>' +
      '<div class="pm-card"><h3>ب) العميل يخصم منا (تحصيل بخصم ضريبة)</h3><div class="pm-grid" id="pmWhB">' + lab('التاريخ', dateF('wbDate')) + lab('العميل', txt('wbParty', 'اسم العميل')) + lab('نوع التعامل', '<select class="pm-in" id="wbCat" data-chg="wbCalc">' + catOpts + '</select>') + lab('قيمة الفاتورة قبل الضريبة', num('wbBase', null, null, ' data-inp="wbCalc"')) + lab('ضريبة القيمة المضافة %', num('wbVat', +A.DB.settings.vat || 0, null, ' data-inp="wbCalc"')) + lab('وسيلة التحصيل', '<select class="pm-in" id="wbMeth"><option value="bank">بنك</option><option value="cash">خزينة</option></select>') + '</div>' +
      '<div class="pm-prev" id="wbPrev">أدخل القيمة لعرض الحساب والقيد.</div><div style="margin-top:10px">' + btn('whColPost', '📥 ترحيل (تحصيل بعد الخصم)', 'g') + '</div><p class="pm-note">يفترض أن الفاتورة مسجّلة على «العملاء - اسم العميل» من شاشة فاتورة البيع. ضريبة الخصم المحصّلة منا تُرصد كرصيد مدين تحت حساب الضريبة وتُخصم من ضريبة الأرباح السنوية.</p></div>' +
      A.filterBar('', true) + '<div class="pm-card" id="pmRep"><h3>نموذج 41 — الضريبة المخصومة من الموردين (' + A.periodTxt() + ')</h3>' + A.setRep('نموذج الخصم والإضافة (41)', A.periodTxt(), ['نوع التعامل', 'النسبة', 'القيمة الخاضعة', 'الضريبة المخصومة'], byCat) +
      '<p style="margin-top:10px;line-height:2">رصيد الضريبة المخصومة المستحقة لمصلحة الضرائب: <b>' + N(due) + '</b> &nbsp;|&nbsp; رصيد ضريبة الخصم المحصّلة منا (رصيد دائن لصالحنا): <b>' + N(credit) + '</b></p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' + btn('xlsx', '📊 Excel', 'g') + btn('print', '📄 PDF / طباعة', 'r') + (due > 0 ? '<select class="pm-in" id="whSetPay" style="width:auto"><option value="bank">من البنك</option><option value="cash">من الخزينة</option></select>' + btn('whSettle', '🏦 سداد الضريبة المخصومة للمصلحة (' + N(due) + ')', 'p') : '') + '</div></div>' +
      '<div class="pm-card"><h3>سجل عمليات الخصم والإضافة</h3>' + grid(['النوع', 'التاريخ', 'الطرف', 'التعامل', 'القيمة', 'ضريبة مضافة', 'ضريبة مخصومة', 'الصافي', ''], allRows) + '</div>';
  }
  function whCalc(pre) {
    var base = nv(pre + 'Base'), vr = nv(pre + 'Vat'), r = rateOf(val(pre + 'Cat')), vat = R2(base * vr / 100), wh = base >= WH.threshold ? R2(base * r / 100) : 0, net = R2(base + vat - wh);
    return { base: base, vat: vat, wh: wh, net: net, r: r };
  }
  function waCalc() { var v = whCalc('wa'), p = $('#waPrev'); if (!p) return; p.innerHTML = !v.base ? 'أدخل القيمة لعرض الحساب والقيد.' : 'الضريبة المخصومة (' + v.r + '%): <b>' + N(v.wh) + '</b>' + (v.wh ? '' : ' (أقل من حد الخصم)') + ' &nbsp;|&nbsp; ضريبة مضافة: <b>' + N(v.vat) + '</b> &nbsp;|&nbsp; الصافي المدفوع للمورد: <b>' + N(v.net) + '</b>'; }
  function wbCalc() { var v = whCalc('wb'), p = $('#wbPrev'); if (!p) return; p.innerHTML = !v.base ? 'أدخل القيمة لعرض الحساب والقيد.' : 'الضريبة المخصومة منا (' + v.r + '%): <b>' + N(v.wh) + '</b> &nbsp;|&nbsp; المحصَّل فعليًا: <b>' + N(v.net) + '</b> من إجمالي فاتورة <b>' + N(v.base + v.vat) + '</b>'; }
  function whPayPost() {
    var v = whCalc('wa'), party = val('waParty').trim(), date = val('waDate') || today(), cat = WH.rates.find(function (x) { return x.id === val('waCat'); }), exp = val('waExp'), pay = val('waPay');
    if (!(v.base > 0)) return alert('اكتب القيمة قبل الضريبة.'); ensureAcc(exp, 'X', '5'); ensureAcc('ضريبة مشتريات قابلة للخصم', 'A', '11'); ensureAcc(WHP, 'L', '21'); var cr = payAcc(pay, party, 'الموردون', 'L');
    var id = postEntry('مشتريات/خدمات من ' + (party || 'مورد') + ' مع خصم ضريبة الخصم والإضافة (' + cat.name + ' ' + v.r + '%)', [[exp, v.base], ['ضريبة مشتريات قابلة للخصم', v.vat]], [[cr, v.net], [WHP, v.wh]], date, { src: 'pro-wh' }); if (id == null) return alert('تعذر إنشاء القيد.');
    WH.docs.push({ id: uid(), type: 'pay', date: date, party: party, cat: cat.id, catName: cat.name, base: v.base, vat: v.vat, wh: v.wh, net: v.net, entryId: id }); save.wh(); afterChange(); toast('تم الترحيل ✅');
  }
  function whColPost() {
    var v = whCalc('wb'), party = val('wbParty').trim(), date = val('wbDate') || today(), cat = WH.rates.find(function (x) { return x.id === val('wbCat'); });
    if (!(v.base > 0)) return alert('اكتب قيمة الفاتورة.'); if (!party) return alert('اكتب اسم العميل.'); ensureAcc(WHC, 'A', '11'); var dr = payAcc(val('wbMeth'), '', '', 'A'), cust = subAcc('العملاء', party, 'A');
    var id = postEntry('تحصيل من ' + party + ' بعد خصم ضريبة الخصم والإضافة (' + cat.name + ' ' + v.r + '%)', [[dr, v.net], [WHC, v.wh]], [[cust, v.base + v.vat]], date, { src: 'pro-wh' }); if (id == null) return alert('تعذر إنشاء القيد.');
    WH.docs.push({ id: uid(), type: 'col', date: date, party: party, cat: cat.id, catName: cat.name, base: v.base, vat: v.vat, wh: v.wh, net: v.net, entryId: id }); save.wh(); afterChange(); toast('تم الترحيل ✅');
  }
  function whSettle() {
    var due = R2(-A.bal(WHP)); if (!(due > 0)) return;
    var cr = payAcc(val('whSetPay') === 'cash' ? 'cash' : 'bank', '', '', 'A'); var id = postEntry('سداد ضريبة الخصم والإضافة لمصلحة الضرائب (نموذج 41)', [[WHP, due]], [[cr, due]], today(), { src: 'pro-wh' });
    if (id == null) return alert('تعذر إنشاء القيد.'); afterChange(); toast('تم السداد ✅');
  }

  /* ============================================================ اللوحة المجمعة */
  function pAgg() {
    var ents = A.entries().map(function (e, i) { return { e: e, no: i + 1 }; }).sort(function (x, y) { return A.cmpDN({ date: x.e.date || '', no: x.no }, { date: y.e.date || '', no: y.no }); });
    var run = { a: 0, l: 0, e: 0, p: 0 }, ser = [], eff = [];
    ents.forEach(function (x) {
      var d = { a: 0, l: 0, e: 0, p: 0 };
      (x.e.debits || []).forEach(function (l) { var t = A.typeOf(l.a), m = +l.m || 0; if (t === 'A') d.a += m; else if (t === 'L') d.l -= m; else if (t === 'E') d.e -= m; else if (t === 'R' || t === 'X') d.p -= m; });
      (x.e.credits || []).forEach(function (l) { var t = A.typeOf(l.a), m = +l.m || 0; if (t === 'A') d.a -= m; else if (t === 'L') d.l += m; else if (t === 'E') d.e += m; else if (t === 'R' || t === 'X') d.p += m; });
      ['a', 'l', 'e', 'p'].forEach(function (k) { run[k] = R2(run[k] + d[k]); d[k] = R2(d[k]); });
      ser.push({ no: x.no, a: run.a, l: run.l, q: R2(run.e + run.p) }); eff.push({ no: x.no, date: x.e.date, desc: x.e.desc, d: d });
    });
    var W = 640, H = 220, pl = 16, pr = 16, pt = 16, pb = 26, all = []; ser.forEach(function (s) { all.push(s.a, s.l, s.q); }); var mn = Math.min.apply(null, all.concat([0])), mx = Math.max.apply(null, all.concat([1])), rg = mx - mn || 1;
    var X = function (i) { return ser.length < 2 ? W / 2 : pl + i * (W - pl - pr) / (ser.length - 1); }, Y = function (v) { return pt + (mx - v) / rg * (H - pt - pb); };
    var line = function (k, col) { return ser.length ? '<polyline fill="none" stroke="' + col + '" stroke-width="2.5" points="' + ser.map(function (s, i) { return X(i).toFixed(1) + ',' + Y(s[k]).toFixed(1); }).join(' ') + '"/>' + ser.map(function (s, i) { return '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(s[k]).toFixed(1) + '" r="3" fill="' + col + '"/>'; }).join('') : ''; };
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;direction:ltr"><line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(0) + '" y2="' + Y(0) + '" stroke="#cdbbe6" stroke-dasharray="4"/>' + line('a', '#6d1f9c') + line('l', '#f59e0b') + line('q', '#16a34a') + '</svg>';
    var last = eff.slice(-15).reverse(), cl = function (v) { return v === 0 ? 0 : { h: '<span style="color:' + (v > 0 ? '#047857' : '#be123c') + ';font-weight:700;direction:ltr;display:inline-block">' + (v > 0 ? '+' : '−') + N(Math.abs(v)) + '</span>' }; };
    var rows = last.map(function (x) { return [String(x.no), x.date || '', x.desc || '', cl(x.d.a), cl(x.d.l), cl(R2(x.d.e)), cl(x.d.p)]; });
    var bal = {}; A.allLines().forEach(function (l) { if (A.typeOf(l.a) === 'A') bal[l.a] = (bal[l.a] || 0) + l.d - l.c; });
    var top = Object.keys(bal).map(function (a) { return { a: a, v: bal[a] }; }).filter(function (x) { return Math.abs(x.v) > 0.004; }).sort(function (x, y) { return Math.abs(y.v) - Math.abs(x.v); }).slice(0, 6), tm = Math.max.apply(null, top.map(function (x) { return Math.abs(x.v); }).concat([1]));
    var bars = top.map(function (x) { return '<div style="display:flex;align-items:center;gap:8px;margin:5px 0"><span style="width:150px;font-size:12.5px">' + E(x.a) + '</span><div style="flex:1">' + pctBar(Math.abs(x.v) / tm * 100, x.v < 0 ? '#e11d48' : '#6d1f9c') + '</div><b style="width:110px;text-align:left;direction:ltr;font-size:12.5px">' + N(x.v) + '</b></div>'; }).join('');
    var cur = ser.length ? ser[ser.length - 1] : { a: 0, l: 0, q: 0 };
    return '<div class="pm-kpi"><div class="pm-k"><small>إجمالي الأصول</small><b>' + N(cur.a) + '</b></div><div class="pm-k o"><small>إجمالي الخصوم</small><b>' + N(cur.l) + '</b></div><div class="pm-k g"><small>حقوق الملكية (شاملة الأرباح)</small><b>' + N(cur.q) + '</b></div><div class="pm-k ' + (Math.abs(cur.a - cur.l - cur.q) < 0.01 ? 'b' : 'r') + '"><small>المعادلة المحاسبية</small><b>' + (Math.abs(cur.a - cur.l - cur.q) < 0.01 ? 'الأصول = الخصوم + حقوق الملكية ✅' : 'غير متزنة ❌ (راجع تصنيف الحسابات)') + '</b></div></div>' +
      '<div class="pm-card"><h3>تطور المركز المالي بعد كل عملية <span class="pm-note">(بنفسجي: أصول — برتقالي: خصوم — أخضر: حقوق ملكية + أرباح)</span></h3>' + (ser.length ? svg : '<p class="pm-note">لا توجد قيود بعد.</p>') + '</div>' +
      '<div class="pm-card" id="pmRep"><h3>أثر آخر 15 عملية على القوائم المالية</h3>' + A.setRep('أثر العمليات على القوائم المالية', 'آخر ' + rows.length + ' عملية', ['رقم القيد', 'التاريخ', 'البيان', 'أثر على الأصول', 'أثر على الخصوم', 'أثر على حقوق الملكية', 'أثر على الربح'], rows) +
      '<p class="pm-note">كل عملية تحقق المعادلة: التغير في الأصول = التغير في الخصوم + حقوق الملكية + الربح. الأخضر زيادة والأحمر نقص.</p><div style="margin-top:8px">' + btn('xlsx', '📊 Excel', 'g s') + ' ' + btn('print', '📄 PDF / طباعة', 'r s') + '</div></div>' +
      '<div class="pm-card"><h3>أكبر أرصدة الأصول</h3>' + (bars || '<p class="pm-note">لا توجد أرصدة.</p>') + '</div>';
  }

  /* ============================================================ شريط التكليف */
  function sheetState() {
    var o = { sheet: null, cloud: false, list: [], subs: {}, role: '' };
    try { o.sheet = typeof activeSheet !== 'undefined' ? activeSheet : null; } catch (e) { }
    try { o.cloud = typeof cloudOn === 'function' && !!cloudOn(); } catch (e) { }
    try { o.list = typeof cloudSheetsList !== 'undefined' ? cloudSheetsList : []; o.subs = typeof cloudSubs !== 'undefined' ? cloudSubs : {}; } catch (e) { }
    try { var p = getProfile(); o.role = p ? p.role : ''; } catch (e) { }
    return o;
  }
  function bar() {
    var st = sheetState(), sh = st.sheet, notes = ''; try { notes = localStorage.getItem(K.prob + (sh ? '_' + sh.sheetId : '')) || ''; } catch (e) { }
    var opts = '<option value="">-- اختر تكليفًا منشورًا --</option>' + st.list.map(function (x) { return '<option value="' + E(x.id) + '"' + (sh && sh.sheetId === x.id ? ' selected' : '') + '>' + E(x.title) + (st.subs[x.id] ? ' ✔ (تم التسليم)' : '') + '</option>'; }).join('');
    var teacher = st.role === 'teacher';
    return '<div class="pm-bar"><div class="pm-barrow"><b>📌 التكليف:</b> <span style="font-weight:700;color:#43126a">' + (sh ? E(sh.title) : 'لا يوجد تكليف نشط (تدريب حر)') + '</span>' +
      (st.cloud ? '<select class="pm-in" id="asSel" style="width:auto;max-width:230px">' + opts + '</select>' + btn('asPull', '📥 سحب تكليف', 's o') : '') +
      '<label class="pm-b s o" style="cursor:pointer">📂 استيراد ملف تكليف<input type="file" id="asFile" accept=".json,.xlsx,.xls,.csv,.txt,.pdf,.png,.jpg,.jpeg" data-chg="asFile" style="display:none"></label>' +
      (teacher ? btn('asTeach', '🧑‍🏫 إدارة التكاليف والتسليمات', 's p') : (sh ? btn('asSubmit', '📤 تسليم الإجابة', 's g') : '')) +
      '<span class="pm-badge ' + (st.cloud ? 'ok' : 'w') + '">' + (st.cloud ? 'حالة الاتصال: سحابي ☁️' : 'حالة الاتصال: محلي') + '</span><span style="flex:1"></span>' + btn('asToggle', barOpen ? '▴ إخفاء معطيات التمرين' : '▾ معطيات التمرين', 's o') + '</div>' +
      (barOpen ? '<div class="pm-barbody">' + (sh && sh.instructions ? '<div class="pm-prev" style="margin:0 0 8px"><b>تعليمات المعلم' + (sh.maxScore ? ' (الدرجة ' + sh.maxScore + ')' : '') + ':</b><br>' + E(sh.instructions).replace(/\n/g, '<br>') + '</div>' : '') +
        '<textarea class="pm-in" id="problemText" rows="4" data-inp="probTxt" placeholder="قم بإدراج معطيات التمرين هنا للبدء في المعالجة...">' + E(notes) + '</textarea></div>' : '') + (barRes ? '<div class="pm-barbody">' + barRes + '</div>' : '') + '</div>';
  }
  function asSubmit() {
    var st = sheetState(); if (!st.sheet) return alert('لا يوجد تكليف نشط. اسحب تكليفًا أو استورد ملف التكليف أولًا.');
    try { if (typeof exportAnswer === 'function') exportAnswer(); } catch (e) { console.error(e); return alert('تعذر التسليم: ' + e.message); }
    try { if (typeof gradeEntries === 'function' && typeof cleanEnts === 'function' && typeof resultHTML === 'function') { barRes = '<b>النتيجة الأولية للتصحيح التلقائي:</b>' + resultHTML(gradeEntries(cleanEnts(A.entries()), st.sheet)); A.renderPage(); } } catch (e) { console.error(e); }
  }

  /* ------------------------------------------------------------ التسجيل في الموديول الرئيسي */
  var ACTS = {
    jvAdd: function () { $('#jvRows').insertAdjacentHTML('beforeend', jvRow()); },
    jvDel: function (a) { if ($$('.jv-r').length > 2) { a.closest('tr').remove(); jvCalc(); } },
    jvSave: jvSave,
    jvDelE: function (a) { var e = A.entries().find(function (x) { return String(x.id) === a.dataset.id; }); if (e && confirm('حذف القيد نهائيًا؟')) { removeEntry(e.id); afterChange(); } },
    itAdd: itAdd, itRecv: itRecv,
    itCard: function (a) { sel.item = a.dataset.id; A.renderPage(); },
    itDel: function (a) { var it = itemById(a.dataset.id); if (!it || !confirm('حذف الصنف «' + it.name + '» وكل حركاته وقيودها؟')) return; it.moves.forEach(function (m) { removeEntry(m.entryId); }); COST.jobs.forEach(function (j) { j.mats = j.mats.filter(function (m) { return m.item !== it.id; }); }); COST.items = COST.items.filter(function (x) { return x !== it; }); save.cost(); afterChange(); },
    mvDel: function (a) { var it = itemById(a.dataset.id); if (!it || !it.moves.length) return; var m = it.moves[it.moves.length - 1]; if (!confirm('حذف آخر حركة (' + (m.type === 'in' ? 'وارد' : 'صادر') + ') وقيدها؟')) return; removeEntry(m.entryId); it.moves.pop(); if (m.job) { var j = jobById(m.job); if (j) j.mats = j.mats.filter(function (x) { return x.entryId !== m.entryId; }); } save.cost(); afterChange(); },
    jobNew: jobNew, jobOpen: function (a) { sel.job = a.dataset.id; A.renderPage(); }, jobIssue: jobIssue, jobLabor: jobLabor, jobDone: jobDone, jobSold: jobSold, ohPost: ohPost, ohSettle: ohSettle,
    jobDel: function (a) { var j = jobById(a.dataset.id); if (!j || !confirm('حذف الأمر ' + j.no + ' وكل قيوده؟')) return; var ids = [j.doneEntry, j.soldEntry]; j.mats.forEach(function (m) { ids.push(m.entryId); }); j.labor.forEach(function (l) { ids.push(l.entryId, l.ohEntryId); }); ids.forEach(function (i) { if (i) removeEntry(i); }); COST.items.forEach(function (it) { it.moves = it.moves.filter(function (m) { return m.job !== j.id; }); }); COST.jobs = COST.jobs.filter(function (x) { return x !== j; }); sel.job = null; save.cost(); afterChange(); },
    conNew: conNew, conOpen: function (a) { sel.con = a.dataset.id; A.renderPage(); }, conCost: conCost, conCert: conCert, conRel: conRel, conProv: conProv,
    conDel: function (a) { var c = conById(a.dataset.id); if (!c || !confirm('حذف العقد وكل قيوده؟')) return; c.costs.concat(c.certs, c.rels).forEach(function (x) { removeEntry(x.entryId); }); (c.provEntries || []).forEach(function (x) { removeEntry(x.id); }); CON.list = CON.list.filter(function (x) { return x !== c; }); sel.con = null; save.con(); afterChange(); },
    whPayPost: whPayPost, whColPost: whColPost, whSettle: whSettle,
    whDel: function (a) { var d = WH.docs.find(function (x) { return x.id === a.dataset.id; }); if (!d || !confirm('حذف العملية وقيدها؟')) return; removeEntry(d.entryId); WH.docs = WH.docs.filter(function (x) { return x !== d; }); save.wh(); afterChange(); },
    asToggle: function () { barOpen = !barOpen; A.renderPage(); },
    asPull: function () { var id = val('asSel'); if (!id) return alert('اختر تكليفًا من القائمة.'); barRes = ''; try { cloudStart(id); } catch (e) { alert('تعذر سحب التكليف.'); } setTimeout(function () { A.renderPage(); }, 80); },
    asSubmit: asSubmit,
    asTeach: function () { try { P.close(); if (typeof tab === 'function') tab('sheets'); } catch (e) { } }
  };
  var CHGS = {
    jmCalc: jmCalc, cvCalc: cvCalc, waCalc: waCalc, wbCalc: wbCalc,
    ohRate: function (t) { COST.cfg.ohRate = Math.max(0, +t.value || 0); save.cost(); toast('تم حفظ معدل التحميل'); },
    whRate: function (t) { var r = WH.rates.find(function (x) { return x.id === t.dataset.id; }); if (r) { r.rate = Math.max(0, +t.value || 0); save.wh(); A.renderPage(); } },
    whThr: function (t) { WH.threshold = Math.max(0, +t.value || 0); save.wh(); },
    asFile: function (t) { try { if (typeof importSheet === 'function') importSheet(t); barRes = ''; setTimeout(function () { A.renderPage(); }, 120); } catch (e) { alert('تعذر استيراد الملف.'); } }
  };
  var INPS = {
    jvCalc: jvCalc, jmCalc: jmCalc, cvCalc: cvCalc, waCalc: waCalc, wbCalc: wbCalc,
    probTxt: function (t) { try { var st = sheetState(); localStorage.setItem(K.prob + (st.sheet ? '_' + st.sheet.sheetId : ''), t.value); } catch (e) { } }
  };

  var css = document.createElement('style'); css.id = 'pmModCss';
  css.textContent = '.pm-bar{background:#fff;border-bottom:1px solid #e6e0ef;padding:8px 14px}.pm-barrow{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:13px}.pm-barbody{margin-top:8px}.pm-bar textarea{resize:vertical}.pm-t td{max-width:360px;overflow:hidden;text-overflow:ellipsis}';
  document.head.appendChild(css);

  P.register({
    pages: { agg: pAgg, jv: pJv, cstock: pcStock, cjobs: pcJobs, contracts: pCon, whtax: pWh },
    acts: ACTS, chg: CHGS, inp: INPS, reconcile: reconcile, bar: bar
  });
  P.modules = { version: '1.0' };
  P._m = { replay: replay, issueCost: issueCost, jobCost: jobCost, cStats: cStats, load: function () { load(); return { COST: COST, CON: CON, WH: WH }; } };
})();
