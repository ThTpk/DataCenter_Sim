/* =====================================================================
   engine.js — เครื่องคำนวณการจำลอง Data Center
   โมเดล 3 ชั้นที่คำนวณต่อเนื่องกัน:
     1) Cloud layer   : จัด workload ลงเซิร์ฟเวอร์ -> ได้ utilization
     2) Power layer   : ไล่กระแสไฟจากแหล่งจ่าย -> รู้ว่าอะไรมีไฟ / โหลดเกิน
     3) Thermal layer : ความร้อนจาก IT เทียบกับความเย็นที่ส่งถึง -> อุณหภูมิ
   แล้วสรุปเป็นตัวชี้วัด: PUE, Availability, Tier, ต้นทุน
   ===================================================================== */
(function () {
  'use strict';

  const DC = window.DC;
  const SIM = (window.SIM = window.SIM || {});

  let seq = 1;
  const nid = () => 'n' + (seq++);

  /* ---------------------------------------------------------------- model */
  SIM.newModel = function () {
    return {
      nodes: [],
      links: [],
      workloads: { web: 0, db: 0, k8s: 0, ai: 0 },
      t: 0,
      running: false,
      speed: 4,
      utilityUp: true,
      opts: { ha: true, scheduler: 'consolidate', overcommit: 2, trafficPct: 50 },
      events: []
    };
  };
  SIM.model = SIM.newModel();

  SIM.log = function (level, text) {
    const m = SIM.model;
    m.events.unshift({ t: m.t, level, text });
    if (m.events.length > 160) m.events.pop();
  };

  /* --------------------------------------------------------------- nodes  */
  SIM.addNode = function (type, x, y) {
    const spec = DC.get(type);
    if (!spec) return null;
    const n = {
      nid: nid(), type, x: Math.round(x), y: Math.round(y),
      failed: false, maintenance: false,
      children: [],                       // ใช้กับ rack เท่านั้น
      temp: DC.ENV.setpoint,              // rack: อุณหภูมิ cold aisle
      tripped: false,                      // rack: ตัดตัวเองจากความร้อน
      battery: 100, depleted: false,       // ups
      running: false, startT: 0, fuel: spec.specs.fuelHours || 0  // generator
    };
    SIM.model.nodes.push(n);
    return n;
  };

  SIM.removeNode = function (n) {
    const m = SIM.model;
    m.links = m.links.filter(l => l.from !== n.nid && l.to !== n.nid);
    m.nodes = m.nodes.filter(x => x !== n);
  };

  SIM.addChild = function (rack, type) {
    if (rack.type !== 'rack') return { ok: false, msg: 'ติดตั้งอุปกรณ์ IT ได้เฉพาะในตู้ Rack' };
    const spec = DC.get(type);
    if (!spec || !spec.intoRack) return { ok: false, msg: 'อุปกรณ์นี้ไม่ได้ติดตั้งในตู้ Rack' };
    const used = rack.children.reduce((s, c) => s + DC.get(c.type).specs.ru, 0);
    if (used + spec.specs.ru > DC.get('rack').specs.ru)
      return { ok: false, msg: 'พื้นที่ในตู้ไม่พอ (เหลือ ' + (42 - used) + 'U)' };
    rack.children.push({ cid: nid(), type, util: 0.15 });
    return { ok: true };
  };

  /* --------------------------------------------------------------- links  */
  SIM.canLink = function (a, b, kind) {
    if (!a || !b || a === b) return false;
    const rule = DC.RULES[kind] && DC.RULES[kind][a.type];
    if (!rule || rule.indexOf(b.type) < 0) return false;
    return !SIM.model.links.some(l => l.from === a.nid && l.to === b.nid && l.kind === kind);
  };

  SIM.linkKindFor = function (a, b) {
    for (const k of ['power', 'cool', 'net']) if (SIM.canLink(a, b, k)) return k;
    return null;
  };

  SIM.addLink = function (a, b, kind) {
    const k = kind || SIM.linkKindFor(a, b);
    if (!k || !SIM.canLink(a, b, k)) return null;
    const l = { lid: nid(), from: a.nid, to: b.nid, kind: k };
    SIM.model.links.push(l);
    return l;
  };

  SIM.removeLink = function (l) { SIM.model.links = SIM.model.links.filter(x => x !== l); };

  /* เชื่อมต่ออัตโนมัติตามกฎ critical path — ช่วยนักศึกษาเริ่มต้นเร็ว */
  SIM.autoWire = function () {
    const m = SIM.model;
    const by = t => m.nodes.filter(n => n.type === t);
    const near = (list, n) => list.slice().sort((p, q) =>
      (Math.hypot(p.x - n.x, p.y - n.y)) - (Math.hypot(q.x - n.x, q.y - n.y)))[0];
    let made = 0;
    const join = (a, b, k) => { if (a && b && SIM.canLink(a, b, k)) { SIM.addLink(a, b, k); made++; } };

    // power chain
    by('utility').forEach(u => join(u, near(by('transformer'), u) || null, 'power'));
    by('transformer').forEach(tr => {
      const a = near(by('ats'), tr);
      if (a) join(tr, a, 'power'); else join(tr, near(by('switchgear'), tr), 'power');
    });
    by('generator').forEach(g => join(g, near(by('ats'), g), 'power'));
    by('ats').forEach(a => join(a, near(by('switchgear'), a), 'power'));
    by('switchgear').forEach(sg => {
      by('ups').forEach(u => join(sg, u, 'power'));
      ['chiller', 'coolingTower', 'pump', 'fire', 'security', 'dcim'].forEach(t =>
        by(t).forEach(x => join(sg, x, 'power')));
    });
    by('ups').forEach(u => by('pdu').forEach(p => join(u, p, 'power')));
    by('rack').forEach(r => { const p = near(by('pdu'), r); join(p, r, 'power'); });
    ['switchCore', 'router', 'firewall', 'crah', 'cdu'].forEach(t =>
      by(t).forEach(x => join(near(by('pdu'), x), x, 'power')));

    // cooling chain
    by('coolingTower').forEach(ct => by('chiller').forEach(ch => join(ct, ch, 'cool')));
    by('pump').forEach(p => by('chiller').forEach(ch => join(p, ch, 'cool')));
    by('chiller').forEach(ch => ['crah', 'cdu'].forEach(t => by(t).forEach(x => join(ch, x, 'cool'))));
    by('rack').forEach(r => {
      const dense = r.children.some(c => c.type === 'gpuServer');
      const unit = dense ? (near(by('cdu'), r) || near(by('crah'), r)) : (near(by('crah'), r) || near(by('cdu'), r));
      join(unit, r, 'cool');
    });

    // network chain
    by('internet').forEach(i => join(i, near(by('router'), i), 'net'));
    by('router').forEach(r => join(r, near(by('firewall'), r), 'net'));
    by('firewall').forEach(f => by('switchCore').forEach(s => join(f, s, 'net')));
    by('switchCore').forEach(s => by('rack').forEach(r => join(s, r, 'net')));

    SIM.log('info', 'เชื่อมต่ออัตโนมัติ ' + made + ' เส้น');
    return made;
  };

  /* ================================================================
     COMPUTE — คำนวณสถานะทั้งระบบจากโมเดลปัจจุบัน (steady state)
     ================================================================ */
  SIM.compute = function () {
    const m = SIM.model, E = DC.ENV;
    const byId = {}, outL = {}, inL = {};
    m.nodes.forEach(n => { byId[n.nid] = n; outL[n.nid] = []; inL[n.nid] = []; n.rt = {}; });
    m.links.forEach(l => {
      if (byId[l.from] && byId[l.to]) { outL[l.from].push(l); inL[l.to].push(l); }
    });
    const kids = (n, k) => outL[n.nid].filter(l => l.kind === k).map(l => byId[l.to]);
    const pars = (n, k) => inL[n.nid].filter(l => l.kind === k).map(l => byId[l.from]);
    const ok = n => n && !n.failed && !n.maintenance;
    const of = t => m.nodes.filter(n => n.type === t);
    const S = t => DC.get(t).specs;
    const alerts = [];
    const add = (level, text) => alerts.push({ level, text });

    /* ---------- 0) containment ---------- */
    const containment = of('containment').some(ok);
    const coolGain = containment ? 1 + S('containment').efficiencyGain : 1;

    /* ---------- 1) NETWORK reachability (ต้องรู้ก่อนจัด workload) ---------- */
    const netUp = {};
    (function () {
      const seeds = of('internet').filter(ok);
      const stack = seeds.slice();
      seeds.forEach(s => netUp[s.nid] = true);
      while (stack.length) {
        const n = stack.pop();
        kids(n, 'net').forEach(c => { if (ok(c) && !netUp[c.nid]) { netUp[c.nid] = true; stack.push(c); } });
      }
    })();

    /* ---------- 2) POWER reachability ---------- */
    const gens = of('generator');
    const powered = {};
    (function () {
      const seeds = [];
      if (m.utilityUp) of('utility').filter(ok).forEach(u => seeds.push(u));
      gens.filter(g => ok(g) && g.running && g.fuel > 0).forEach(g => seeds.push(g));
      const stack = seeds.slice();
      seeds.forEach(s => powered[s.nid] = true);
      while (stack.length) {
        const n = stack.pop();
        kids(n, 'power').forEach(c => { if (ok(c) && !powered[c.nid]) { powered[c.nid] = true; stack.push(c); } });
      }
      // UPS ที่ไฟต้นทางหาย แต่ยังมีแบตเตอรี่ -> ยังจ่ายไฟได้ (battery mode)
      let changed = true;
      while (changed) {
        changed = false;
        of('ups').forEach(u => {
          const live = powered[u.nid] && !u.onBatteryFlag;
          if (ok(u) && !live && u.battery > 0.2 && !u.depleted) {
            if (!powered[u.nid]) { powered[u.nid] = true; changed = true; }
            u.rt.onBattery = true;
            const stack2 = [u];
            while (stack2.length) {
              const n = stack2.pop();
              kids(n, 'power').forEach(c => {
                if (ok(c) && !powered[c.nid]) { powered[c.nid] = true; stack2.push(c); changed = true; }
              });
            }
          }
        });
      }
      of('ups').forEach(u => {
        const fedFromGrid = pars(u, 'power').some(p => ok(p) && powered[p.nid] && p.type !== 'ups');
        if (fedFromGrid) u.depleted = false;   // ไฟต้นทางกลับมาแล้ว แบตเตอรี่เริ่มชาร์จใหม่ได้
        u.rt.onBattery = ok(u) && !fedFromGrid && powered[u.nid];
      });
    })();

    /* ---------- 3) CLOUD : จัด workload ลงเซิร์ฟเวอร์ ---------- */
    const racks = of('rack');
    const hosts = [];   // เซิร์ฟเวอร์ทุกตัวที่ "มีอยู่"
    racks.forEach(r => {
      const live = ok(r) && powered[r.nid] && !r.tripped;
      const net = netUp[r.nid];
      r.children.forEach(c => {
        c.util = 0;
        if (c.type === 'server' || c.type === 'gpuServer') {
          hosts.push({ rack: r, dev: c, live, net, spec: DC.get(c.type) });
        }
      });
    });
    const healthy = hosts.filter(h => h.live && h.net);
    const oc = m.opts.overcommit;
    const capOf = h => ({
      vcpu: h.spec.specs.vcpu * oc,
      ram: h.spec.specs.ramGb * 1.0,
      gpu: h.spec.specs.gpu || 0,
      aVcpu: 0, aRam: 0, aGpu: 0
    });
    healthy.forEach(h => h.cap = capOf(h));

    // ความต้องการ: จำนวน VM ตามที่ผู้ใช้กำหนด (web ปรับตามทราฟฟิกเพื่อสอน autoscaling)
    const traffic = m.opts.trafficPct / 100;
    const want = {
      web: Math.max(0, Math.round(m.workloads.web * (0.4 + 1.2 * traffic))),
      db: m.workloads.db, k8s: m.workloads.k8s, ai: m.workloads.ai
    };
    const placedCount = { web: 0, db: 0, k8s: 0, ai: 0 };
    const order = ['ai', 'db', 'web', 'k8s'];
    order.forEach(wk => {
      const w = DC.WORKLOADS[wk];
      for (let i = 0; i < want[wk]; i++) {
        const pool = healthy.filter(h =>
          h.cap.aVcpu + w.vcpu <= h.cap.vcpu &&
          h.cap.aRam + w.ramGb <= h.cap.ram &&
          (w.gpu === 0 || h.cap.aGpu + w.gpu <= h.cap.gpu));
        if (!pool.length) break;
        pool.sort((a, b) => {
          const ua = a.cap.aVcpu / a.cap.vcpu, ub = b.cap.aVcpu / b.cap.vcpu;
          return m.opts.scheduler === 'consolidate' ? ub - ua : ua - ub;   // best-fit vs spread
        });
        const h = pool[0];
        h.cap.aVcpu += w.vcpu; h.cap.aRam += w.ramGb; h.cap.aGpu += w.gpu;
        placedCount[wk]++;
      }
    });
    // VM ที่จัดสรรไว้ไม่ได้ใช้ CPU เต็มตลอดเวลา สัดส่วนการใช้จริงขึ้นกับปริมาณทราฟฟิก
    const usage = 0.35 + 0.65 * traffic;
    healthy.forEach(h => {
      const byCpu = (h.cap.aVcpu * usage) / h.spec.specs.vcpu;
      const byGpu = h.cap.gpu ? (h.cap.aGpu / h.cap.gpu) * usage : 0;
      h.dev.util = Math.max(0, Math.min(1, Math.max(byCpu, byGpu)));
    });
    const totalWant = Object.values(want).reduce((a, b) => a + b, 0);
    const scheduled = Object.values(placedCount).reduce((a, b) => a + b, 0);
    let vmDown = totalWant - scheduled;
    if (!m.opts.ha && totalWant > 0) {
      // ไม่มี HA: VM ที่อยู่บนโฮสต์ที่ล่มจะไม่ถูกย้ายไปเครื่องอื่น จึงดับตามโฮสต์
      const deadFrac = hosts.length ? hosts.filter(h => !(h.live && h.net)).length / hosts.length : 0;
      vmDown = Math.max(vmDown, Math.round(totalWant * deadFrac));
    }
    const totalPlaced = Math.max(0, totalWant - vmDown);
    const servedRatio = scheduled > 0 ? totalPlaced / scheduled : 0;
    Object.keys(placedCount).forEach(k => placedCount[k] = Math.round(placedCount[k] * servedRatio));

    /* ---------- 4) โหลดไฟของอุปกรณ์ IT ---------- */
    let itKw = 0;
    racks.forEach(r => {
      const live = ok(r) && powered[r.nid] && !r.tripped;
      let kw = 0, ru = 0, devs = 0;
      r.children.forEach(c => {
        const s = DC.get(c.type).specs;
        ru += s.ru; devs++;
        if (c.type === 'storage') c.util = live ? 0.7 : 0;
        if (c.type === 'switchTor') c.util = live ? 0.5 : 0;
        if (live) kw += (s.idleW + (s.maxW - s.idleW) * (c.util || 0)) / 1000;
      });
      r.rt = Object.assign(r.rt, {
        itKw: kw, ru, devs, live,
        net: !!netUp[r.nid], powered: !!powered[r.nid],
        density: kw, overDensity: kw > S('rack').maxKw,
        hasTor: r.children.some(c => c.type === 'switchTor')
      });
      itKw += kw;
    });
    // อุปกรณ์เครือข่ายระดับห้องนับเป็นโหลด IT ตามนิยามของ PUE
    ['router', 'firewall', 'switchCore'].forEach(t => of(t).forEach(n => {
      const live = ok(n) && powered[n.nid];
      n.rt.kw = live ? S(t).powerW / 1000 : 0;
      n.rt.live = live; n.rt.net = !!netUp[n.nid];
      itKw += n.rt.kw;
    }));

    /* ---------- 5) THERMAL : ความเย็นที่ส่งถึงแต่ละตู้ ---------- */
    // Chiller จะผลิตน้ำเย็นได้ก็ต่อเมื่อมีไฟ + มีปั๊มน้ำเย็นเดินอยู่ + มีหอผึ่งเย็นทิ้งความร้อนได้
    const chillerLive = c => {
      if (!ok(c) || !powered[c.nid]) return false;
      const p = pars(c, 'cool');
      return p.some(x => x.type === 'pump' && ok(x) && powered[x.nid]) &&
             p.some(x => x.type === 'coolingTower' && ok(x) && powered[x.nid]);
    };
    const chillerCap = of('chiller').filter(chillerLive).reduce(s => s + S('chiller').coolKw, 0);
    const chillerPresent = of('chiller').length > 0;

    const units = [].concat(of('crah'), of('cdu')).map(u => {
      const fed = !chillerPresent ? false : pars(u, 'cool').some(p => p.type === 'chiller' && chillerLive(p));
      const live = ok(u) && powered[u.nid] && fed;
      const baseCap = u.type === 'crah' ? S('crah').coolKw * coolGain : S('cdu').coolKw;
      const served = kids(u, 'cool').filter(r => r.type === 'rack');
      return { u, live, cap: live ? baseCap : 0, served, demand: 0, deliver: 0 };
    });
    const coolUnitsPerRack = {};
    racks.forEach(r => coolUnitsPerRack[r.nid] = 0);
    units.forEach(x => { if (x.live) x.served.forEach(r => coolUnitsPerRack[r.nid]++); });
    units.forEach(x => {
      // ตู้หนึ่งที่มีชุดทำความเย็น 2 ชุด จะแบ่งภาระชุดละครึ่ง (N+1 ทำงานพร้อมกัน)
      x.shares = x.served.map(r => (r.rt.itKw || 0) / Math.max(1, coolUnitsPerRack[r.nid]));
      x.demand = x.shares.reduce((a, b) => a + b, 0);
    });
    let rawDeliver = 0;
    units.forEach(x => { x.deliver = Math.min(x.cap, x.demand); rawDeliver += x.deliver; });
    const chillerFactor = rawDeliver > 0 ? Math.min(1, chillerCap / rawDeliver) : 1;
    units.forEach(x => x.deliver *= chillerFactor);
    let airDeliver = 0, liqDeliver = 0;
    units.forEach(x => { if (x.u.type === 'cdu') liqDeliver += x.deliver; else airDeliver += x.deliver; });

    const rackCool = {};
    racks.forEach(r => rackCool[r.nid] = 0);
    units.forEach(x => {
      const tot = x.demand || 1;
      x.served.forEach((r, i) => { rackCool[r.nid] += x.deliver * ((x.shares[i] || 0) / tot); });
      x.u.rt = Object.assign(x.u.rt, {
        live: x.live, cap: x.cap, deliver: x.deliver,
        loadPct: x.cap ? (x.deliver / x.cap) * 100 : 0, served: x.served.length
      });
    });
    let heatTotal = 0, coolDelivered = 0;
    racks.forEach(r => {
      r.rt.heatKw = r.rt.itKw;
      r.rt.coolKw = rackCool[r.nid];
      r.rt.deficitKw = Math.max(0, r.rt.heatKw - r.rt.coolKw);
      heatTotal += r.rt.heatKw; coolDelivered += r.rt.coolKw;
    });

    /* ---------- 6) ไฟที่ระบบทำความเย็นใช้ ---------- */
    let coolKw = 0;
    // ภาระของเครื่องทำน้ำเย็น (Part Load Ratio) ใช้กำหนดรอบปั๊ม/พัดลม และประสิทธิภาพของ Chiller
    const plr = chillerCap > 0 ? Math.min(1, (airDeliver + liqDeliver) / chillerCap) : 0;
    // Chiller ที่เดินโหลดต่ำมีประสิทธิภาพแย่ลง (part-load performance)
    const copEff = S('chiller').cop * (0.70 + 0.30 * Math.min(1, plr * 2));
    // Liquid cooling ใช้น้ำอุ่นกว่า จึงได้ COP สูงกว่าประมาณ 45%
    const chillerElec = airDeliver / copEff + liqDeliver / (copEff * 1.45);
    of('chiller').forEach(c => {
      const live = chillerLive(c);
      const share = chillerCap > 0 ? S('chiller').coolKw / chillerCap : 0;
      c.rt = Object.assign(c.rt, {
        live, produced: live ? (airDeliver + liqDeliver) * share : 0, cap: S('chiller').coolKw,
        kw: live ? chillerElec * share : 0, copEff,
        loadPct: plr * 100
      });
      coolKw += c.rt.kw;
    });
    const fanTrim = containment ? 0.85 : 1;   // containment ทำให้พัดลมเดินรอบต่ำลง
    of('crah').forEach(u => {
      const l = u.rt.cap ? u.rt.deliver / u.rt.cap : 0;
      u.rt.kw = u.rt.live ? S('crah').fanKw * (0.30 + 0.70 * l) * fanTrim : 0;
      coolKw += u.rt.kw;
    });
    of('cdu').forEach(u => {
      const l = u.rt.cap ? u.rt.deliver / u.rt.cap : 0;
      u.rt.kw = u.rt.live ? S('cdu').pumpKw * (0.30 + 0.70 * l) : 0;
      coolKw += u.rt.kw;
    });
    of('pump').forEach(p => {   // ปั๊มใช้ VFD ปรับรอบตามภาระจริง
      p.rt.live = ok(p) && powered[p.nid];
      p.rt.kw = p.rt.live ? S('pump').powerKw * (0.25 + 0.75 * plr) : 0; coolKw += p.rt.kw;
    });
    of('coolingTower').forEach(ct => {
      ct.rt.live = ok(ct) && powered[ct.nid];
      ct.rt.kw = ct.rt.live ? S('coolingTower').fanKw * (0.25 + 0.75 * plr) : 0; coolKw += ct.rt.kw;
    });

    /* ---------- 7) โหลดอื่น ๆ และการสูญเสียในระบบจ่ายไฟ ---------- */
    let otherKw = DC.ENV.ancillaryKw + 0.25 * racks.length;   // แสงสว่าง/ปลั๊ก เพิ่มตามขนาดห้อง
    ['fire', 'security', 'dcim'].forEach(t => of(t).forEach(n => {
      n.rt.live = ok(n) && powered[n.nid];
      n.rt.kw = n.rt.live ? S(t).powerW / 1000 : 0;
      otherKw += n.rt.kw;
    }));

    // ไล่โหลดจากปลายทางขึ้นต้นทางเพื่อหา throughput ของอุปกรณ์จ่ายไฟแต่ละตัว
    const memo = {};
    function demandOf(n) {
      if (!n) return 0;
      if (memo[n.nid] !== undefined) return memo[n.nid];
      memo[n.nid] = 0;                       // กัน loop
      let own = 0;
      if (n.type === 'rack') own = n.rt.itKw || 0;
      else if (['router', 'firewall', 'switchCore', 'crah', 'cdu', 'pump', 'coolingTower', 'fire', 'security', 'dcim'].includes(n.type)) own = n.rt.kw || 0;
      else if (n.type === 'chiller') own = n.rt.kw || 0;
      let down = 0;
      kids(n, 'power').forEach(c => {
        // โหลดของอุปกรณ์ปลายทางถูกแบ่งตามจำนวนเส้นทางจ่ายไฟที่ยังมีไฟ (A-side / B-side)
        const feeders = pars(c, 'power').filter(x => ok(x) && powered[x.nid]).length || 1;
        down += demandOf(c) / feeders;
      });
      let total = own + down;
      const sp = S(n.type);
      if (sp && sp.efficiency) total = total / sp.efficiency;   // รวมการสูญเสียของอุปกรณ์ตัวนี้
      memo[n.nid] = total;
      return total;
    }
    m.nodes.forEach(n => {
      if (DC.RULES.power[n.type] || n.type === 'rack') {
        const d = demandOf(n);
        n.rt.loadKw = d;
        const cap = S(n.type).capacityKw;
        if (cap) { n.rt.capKw = cap; n.rt.loadPct = (d / cap) * 100; n.rt.overload = d > cap; }
      }
    });
    // การสูญเสีย = ไฟเข้า - ไฟออก ของอุปกรณ์ที่มีค่าประสิทธิภาพ
    let lossKw = 0;
    ['transformer', 'switchgear', 'ups', 'pdu'].forEach(t => of(t).forEach(n => {
      if (!powered[n.nid] || !ok(n)) { n.rt.lossKw = 0; return; }
      const e = S(t).efficiency || 1;
      const outKw = (n.rt.loadKw || 0) * e;
      n.rt.lossKw = (n.rt.loadKw || 0) - outKw;
      lossKw += n.rt.lossKw;
    }));

    const totalKw = itKw + coolKw + lossKw + otherKw;
    const pue = itKw > 0.01 ? totalKw / itKw : 0;

    /* ---------- 8) RELIABILITY & TIER ---------- */
    const cnt = t => of(t).filter(ok).length;
    const aOf = t => S(t).availability || 0.999;
    const par = (t, n) => (n <= 0 ? 0 : 1 - Math.pow(1 - aOf(t), n));

    let srcA = 0;
    if (cnt('utility') > 0) srcA = par('utility', cnt('utility'));
    if (cnt('generator') > 0 && of('ats').filter(ok).length > 0)
      srcA = 1 - (1 - srcA) * (1 - par('generator', cnt('generator')));

    const stages = [
      { key: 'แหล่งจ่ายไฟ', a: srcA, n: cnt('utility') + cnt('generator') },
      { key: 'หม้อแปลง', a: par('transformer', cnt('transformer')), n: cnt('transformer') },
      { key: 'ตู้เมนไฟฟ้า', a: par('switchgear', cnt('switchgear')), n: cnt('switchgear') },
      { key: 'UPS', a: par('ups', cnt('ups')), n: cnt('ups') },
      { key: 'PDU', a: par('pdu', cnt('pdu')), n: cnt('pdu') },
      { key: 'Chiller', a: par('chiller', cnt('chiller')), n: cnt('chiller') },
      { key: 'CRAH/CDU', a: par('crah', cnt('crah') + cnt('cdu')), n: cnt('crah') + cnt('cdu') },
      { key: 'ปั๊มน้ำเย็น', a: par('pump', cnt('pump')), n: cnt('pump') },
      { key: 'เครือข่ายขอบ', a: par('internet', cnt('internet')), n: cnt('internet') },
      { key: 'Core Switch', a: par('switchCore', cnt('switchCore')), n: cnt('switchCore') }
    ];
    let availability = 1;
    stages.forEach(s => { availability *= (s.n > 0 ? s.a : 0); });
    const downtimeH = (1 - availability) * 8760;

    // นับเส้นทางไฟของแต่ละตู้ (เพื่อตัดสิน concurrently maintainable / fault tolerant)
    racks.forEach(r => {
      const feeds = pars(r, 'power').filter(p => p.type === 'pdu');
      const upsSet = new Set();
      feeds.forEach(p => pars(p, 'power').forEach(u => { if (u.type === 'ups') upsSet.add(u.nid); }));
      r.rt.feeds = feeds.length;
      r.rt.upsPaths = upsSet.size;
      r.rt.coolUnits = pars(r, 'cool').filter(u => u.type === 'crah' || u.type === 'cdu').length;
    });

    const allRacksOk = racks.length > 0 && racks.every(r => r.rt.powered && r.rt.coolKw >= r.rt.heatKw - 0.01 && r.rt.net);
    const minFeeds = racks.length ? Math.min.apply(null, racks.map(r => r.rt.feeds)) : 0;
    const minUps = racks.length ? Math.min.apply(null, racks.map(r => r.rt.upsPaths)) : 0;
    const minCool = racks.length ? Math.min.apply(null, racks.map(r => r.rt.coolUnits)) : 0;
    const nPlus1 = ['ups', 'pdu', 'chiller', 'pump'].every(t => cnt(t) >= 2) && (cnt('crah') + cnt('cdu')) >= 2;
    const twoN = ['utility', 'transformer', 'switchgear', 'ats', 'generator', 'ups', 'chiller'].every(t => cnt(t) >= 2);

    let tier = 0, tierNote = 'ยังไม่ครบองค์ประกอบพื้นฐาน';
    if (allRacksOk) {
      tier = 1; tierNote = 'มีเส้นทางเดียว ไม่มีอุปกรณ์สำรอง — ต้องดับระบบเมื่อซ่อมบำรุง';
      if (cnt('generator') > 0 && cnt('ats') > 0 && nPlus1) {
        tier = 2; tierNote = 'มีอุปกรณ์สำรอง N+1 แต่เส้นทางจ่ายไฟยังเส้นเดียว';
        if (minFeeds >= 2 && minUps >= 2 && minCool >= 2) {
          tier = 3; tierNote = 'N+1 และมีสองเส้นทางจ่าย — ซ่อมบำรุงได้โดยไม่ดับระบบ (Concurrently Maintainable)';
          if (twoN) { tier = 4; tierNote = '2N ทุกชั้น — ทนความเสียหายได้โดยไม่กระทบบริการ (Fault Tolerant)'; }
        }
      }
    }

    /* ---------- 9) ต้นทุน ---------- */
    let capex = 0;
    m.nodes.forEach(n => {
      capex += S(n.type).capex || 0;
      n.children.forEach(c => capex += DC.get(c.type).specs.capex || 0);
    });
    const kwhMonth = totalKw * 24 * 30;
    const energyMonth = kwhMonth * DC.ENV.tariff;
    const isp = of('internet').length * (S('internet').opexMonth || 0);
    const opexMonth = energyMonth + isp;
    const co2Month = kwhMonth * 0.4999;   // ค่าการปล่อยของระบบไฟฟ้าไทย kgCO2e/kWh

    /* ---------- 10) ALERTS ---------- */
    if (!m.utilityUp) add('err', 'ไฟการไฟฟ้าดับ — ระบบกำลังใช้ไฟสำรอง');
    if (!racks.length) add('info', 'ยังไม่มีตู้ Rack — ลากตู้ Rack มาวางใน White Space แล้วใส่เซิร์ฟเวอร์');
    racks.forEach((r, i) => {
      const nm = 'Rack #' + (i + 1);
      if (!r.rt.powered) add('err', nm + ' ไม่มีไฟ — ต่อสายไฟจาก PDU');
      else if (r.tripped) add('err', nm + ' ตัดตัวเองจากความร้อนสูงเกิน (thermal shutdown)');
      if (r.rt.powered && r.rt.deficitKw > 0.05)
        add('err', nm + ' ความเย็นไม่พอ ขาด ' + DC.num(r.rt.deficitKw) + ' kW');
      if (!r.rt.net && r.rt.devs > 0) add('warn', nm + ' ไม่มีเส้นทางเครือข่าย — เครื่องทำงานแต่ให้บริการภายนอกไม่ได้');
      if (r.rt.devs > 0 && !r.rt.hasTor) add('warn', nm + ' ไม่มี ToR Switch — ควรมีสวิตช์ประจำตู้');
      const liquid = units.some(x => x.u.type === 'cdu' && x.served.indexOf(r) >= 0);
      if (r.rt.overDensity && !liquid)
        add('warn', nm + ' ความหนาแน่น ' + DC.num(r.rt.density) + ' kW เกิน 15 kW ที่ลมเย็นรับได้ — พิจารณา Liquid Cooling');
      if (r.temp > DC.ENV.ashraeMax && r.rt.powered)
        add(r.temp > DC.ENV.tempAlarm ? 'err' : 'warn', nm + ' อุณหภูมิ ' + DC.num(r.temp) + ' °C สูงกว่าช่วงที่ ASHRAE แนะนำ');
    });
    m.nodes.forEach(n => {
      if (n.rt.overload) add('err', DC.get(n.type).name + ' โหลด ' + DC.num(n.rt.loadKw) + ' kW เกินพิกัด ' + DC.int(n.rt.capKw) + ' kW');
      if (n.failed) add('err', DC.get(n.type).name + ' อยู่ในสถานะเสีย (failed)');
      if (n.maintenance) add('warn', DC.get(n.type).name + ' อยู่ในสถานะซ่อมบำรุง');
    });
    of('ups').forEach(u => {
      if (u.rt.onBattery) add('warn', 'UPS ทำงานด้วยแบตเตอรี่ เหลือ ' + DC.num(u.battery, 0) + '%');
      if (u.battery < 20 && u.rt.onBattery) add('err', 'แบตเตอรี่ UPS ใกล้หมด — ถ้า Generator ไม่รับโหลด ระบบจะดับ');
    });
    gens.forEach(g => { if (g.running) add('info', 'Generator เดินเครื่อง เหลือน้ำมัน ' + DC.num(g.fuel) + ' ชม.'); });
    if (chillerPresent && chillerFactor < 0.999 && rawDeliver > 0)
      add('err', 'กำลังทำความเย็นของ Chiller ไม่พอ (ผลิตได้ ' + DC.int(chillerCap) + ' kW จากที่ต้องการ ' + DC.int(rawDeliver) + ' kW)');
    if (racks.length && !of('chiller').length) add('err', 'ไม่มี Chiller — ไม่มีการทำความเย็นเลย');
    if (of('chiller').length && !of('coolingTower').length) add('err', 'Chiller ไม่มีหอผึ่งเย็น — ทิ้งความร้อนไม่ได้ จึงผลิตความเย็นไม่ได้');
    if (of('chiller').length && !of('pump').length) add('err', 'Chiller ไม่มีปั๊มน้ำเย็น — น้ำเย็นไหลไปถึง CRAH/CDU ไม่ได้');
    if (!of('fire').length) add('warn', 'ไม่มีระบบดับเพลิง — ไม่ผ่านมาตรฐานและประกันภัย');
    if (!of('security').length) add('warn', 'ไม่มีระบบรักษาความปลอดภัยทางกายภาพ');
    if (!of('dcim').length) add('info', 'ไม่มี DCIM — วัด PUE และเฝ้าระวังอุปกรณ์ไม่ได้');
    if (!containment && racks.length) add('info', 'ยังไม่มี Aisle Containment — เพิ่มได้เพื่อลด PUE โดยไม่กินไฟ');
    if (vmDown > 0) add('err', 'มี Workload ที่ไม่ได้ให้บริการ ' + vmDown + ' รายการ (ทรัพยากรไม่พอหรือโฮสต์ล่ม)');

    /* ---------- สรุป ---------- */
    const avgTemp = racks.length ? racks.reduce((s, r) => s + r.temp, 0) / racks.length : DC.ENV.setpoint;
    const vcpuCap = healthy.reduce((s, h) => s + h.cap.vcpu, 0);
    const vcpuUsed = healthy.reduce((s, h) => s + h.cap.aVcpu, 0);
    const revenueMonth = Object.keys(placedCount)
      .reduce((s, k) => s + placedCount[k] * DC.WORKLOADS[k].priceMonth, 0);

    return SIM.rt = {
      itKw, coolKw, lossKw, otherKw, totalKw, pue,
      heatTotal, coolDelivered,
      coolCapTotal: units.reduce((s, x) => s + x.cap, 0),
      chillerCap, chillerFactor, containment, plr, copEff, airDeliver, liqDeliver,
      availability, downtimeH, stages, tier, tierNote,
      nPlus1, twoN, minFeeds, minUps, minCool,
      capex, opexMonth, energyMonth, co2Month, kwhMonth,
      racks: racks.length, devices: racks.reduce((s, r) => s + r.children.length, 0),
      want, placed: placedCount, totalWant, totalPlaced, vmDown,
      hosts: hosts.length, healthyHosts: healthy.length,
      vcpuCap, vcpuUsed, consolidation: healthy.length ? totalPlaced / healthy.length : 0,
      revenueMonth, costPerVm: totalPlaced ? opexMonth / totalPlaced : 0,
      avgTemp, alerts, powered, netUp
    };
  };

  /* ================================================================
     TICK — อัปเดตสถานะที่เปลี่ยนตามเวลา (อุณหภูมิ แบตเตอรี่ เครื่องยนต์)
     ================================================================ */
  SIM.tick = function (dt) {
    const m = SIM.model, E = DC.ENV;
    m.t += dt;
    const rt = SIM.rt || SIM.compute();

    // Generator: สตาร์ทเมื่อไฟหลักดับ
    m.nodes.filter(n => n.type === 'generator').forEach(g => {
      const needed = !m.utilityUp;
      if (needed && !g.failed && !g.maintenance) {
        if (!g.running) {
          g.startT += dt;
          if (g.startT >= DC.get('generator').specs.startSec) {
            g.running = true;
            SIM.log('ok', 'Generator รับโหลดสำเร็จ (ใช้เวลา ' + DC.num(g.startT, 0) + ' วินาที)');
          }
        } else {
          g.fuel = Math.max(0, g.fuel - dt / 3600);
          if (g.fuel === 0 && g.running) { g.running = false; SIM.log('err', 'Generator น้ำมันหมด'); }
        }
      } else { if (g.running) SIM.log('info', 'Generator หยุดเดินเครื่อง (ไฟหลักกลับมา)'); g.running = false; g.startT = 0; }
    });

    // UPS: คายและชาร์จแบตเตอรี่
    m.nodes.filter(n => n.type === 'ups').forEach(u => {
      const cap = DC.get('ups').specs.capacityKw;
      const mins = DC.get('ups').specs.batteryMin;
      if (u.rt && u.rt.onBattery) {
        const loadFrac = Math.max(0.05, Math.min(1.5, (u.rt.loadKw || 0) / cap));
        const before = u.battery;
        u.battery = Math.max(0, u.battery - (100 / (mins * 60)) * (0.4 + 0.6 * loadFrac) * dt);
        if (before > 20 && u.battery <= 20) SIM.log('warn', 'แบตเตอรี่ UPS เหลือ 20%');
        if (before > 0 && u.battery === 0) { u.depleted = true; SIM.log('err', 'แบตเตอรี่ UPS หมด — โหลด IT ดับ'); }
      } else if (u.battery < 100 && !u.depleted) {
        u.battery = Math.min(100, u.battery + (100 / (45 * 60)) * dt);   // ชาร์จเต็มใน ~45 นาที
      }
    });

    // อุณหภูมิของแต่ละตู้
    const coolingBack = (SIM.rt && SIM.rt.chillerCap > 0);
    m.nodes.filter(n => n.type === 'rack').forEach(r => {
      const info = r.rt || {};
      if (r.tripped && r.temp < DC.ENV.ashraeMax && coolingBack) {
        r.tripped = false;
        SIM.log('ok', 'ตู้ Rack กลับมาทำงานหลังอุณหภูมิลดลงและความเย็นกลับมาแล้ว');
      }
      if (!info.powered) {
        r.temp += (E.ambient - r.temp) * 0.01 * dt;           // ไม่มีไฟ -> ไล่ตามอุณหภูมิห้อง
        return;
      }
      const heat = info.heatKw || 0, cool = info.coolKw || 0;
      if (heat <= 0.01) { r.temp += (E.setpoint - r.temp) * 0.05 * dt; return; }
      const deficit = (heat - cool) / heat;                    // -1 .. 1
      if (deficit > 0) {
        const rate = 0.12 * (1 + heat / 15);                   // ตู้ยิ่งหนาแน่น ยิ่งร้อนเร็ว
        r.temp += deficit * rate * dt;
      } else {
        const target = E.setpoint + 3 * Math.min(1, heat / 15);
        r.temp += (target - r.temp) * 0.06 * dt;
      }
      r.temp = Math.max(15, Math.min(90, r.temp));
      if (!r.tripped && r.temp >= E.tempTrip) {
        r.tripped = true;
        SIM.log('err', 'ตู้ Rack ตัดตัวเองที่ ' + DC.num(r.temp, 0) + ' °C เพื่อป้องกันความเสียหาย');
      }
    });
  };

  SIM.resetTransient = function () {
    SIM.model.nodes.forEach(n => {
      n.battery = 100; n.depleted = false; n.running = false; n.startT = 0;
      n.temp = DC.ENV.setpoint; n.tripped = false;
      n.fuel = DC.get(n.type).specs.fuelHours || 0;
      n.failed = false; n.maintenance = false;
    });
    SIM.model.utilityUp = true;
    SIM.model.t = 0;
  };
})();
