/* =====================================================================
   ui.js — ส่วนติดต่อผู้ใช้: ลากวาง, ต่อสาย, แดชบอร์ด, บทเรียน
   ===================================================================== */
(function () {
  'use strict';
  const DC = window.DC, SIM = window.SIM;
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const UI = window.UI = {
    mode: 'select', kind: 'auto', palCat: 'power',
    sel: null, selLink: null, from: null, zoom: 1, lesson: 0, tab: 'dash'
  };

  const canvas = $('#canvas'), nodesLayer = $('#nodes'), wires = $('#wires');
  const nodeEls = {};
  let dragging = null, toastT = null;

  /* ------------------------------------------------------------ helpers */
  function toast(msg, kind) {
    const t = $('#toast');
    t.textContent = msg; t.className = kind || '';
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 3600);
  }
  function status(msg) { $('#statusMsg').textContent = msg; }
  const pct = (a, b) => (b > 0 ? Math.max(0, Math.min(100, (a / b) * 100)) : 0);

  /* ============================================================ zones */
  function buildZones() {
    $('#zones').innerHTML = DC.ZONES.map(z =>
      `<div class="zone" data-zone="${z.id}" style="top:${z.y}px;height:${z.h - 8}px">
         <div class="zlabel">${esc(z.name)}</div></div>`).join('');
  }

  /* ========================================================== palette */
  function buildPalTabs() {
    $('#palTabs').innerHTML = DC.CATS.map(c =>
      `<button data-cat="${c.id}" class="${c.id === UI.palCat ? 'active' : ''}">${esc(c.name)}</button>`).join('');
    $('#palTabs').onclick = e => {
      const b = e.target.closest('button[data-cat]'); if (!b) return;
      UI.palCat = b.dataset.cat; buildPalTabs(); buildPalette();
    };
  }

  function specChips(type) {
    const s = DC.get(type).specs, out = [];
    if (s.capacityKw) out.push(s.capacityKw + ' kW');
    if (s.coolKw) out.push('ทำความเย็น ' + s.coolKw + ' kW');
    if (s.rejectKw) out.push('ทิ้งความร้อน ' + s.rejectKw + ' kW');
    if (s.cop) out.push('COP ' + s.cop);
    if (s.efficiency) out.push('ประสิทธิภาพ ' + (s.efficiency * 100).toFixed(1) + '%');
    if (s.batteryMin) out.push('แบต ' + s.batteryMin + ' นาที');
    if (s.startSec) out.push('สตาร์ท ' + s.startSec + ' วิ');
    if (s.ru) out.push(s.ru + 'U');
    if (s.maxW) out.push((s.idleW / 1000).toFixed(2) + '–' + (s.maxW / 1000).toFixed(2) + ' kW');
    if (s.powerW) out.push((s.powerW / 1000).toFixed(2) + ' kW');
    if (s.powerKw) out.push(s.powerKw + ' kW');
    if (s.vcpu) out.push(s.vcpu + ' vCPU / ' + s.ramGb + ' GB');
    if (s.gpu) out.push(s.gpu + ' GPU');
    if (s.tb) out.push(s.tb + ' TB');
    if (s.gbps) out.push(s.gbps + ' Gbps');
    if (s.ports) out.push(s.ports + ' พอร์ต');
    if (s.maxKw) out.push('รับได้ ' + s.maxKw + ' kW');
    return out;
  }

  function buildPalette() {
    const list = Object.keys(DC.CATALOG).filter(k => DC.CATALOG[k].cat === UI.palCat);
    $('#palette').innerHTML = list.map(k => {
      const c = DC.CATALOG[k];
      return `<div class="pitem ${c.intoRack ? 'rackonly' : ''}" draggable="true" data-type="${k}">
        <div class="g">${c.glyph}</div>
        <div class="t"><b>${esc(c.name)}</b><span>${esc(c.th)}</span>
        <em>${esc(specChips(k).slice(0, 2).join(' · '))}</em></div></div>`;
    }).join('') + `<div style="font-size:10.5px;color:var(--txt3);padding:6px 4px;line-height:1.5">
      แถบสีม่วงด้านซ้าย = อุปกรณ์ที่ต้องลากไปวาง<b style="color:#a78bfa"> บนตู้ Rack</b><br>ลากวางได้ทั้งมุมมองผัง 2D และห้อง 3D</div>`;

    $('#palette').querySelectorAll('.pitem').forEach(it => {
      it.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', it.dataset.type);
        e.dataTransfer.effectAllowed = 'copy';
      });
      it.addEventListener('click', () => { UI.sel = null; showSpec(it.dataset.type); });
    });
  }

  /* ========================================================== presets */
  function buildPresetSel() {
    const sel = $('#presetSel');
    sel.innerHTML = Object.keys(SIM.PRESETS).map(k =>
      `<option value="${k}">${esc(SIM.PRESETS[k].name)}</option>`).join('');
    sel.value = 'tier1';
    sel.onchange = () => {
      SIM.loadPreset(sel.value);
      Object.keys(nodeEls).forEach(k => { nodeEls[k].remove(); delete nodeEls[k]; });
      UI.sel = UI.selLink = UI.from = null;
      const p = SIM.PRESETS[sel.value];
      if (window.V3D) window.V3D.fit();
      status(p.name + ' — ' + p.desc);
      if (p.hints) toast('แบบฝึกหัด: ' + p.hints.length + ' จุดบกพร่อง ดูคำใบ้ในแท็บเหตุการณ์');
      refresh();
    };
  }

  /* ========================================================== toolbar */
  function bindToolbar() {
    $('#toolbar').addEventListener('click', e => {
      const t = e.target.closest('.btn.tool');
      if (t) {
        UI.mode = t.dataset.mode; UI.from = null;
        document.querySelectorAll('.btn.tool').forEach(b => b.classList.toggle('active', b === t));
        status(UI.mode === 'connect' ? 'โหมดต่อสาย: คลิกอุปกรณ์ต้นทาง แล้วคลิกอุปกรณ์ปลายทาง'
          : UI.mode === 'erase' ? 'โหมดตัดสาย: คลิกบนเส้นที่ต้องการลบ'
            : 'โหมดเลือก: ลากอุปกรณ์เพื่อจัดผัง คลิกเพื่อดูรายละเอียด');
        refresh(); return;
      }
      const k = e.target.closest('.btn.kind');
      if (k) {
        UI.kind = k.dataset.kind;
        document.querySelectorAll('.btn.kind').forEach(b => b.classList.toggle('active', b === k));
      }
    });

    $('#btnAuto').onclick = () => { const n = SIM.autoWire(); toast('เชื่อมต่ออัตโนมัติ ' + n + ' เส้น', 'ok'); refresh(); };
    $('#btnClear').onclick = () => {
      if (!confirm('ล้างผังทั้งหมด?')) return;
      SIM.model = SIM.newModel();
      Object.keys(nodeEls).forEach(k => { nodeEls[k].remove(); delete nodeEls[k]; });
      UI.sel = UI.selLink = UI.from = null; refresh();
    };
    $('#btnPlay').onclick = () => {
      SIM.model.running = !SIM.model.running;
      $('#btnPlay').textContent = SIM.model.running ? '⏸ หยุดเวลา' : '▶ เริ่มเดินเวลา';
      $('#btnPlay').classList.toggle('danger', SIM.model.running);
    };
    $('#speedSel').onchange = e => SIM.model.speed = +e.target.value;
    $('#btnReset').onclick = () => {
      SIM.resetTransient(); SIM.model.events = [];
      SIM.log('info', 'รีเซ็ตสถานะอุปกรณ์และเวลาจำลอง');
      toast('คืนสถานะอุปกรณ์ทั้งหมดแล้ว', 'ok'); refresh();
    };
    const setZoom = v => {
      UI.zoom = Math.max(0.5, Math.min(1.3, v));
      canvas.style.transform = 'scale(' + UI.zoom + ')';
      $('#zVal').textContent = Math.round(UI.zoom * 100) + '%';
    };
    $('#zIn').onclick = () => setZoom(UI.zoom + 0.1);
    $('#zOut').onclick = () => setZoom(UI.zoom - 0.1);
    $('#btnHelp').onclick = () => openModal(0);
    $('#btnCloseModal').onclick = () => $('#modal').classList.add('hidden');
  }

  /* ====================================================== canvas drag */
  function canvasPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / UI.zoom, y: (e.clientY - r.top) / UI.zoom };
  }
  function rackAt(p) {
    return SIM.model.nodes.filter(n => n.type === 'rack')
      .find(n => p.x >= n.x && p.x <= n.x + 122 && p.y >= n.y && p.y <= n.y + 100);
  }

  function bindCanvas() {
    const wrap = $('#canvasWrap');

    wrap.addEventListener('dragover', e => {
      e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
      const p = canvasPos(e);
      document.querySelectorAll('.zone').forEach(z => z.classList.remove('drop'));
      document.querySelectorAll('.node').forEach(z => z.classList.remove('rackhover'));
      const z = DC.ZONES.find(zz => p.y >= zz.y && p.y < zz.y + zz.h);
      if (z) { const d = document.querySelector('.zone[data-zone="' + z.id + '"]'); if (d) d.classList.add('drop'); }
      const r = rackAt(p);
      if (r && nodeEls[r.nid]) nodeEls[r.nid].classList.add('rackhover');
    });
    wrap.addEventListener('dragleave', () => {
      document.querySelectorAll('.zone').forEach(z => z.classList.remove('drop'));
    });
    wrap.addEventListener('drop', e => {
      e.preventDefault();
      document.querySelectorAll('.zone').forEach(z => z.classList.remove('drop'));
      const type = e.dataTransfer.getData('text/plain');
      if (!DC.get(type)) return;
      const p = canvasPos(e);
      if (DC.get(type).intoRack) {
        const r = rackAt(p);
        if (!r) { toast('อุปกรณ์ IT ต้องวางบนตู้ Rack — ลากไปทับตู้', 'err'); return; }
        const res = SIM.addChild(r, type);
        if (!res.ok) { toast(res.msg, 'err'); return; }
        UI.sel = r; toast('ติดตั้ง ' + DC.get(type).name + ' ในตู้แล้ว', 'ok');
      } else {
        const n = SIM.addNode(type, Math.max(0, p.x - 61), Math.max(0, p.y - 39));
        const z = DC.ZONES.find(zz => n.y >= zz.y && n.y < zz.y + zz.h);
        if (z && z.id !== DC.get(type).zone) {
          const want = DC.ZONES.find(zz => zz.id === DC.get(type).zone);
          toast('หมายเหตุ: ปกติ ' + DC.get(type).name + ' จะอยู่ใน ' + (want ? want.name.split(' —')[0] : '?'));
        }
        UI.sel = n;
      }
      refresh();
    });

    // ลากอุปกรณ์ / คลิกเลือก / ต่อสาย
    nodesLayer.addEventListener('pointerdown', e => {
      const el = e.target.closest('.node'); if (!el) return;
      const n = SIM.model.nodes.find(x => x.nid === el.dataset.nid); if (!n) return;

      if (UI.mode === 'connect') { tryConnect(n); return; }

      UI.sel = n; UI.selLink = null;
      if (UI.mode === 'select') {
        const p0 = canvasPos(e);
        dragging = { n, dx: p0.x - n.x, dy: p0.y - n.y, moved: false };
        el.setPointerCapture(e.pointerId);
      }
      refresh();
    });

    window.addEventListener('pointermove', e => {
      if (!dragging) return;
      const p = canvasPos(e);
      dragging.n.x = Math.max(0, Math.min(1240 - 124, Math.round((p.x - dragging.dx) / 5) * 5));
      dragging.n.y = Math.max(0, Math.min(1045 - 100, Math.round((p.y - dragging.dy) / 5) * 5));
      dragging.moved = true;
      const el = nodeEls[dragging.n.nid];
      if (el) { el.style.left = dragging.n.x + 'px'; el.style.top = dragging.n.y + 'px'; }
      renderWires(SIM.rt || SIM.compute());
    });
    window.addEventListener('pointerup', () => { if (dragging) { dragging = null; refresh(); } });

    // คลิกเส้นสาย
    wires.addEventListener('click', e => {
      const p = e.target.closest('path[data-lid]'); if (!p) return;
      const l = SIM.model.links.find(x => x.lid === p.dataset.lid); if (!l) return;
      if (UI.mode === 'erase') { SIM.removeLink(l); toast('ลบสายแล้ว'); UI.selLink = null; }
      else { UI.selLink = l; UI.sel = null; }
      refresh();
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { UI.from = null; refresh(); }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
        if (UI.sel) { SIM.removeNode(UI.sel); UI.sel = null; refresh(); }
        else if (UI.selLink) { SIM.removeLink(UI.selLink); UI.selLink = null; refresh(); }
      }
    });
  }

  function tryConnect(n) {
    if (!UI.from) { UI.from = n; status('เลือกต้นทาง: ' + DC.get(n.type).name + ' — คลิกปลายทาง'); }
    else if (UI.from === n) { UI.from = null; status('ยกเลิกการต่อสาย'); }
    else {
      const kind = UI.kind === 'auto' ? SIM.linkKindFor(UI.from, n) : UI.kind;
      const l = kind ? SIM.addLink(UI.from, n, kind) : null;
      if (l) { toast('ต่อ' + DC.LINK_KINDS[l.kind].name + ': ' + DC.get(UI.from.type).name + ' → ' + DC.get(n.type).name, 'ok'); UI.from = null; }
      else {
        const allow = (DC.RULES[UI.kind === 'auto' ? 'power' : UI.kind] || {})[UI.from.type];
        toast('ต่อไม่ได้: ' + DC.get(UI.from.type).name + ' → ' + DC.get(n.type).name +
          (allow && allow.length ? ' (ต่อได้เฉพาะ ' + allow.map(t => DC.get(t).name).join(', ') + ')' : ' (หรือมีสายนี้อยู่แล้ว)'), 'err');
      }
    }
    UI.sel = n; refresh();
  }

  /* ===================================================== มุมมอง 3 มิติ */
  function setView(v) {
    UI.view = v;
    document.querySelectorAll('.btn.view').forEach(b => b.classList.toggle('active', b.dataset.view === v));
    $('#canvasWrap').classList.toggle('hidden', v === '3d');
    $('#view3dWrap').classList.toggle('hidden', v !== '3d');
    window.V3D.show(v === '3d');
    if (v === '3d') requestAnimationFrame(() => { window.V3D.resize(); });
    status(v === '3d'
      ? 'มุมมอง 3 มิติ: ลากเพื่อหมุน · Shift+ลากเพื่อเลื่อน · ล้อเมาส์เพื่อซูม · คลิกอุปกรณ์เพื่อดูรายละเอียด'
      : 'มุมมองผัง 2 มิติ: ลากจัดตำแหน่งอุปกรณ์และต่อสายได้');
    refresh();
  }

  function bind3D() {
    window.V3D.mount($('#cv3d'));
    $('#viewGroup').addEventListener('click', e => {
      const b = e.target.closest('.btn.view'); if (b) setView(b.dataset.view);
    });
    $('#hud3d').addEventListener('click', e => {
      const b = e.target.closest('[data-cam]'); if (b) window.V3D.setView(b.dataset.cam);
    });
    $('#hud3d').addEventListener('change', e => {
      const t = e.target; if (t.dataset.l3) window.V3D.opts[t.dataset.l3] = t.checked;
    });

    // คลิกเลือกอุปกรณ์ในภาพ 3 มิติ
    window.onPick3D = function (n) {
      if (!n) { UI.sel = null; UI.selLink = null; refresh(); return; }
      if (UI.mode === 'connect') { tryConnect(n); return; }
      UI.sel = n; UI.selLink = null;
      if (UI.tab === 'dash') { UI.tab = 'detail'; syncTabs(); }
      refresh();
    };

    // ลากองค์ประกอบจากคลังมาวางในภาพ 3 มิติ
    window.onDrop3D = function (type, mx, my, floor, picked) {
      const spec = DC.get(type); if (!spec) return;
      if (spec.intoRack) {
        if (!picked || picked.type !== 'rack') { toast('อุปกรณ์ IT ต้องวางบนตู้ Rack — ลากไปทับตู้ในภาพ 3 มิติ', 'err'); return; }
        const res = SIM.addChild(picked, type);
        if (!res.ok) { toast(res.msg, 'err'); return; }
        UI.sel = picked; toast('ติดตั้ง ' + spec.name + ' ในตู้แล้ว', 'ok');
      } else {
        if (!floor) { toast('วางตรงนี้ไม่ได้ — หมุนกล้องให้เห็นพื้นห้องก่อน', 'err'); return; }
        const p = window.V3D.worldToLayout(floor);
        UI.sel = SIM.addNode(type, Math.max(0, Math.min(1116, p.x)), Math.max(0, Math.min(945, p.y)));
      }
      refresh();
    };
  }

  /* ========================================================== node UI */
  function nodeVals(n, rt) {
    const S = DC.get(n.type).specs, v = [], R = n.rt || {};
    const num = DC.num, int = DC.int;
    switch (n.type) {
      case 'utility':
        v.push([SIM.model.utilityUp ? 'จ่ายไฟปกติ' : 'ไฟดับ', SIM.model.utilityUp ? 'good' : 'hot']);
        v.push([num(R.loadKw) + ' kW', '']); break;
      case 'transformer': case 'switchgear': case 'ats':
        v.push([num(R.loadKw) + ' / ' + int(S.capacityKw) + ' kW', R.overload ? 'hot' : '']); break;
      case 'generator':
        v.push([n.running ? 'เดินเครื่อง' : (n.startT > 0 ? 'กำลังสตาร์ท ' + num(n.startT, 0) + 'วิ' : 'พร้อมใช้'), n.running ? 'good' : '']);
        v.push(['น้ำมัน ' + num(n.fuel) + ' ชม.', n.fuel < 2 ? 'warn' : '']); break;
      case 'ups':
        v.push([num(R.loadKw) + ' / ' + int(S.capacityKw) + ' kW', R.overload ? 'hot' : '']);
        v.push(['แบต ' + num(n.battery, 0) + '%', n.battery < 25 ? 'hot' : (R.onBattery ? 'warn' : 'good')]);
        if (R.onBattery) v.push(['ใช้แบตเตอรี่', 'warn']);
        break;
      case 'pdu':
        v.push([num(R.loadKw) + ' / ' + int(S.capacityKw) + ' kW', R.overload ? 'hot' : '']); break;
      case 'chiller':
        v.push([int(R.produced) + ' / ' + int(S.coolKw) + ' kW', R.live ? '' : 'hot']);
        v.push(['ใช้ไฟ ' + num(R.kw) + ' kW', '']); break;
      case 'crah': case 'cdu':
        v.push([int(R.deliver) + ' / ' + int(R.cap || (n.type === 'crah' ? S.coolKw : S.coolKw)) + ' kW', R.live ? '' : 'hot']);
        v.push([(R.served || 0) + ' ตู้', '']); break;
      case 'pump': case 'coolingTower':
        v.push([R.live ? 'ทำงาน' : 'หยุด', R.live ? 'good' : 'hot']);
        v.push([num(R.kw) + ' kW', '']); break;
      case 'rack': {
        const used = n.children.reduce((s, c) => s + DC.get(c.type).specs.ru, 0);
        v.push([num(R.itKw) + ' kW', R.overDensity ? 'warn' : '']);
        v.push([num(n.temp, 0) + '°C', n.temp > DC.ENV.tempAlarm ? 'hot' : (n.temp > DC.ENV.ashraeMax ? 'warn' : 'good')]);
        v.push([used + 'U/42U', '']);
        if (R.deficitKw > 0.05) v.push(['ความเย็นขาด ' + num(R.deficitKw), 'hot']);
        if (!R.net && n.children.length) v.push(['ไม่มีเน็ต', 'warn']);
        if (n.tripped) v.push(['ตัดจากความร้อน', 'hot']);
        break;
      }
      case 'internet':
        v.push([S.gbps + ' Gbps', rt.netUp[n.nid] ? 'good' : 'hot']); break;
      case 'router': case 'firewall': case 'switchCore':
        v.push([rt.netUp[n.nid] ? 'ออนไลน์' : 'ออฟไลน์', rt.netUp[n.nid] ? 'good' : 'hot']);
        v.push([num(R.kw, 2) + ' kW', '']); break;
      case 'containment':
        v.push(['+' + (S.efficiencyGain * 100).toFixed(0) + '% ประสิทธิภาพ', 'good']); break;
      default:
        v.push([R.live ? 'ทำงาน' : 'ไม่มีไฟ', R.live ? 'good' : 'hot']);
        if (R.kw !== undefined) v.push([num(R.kw, 2) + ' kW', '']);
    }
    return v;
  }

  function nodeInner(n, rt) {
    const c = DC.get(n.type), R = n.rt || {};
    let bar = '';
    if (n.type === 'rack') {
      const slots = 42, cells = [];
      n.children.forEach(ch => {
        const s = DC.get(ch.type).specs.ru;
        const cls = ch.type === 'gpuServer' ? 'gpu' : ch.type === 'storage' ? 'sto' : ch.type === 'switchTor' ? 'tor' : 'on';
        for (let i = 0; i < s; i++) cells.push('<i class="' + cls + '"></i>');
      });
      const used = cells.length;
      for (let i = used; i < slots; i++) cells.push('<i></i>');
      bar = '<div class="ru">' + cells.join('') + '</div>';
    } else if (R.loadPct !== undefined) {
      const p = Math.min(100, R.loadPct || 0);
      const cls = p > 100 ? 'hot' : p > 85 ? 'warn' : 'good';
      bar = '<div class="bar"><i class="' + cls + '" style="width:' + p + '%"></i></div>';
    }
    const vals = nodeVals(n, rt).map(([t, k]) => '<span class="v ' + k + '">' + esc(t) + '</span>').join('');
    return `<div class="nh"><span class="g">${c.glyph}</span><b>${esc(c.name)}</b></div>
      <div class="nsub">${esc(c.th)}</div><div class="vals">${vals}</div>${bar}`;
  }

  function renderNodes(rt) {
    const seen = {};
    SIM.model.nodes.forEach(n => {
      seen[n.nid] = 1;
      let el = nodeEls[n.nid];
      if (!el) {
        el = document.createElement('div'); el.dataset.nid = n.nid;
        nodesLayer.appendChild(el); nodeEls[n.nid] = el;
      }
      const cls = ['node', 'cat-' + DC.catOf(n.type)];
      if (n.type === 'rack') cls.push('rack');
      if (UI.sel === n) cls.push('sel');
      if (n.failed) cls.push('failed');
      if (n.maintenance) cls.push('maint');
      if (DC.RULES.power[n.type] || n.type === 'rack' || ['crah', 'cdu', 'pump', 'coolingTower', 'chiller', 'router', 'firewall', 'switchCore', 'fire', 'security', 'dcim'].includes(n.type)) {
        if (!rt.powered[n.nid] && n.type !== 'utility') cls.push('dead');
      }
      if (UI.mode === 'connect' && UI.from) {
        if (UI.from === n) cls.push('linksrc');
        else if (SIM.linkKindFor(UI.from, n)) cls.push('linkable');
      }
      el.className = cls.join(' ');
      el.style.left = n.x + 'px'; el.style.top = n.y + 'px';
      el.innerHTML = nodeInner(n, rt);
    });
    Object.keys(nodeEls).forEach(k => { if (!seen[k]) { nodeEls[k].remove(); delete nodeEls[k]; } });
  }

  function renderWires(rt) {
    const by = {}; SIM.model.nodes.forEach(n => by[n.nid] = n);
    const W = 122, H = 78;
    let out = '';
    SIM.model.links.forEach(l => {
      const a = by[l.from], b = by[l.to]; if (!a || !b) return;
      const ah = a.type === 'rack' ? 96 : H, bh = b.type === 'rack' ? 96 : H;
      let x1, y1, x2, y2, c1, c2;
      if (b.y >= a.y + ah - 20) {
        x1 = a.x + W / 2; y1 = a.y + ah; x2 = b.x + W / 2; y2 = b.y;
        const m = (y2 - y1) / 2;
        c1 = `${x1},${y1 + m} ${x2},${y2 - m}`;
      } else if (a.y >= b.y + bh - 20) {
        x1 = a.x + W / 2; y1 = a.y; x2 = b.x + W / 2; y2 = b.y + bh;
        const m = (y1 - y2) / 2;
        c1 = `${x1},${y1 - m} ${x2},${y2 + m}`;
      } else if (b.x > a.x) {
        x1 = a.x + W; y1 = a.y + ah / 2; x2 = b.x; y2 = b.y + bh / 2;
        const m = Math.max(24, (x2 - x1) / 2);
        c1 = `${x1 + m},${y1} ${x2 - m},${y2}`;
      } else {
        x1 = a.x; y1 = a.y + ah / 2; x2 = b.x + W; y2 = b.y + bh / 2;
        const m = Math.max(24, (x1 - x2) / 2);
        c1 = `${x1 - m},${y1} ${x2 + m},${y2}`;
      }
      const d = `M${x1},${y1} C${c1} ${x2},${y2}`;
      let live = false;
      if (l.kind === 'power') live = rt.powered[a.nid] && rt.powered[b.nid];
      else if (l.kind === 'cool') live = (a.rt && a.rt.live !== false) && rt.powered[a.nid];
      else live = rt.netUp[a.nid] && rt.netUp[b.nid];
      const cls = 'k-' + l.kind + (live ? ' flow' : ' dim') + (UI.selLink === l ? ' selL' : '');
      out += `<path class="hit" data-lid="${l.lid}" d="${d}"></path><path class="${cls}" d="${d}"></path>`;
    });
    // เส้นประจากต้นทางที่กำลังเลือกในโหมดต่อสาย
    wires.innerHTML = out;
  }

  /* ============================================================== KPI */
  function renderKPIs(rt) {
    const t = [];
    const tierTxt = ['—', 'Tier I', 'Tier II', 'Tier III', 'Tier IV'][rt.tier];
    const coolPct = rt.heatTotal > 0 ? (rt.coolDelivered / rt.heatTotal) * 100 : 100;
    t.push(['โหลด IT', DC.num(rt.itKw) + '<small> kW</small>', rt.devices + ' อุปกรณ์ใน ' + rt.racks + ' ตู้', 'accent']);
    t.push(['ไฟรวมทั้งอาคาร', DC.num(rt.totalKw) + '<small> kW</small>', 'ความเย็น ' + DC.num(rt.coolKw) + ' · สูญเสีย ' + DC.num(rt.lossKw) + ' kW', '']);
    t.push(['PUE', rt.pue ? rt.pue.toFixed(3) : '—', rt.pue ? (rt.pue < 1.4 ? 'ดีมาก' : rt.pue < 1.6 ? 'ดี' : rt.pue < 2 ? 'พอใช้' : 'ต้องปรับปรุง') : 'ยังไม่มีโหลด IT',
      rt.pue && rt.pue < 1.5 ? 'good' : rt.pue > 1.9 ? 'err' : 'warn']);
    t.push(['ความเย็นที่ส่งถึง', DC.num(coolPct, 0) + '<small>%</small>', DC.num(rt.coolDelivered) + ' / ' + DC.num(rt.heatTotal) + ' kW',
      coolPct > 99.5 ? 'good' : coolPct > 90 ? 'warn' : 'err']);
    t.push(['อุณหภูมิเฉลี่ย', DC.num(rt.avgTemp, 1) + '<small> °C</small>', 'ASHRAE 18–27 °C',
      rt.avgTemp <= 27 ? 'good' : rt.avgTemp < 32 ? 'warn' : 'err']);
    t.push(['ความพร้อมใช้งาน', (rt.availability * 100).toFixed(3) + '<small>%</small>',
      'ดับ ~' + (rt.downtimeH < 1 ? DC.num(rt.downtimeH * 60, 0) + ' นาที' : DC.num(rt.downtimeH) + ' ชม.') + '/ปี',
      rt.availability > 0.9998 ? 'good' : rt.availability > 0.997 ? 'warn' : 'err']);
    t.push(['ระดับ Tier', tierTxt, rt.tierNote.slice(0, 42), rt.tier >= 3 ? 'good' : rt.tier >= 1 ? 'warn' : 'err']);
    t.push(['ค่าไฟ', DC.int(rt.energyMonth / 1000) + '<small> พัน฿/เดือน</small>',
      DC.int(rt.kwhMonth) + ' kWh · CO₂ ' + DC.int(rt.co2Month / 1000) + ' ตัน', '']);
    t.push(['Workload ให้บริการ', rt.totalPlaced + '<small>/' + rt.totalWant + '</small>',
      rt.vmDown ? 'ไม่ได้ให้บริการ ' + rt.vmDown + ' รายการ' : 'ครบทุกรายการ',
      rt.vmDown ? 'err' : 'good']);
    $('#kpis').innerHTML = t.map(([k, v, s, c]) =>
      `<div class="kpi ${c}"><div class="k">${esc(k)}</div><div class="v">${v}</div><div class="s" title="${esc(s)}">${esc(s)}</div></div>`).join('');
  }

  /* ======================================================= dashboard */
  function renderDash(rt) {
    const p = v => (rt.totalKw > 0 ? (v / rt.totalKw) * 100 : 0);
    const stageRows = rt.stages.map(s => {
      const level = s.n === 0 ? 'low' : s.n >= 2 ? '' : 'mid';
      const txt = s.n === 0 ? 'ไม่มีอุปกรณ์' : s.n + ' ชุด' + (s.n >= 2 ? ' (สำรองแล้ว)' : ' (ไม่มีสำรอง)');
      return `<div class="b"><div class="t"><span>${esc(s.key)}</span><span>${txt}</span></div>
        <div class="g"><i class="${level}" style="width:${(s.n ? s.a : 0) * 100}%"></i></div></div>`;
    }).join('');

    const drills = SIM.DRILLS.map((d, i) =>
      `<button class="drill" data-drill="${i}"><b>${d.glyph} ${esc(d.name)}</b><small>${esc(d.desc)}</small></button>`).join('');

    const alerts = rt.alerts.length
      ? rt.alerts.slice(0, 30).map(a => `<div class="alert ${a.level}"><span>${a.level === 'err' ? '⛔' : a.level === 'warn' ? '⚠' : 'ℹ'}</span><span>${esc(a.text)}</span></div>`).join('')
      : '<div class="alert ok"><span>✓</span><span>ระบบทำงานครบถ้วน ไม่มีข้อผิดพลาด</span></div>';

    $('#pDash').innerHTML = `
      <div class="card">
        <h3>การใช้พลังงาน <span>PUE ${rt.pue ? rt.pue.toFixed(3) : '—'}</span></h3>
        <div class="stack">
          <i class="it" style="width:${p(rt.itKw)}%"></i>
          <i class="cool" style="width:${p(rt.coolKw)}%"></i>
          <i class="loss" style="width:${p(rt.lossKw)}%"></i>
          <i class="other" style="width:${p(rt.otherKw)}%"></i>
        </div>
        <div class="lgnd">
          <span><i style="background:var(--it)"></i>IT ${DC.num(rt.itKw)} kW</span>
          <span><i style="background:var(--cool)"></i>ความเย็น ${DC.num(rt.coolKw)} kW</span>
          <span><i style="background:var(--power)"></i>สูญเสีย ${DC.num(rt.lossKw)} kW</span>
          <span><i style="background:#64748b"></i>อื่น ๆ ${DC.num(rt.otherKw)} kW</span>
        </div>
        <div class="row sep"><span>รวมทั้งอาคาร</span><b>${DC.num(rt.totalKw)} kW</b></div>
        <div class="row"><span>สูตร PUE</span><b>${DC.num(rt.totalKw)} ÷ ${DC.num(rt.itKw)}</b></div>
      </div>

      <div class="card">
        <h3>ระบบทำความเย็น</h3>
        <div class="row"><span>ภาระความร้อนจาก IT</span><b>${DC.num(rt.heatTotal)} kW</b></div>
        <div class="row"><span>ความเย็นที่ส่งถึงตู้</span><b>${DC.num(rt.coolDelivered)} kW</b></div>
        <div class="row"><span>กำลังรวมของ CRAH/CDU</span><b>${DC.num(rt.coolCapTotal)} kW</b></div>
        <div class="row"><span>กำลังรวมของ Chiller</span><b>${DC.num(rt.chillerCap)} kW</b></div>
        <div class="row"><span>Aisle Containment</span><b>${rt.containment ? 'มี (+22%)' : 'ไม่มี'}</b></div>
        <div class="row sep"><span>อุณหภูมิเฉลี่ยในตู้</span><b>${DC.num(rt.avgTemp, 1)} °C</b></div>
      </div>

      <div class="card">
        <h3>ความน่าเชื่อถือ <span>${(rt.availability * 100).toFixed(3)}%</span></h3>
        <div class="tier">
          ${[1, 2, 3, 4].map(i => `<div class="${rt.tier === i ? 'cur' : rt.tier > i ? 'on' : ''}">Tier ${['I', 'II', 'III', 'IV'][i - 1]}</div>`).join('')}
        </div>
        <div class="row"><span>ผลประเมิน</span><b>${rt.tier ? 'Tier ' + ['I', 'II', 'III', 'IV'][rt.tier - 1] : 'ไม่ผ่าน'}</b></div>
        <div style="font-size:11px;color:var(--txt2);line-height:1.5;margin:3px 0 6px">${esc(rt.tierNote)}</div>
        <div class="row"><span>เวลาที่ระบบดับต่อปี</span><b>${rt.downtimeH < 1 ? DC.num(rt.downtimeH * 60, 0) + ' นาที' : DC.num(rt.downtimeH) + ' ชม.'}</b></div>
        <div class="row"><span>ตู้รับไฟ 2 เส้นทาง</span><b>${rt.minFeeds >= 2 ? 'ครบทุกตู้' : 'ยังไม่ครบ'}</b></div>
        <div class="row"><span>N+1 ทุกชั้น</span><b>${rt.nPlus1 ? 'ใช่' : 'ไม่'}</b></div>
        <div class="row"><span>2N ทุกชั้น</span><b>${rt.twoN ? 'ใช่' : 'ไม่'}</b></div>
        <div class="bars" style="margin-top:7px">${stageRows}</div>
      </div>

      <div class="card">
        <h3>ต้นทุน</h3>
        <div class="row"><span>เงินลงทุนอุปกรณ์ (CapEx)</span><b>${DC.money(rt.capex)}</b></div>
        <div class="row"><span>ค่าไฟต่อเดือน</span><b>${DC.money(rt.energyMonth)}</b></div>
        <div class="row"><span>ค่าใช้จ่ายรวมต่อเดือน</span><b>${DC.money(rt.opexMonth)}</b></div>
        <div class="row"><span>พลังงานต่อเดือน</span><b>${DC.int(rt.kwhMonth)} kWh</b></div>
        <div class="row"><span>คาร์บอนต่อเดือน</span><b>${DC.int(rt.co2Month / 1000)} ตัน CO₂e</b></div>
        <div class="row sep"><span>รายได้จาก Workload</span><b>${DC.money(rt.revenueMonth)}</b></div>
        <div class="row"><span>กำไรขั้นต้นต่อเดือน</span><b style="color:${rt.revenueMonth - rt.opexMonth >= 0 ? '#86efac' : '#fca5a5'}">${DC.money(rt.revenueMonth - rt.opexMonth)}</b></div>
      </div>

      <div class="card">
        <h3>เหตุการณ์ฝึกซ้อม <span>คลิกเพื่อจำลอง</span></h3>
        <div class="drills">${drills}</div>
        <div class="btnrow"><button class="btn ghost" data-act="clearfail">↺ คืนสถานะอุปกรณ์ทั้งหมด</button></div>
      </div>

      <div class="card">
        <h3>แจ้งเตือน <span>${rt.alerts.length} รายการ</span></h3>
        ${alerts}
      </div>`;
  }

  /* ========================================================== detail */
  function showSpec(type) {
    const c = DC.get(type);
    UI.tab = 'detail'; syncTabs();
    $('#pDetail').innerHTML = `<div class="detail">
      <div class="dh"><span class="g">${c.glyph}</span><div><h3>${esc(c.name)}</h3><p>${esc(c.th)}</p></div></div>
      <p class="desc">${esc(c.desc)}</p>
      <div class="card"><h3>สเปก</h3><div class="chips">${specChips(type).map(s => `<span class="chip">${esc(s)}</span>`).join('')}</div>
        <div class="row"><span>เงินลงทุน</span><b>${DC.money(c.specs.capex || 0)}</b></div>
        <div class="row"><span>ความพร้อมใช้งานของชิ้นนี้</span><b>${c.specs.availability ? (c.specs.availability * 100).toFixed(3) + '%' : '—'}</b></div></div>
      <div class="card"><h3>หน้าที่ในระบบ</h3><p class="desc" style="margin:0">${esc(c.role)}</p></div>
      <div class="card"><h3>ประเด็นที่ต้องจำ</h3><ul>${c.teach.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>
      <div class="card"><h3>ต่อสายไปยัง</h3>
        ${['power', 'cool', 'net'].map(k => {
      const r = (DC.RULES[k] || {})[type];
      return r && r.length ? `<div class="row"><span>${DC.LINK_KINDS[k].name}</span><b style="font-family:var(--font)">${r.map(t => DC.get(t).name).join(', ')}</b></div>` : '';
    }).join('') || '<div class="row"><span>เป็นปลายทาง ไม่ต่อออกไปที่อื่น</span><b></b></div>'}
      </div></div>`;
  }

  function renderDetail(rt) {
    if (UI.selLink) {
      const l = UI.selLink, a = SIM.model.nodes.find(n => n.nid === l.from), b = SIM.model.nodes.find(n => n.nid === l.to);
      $('#pDetail').innerHTML = `<div class="detail"><div class="dh"><span class="g">🔗</span>
        <div><h3>${esc(DC.LINK_KINDS[l.kind].name)}</h3><p>${esc(DC.get(a.type).name)} → ${esc(DC.get(b.type).name)}</p></div></div>
        <div class="btnrow"><button class="btn danger" data-act="dellink">ลบสายนี้</button></div></div>`;
      return;
    }
    const n = UI.sel;
    if (!n) {
      $('#pDetail').innerHTML = `<div class="detail"><p class="desc">คลิกอุปกรณ์บนผัง หรือคลิกรายการในแถบซ้าย เพื่อดูรายละเอียด สเปก และประเด็นที่ต้องจำ</p>
        <div class="card"><h3>ปุ่มลัด</h3>
        <div class="row"><span>ลบอุปกรณ์/สายที่เลือก</span><b>Delete</b></div>
        <div class="row"><span>ยกเลิกการต่อสาย</span><b>Esc</b></div></div></div>`;
      return;
    }
    const c = DC.get(n.type), R = n.rt || {};
    let live = '';
    const row = (k, v) => `<div class="row"><span>${k}</span><b>${v}</b></div>`;
    if (n.type === 'rack') {
      const used = n.children.reduce((s, x) => s + DC.get(x.type).specs.ru, 0);
      live = row('สถานะไฟ', R.powered ? 'มีไฟ' : 'ไม่มีไฟ') +
        row('โหลด IT ในตู้', DC.num(R.itKw) + ' kW') +
        row('ความร้อนที่ต้องระบาย', DC.num(R.heatKw) + ' kW') +
        row('ความเย็นที่ได้รับ', DC.num(R.coolKw) + ' kW') +
        row('อุณหภูมิ', DC.num(n.temp, 1) + ' °C') +
        row('พื้นที่ใช้ไป', used + 'U / 42U') +
        row('เส้นทางไฟที่รับ', (R.feeds || 0) + ' เส้น (จาก UPS ' + (R.upsPaths || 0) + ' ชุด)') +
        row('ชุดทำความเย็นที่ต่อ', (R.coolUnits || 0) + ' ชุด') +
        row('เครือข่าย', R.net ? 'เชื่อมต่อแล้ว' : 'ไม่มีเส้นทาง') +
        `<div class="kidlist">${n.children.length ? n.children.map(ch =>
          `<div class="kid"><span>${DC.get(ch.type).glyph}</span><span>${esc(DC.get(ch.type).name)}</span>
            <span class="u">${DC.get(ch.type).specs.ru}U · ${DC.num((ch.util || 0) * 100, 0)}%</span>
            <span class="x" data-act="delkid" data-cid="${ch.cid}">✕</span></div>`).join('')
          : '<div style="font-size:11px;color:var(--txt3)">ยังไม่มีอุปกรณ์ในตู้ — ลากเซิร์ฟเวอร์จากแถบซ้ายมาวางบนตู้นี้</div>'}</div>
        <div class="btnrow">
          <button class="btn" data-act="addkid" data-type="server">+ Server</button>
          <button class="btn" data-act="addkid" data-type="gpuServer">+ GPU</button>
          <button class="btn" data-act="addkid" data-type="storage">+ Storage</button>
          <button class="btn" data-act="addkid" data-type="switchTor">+ ToR</button>
        </div>`;
    } else {
      if (R.loadKw !== undefined) live += row('โหลดที่ไหลผ่าน', DC.num(R.loadKw) + ' kW' + (R.capKw ? ' / ' + DC.int(R.capKw) + ' kW (' + DC.num(R.loadPct, 0) + '%)' : ''));
      if (R.lossKw) live += row('การสูญเสียเป็นความร้อน', DC.num(R.lossKw, 2) + ' kW');
      if (R.kw !== undefined) live += row('ไฟที่อุปกรณ์นี้ใช้', DC.num(R.kw, 2) + ' kW');
      if (R.produced !== undefined) live += row('ความเย็นที่ผลิต', DC.num(R.produced) + ' / ' + DC.int(R.cap) + ' kW');
      if (R.deliver !== undefined) live += row('ความเย็นที่ส่งออก', DC.num(R.deliver) + ' / ' + DC.int(R.cap) + ' kW');
      if (n.type === 'ups') live += row('แบตเตอรี่', DC.num(n.battery, 0) + '%' + (R.onBattery ? ' (กำลังใช้แบตเตอรี่)' : ''));
      if (n.type === 'generator') live += row('สถานะ', n.running ? 'เดินเครื่อง' : 'หยุด') + row('น้ำมันคงเหลือ', DC.num(n.fuel) + ' ชม.');
      if (n.type === 'utility') live += row('สถานะการจ่ายไฟ', SIM.model.utilityUp ? 'ปกติ' : 'ไฟดับ');
      live += row('มีไฟเลี้ยงอุปกรณ์', rt.powered[n.nid] ? 'ใช่' : 'ไม่');
    }
    const ups = SIM.model.links.filter(l => l.to === n.nid), dns = SIM.model.links.filter(l => l.from === n.nid);
    const nm = id => { const x = SIM.model.nodes.find(k => k.nid === id); return x ? DC.get(x.type).name : '?'; };

    $('#pDetail').innerHTML = `<div class="detail">
      <div class="dh"><span class="g">${c.glyph}</span><div><h3>${esc(c.name)}</h3><p>${esc(c.th)}</p></div></div>
      <div class="card"><h3>ค่าที่วัดได้ขณะนี้</h3>${live || '<div class="row"><span>ไม่มีค่าวัด</span><b></b></div>'}</div>
      <p class="desc">${esc(c.desc)}</p>
      <div class="card"><h3>สเปก</h3><div class="chips">${specChips(n.type).map(s => `<span class="chip">${esc(s)}</span>`).join('')}</div>
        ${row('เงินลงทุน', DC.money(c.specs.capex || 0))}</div>
      <div class="card"><h3>หน้าที่ในระบบ</h3><p class="desc" style="margin:0">${esc(c.role)}</p></div>
      <div class="card"><h3>ประเด็นที่ต้องจำ</h3><ul>${c.teach.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>
      <div class="card"><h3>การเชื่อมต่อ</h3>
        ${row('รับเข้า', ups.length ? ups.map(l => nm(l.from)).join(', ') : '—')}
        ${row('ส่งออก', dns.length ? dns.map(l => nm(l.to)).join(', ') : '—')}</div>
      <div class="btnrow">
        <button class="btn ${n.failed ? 'active' : ''}" data-act="fail">${n.failed ? '✓ คืนสภาพ' : '✕ จำลองอุปกรณ์เสีย'}</button>
        <button class="btn ${n.maintenance ? 'active' : ''}" data-act="maint">${n.maintenance ? '✓ เลิกซ่อมบำรุง' : '🔧 นำออกซ่อมบำรุง'}</button>
        <button class="btn danger" data-act="delnode">🗑 ลบอุปกรณ์</button>
      </div></div>`;
  }

  /* =========================================================== cloud */
  function renderCloud(rt) {
    const m = SIM.model;
    const wl = Object.keys(DC.WORKLOADS).map(k => {
      const w = DC.WORKLOADS[k];
      return `<div class="slider">
        <div class="t"><span>${w.glyph} ${esc(w.name)} <small style="color:var(--txt3)">${w.vcpu} vCPU / ${w.ramGb} GB${w.gpu ? ' / ' + w.gpu + ' GPU' : ''}</small></span>
          <b>${m.workloads[k]}</b></div>
        <input type="range" min="0" max="${k === 'ai' ? 200 : k === 'k8s' ? 8000 : k === 'db' ? 400 : 3000}" value="${m.workloads[k]}" data-wl="${k}">
        <div style="font-size:10px;color:var(--txt3);line-height:1.4">${esc(w.desc)} · ราคาขาย ${DC.int(w.priceMonth)} ฿/เดือน</div>
      </div>`;
    }).join('');

    $('#pCloud').innerHTML = `
      <div class="card">
        <h3>ชั้น Cloud — จัดสรรทรัพยากร</h3>
        <div style="font-size:11px;color:var(--txt2);line-height:1.5;margin-bottom:6px">
          กำหนดจำนวน Workload ที่ต้องการให้บริการ ระบบจะจัดลงเซิร์ฟเวอร์ที่ "มีไฟ + มีความเย็น + มีเครือข่าย" เท่านั้น
        </div>
        ${wl}
      </div>

      <div class="card">
        <h3>นโยบายการจัดวาง (Scheduler)</h3>
        <div class="slider"><div class="t"><span>ทราฟฟิกผู้ใช้ (Autoscaling ของ Web VM)</span><b>${m.opts.trafficPct}%</b></div>
          <input type="range" min="0" max="100" value="${m.opts.trafficPct}" data-opt="trafficPct"></div>
        <div class="slider"><div class="t"><span>อัตรา Overcommit ของ vCPU</span><b>${m.opts.overcommit}×</b></div>
          <input type="range" min="1" max="6" step="0.5" value="${m.opts.overcommit}" data-opt="overcommit"></div>
        <div class="row"><span>วิธีจัดวาง</span><b>
          <select data-opt="scheduler" style="min-width:150px">
            <option value="consolidate" ${m.opts.scheduler === 'consolidate' ? 'selected' : ''}>Consolidate (รวมงาน ประหยัดไฟ)</option>
            <option value="spread" ${m.opts.scheduler === 'spread' ? 'selected' : ''}>Spread (กระจาย ทนความเสียหาย)</option>
          </select></b></div>
        <label class="toggle"><input type="checkbox" data-opt="ha" ${m.opts.ha ? 'checked' : ''}>
          เปิด High Availability (ย้าย Workload อัตโนมัติเมื่อโฮสต์ล่ม)</label>
      </div>

      <div class="card">
        <h3>ผลการจัดสรร</h3>
        <div class="row"><span>เซิร์ฟเวอร์ทั้งหมด / พร้อมใช้งาน</span><b>${rt.hosts} / ${rt.healthyHosts}</b></div>
        <div class="row"><span>vCPU ที่จัดสรร / ที่มี</span><b>${DC.int(rt.vcpuUsed)} / ${DC.int(rt.vcpuCap)}</b></div>
        <div class="row"><span>อัตราการใช้ vCPU</span><b>${DC.num(pct(rt.vcpuUsed, rt.vcpuCap), 0)}%</b></div>
        <div class="row"><span>Workload ต่อเครื่อง (Consolidation)</span><b>${DC.num(rt.consolidation, 1)}</b></div>
        <div class="row sep"><span>ให้บริการได้ / ต้องการ</span><b>${rt.totalPlaced} / ${rt.totalWant}</b></div>
        <div class="row"><span>ไม่ได้ให้บริการ</span><b style="color:${rt.vmDown ? '#fca5a5' : '#86efac'}">${rt.vmDown}</b></div>
        ${Object.keys(rt.placed).map(k => `<div class="row"><span>${DC.WORKLOADS[k].glyph} ${esc(DC.WORKLOADS[k].name)}</span><b>${rt.placed[k]} / ${rt.want[k]}</b></div>`).join('')}
      </div>

      <div class="card">
        <h3>เศรษฐศาสตร์ของ Cloud</h3>
        <div class="row"><span>ต้นทุนดำเนินการต่อเดือน</span><b>${DC.money(rt.opexMonth)}</b></div>
        <div class="row"><span>ต้นทุนต่อ Workload ต่อเดือน</span><b>${DC.money(rt.costPerVm)}</b></div>
        <div class="row"><span>รายได้ตามราคาขาย</span><b>${DC.money(rt.revenueMonth)}</b></div>
        <div class="row sep"><span>กำไรขั้นต้น</span><b style="color:${rt.revenueMonth - rt.opexMonth >= 0 ? '#86efac' : '#fca5a5'}">${DC.money(rt.revenueMonth - rt.opexMonth)}</b></div>
        <div style="font-size:11px;color:var(--txt2);line-height:1.55;margin-top:6px">
          ลองเปรียบเทียบ: เลือก Consolidate แล้วดูว่า PUE และต้นทุนต่อ Workload ดีขึ้น
          แต่เมื่อกดเหตุการณ์ "ตู้ Rack ล่มทั้งตู้" จะมี Workload ดับมากกว่าแบบ Spread
          — นี่คือการแลกเปลี่ยนระหว่างประสิทธิภาพกับความทนทานที่ผู้ออกแบบ Cloud ต้องตัดสินใจ
        </div>
      </div>`;
  }

  /* ============================================================= log */
  function renderLog() {
    const m = SIM.model;
    const hints = (SIM.PRESETS[m.presetKey] || {}).hints;
    $('#pLog').innerHTML =
      (hints ? `<div class="card"><h3>คำใบ้ของแบบฝึกหัด</h3>${hints.map((h, i) =>
        `<div class="row"><span>${i + 1}. ${esc(h)}</span><b></b></div>`).join('')}</div>` : '') +
      `<div class="card"><h3>บันทึกเหตุการณ์ <span>${m.events.length} รายการ</span></h3>
        ${m.events.length ? m.events.map(e =>
        `<div class="logline ${e.level}"><span class="tm">${DC.clock(e.t).slice(3)}</span><span class="tx">${esc(e.text)}</span></div>`).join('')
        : '<div style="font-size:11px;color:var(--txt3)">ยังไม่มีเหตุการณ์</div>'}</div>`;
  }

  /* ====================================================== challenges */
  function renderChallenges(rt) {
    $('#challenges').innerHTML = SIM.CHALLENGES.map(c => {
      let done = false;
      try { done = !!c.check(rt, SIM.model); } catch (e) { done = false; }
      return `<div class="chal ${done ? 'done' : ''}" title="${esc(c.hint)}">
        <span class="mark">${done ? '✓' : '○'}</span>
        <span>${esc(c.text)}<small>${esc(c.hint)}</small></span></div>`;
    }).join('');
  }

  /* =========================================================== tabs */
  function syncTabs() {
    document.querySelectorAll('#rTabs .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === UI.tab));
    ['dash', 'detail', 'cloud', 'log'].forEach(t =>
      $('#p' + t.charAt(0).toUpperCase() + t.slice(1)).classList.toggle('active', t === UI.tab));
  }
  function bindRight() {
    $('#rTabs').onclick = e => {
      const b = e.target.closest('.tab'); if (!b) return;
      UI.tab = b.dataset.tab; syncTabs(); refresh();
    };

    // event delegation สำหรับปุ่มในแผงขวา
    $('#right').addEventListener('click', e => {
      const b = e.target.closest('[data-act],[data-drill]'); if (!b) return;
      const m = SIM.model;
      if (b.dataset.drill !== undefined) {
        const d = SIM.DRILLS[+b.dataset.drill];
        d.run(m); m.running = true;
        $('#btnPlay').textContent = '⏸ หยุดเวลา'; $('#btnPlay').classList.add('danger');
        SIM.log('warn', 'เริ่มการฝึกซ้อม: ' + d.name);
        toast(d.glyph + ' ' + d.name + ' — ' + d.teach);
        status(d.teach); refresh(); return;
      }
      switch (b.dataset.act) {
        case 'clearfail':
          m.nodes.forEach(n => { n.failed = false; n.maintenance = false; });
          m.utilityUp = true; m.opts.trafficPct = 50;
          SIM.log('ok', 'คืนสถานะอุปกรณ์ทั้งหมด'); toast('คืนสถานะอุปกรณ์ทั้งหมดแล้ว', 'ok'); break;
        case 'fail': if (UI.sel) { UI.sel.failed = !UI.sel.failed; SIM.log(UI.sel.failed ? 'err' : 'ok', DC.get(UI.sel.type).name + (UI.sel.failed ? ' ถูกตั้งเป็นเสีย' : ' กลับมาใช้งาน')); } break;
        case 'maint': if (UI.sel) { UI.sel.maintenance = !UI.sel.maintenance; } break;
        case 'delnode': if (UI.sel) { SIM.removeNode(UI.sel); UI.sel = null; } break;
        case 'dellink': if (UI.selLink) { SIM.removeLink(UI.selLink); UI.selLink = null; } break;
        case 'delkid':
          if (UI.sel) UI.sel.children = UI.sel.children.filter(c => c.cid !== b.dataset.cid); break;
        case 'addkid': {
          if (!UI.sel || UI.sel.type !== 'rack') break;
          const r = SIM.addChild(UI.sel, b.dataset.type);
          if (!r.ok) toast(r.msg, 'err'); break;
        }
      }
      refresh();
    });

    $('#right').addEventListener('input', e => {
      const m = SIM.model, t = e.target;
      if (t.dataset.wl) { m.workloads[t.dataset.wl] = +t.value; refresh(); }
      else if (t.dataset.opt) {
        const k = t.dataset.opt;
        m.opts[k] = t.type === 'checkbox' ? t.checked : (t.type === 'range' ? +t.value : t.value);
        refresh();
      }
    });
    $('#right').addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.opt === 'scheduler') { SIM.model.opts.scheduler = t.value; refresh(); }
      if (t.dataset.opt === 'ha') { SIM.model.opts.ha = t.checked; refresh(); }
    });
  }

  /* ========================================================== modal */
  function openModal(i) {
    UI.lesson = i;
    $('#modal').classList.remove('hidden');
    $('#lessonTabs').innerHTML = SIM.LESSONS.map((l, k) =>
      `<button data-l="${k}" class="${k === i ? 'active' : ''}">${esc(l.title.split(' —')[0])}</button>`).join('');
    const L = SIM.LESSONS[i];
    $('#lessonBody').innerHTML = `<h4>${esc(L.title)}</h4>${esc(L.body)}`;
  }
  function bindModal() {
    $('#lessonTabs').onclick = e => { const b = e.target.closest('button[data-l]'); if (b) openModal(+b.dataset.l); };
    $('#modal').onclick = e => { if (e.target.id === 'modal') $('#modal').classList.add('hidden'); };
  }

  /* ========================================================= refresh */
  function refresh() {
    const rt = SIM.compute();
    if (!window.V3D.visible) { renderNodes(rt); renderWires(rt); }
    renderKPIs(rt); renderChallenges(rt);
    if (UI.tab === 'dash') renderDash(rt);
    else if (UI.tab === 'detail') renderDetail(rt);
    else if (UI.tab === 'cloud') renderCloud(rt);
    else renderLog();
    $('#simClock').textContent = DC.clock(SIM.model.t);
  }
  window.refreshUI = refresh;

  /* ============================================================ loop */
  let last = performance.now(), uiAcc = 0;
  function loop(now) {
    const dtReal = Math.min(0.2, (now - last) / 1000); last = now;
    if (SIM.model.running) {
      let left = dtReal * SIM.model.speed, guard = 0;
      while (left > 0.0001 && guard++ < 20) { const step = Math.min(1, left); SIM.tick(step); left -= step; }
    }
    uiAcc += dtReal;
    if (uiAcc >= 0.15) { uiAcc = 0; if (!dragging) refresh(); else $('#simClock').textContent = DC.clock(SIM.model.t); }
    requestAnimationFrame(loop);
  }

  /* ============================================================ init */
  function init() {
    buildZones(); buildPalTabs(); buildPalette(); buildPresetSel();
    bindToolbar(); bindCanvas(); bindRight(); bindModal(); bind3D();
    SIM.loadPreset('tier1');
    status('โหลดแบบจำลอง Tier I — ลองกดปุ่มเล่นแล้วทดลองเหตุการณ์ "ไฟการไฟฟ้าดับ" ในแถบขวา');
    refresh();
    requestAnimationFrame(loop);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
