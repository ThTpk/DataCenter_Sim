/* =====================================================================
   scenarios.js — แบบจำลองสำเร็จรูป, เหตุการณ์ฝึกซ้อม, โจทย์ท้าทาย, บทเรียน
   ===================================================================== */
(function () {
  'use strict';
  const DC = window.DC, SIM = window.SIM;

  /* ================================================================
     PRESETS — แบบจำลองสำเร็จรูปสำหรับเริ่มบทเรียน
     รูปแบบ: nodes = [{t: type, x, y, tag, kids: [ชนิดอุปกรณ์ในตู้]}]
             links = [[tagต้นทาง, tagปลายทาง | [หลายปลายทาง]]]
     ================================================================ */
  const P = {};

  P.empty = {
    name: 'เริ่มจากศูนย์',
    sub: 'ผังว่าง — ออกแบบเองทั้งหมด',
    desc: 'ลากองค์ประกอบจากแถบซ้ายมาวางในโซนที่ถูกต้อง แล้วกด "เชื่อมต่ออัตโนมัติ" หรือใช้โหมดต่อสายเอง',
    nodes: [], links: []
  };

  P.tier1 = {
    name: 'Tier I — ระบบพื้นฐาน',
    sub: 'เส้นทางเดียว ไม่มีสำรอง · ~99.67%',
    desc: 'ครบทุกองค์ประกอบที่จำเป็นแต่ไม่มีอุปกรณ์สำรองเลย เหมาะใช้ชี้ให้เห็นว่า "ครบ" ไม่เท่ากับ "เชื่อถือได้"',
    nodes: [
      { t: 'utility', x: 40, y: 40, tag: 'u1' },
      { t: 'transformer', x: 200, y: 40, tag: 'tr1' },
      { t: 'switchgear', x: 40, y: 190, tag: 'sg1' },
      { t: 'ups', x: 230, y: 190, tag: 'ups1' },
      { t: 'pdu', x: 420, y: 190, tag: 'pdu1' },
      { t: 'coolingTower', x: 40, y: 350, tag: 'ct1' },
      { t: 'pump', x: 200, y: 350, tag: 'pm1' },
      { t: 'chiller', x: 360, y: 350, tag: 'ch1' },
      { t: 'crah', x: 520, y: 350, tag: 'crah1' },
      { t: 'rack', x: 60, y: 515, tag: 'r1', kids: ['switchTor', 'storage'], fill: { type: 'server', count: 16 } },
      { t: 'rack', x: 220, y: 515, tag: 'r2', kids: ['switchTor', 'storage'], fill: { type: 'server', count: 16 } },
      { t: 'rack', x: 380, y: 515, tag: 'r3', kids: ['switchTor', 'storage'], fill: { type: 'server', count: 16 } },
      { t: 'rack', x: 540, y: 515, tag: 'r4', kids: ['switchTor', 'storage'], fill: { type: 'server', count: 16 } },
      { t: 'internet', x: 40, y: 770, tag: 'isp1' },
      { t: 'router', x: 200, y: 770, tag: 'rt1' },
      { t: 'firewall', x: 360, y: 770, tag: 'fw1' },
      { t: 'switchCore', x: 520, y: 770, tag: 'core1' },
      { t: 'fire', x: 40, y: 930, tag: 'fire1' },
      { t: 'security', x: 200, y: 930, tag: 'sec1' },
      { t: 'dcim', x: 360, y: 930, tag: 'dcim1' }
    ],
    links: [
      ['u1', 'tr1'], ['tr1', 'sg1'],
      ['sg1', ['ups1', 'ch1', 'ct1', 'pm1', 'crah1', 'fire1', 'sec1', 'dcim1']],
      ['ups1', 'pdu1'], ['pdu1', ['r1', 'r2', 'r3', 'r4', 'core1', 'rt1', 'fw1']],
      ['ct1', 'ch1'], ['pm1', 'ch1'], ['ch1', 'crah1'], ['crah1', ['r1', 'r2', 'r3', 'r4']],
      ['isp1', 'rt1'], ['rt1', 'fw1'], ['fw1', 'core1'], ['core1', ['r1', 'r2', 'r3', 'r4']]
    ],
    workloads: { web: 600, db: 70, k8s: 2000, ai: 0 }
  };

  P.tier3 = {
    name: 'Tier III — N+1 สองเส้นทาง',
    sub: 'ซ่อมบำรุงได้ไม่ต้องดับระบบ · ~99.98%',
    desc: 'มาตรฐานที่ Data Center เชิงพาณิชย์ส่วนใหญ่ใช้: อุปกรณ์สำรอง N+1 ทุกชั้น และตู้ Rack รับไฟจาก 2 เส้นทาง',
    nodes: [
      { t: 'utility', x: 40, y: 40, tag: 'u1' },
      { t: 'transformer', x: 200, y: 40, tag: 'tr1' },
      { t: 'generator', x: 400, y: 40, tag: 'g1' },
      { t: 'ats', x: 600, y: 40, tag: 'ats1' },
      { t: 'switchgear', x: 40, y: 190, tag: 'sg1' },
      { t: 'ups', x: 210, y: 190, tag: 'ups1' },
      { t: 'ups', x: 380, y: 190, tag: 'ups2' },
      { t: 'pdu', x: 560, y: 190, tag: 'pdu1' },
      { t: 'pdu', x: 710, y: 190, tag: 'pdu2' },
      { t: 'coolingTower', x: 40, y: 350, tag: 'ct1' },
      { t: 'pump', x: 190, y: 350, tag: 'pm1' },
      { t: 'pump', x: 320, y: 350, tag: 'pm2' },
      { t: 'chiller', x: 450, y: 350, tag: 'ch1' },
      { t: 'chiller', x: 600, y: 350, tag: 'ch2' },
      { t: 'crah', x: 750, y: 350, tag: 'crah1' },
      { t: 'crah', x: 890, y: 350, tag: 'crah2' },
      { t: 'rack', x: 60, y: 505, tag: 'r1', kids: ['switchTor', 'storage'], fill: { type: 'server', count: 16 } },
      { t: 'rack', x: 220, y: 505, tag: 'r2', kids: ['switchTor', 'storage'], fill: { type: 'server', count: 16 } },
      { t: 'rack', x: 380, y: 505, tag: 'r3', kids: ['switchTor', 'storage'], fill: { type: 'server', count: 16 } },
      { t: 'rack', x: 540, y: 505, tag: 'r4', kids: ['switchTor', 'storage'], fill: { type: 'server', count: 16 } },
      { t: 'rack', x: 60, y: 615, tag: 'r5', kids: ['switchTor', 'storage'], fill: { type: 'server', count: 16 } },
      { t: 'rack', x: 220, y: 615, tag: 'r6', kids: ['switchTor', 'storage'], fill: { type: 'server', count: 16 } },
      { t: 'rack', x: 380, y: 615, tag: 'r7', kids: ['switchTor', 'storage', 'storage'], fill: { type: 'server', count: 14 } },
      { t: 'rack', x: 540, y: 615, tag: 'r8', kids: ['switchTor', 'storage', 'storage'], fill: { type: 'server', count: 14 } },
      { t: 'containment', x: 710, y: 505, tag: 'cont1' },
      { t: 'internet', x: 40, y: 770, tag: 'isp1' },
      { t: 'internet', x: 180, y: 770, tag: 'isp2' },
      { t: 'router', x: 330, y: 770, tag: 'rt1' },
      { t: 'firewall', x: 480, y: 770, tag: 'fw1' },
      { t: 'switchCore', x: 630, y: 770, tag: 'core1' },
      { t: 'switchCore', x: 790, y: 770, tag: 'core2' },
      { t: 'fire', x: 40, y: 930, tag: 'fire1' },
      { t: 'security', x: 200, y: 930, tag: 'sec1' },
      { t: 'dcim', x: 360, y: 930, tag: 'dcim1' }
    ],
    links: [
      ['u1', 'tr1'], ['tr1', 'ats1'], ['g1', 'ats1'], ['ats1', 'sg1'],
      ['sg1', ['ups1', 'ups2', 'ch1', 'ch2', 'ct1', 'pm1', 'pm2', 'crah1', 'crah2', 'fire1', 'sec1', 'dcim1']],
      ['ups1', ['pdu1', 'pdu2']], ['ups2', ['pdu1', 'pdu2']],
      ['pdu1', ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'core1', 'rt1', 'fw1']],
      ['pdu2', ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'core2']],
      ['ct1', ['ch1', 'ch2']], ['pm1', 'ch1'], ['pm2', 'ch2'],
      ['ch1', ['crah1', 'crah2']], ['ch2', ['crah1', 'crah2']],
      ['crah1', ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8']],
      ['crah2', ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8']],
      ['isp1', 'rt1'], ['isp2', 'rt1'], ['rt1', 'fw1'], ['fw1', ['core1', 'core2']],
      ['core1', ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8']],
      ['core2', ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8']]
    ],
    workloads: { web: 1100, db: 140, k8s: 4000, ai: 0 }
  };

  P.tier4 = {
    name: 'Tier IV — 2N ทนความเสียหาย',
    sub: 'สองระบบอิสระเต็มรูปแบบ · ~99.995%',
    desc: 'ทุกชั้นมีสองชุดแยกอิสระ (A-side / B-side) อุปกรณ์ชิ้นใดเสียก็ไม่กระทบบริการ ต้นทุนสูงที่สุด',
    nodes: [
      { t: 'utility', x: 40, y: 40, tag: 'uA' }, { t: 'utility', x: 180, y: 40, tag: 'uB' },
      { t: 'transformer', x: 330, y: 40, tag: 'trA' }, { t: 'transformer', x: 470, y: 40, tag: 'trB' },
      { t: 'generator', x: 620, y: 40, tag: 'gA' }, { t: 'generator', x: 760, y: 40, tag: 'gB' },
      { t: 'ats', x: 910, y: 40, tag: 'atsA' }, { t: 'ats', x: 1050, y: 40, tag: 'atsB' },
      { t: 'switchgear', x: 40, y: 190, tag: 'sgA' }, { t: 'switchgear', x: 190, y: 190, tag: 'sgB' },
      { t: 'ups', x: 350, y: 190, tag: 'upsA' }, { t: 'ups', x: 490, y: 190, tag: 'upsB' },
      { t: 'pdu', x: 650, y: 190, tag: 'pduA' }, { t: 'pdu', x: 790, y: 190, tag: 'pduB' },
      { t: 'coolingTower', x: 40, y: 350, tag: 'ctA' }, { t: 'coolingTower', x: 180, y: 350, tag: 'ctB' },
      { t: 'pump', x: 330, y: 350, tag: 'pmA' }, { t: 'pump', x: 450, y: 350, tag: 'pmB' },
      { t: 'chiller', x: 580, y: 350, tag: 'chA' }, { t: 'chiller', x: 720, y: 350, tag: 'chB' },
      { t: 'crah', x: 870, y: 350, tag: 'crA' }, { t: 'crah', x: 1010, y: 350, tag: 'crB' },
      { t: 'rack', x: 60, y: 505, tag: 'r1', kids: ['switchTor', 'switchTor', 'storage'], fill: { type: 'server', count: 15 } },
      { t: 'rack', x: 220, y: 505, tag: 'r2', kids: ['switchTor', 'switchTor', 'storage'], fill: { type: 'server', count: 15 } },
      { t: 'rack', x: 380, y: 505, tag: 'r3', kids: ['switchTor', 'switchTor', 'storage'], fill: { type: 'server', count: 15 } },
      { t: 'rack', x: 60, y: 615, tag: 'r4', kids: ['switchTor', 'switchTor', 'storage'], fill: { type: 'server', count: 15 } },
      { t: 'rack', x: 220, y: 615, tag: 'r5', kids: ['switchTor', 'switchTor', 'storage'], fill: { type: 'server', count: 15 } },
      { t: 'rack', x: 380, y: 615, tag: 'r6', kids: ['switchTor', 'switchTor', 'storage'], fill: { type: 'server', count: 15 } },
      { t: 'containment', x: 550, y: 505, tag: 'cont1' },
      { t: 'internet', x: 40, y: 770, tag: 'ispA' }, { t: 'internet', x: 180, y: 770, tag: 'ispB' },
      { t: 'router', x: 330, y: 770, tag: 'rtA' },
      { t: 'firewall', x: 480, y: 770, tag: 'fwA' },
      { t: 'switchCore', x: 630, y: 770, tag: 'coreA' }, { t: 'switchCore', x: 790, y: 770, tag: 'coreB' },
      { t: 'fire', x: 40, y: 930, tag: 'fire1' },
      { t: 'security', x: 200, y: 930, tag: 'sec1' },
      { t: 'dcim', x: 360, y: 930, tag: 'dcim1' }
    ],
    links: [
      ['uA', 'trA'], ['uB', 'trB'], ['trA', 'atsA'], ['trB', 'atsB'],
      ['gA', 'atsA'], ['gB', 'atsB'], ['atsA', 'sgA'], ['atsB', 'sgB'],
      ['sgA', ['upsA', 'chA', 'ctA', 'pmA', 'crA', 'fire1', 'sec1', 'dcim1']],
      ['sgB', ['upsB', 'chB', 'ctB', 'pmB', 'crB']],
      ['upsA', 'pduA'], ['upsB', 'pduB'],
      ['pduA', ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'coreA', 'rtA', 'fwA']],
      ['pduB', ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'coreB']],
      ['ctA', 'chA'], ['ctB', 'chB'], ['pmA', 'chA'], ['pmB', 'chB'],
      ['chA', 'crA'], ['chB', 'crB'],
      ['crA', ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']], ['crB', ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']],
      ['ispA', 'rtA'], ['ispB', 'rtA'], ['rtA', 'fwA'], ['fwA', ['coreA', 'coreB']],
      ['coreA', ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']], ['coreB', ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']]
    ],
    workloads: { web: 800, db: 100, k8s: 2900, ai: 0 }
  };

  P.ai = {
    name: 'AI Cluster — ความหนาแน่นสูง',
    sub: 'GPU + Liquid Cooling · 40 kW/ตู้',
    desc: 'ตู้ GPU กินไฟระดับ 28–40 kW ซึ่งลมเย็นระบายไม่ได้ ต้องใช้ Liquid Cooling (CDU) ใช้สอนเรื่อง Data Center ยุค AI',
    nodes: [
      { t: 'utility', x: 40, y: 40, tag: 'u1' },
      { t: 'transformer', x: 200, y: 40, tag: 'tr1' },
      { t: 'generator', x: 400, y: 40, tag: 'g1' },
      { t: 'ats', x: 600, y: 40, tag: 'ats1' },
      { t: 'switchgear', x: 40, y: 190, tag: 'sg1' },
      { t: 'ups', x: 210, y: 190, tag: 'ups1' },
      { t: 'ups', x: 350, y: 190, tag: 'ups2' },
      { t: 'ups', x: 490, y: 190, tag: 'ups3' },
      { t: 'pdu', x: 650, y: 190, tag: 'pdu1' },
      { t: 'pdu', x: 790, y: 190, tag: 'pdu2' },
      { t: 'coolingTower', x: 40, y: 350, tag: 'ct1' },
      { t: 'coolingTower', x: 180, y: 350, tag: 'ct2' },
      { t: 'pump', x: 330, y: 350, tag: 'pm1' },
      { t: 'pump', x: 450, y: 350, tag: 'pm2' },
      { t: 'chiller', x: 580, y: 350, tag: 'ch1' },
      { t: 'chiller', x: 720, y: 350, tag: 'ch2' },
      { t: 'cdu', x: 870, y: 350, tag: 'cdu1' },
      { t: 'cdu', x: 1010, y: 350, tag: 'cdu2' },
      { t: 'rack', x: 60, y: 505, tag: 'r1', kids: ['switchTor'], fill: { type: 'gpuServer', count: 8 } },
      { t: 'rack', x: 220, y: 505, tag: 'r2', kids: ['switchTor'], fill: { type: 'gpuServer', count: 8 } },
      { t: 'rack', x: 380, y: 505, tag: 'r3', kids: ['switchTor'], fill: { type: 'gpuServer', count: 8 } },
      { t: 'rack', x: 60, y: 615, tag: 'r4', kids: ['switchTor', 'storage', 'storage'], fill: { type: 'server', count: 14 } },
      { t: 'rack', x: 220, y: 615, tag: 'r5', kids: ['switchTor', 'storage', 'storage'], fill: { type: 'server', count: 14 } },
      { t: 'containment', x: 540, y: 505, tag: 'cont1' },
      { t: 'internet', x: 40, y: 770, tag: 'isp1' },
      { t: 'internet', x: 180, y: 770, tag: 'isp2' },
      { t: 'router', x: 330, y: 770, tag: 'rt1' },
      { t: 'firewall', x: 480, y: 770, tag: 'fw1' },
      { t: 'switchCore', x: 630, y: 770, tag: 'core1' },
      { t: 'switchCore', x: 790, y: 770, tag: 'core2' },
      { t: 'fire', x: 40, y: 930, tag: 'fire1' },
      { t: 'security', x: 200, y: 930, tag: 'sec1' },
      { t: 'dcim', x: 360, y: 930, tag: 'dcim1' }
    ],
    links: [
      ['u1', 'tr1'], ['tr1', 'ats1'], ['g1', 'ats1'], ['ats1', 'sg1'],
      ['sg1', ['ups1', 'ups2', 'ups3', 'ch1', 'ch2', 'ct1', 'ct2', 'pm1', 'pm2', 'cdu1', 'cdu2', 'fire1', 'sec1', 'dcim1']],
      ['ups1', ['pdu1', 'pdu2']], ['ups2', ['pdu1', 'pdu2']], ['ups3', ['pdu1', 'pdu2']],
      ['pdu1', ['r1', 'r2', 'r3', 'r4', 'r5', 'core1', 'rt1', 'fw1']],
      ['pdu2', ['r1', 'r2', 'r3', 'r4', 'r5', 'core2']],
      ['ct1', 'ch1'], ['ct2', 'ch2'], ['pm1', 'ch1'], ['pm2', 'ch2'],
      ['ch1', ['cdu1', 'cdu2']], ['ch2', ['cdu1', 'cdu2']],
      ['cdu1', ['r1', 'r2', 'r3', 'r4', 'r5']], ['cdu2', ['r1', 'r2', 'r3', 'r4', 'r5']],
      ['isp1', 'rt1'], ['isp2', 'rt1'], ['rt1', 'fw1'], ['fw1', ['core1', 'core2']],
      ['core1', ['r1', 'r2', 'r3', 'r4', 'r5']], ['core2', ['r1', 'r2', 'r3', 'r4', 'r5']]
    ],
    workloads: { web: 400, db: 12, k8s: 600, ai: 48 }
  };

  P.broken = {
    name: 'ผังที่มีข้อผิดพลาด',
    sub: 'แบบฝึกหัด: หาจุดบกพร่อง 5 จุด',
    desc: 'ผังนี้ดูเหมือนครบแต่มีข้อผิดพลาดซ่อนอยู่ ให้นักศึกษาอ่านแถบแจ้งเตือนและแก้ไขให้ระบบทำงานได้สมบูรณ์',
    nodes: [
      { t: 'utility', x: 40, y: 40, tag: 'u1' },
      { t: 'transformer', x: 200, y: 40, tag: 'tr1' },
      { t: 'switchgear', x: 40, y: 190, tag: 'sg1' },
      { t: 'ups', x: 230, y: 190, tag: 'ups1' },
      { t: 'pdu', x: 420, y: 190, tag: 'pdu1' },
      { t: 'chiller', x: 360, y: 350, tag: 'ch1' },
      { t: 'crah', x: 520, y: 350, tag: 'crah1' },
      { t: 'rack', x: 60, y: 515, tag: 'r1', kids: ['storage'], fill: { type: 'server', count: 17 } },
      { t: 'rack', x: 220, y: 515, tag: 'r2', kids: ['switchTor'], fill: { type: 'gpuServer', count: 8 } },
      { t: 'internet', x: 40, y: 770, tag: 'isp1' },
      { t: 'router', x: 200, y: 770, tag: 'rt1' },
      { t: 'switchCore', x: 520, y: 770, tag: 'core1' }
    ],
    links: [
      ['u1', 'tr1'], ['tr1', 'sg1'], ['sg1', ['ups1', 'ch1', 'crah1']],
      ['ups1', 'pdu1'], ['pdu1', ['r1', 'core1', 'rt1']],
      ['ch1', 'crah1'], ['crah1', 'r1'],
      ['isp1', 'rt1'], ['core1', 'r1']
    ],
    workloads: { web: 350, db: 40, k8s: 900, ai: 12 },
    hints: [
      'Rack #2 ไม่ได้ต่อสายไฟจาก PDU',
      'Rack #2 ไม่ได้ต่อความเย็น และตู้ GPU ต้องใช้ CDU ไม่ใช่ CRAH',
      'ขาด Firewall ระหว่าง Router กับ Core Switch ทำให้เส้นทางเครือข่ายไม่ต่อเนื่อง',
      'ขาดหอผึ่งเย็นและปั๊มน้ำเย็นของ Chiller',
      'ขาดระบบดับเพลิง / รักษาความปลอดภัย / DCIM และไม่มี Generator'
    ]
  };

  /* โหลด preset เข้าโมเดล */
  SIM.loadPreset = function (key) {
    const p = P[key];
    if (!p) return;
    SIM.model = SIM.newModel();
    const m = SIM.model;
    const tags = {};
    (p.nodes || []).forEach(d => {
      const n = SIM.addNode(d.t, d.x, d.y);
      if (d.tag) tags[d.tag] = n;
      (d.kids || []).forEach(k => SIM.addChild(n, k));
      if (d.fill) for (let i = 0; i < d.fill.count; i++) SIM.addChild(n, d.fill.type);
    });
    (p.links || []).forEach(([a, b]) => {
      const A = tags[a];
      (Array.isArray(b) ? b : [b]).forEach(t => { if (A && tags[t]) SIM.addLink(A, tags[t]); });
    });
    if (p.workloads) m.workloads = Object.assign({}, p.workloads);
    m.presetKey = key;
    SIM.log('info', 'โหลดแบบจำลอง: ' + p.name);
  };
  SIM.PRESETS = P;

  /* ================================================================
     DRILLS — เหตุการณ์ฝึกซ้อม
     ================================================================ */
  SIM.DRILLS = [
    {
      id: 'blackout', name: 'ไฟการไฟฟ้าดับ', glyph: '🌑',
      desc: 'ตัดไฟจากการไฟฟ้า ดูว่า UPS ครอบช่วงรอยต่อและ Generator รับโหลดทันหรือไม่',
      teach: 'ลำดับที่ถูกต้อง: ไฟดับ → UPS จ่ายจากแบตเตอรี่ทันที → Generator สตาร์ท ~10 วินาที → ATS สลับแหล่งจ่าย → UPS กลับมาชาร์จ ถ้าขาดอุปกรณ์ตัวใดในลำดับนี้ โหลด IT จะดับเมื่อแบตเตอรี่หมด',
      run: m => { m.utilityUp = false; SIM.log('err', '⚡ ไฟการไฟฟ้าดับ!'); }
    },
    {
      id: 'genfail', name: 'ไฟดับ + Generator สตาร์ทไม่ติด', glyph: '💥',
      desc: 'สถานการณ์จริงที่พบบ่อยที่สุด: ไฟดับแล้วเครื่องกำเนิดไฟฟ้าไม่ทำงาน',
      teach: 'นับเวลาจนแบตเตอรี่ UPS หมด นั่นคือเวลาทั้งหมดที่ทีมปฏิบัติการมีเพื่อแก้ปัญหา จึงต้องทดสอบเดินเครื่องแบบมีโหลดทุกเดือน',
      run: m => {
        m.utilityUp = false;
        m.nodes.filter(n => n.type === 'generator').forEach(g => g.failed = true);
        SIM.log('err', '⚡ ไฟดับ และ Generator สตาร์ทไม่ติด!');
      }
    },
    {
      id: 'chillerfail', name: 'Chiller เสีย 1 ชุด', glyph: '❄️',
      desc: 'เครื่องทำน้ำเย็นชุดหนึ่งหยุดทำงาน',
      teach: 'ถ้าออกแบบแบบ N+1 ชุดที่เหลือต้องรับภาระได้ทั้งหมด ถ้าเป็นแบบ N อุณหภูมิจะไต่ขึ้นและตู้จะตัดตัวเองในไม่กี่นาที',
      run: m => {
        const c = m.nodes.find(n => n.type === 'chiller' && !n.failed);
        if (c) { c.failed = true; SIM.log('err', '❄️ Chiller หยุดทำงาน'); }
      }
    },
    {
      id: 'coolingloss', name: 'ความเย็นหายทั้งระบบ', glyph: '🔥',
      desc: 'ปั๊มน้ำเย็นหยุดทำงานทั้งหมด — จำลอง thermal runaway',
      teach: 'ไม่มีการระบายความร้อน อุณหภูมิจะถึงจุดตัด 45 °C ในเวลาไม่กี่นาที ยิ่งตู้หนาแน่นยิ่งเร็ว นี่คือเหตุผลที่ปั๊มต้องต่อไฟสำรอง',
      run: m => {
        m.nodes.filter(n => n.type === 'pump').forEach(p => p.failed = true);
        SIM.log('err', '🔥 ปั๊มน้ำเย็นหยุดทำงานทั้งหมด');
      }
    },
    {
      id: 'upsfail', name: 'UPS เสีย 1 ชุด', glyph: '🔋',
      desc: 'UPS ชุดหนึ่งเสีย ทดสอบว่าโหลดย้ายไปอีกชุดได้หรือไม่',
      teach: 'ระบบ 2N จะไม่กระทบเลย ระบบ N จะทำให้ตู้ที่รับไฟจาก UPS ตัวนั้นดับทันที',
      run: m => {
        const u = m.nodes.find(n => n.type === 'ups' && !n.failed);
        if (u) { u.failed = true; SIM.log('err', '🔋 UPS ชุดหนึ่งเสีย'); }
      }
    },
    {
      id: 'pdufail', name: 'PDU เสีย 1 ตัว', glyph: '🔳',
      desc: 'ตู้จ่ายไฟย่อยตัวหนึ่งเสีย',
      teach: 'ตู้ Rack ที่รับไฟทางเดียว (single-corded) จะดับ ส่วนตู้ที่รับไฟสองทางจะยังทำงาน — นี่คือหัวใจของ Tier III',
      run: m => {
        const p = m.nodes.find(n => n.type === 'pdu' && !n.failed);
        if (p) { p.failed = true; SIM.log('err', '🔳 PDU เสีย'); }
      }
    },
    {
      id: 'hostfail', name: 'ตู้ Rack ล่มทั้งตู้', glyph: '🗃️',
      desc: 'จำลองตู้เสียหายทั้งตู้ เพื่อดูการทำงานของ HA บนชั้น Cloud',
      teach: 'เปิด HA แล้ว VM จะถูกจัดลงเครื่องที่เหลือ (ถ้ามีทรัพยากรว่าง) ปิด HA แล้ว VM บนตู้นั้นจะดับ — เหตุผลที่ต้องเผื่อกำลังสำรองไว้เสมอ',
      run: m => {
        const r = m.nodes.find(n => n.type === 'rack' && !n.failed && n.children.length);
        if (r) { r.failed = true; SIM.log('err', '🗃️ ตู้ Rack ล่มทั้งตู้'); }
      }
    },
    {
      id: 'corefail', name: 'Core Switch ล่ม', glyph: '🕸️',
      desc: 'สวิตช์แกนหลักตัวหนึ่งหยุดทำงาน',
      teach: 'ถ้ามี Core เดียว บริการจะขาดทั้งหมดแม้เครื่องยังเปิดอยู่ — "มีไฟ" ไม่เท่ากับ "ให้บริการได้"',
      run: m => {
        const s = m.nodes.find(n => n.type === 'switchCore' && !n.failed);
        if (s) { s.failed = true; SIM.log('err', '🕸️ Core Switch ล่ม'); }
      }
    },
    {
      id: 'spike', name: 'ทราฟฟิกพุ่ง 100%', glyph: '📈',
      desc: 'ปริมาณผู้ใช้เพิ่มสูงสุด ระบบ Autoscale จะเพิ่มจำนวน VM',
      teach: 'ดูว่า utilization, ไฟที่ใช้ และ PUE เปลี่ยนไปอย่างไร โหลดสูงขึ้นทำให้ PUE ดีขึ้น เพราะโหลดคงที่ของระบบถูกหารด้วยโหลด IT ที่มากขึ้น',
      run: m => { m.opts.trafficPct = 100; SIM.log('warn', '📈 ทราฟฟิกพุ่งสูงสุด'); }
    },
    {
      id: 'maint', name: 'ซ่อมบำรุง UPS ตามแผน', glyph: '🔧',
      desc: 'ปลด UPS ชุดหนึ่งออกเพื่อซ่อมบำรุง (ไม่ใช่ความเสียหาย)',
      teach: 'นี่คือการทดสอบคุณสมบัติ Concurrently Maintainable ของ Tier III: ต้องซ่อมได้โดยไม่กระทบบริการ',
      run: m => {
        const u = m.nodes.find(n => n.type === 'ups' && !n.maintenance);
        if (u) { u.maintenance = true; SIM.log('warn', '🔧 นำ UPS ออกจากระบบเพื่อซ่อมบำรุง'); }
      }
    }
  ];

  /* ================================================================
     CHALLENGES — โจทย์ที่ตรวจให้อัตโนมัติ
     ================================================================ */
  SIM.CHALLENGES = [
    {
      id: 'c1', text: 'ทำให้ทุกตู้ Rack มีไฟ ความเย็น และเครือข่ายครบ',
      hint: 'ตู้ต้องมีสาย 3 ชนิด: จาก PDU, จาก CRAH/CDU และจาก Core Switch',
      check: (rt, m) => rt.racks > 0 && !rt.alerts.some(a => a.level === 'err')
    },
    {
      id: 'c2', text: 'ทำให้ PUE ต่ำกว่า 1.55',
      hint: 'เพิ่ม Aisle Containment, ใช้ Liquid Cooling (CDU) และเพิ่มการใช้งานเซิร์ฟเวอร์ให้สูงขึ้น',
      check: rt => rt.pue > 0 && rt.pue < 1.55
    },
    {
      id: 'c3', text: 'ผ่านเกณฑ์ Tier III',
      hint: 'ต้องมี Generator + ATS, อุปกรณ์ N+1 ทุกชั้น และตู้ Rack รับไฟจาก PDU 2 ตัวที่มาจาก UPS ต่างชุด',
      check: rt => rt.tier >= 3
    },
    {
      id: 'c4', text: 'รองรับโหลด IT ตั้งแต่ 100 kW ขึ้นไปโดยไม่มีข้อผิดพลาด',
      hint: 'เพิ่มตู้และเซิร์ฟเวอร์ แล้วเพิ่ม Chiller/CRAH และ PDU ให้พอกับโหลด',
      check: (rt) => rt.itKw >= 100 && !rt.alerts.some(a => a.level === 'err')
    },
    {
      id: 'c5', text: 'รอดการฝึกซ้อม "ไฟดับ" โดยไม่มีตู้ใดดับ',
      hint: 'ต้องมี Generator ต่อผ่าน ATS และปั๊มน้ำเย็นต้องมีไฟด้วย',
      check: (rt, m) => !m.utilityUp && rt.racks > 0 && m.nodes.filter(n => n.type === 'rack').every(r => r.rt.powered && !r.tripped)
    },
    {
      id: 'c6', text: 'ให้บริการ Workload ครบทุกรายการ ขณะที่ตู้หนึ่งล่ม',
      hint: 'เปิด HA และเผื่อกำลังประมวลผลสำรองไว้ (ห้ามจัดเครื่องเต็ม 100%)',
      check: (rt, m) => rt.totalWant > 0 && rt.vmDown === 0 && m.nodes.some(n => n.type === 'rack' && (n.failed || n.maintenance))
    },
    {
      id: 'c7', text: 'ความพร้อมใช้งานของระบบเกิน 99.98%',
      hint: 'ความพร้อมใช้คิดจากทุกชั้นคูณกัน — ชั้นที่ไม่มีอุปกรณ์สำรองจะดึงค่ารวมลงมาก',
      check: rt => rt.availability >= 0.9998
    }
  ];

  /* ================================================================
     LESSONS — การ์ดบทเรียนสำหรับหน้าช่วยเหลือ
     ================================================================ */
  SIM.LESSONS = [
    {
      title: 'PUE — ตัวชี้วัดประสิทธิภาพพลังงาน',
      body: 'PUE = พลังงานรวมของสถานที่ ÷ พลังงานที่อุปกรณ์ IT ใช้\n\n' +
        'ค่า 1.0 คือสมบูรณ์แบบ (ไฟทุกหน่วยเข้าอุปกรณ์ IT) แต่ในทางปฏิบัติ:\n' +
        '• 1.8–2.2 = Data Center เก่าที่ไม่ได้ปรับปรุง\n' +
        '• 1.4–1.6 = ระดับที่ออกแบบดีในเขตร้อนแบบไทย\n' +
        '• 1.1–1.3 = Hyperscale ที่ใช้ free cooling / liquid cooling\n\n' +
        'ส่วนที่ทำให้เกิน 1.0 คือ (1) ไฟของระบบทำความเย็น (2) การสูญเสียใน UPS และหม้อแปลง (3) แสงสว่างและระบบประกอบอาคาร\n\n' +
        'ข้อสังเกตสำคัญ: PUE ดีขึ้นเมื่อโหลด IT สูงขึ้น เพราะโหลดคงที่ของสถานที่ถูกหารด้วยตัวเลขที่ใหญ่ขึ้น — Data Center ที่ใช้งานน้อยจึงมี PUE แย่'
    },
    {
      title: 'Redundancy — N, N+1, 2N',
      body: 'N = กำลังที่พอดีกับโหลดจริง ไม่มีสำรองเลย\n' +
        'N+1 = มีอุปกรณ์สำรองเพิ่ม 1 ชุด เสียได้ 1 ชุดโดยไม่กระทบ\n' +
        '2N = มีสองระบบแยกอิสระเต็มรูปแบบ (A-side / B-side)\n' +
        '2N+1 = สองระบบ และแต่ละระบบยังมีสำรองอีกชุด\n\n' +
        'กฎที่ต้องจำ: ความซ้ำซ้อนมีประโยชน์เฉพาะเมื่อ "ไม่มีจุดร่วม" — UPS สองชุดที่รับไฟจากตู้เมนเดียวกัน ยังล้มพร้อมกันได้\n\n' +
        'อุปกรณ์ IT ต้องมี Power Supply สองชุดต่อเข้า PDU คนละฝั่ง มิฉะนั้นการลงทุน 2N จะไม่เกิดประโยชน์'
    },
    {
      title: 'Tier Classification (Uptime Institute)',
      body: 'Tier I   — N, เส้นทางเดียว, 99.671% (ดับ ~28.8 ชม./ปี)\n' +
        'Tier II  — N+1, เส้นทางเดียว, 99.741% (~22 ชม./ปี)\n' +
        'Tier III — N+1, สองเส้นทาง, ซ่อมบำรุงได้ไม่ต้องดับ, 99.982% (~1.6 ชม./ปี)\n' +
        'Tier IV  — 2N, ทนความเสียหาย, 99.995% (~26 นาที/ปี)\n\n' +
        'คำว่า Concurrently Maintainable (Tier III) หมายถึง "ถอดอุปกรณ์ชิ้นใดออกซ่อมก็ได้โดยบริการไม่หยุด"\n' +
        'คำว่า Fault Tolerant (Tier IV) หมายถึง "อุปกรณ์เสียเองโดยไม่ได้วางแผนก็ยังไม่หยุด"\n\n' +
        'ต้นทุนเพิ่มขึ้นแบบก้าวกระโดด: จาก Tier III ไป Tier IV มักเพิ่มงบประมาณ 40–60%'
    },
    {
      title: 'ความร้อนและความหนาแน่น',
      body: 'ไฟฟ้าที่อุปกรณ์ IT ใช้เกือบ 100% แปลงเป็นความร้อน ดังนั้น ภาระความเย็น (kW) ≈ โหลด IT (kW)\n\n' +
        'ขีดจำกัดตามเทคโนโลยีระบายความร้อน:\n' +
        '• ลมเย็นทั่วไป: 5–10 kW/ตู้\n' +
        '• ลมเย็น + containment: 10–15 kW/ตู้\n' +
        '• Rear-door heat exchanger: 20–30 kW/ตู้\n' +
        '• Direct-to-chip liquid: 40–130 kW/ตู้\n' +
        '• Immersion: มากกว่า 150 kW/ตู้\n\n' +
        'ASHRAE แนะนำอุณหภูมิทางลมเข้า 18–27 °C การเดินระบบที่ปลายสูงช่วยประหยัดไฟแต่เหลือเวลารับมือ (ride-through) น้อยลงเมื่อความเย็นหาย'
    },
    {
      title: 'จาก Data Center สู่ Cloud Computing',
      body: 'Cloud คือการนำทรัพยากรของ Data Center มาแบ่งขายเป็นหน่วยย่อยด้วยซอฟต์แวร์\n\n' +
        '• Virtualization: รวมงานหลายงานลงเครื่องเดียว — เพราะเครื่องว่างก็ยังกินไฟ 30%\n' +
        '• Overcommit: จัดสรร vCPU เกินจำนวน CPU จริง เพราะงานไม่ได้ใช้เต็มพร้อมกัน\n' +
        '• Elasticity: เพิ่ม/ลดจำนวน instance ตามทราฟฟิกอัตโนมัติ\n' +
        '• High Availability: เมื่อโฮสต์ล่ม ตัวจัดตารางย้ายงานไปเครื่องที่เหลือ — ต้องเผื่อกำลังสำรองไว้เสมอ\n' +
        '• Region / Availability Zone: ความซ้ำซ้อนระดับอาคารและระดับภูมิภาค เพราะ Data Center หนึ่งหลังก็ยังล่มได้\n\n' +
        'หลักคิดสำคัญ: Tier ของอาคารแก้ปัญหาที่ชั้นกายภาพ แต่ Cloud แก้ปัญหาที่ชั้นซอฟต์แวร์ ระบบที่ออกแบบดีจะกระจายงานข้าม AZ จึงไม่จำเป็นต้องสร้าง Tier IV ทุกหลัง'
    },
    {
      title: 'วิธีใช้โปรแกรมจำลองนี้',
      body: '1) เลือกแบบจำลองสำเร็จรูปจากเมนูด้านบน หรือเริ่มจากผังว่าง\n' +
        '2) ลากองค์ประกอบจากแถบซ้ายมาวางในโซนที่ถูกต้อง (กรอบโซนจะเรืองแสงเมื่อลากถูกที่)\n' +
        '3) ลากอุปกรณ์ IT (เซิร์ฟเวอร์ สตอเรจ ToR) ไปวางทับบนตู้ Rack เพื่อติดตั้งในตู้\n' +
        '4) ใช้โหมด "ต่อสาย" แล้วคลิกต้นทาง → ปลายทาง หรือกด "เชื่อมต่ออัตโนมัติ"\n' +
        '5) กดปุ่มเล่นเพื่อเดินเวลา แล้วลองกดเหตุการณ์ฝึกซ้อมเพื่อดูผล\n' +
        '6) คลิกอุปกรณ์เพื่ออ่านรายละเอียด สเปก และประเด็นที่ต้องจำ\n\n' +
        'เคล็ดลับ: กดปุ่ม Delete เพื่อลบอุปกรณ์ที่เลือก, Shift+ลาก เพื่อลากผังทั้งหมด'
    }
  ];
})();
