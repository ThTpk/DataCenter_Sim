/* =====================================================================
   view3d.js — มุมมอง 3 มิติของห้อง Data Center
   เขียน renderer เองบน Canvas 2D (ไม่พึ่งไลบรารีภายนอก จึงเปิดออฟไลน์ได้)
     • กล้องแบบ orbit: ลากเพื่อหมุน, Shift+ลาก เพื่อเลื่อน, ล้อเมาส์เพื่อซูม
     • วาดด้วย painter's algorithm + back-face culling + flat shading
     • สายไฟเดินบนรางเพดาน / ท่อน้ำเย็นเดินบนพื้น / สายสัญญาณบนรางสูงสุด
     • จุดไหลเวียนวิ่งตามสายเฉพาะเส้นที่มีกระแสจริง
   ===================================================================== */
(function () {
  'use strict';
  const DC = window.DC, SIM = window.SIM;
  const V3D = window.V3D = {};

  /* ----------------------------------------------------------- ค่าคงที่ */
  const S = 0.13;                                   // px ของผัง 2D -> หน่วยโลก
  let RW = 1240 * S, RD = 1045 * S;                 // ขนาดห้อง (คำนวณใหม่ตามผังจริง)
  let BX0 = 0, BZ0 = 0;                             // มุมซ้ายบนของห้องในพิกัดผัง 2D
  const Y_COOL = 2.2, Y_POWER = 46, Y_NET = 56;     // ระดับท่อ/ราง
  const LIGHT = norm({ x: -0.45, y: 0.82, z: -0.36 });

  /* รูปทรงของอุปกรณ์แต่ละชนิด: w กว้าง, h สูง, d ลึก */
  const GEO = {
    utility: { w: 9, h: 32, d: 9, kind: 'pylon' },
    transformer: { w: 17, h: 15, d: 15, kind: 'fins' },
    generator: { w: 27, h: 15, d: 14, kind: 'gen' },
    ats: { w: 11, h: 21, d: 9, kind: 'cab' },
    switchgear: { w: 23, h: 23, d: 11, kind: 'cab' },
    ups: { w: 17, h: 23, d: 11, kind: 'ups' },
    pdu: { w: 10, h: 21, d: 10, kind: 'cab' },
    coolingTower: { w: 19, h: 21, d: 19, kind: 'tower' },
    pump: { w: 11, h: 10, d: 10, kind: 'pump' },
    chiller: { w: 25, h: 16, d: 15, kind: 'chiller' },
    crah: { w: 14, h: 23, d: 13, kind: 'crah' },
    cdu: { w: 14, h: 21, d: 13, kind: 'cdu' },
    containment: { w: 46, h: 35, d: 24, kind: 'glass' },
    rack: { w: 12, h: 31, d: 17, kind: 'rack' },
    internet: { w: 7, h: 28, d: 7, kind: 'pylon' },
    router: { w: 14, h: 10, d: 12, kind: 'net' },
    firewall: { w: 14, h: 10, d: 12, kind: 'net' },
    switchCore: { w: 16, h: 12, d: 13, kind: 'net' },
    fire: { w: 10, h: 15, d: 10, kind: 'cab' },
    security: { w: 10, h: 13, d: 10, kind: 'cab' },
    dcim: { w: 12, h: 13, d: 10, kind: 'cab' }
  };

  const CATCOL = {
    power: [245, 158, 11], cooling: [34, 211, 238], it: [167, 139, 250],
    network: [52, 211, 153], support: [251, 113, 133]
  };
  const DEVCOL = { server: [109, 79, 240], gpuServer: [244, 114, 182], storage: [56, 189, 248], switchTor: [52, 211, 153] };

  /* -------------------------------------------------------- เวกเตอร์ */
  function norm(v) { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; }
  function rgb(c, k, a) {
    const f = x => Math.max(0, Math.min(255, Math.round(x * k)));
    return a === undefined ? `rgb(${f(c[0])},${f(c[1])},${f(c[2])})` : `rgba(${f(c[0])},${f(c[1])},${f(c[2])},${a})`;
  }
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  /* --------------------------------------------------------- สถานะ */
  const cam = V3D.cam = { yaw: -0.62, pitch: 0.52, dist: 250, tx: 0, ty: 10, tz: 6, fov: 760 };
  const opts = V3D.opts = { power: true, cool: true, net: true, labels: true, flow: true, zones: true };
  let cv = null, ctx = null, W = 0, H = 0, dpr = 1, raf = 0;
  let hover = null, picks = [];
  V3D.visible = false;

  /* ---------------------------------------------------- กล้อง & ฉาย */
  function toCam(x, y, z) {
    const dx = x - cam.tx, dy = y - cam.ty, dz = z - cam.tz;
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    const X = dx * cy - dz * sy, Z1 = dx * sy + dz * cy;
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    return { x: X, y: dy * cp - Z1 * sp, z: dy * sp + Z1 * cp + cam.dist };
  }
  function proj(p) {
    const c = toCam(p.x, p.y, p.z);
    if (c.z < 12) return null;
    const s = cam.fov / c.z;
    return { x: W / 2 + c.x * s, y: H / 2 + 22 - c.y * s, z: c.z, s: s };
  }
  // หมุนเวกเตอร์ (ไม่เลื่อนตำแหน่ง) ใช้ตรวจว่าหน้าไหนหันเข้าหากล้อง
  function rotV(v) {
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    const X = v.x * cy - v.z * sy, Z1 = v.x * sy + v.z * cy;
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    return { x: X, y: v.y * cp - Z1 * sp, z: v.y * sp + Z1 * cp };
  }
  // แปลงพิกัดบนจอกลับเป็นจุดบนพื้นห้อง (y = 0)
  function screenToFloor(px, py) {
    const dx = (px - W / 2) / cam.fov, dy = -(py - H / 2 - 22) / cam.fov;
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const den = dy * cp + sp;
    if (Math.abs(den) < 1e-4) return null;
    const t = (cam.dist * sp - cam.ty) / den;
    if (t <= 0) return null;
    const Xc = dx * t, Yc = dy * t, Zc = t - cam.dist;
    const Z1 = -Yc * sp + Zc * cp;
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    return { x: Xc * cy + Z1 * sy + cam.tx, z: -Xc * sy + Z1 * cy + cam.tz };
  }

  // ย่อ/ขยายห้องให้พอดีกับอุปกรณ์ที่วางอยู่ จะได้ไม่เหลือพื้นว่างเปล่า
  function updateBounds() {
    const ns = SIM.model.nodes;
    let x0 = 0, x1 = 1240, z0 = 0, z1 = 1045;
    if (ns.length) {
      x0 = 1e9; x1 = -1e9; z0 = 1e9; z1 = -1e9;
      ns.forEach(n => {
        x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x + 122);
        z0 = Math.min(z0, n.y); z1 = Math.max(z1, n.y + 96);
      });
      x0 -= 95; x1 += 95; z0 -= 70; z1 += 70;
      if (x1 - x0 < 560) { const c = (x0 + x1) / 2; x0 = c - 280; x1 = c + 280; }
      if (z1 - z0 < 460) { const c = (z0 + z1) / 2; z0 = c - 230; z1 = c + 230; }
    }
    BX0 = x0; BZ0 = z0; RW = (x1 - x0) * S; RD = (z1 - z0) * S;
  }
  const nodeW = n => ({ x: (n.x + 61 - BX0) * S - RW / 2, z: (n.y + 39 - BZ0) * S - RD / 2 });
  const geoOf = n => GEO[n.type] || { w: 12, h: 14, d: 12, kind: 'cab' };

  /* ------------------------------------------------------ รายการวาด */
  let list = [], labels = [];
  function addQuad(pts, fill, z, stroke, alpha) {
    const p = pts.map(proj); if (p.some(q => !q)) return;
    list.push({ t: 'q', p, fill, z, stroke, alpha });
  }
  function addLine(a, b, color, width, alpha, dash) {
    const pa = proj(a), pb = proj(b); if (!pa || !pb) return;
    list.push({ t: 'l', a: pa, b: pb, color, w: width * ((pa.s + pb.s) / 2), z: (pa.z + pb.z) / 2, alpha, dash });
  }
  function addDot(p, color, r) {
    const q = proj(p); if (!q) return;
    list.push({ t: 'c', p: q, color, r: Math.max(1, r * q.s), z: q.z - 0.6 });
  }

  /* กล่องสี่เหลี่ยม: ฐานอยู่ที่ (cx,cz) สูงจากพื้น h */
  const FACES = [
    { n: { x: 0, y: 1, z: 0 }, i: [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]] },   // บน
    { n: { x: 0, y: 0, z: -1 }, i: [[-1, 0, -1], [1, 0, -1], [1, 1, -1], [-1, 1, -1]] }, // หน้า
    { n: { x: 0, y: 0, z: 1 }, i: [[1, 0, 1], [-1, 0, 1], [-1, 1, 1], [1, 1, 1]] },      // หลัง
    { n: { x: -1, y: 0, z: 0 }, i: [[-1, 0, 1], [-1, 0, -1], [-1, 1, -1], [-1, 1, 1]] }, // ซ้าย
    { n: { x: 1, y: 0, z: 0 }, i: [[1, 0, -1], [1, 0, 1], [1, 1, 1], [1, 1, -1]] }       // ขวา
  ];

  function box(cx, cz, w, h, d, base, top, alpha, deco) {
    const hw = w / 2, hd = d / 2;
    FACES.forEach(f => {
      const nc = rotV(f.n);
      const ctr = { x: cx + f.n.x * hw, y: h * (f.n.y ? 1 : 0.5), z: cz + f.n.z * hd };
      const cc = toCam(ctr.x, ctr.y, ctr.z);
      if (nc.x * cc.x + nc.y * cc.y + nc.z * cc.z >= 0) return;          // หันหนีกล้อง
      const pts = f.i.map(([sx, sy, sz]) => ({ x: cx + sx * hw, y: sy * h, z: cz + sz * hd }));
      const lum = 0.58 + 0.52 * Math.max(0, f.n.x * LIGHT.x + f.n.y * LIGHT.y + f.n.z * LIGHT.z);
      const col = f.n.y ? top : base;
      const p = pts.map(proj); if (p.some(q => !q)) return;
      const zc = (p[0].z + p[1].z + p[2].z + p[3].z) / 4;
      list.push({ t: 'q', p, fill: rgb(col, lum, alpha), z: zc, stroke: rgb(col, lum * 1.45), lw: 0.9 });
      if (deco) deco(f, pts, zc - 0.25, lum);
    });
  }

  // จุดบนหน้าสี่เหลี่ยม (u,v ในช่วง 0..1) ด้วยการ interpolate มุมทั้งสี่
  function onFace(pts, u, v) {
    const a = pts[0], b = pts[1], c = pts[2], d = pts[3];
    const p = t => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
    const q = t => ({ x: d.x + (c.x - d.x) * t, y: d.y + (c.y - d.y) * t, z: d.z + (c.z - d.z) * t });
    const P = p(u), Q = q(u);
    return { x: P.x + (Q.x - P.x) * v, y: P.y + (Q.y - P.y) * v, z: P.z + (Q.z - P.z) * v };
  }
  function facePatch(pts, u0, v0, u1, v1, color, z) {
    const c = [onFace(pts, u0, v0), onFace(pts, u1, v0), onFace(pts, u1, v1), onFace(pts, u0, v1)].map(proj);
    if (c.some(q => !q)) return;
    list.push({ t: 'q', p: c, fill: color, z });
  }
  function faceDisc(pts, u, v, r, color, z) {
    const c = proj(onFace(pts, u, v)); if (!c) return;
    list.push({ t: 'c', p: c, color, r: r * c.s, z });
  }

  /* ------------------------------------------------------------ ฉาก */
  function buildFloor() {
    // พื้นห้อง
    addQuad([{ x: -RW / 2, y: 0, z: -RD / 2 }, { x: RW / 2, y: 0, z: -RD / 2 },
    { x: RW / 2, y: 0, z: RD / 2 }, { x: -RW / 2, y: 0, z: RD / 2 }], 'rgb(26,34,58)', 1e6, 'rgb(72,90,136)');
    // แถบโซน
    if (opts.zones) DC.ZONES.forEach((z, i) => {
      if (z.y + z.h < BZ0 || z.y > BZ0 + RD / S) return;
      const z0 = Math.max(-RD / 2, (z.y - BZ0) * S - RD / 2);
      const z1 = Math.min(RD / 2, (z.y + z.h - BZ0) * S - RD / 2);
      if (z1 - z0 < 1) return;
      addQuad([{ x: -RW / 2 + 1, y: 0.05, z: z0 }, { x: RW / 2 - 1, y: 0.05, z: z0 },
      { x: RW / 2 - 1, y: 0.05, z: z1 - 0.8 }, { x: -RW / 2 + 1, y: 0.05, z: z1 - 0.8 }],
        i % 2 ? 'rgba(48,62,104,.75)' : 'rgba(31,42,74,.75)', 1e6 - 1, 'rgba(78,98,146,.9)');
      const lp = proj({ x: -RW / 2 + 3, y: 0.2, z: z0 + 2.4 });
      if (lp) labels.push({ x: lp.x, y: lp.y, z: lp.z + 5e5, text: z.name.split(' —')[0], zone: true });
    });
    // เส้นกริดพื้น
    for (let gx = -RW / 2; gx <= RW / 2 + 0.1; gx += 13)
      addLine({ x: gx, y: 0.1, z: -RD / 2 }, { x: gx, y: 0.1, z: RD / 2 }, 'rgba(96,120,176,.22)', 0.7, 1);
    for (let gz = -RD / 2; gz <= RD / 2 + 0.1; gz += 13)
      addLine({ x: -RW / 2, y: 0.1, z: gz }, { x: RW / 2, y: 0.1, z: gz }, 'rgba(96,120,176,.22)', 0.7, 1);
  }

  function nodeColors(n, rt) {
    const cat = DC.catOf(n.type);
    let accent = CATCOL[cat] || [148, 163, 184];
    const dead = rt && !rt.powered[n.nid] && n.type !== 'utility' && n.type !== 'internet' && n.type !== 'containment';
    if (n.type === 'rack') {
      const t = Math.max(0, Math.min(1, (n.temp - DC.ENV.setpoint) / (DC.ENV.tempTrip - DC.ENV.setpoint)));
      accent = t < 0.5 ? mix([34, 211, 238], [250, 204, 21], t * 2) : mix([250, 204, 21], [239, 68, 68], (t - 0.5) * 2);
    }
    let base = mix(accent, [74, 90, 128], 0.58);
    if (n.failed) { base = [124, 46, 52]; accent = [239, 68, 68]; }
    else if (n.maintenance) { base = [120, 92, 34]; accent = [245, 158, 11]; }
    else if (dead) { base = mix(base, [66, 74, 98], 0.72); accent = mix(accent, [120, 132, 158], 0.62); }
    return { base, accent };
  }

  function buildNode(n, rt) {
    const g = geoOf(n), w = nodeW(n), col = nodeColors(n, rt);
    const sel = window.UI && UI.sel === n, hov = hover === n;

    // เงาใต้ตัวอุปกรณ์ ช่วยให้เห็นว่าวางอยู่ตรงไหนบนพื้น
    const sw = g.w * 0.72, sd = g.d * 0.72;
    addQuad([{ x: w.x - sw, y: 0.18, z: w.z - sd }, { x: w.x + sw, y: 0.18, z: w.z - sd },
    { x: w.x + sw, y: 0.18, z: w.z + sd }, { x: w.x - sw, y: 0.18, z: w.z + sd }], 'rgba(3,6,14,.5)', 1e5);

    if (g.kind === 'glass') {                                   // Aisle containment โปร่งแสง
      box(w.x, w.z, g.w, g.h, g.d, [120, 190, 230], [150, 215, 245], 0.12);
      const hw = g.w / 2, hd = g.d / 2;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz], i, arr) => {
        const [nx, nz] = arr[(i + 1) % 4];
        addLine({ x: w.x + sx * hw, y: g.h, z: w.z + sz * hd }, { x: w.x + nx * hw, y: g.h, z: w.z + nz * hd }, 'rgba(125,211,252,.55)', 1.2, 1);
        addLine({ x: w.x + sx * hw, y: 0, z: w.z + sz * hd }, { x: w.x + sx * hw, y: g.h, z: w.z + sz * hd }, 'rgba(125,211,252,.4)', 1, 1);
      });
    } else {
      box(w.x, w.z, g.w, g.h, g.d, col.base, col.accent, 1, (f, pts, z, lum) => decorate(n, g, f, pts, z, lum, col, rt));
    }

    // กรอบเน้นเมื่อเลือก / ชี้
    if (sel || hov) {
      const hw = g.w / 2 + 1.2, hd = g.d / 2 + 1.2, hh = g.h + 1.2;
      const c = sel ? 'rgba(125,211,252,.95)' : 'rgba(167,139,250,.7)';
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz], i, arr) => {
        const [nx, nz] = arr[(i + 1) % 4];
        addLine({ x: w.x + sx * hw, y: hh, z: w.z + sz * hd }, { x: w.x + nx * hw, y: hh, z: w.z + nz * hd }, c, 1.6, 1);
        addLine({ x: w.x + sx * hw, y: 0.2, z: w.z + sz * hd }, { x: w.x + nx * hw, y: 0.2, z: w.z + nz * hd }, c, 1.3, 1);
        addLine({ x: w.x + sx * hw, y: 0.2, z: w.z + sz * hd }, { x: w.x + sx * hw, y: hh, z: w.z + sz * hd }, c, 1.1, 1);
      });
    }

    // ป้ายชื่อ + ค่าที่วัดได้
    if (opts.labels || sel || hov) {
      const p = proj({ x: w.x, y: g.h + 3.5, z: w.z });
      if (p) labels.push({ x: p.x, y: p.y, z: p.z, node: n, text: DC.get(n.type).name, sub: liveText(n, rt), sel, hov });
    }
    // เก็บกรอบไว้ใช้คลิกเลือก
    const corners = [];
    for (const sx of [-1, 1]) for (const sy of [0, 1]) for (const sz of [-1, 1]) {
      const q = proj({ x: w.x + sx * g.w / 2, y: sy * g.h, z: w.z + sz * g.d / 2 });
      if (q) corners.push(q);
    }
    if (corners.length) {
      picks.push({
        n, x0: Math.min(...corners.map(c => c.x)), x1: Math.max(...corners.map(c => c.x)),
        y0: Math.min(...corners.map(c => c.y)), y1: Math.max(...corners.map(c => c.y)),
        z: Math.min(...corners.map(c => c.z))
      });
    }
  }

  /* รายละเอียดบนผิวอุปกรณ์แต่ละชนิด */
  function decorate(n, g, f, pts, z, lum, col, rt) {
    const k = g.kind;
    if (k === 'rack' && (f.n.z === -1 || f.n.z === 1)) {
      // ประตูตู้: ช่อง U ทั้ง 42 ช่อง ไล่จากบนลงล่าง
      facePatch(pts, 0.06, 0.04, 0.94, 0.97, 'rgba(6,10,20,.96)', z);
      let u = 0;
      n.children.forEach(ch => {
        const ru = DC.get(ch.type).specs.ru, c = DEVCOL[ch.type] || [120, 130, 160];
        const v0 = 0.06 + (u / 42) * 0.88, v1 = 0.06 + ((u + ru - 0.25) / 42) * 0.88;
        const lit = rt && rt.powered[n.nid] && !n.tripped;
        facePatch(pts, 0.1, 1 - v1, 0.9, 1 - v0, rgb(c, lit ? (0.85 + 0.55 * (ch.util || 0)) : 0.32), z - 0.05);
        u += ru;
      });
      if (u < 42) facePatch(pts, 0.1, 0.06, 0.9, 1 - (0.06 + (u / 42) * 0.88), 'rgba(22,30,52,.85)', z - 0.04);
    } else if (k === 'tower' && f.n.y === 1) {
      faceDisc(pts, 0.5, 0.5, g.w * 0.33, 'rgba(10,16,30,.9)', z);
      faceDisc(pts, 0.5, 0.5, g.w * 0.3, rgb(col.accent, 0.5), z - 0.05);
      faceDisc(pts, 0.5, 0.5, g.w * 0.08, rgb(col.accent, 1.1), z - 0.1);
    } else if (k === 'chiller' && f.n.y === 1) {
      [0.28, 0.72].forEach(u => {
        faceDisc(pts, u, 0.5, g.d * 0.3, 'rgba(10,16,30,.9)', z);
        faceDisc(pts, u, 0.5, g.d * 0.26, rgb(col.accent, 0.45), z - 0.05);
      });
    } else if ((k === 'crah' || k === 'cdu') && f.n.z === -1) {
      facePatch(pts, 0.12, 0.08, 0.88, 0.62, 'rgba(10,16,30,.85)', z);
      for (let i = 0; i < 5; i++) facePatch(pts, 0.14, 0.12 + i * 0.1, 0.86, 0.15 + i * 0.1, rgb(col.accent, 0.42), z - 0.05);
      facePatch(pts, 0.2, 0.72, 0.8, 0.92, rgb(col.accent, n.rt && n.rt.live ? 0.85 : 0.22), z - 0.05);
    } else if (k === 'ups' && f.n.z === -1) {
      facePatch(pts, 0.1, 0.1, 0.9, 0.42, 'rgba(10,16,30,.85)', z);
      const b = Math.max(0, Math.min(1, (n.battery || 0) / 100));
      facePatch(pts, 0.12, 0.14, 0.12 + 0.76 * b, 0.26, b > 0.25 ? 'rgb(74,222,128)' : 'rgb(248,113,113)', z - 0.05);
      facePatch(pts, 0.12, 0.3, 0.88, 0.38, rgb(col.accent, n.rt && n.rt.onBattery ? 0.9 : 0.3), z - 0.05);
    } else if (k === 'gen' && f.n.y === 1) {
      facePatch(pts, 0.05, 0.25, 0.6, 0.75, rgb(col.base, 1.25), z);
      faceDisc(pts, 0.82, 0.5, g.d * 0.16, n.running ? 'rgb(248,180,80)' : 'rgba(12,18,32,.9)', z - 0.05);
    } else if (k === 'fins' && (f.n.x || f.n.z)) {
      for (let i = 1; i < 6; i++) facePatch(pts, i / 6, 0.12, i / 6 + 0.045, 0.88, 'rgba(10,16,30,.5)', z);
    } else if (k === 'cab' && f.n.z === -1) {
      facePatch(pts, 0.12, 0.08, 0.88, 0.92, 'rgba(12,18,34,.45)', z);
      faceDisc(pts, 0.8, 0.5, 0.9, rgb(col.accent, 0.9), z - 0.05);
    } else if (k === 'net' && f.n.y === 1) {
      for (let i = 0; i < 6; i++)
        faceDisc(pts, 0.14 + i * 0.145, 0.3, 0.75, rgb(col.accent, rt && rt.netUp[n.nid] ? 1.1 : 0.3), z - 0.05);
    } else if (k === 'pump' && f.n.y === 1) {
      faceDisc(pts, 0.5, 0.5, g.w * 0.26, rgb(col.accent, n.rt && n.rt.live ? 0.9 : 0.3), z);
    } else if (k === 'pylon' && f.n.y === 1) {
      faceDisc(pts, 0.5, 0.5, g.w * 0.4, rgb(col.accent, 1), z);
    }
  }

  function liveText(n, rt) {
    const R = n.rt || {}, num = DC.num;
    switch (n.type) {
      case 'rack': return num(R.itKw) + ' kW · ' + num(n.temp, 0) + '°C';
      case 'ups': return num(R.loadKw) + ' kW · แบต ' + num(n.battery, 0) + '%';
      case 'chiller': return num(R.produced) + ' kW เย็น';
      case 'crah': case 'cdu': return num(R.deliver) + ' kW';
      case 'generator': return n.running ? 'เดินเครื่อง' : 'สแตนด์บาย';
      case 'utility': return SIM.model.utilityUp ? 'จ่ายไฟปกติ' : 'ไฟดับ';
      case 'pump': case 'coolingTower': return (R.live ? 'ทำงาน' : 'หยุด');
      default:
        if (R.loadKw !== undefined) return num(R.loadKw) + ' kW';
        if (R.kw !== undefined) return num(R.kw, 2) + ' kW';
        return '';
    }
  }

  /* -------------------------------------------------- สายและท่อ + flow */
  function buildLinks(rt, time) {
    const by = {}; SIM.model.nodes.forEach(n => by[n.nid] = n);
    const trayIdx = { power: 0, cool: 0, net: 0 };
    SIM.model.links.forEach(l => {
      if (!opts[l.kind]) return;
      const A = by[l.from], B = by[l.to]; if (!A || !B) return;
      const a = nodeW(A), b = nodeW(B), ga = geoOf(A), gb = geoOf(B);
      const i = trayIdx[l.kind]++;
      let path;
      if (l.kind === 'cool') {
        const y = Y_COOL + (i % 3) * 1.3, zm = (a.z + b.z) / 2;
        path = [{ x: a.x, y: ga.h * 0.25, z: a.z }, { x: a.x, y: y, z: a.z }, { x: a.x, y: y, z: zm },
        { x: b.x, y: y, z: zm }, { x: b.x, y: y, z: b.z }, { x: b.x, y: y, z: b.z }, { x: b.x, y: gb.h * 0.25, z: b.z }];
      } else {
        const y = (l.kind === 'power' ? Y_POWER : Y_NET) + (i % 4) * 2.2;
        path = [{ x: a.x, y: ga.h, z: a.z }, { x: a.x, y: y, z: a.z },
        { x: b.x, y: y, z: b.z }, { x: b.x, y: gb.h, z: b.z }];
      }
      let live;
      if (l.kind === 'power') live = rt.powered[A.nid] && rt.powered[B.nid];
      else if (l.kind === 'cool') live = !!(A.rt && A.rt.live !== false && rt.powered[A.nid]);
      else live = rt.netUp[A.nid] && rt.netUp[B.nid];

      const base = DC.LINK_KINDS[l.kind].color;
      const col = live ? base : 'rgba(110,125,160,.35)';
      const wdt = l.kind === 'net' ? 1.1 : 1.5;
      for (let k = 0; k < path.length - 1; k++)
        addLine(path[k], path[k + 1], col, live ? wdt : wdt * 0.6, live ? 0.75 : 0.45, !live);

      if (live && opts.flow) {
        const segs = [], len = [];
        let total = 0;
        for (let k = 0; k < path.length - 1; k++) {
          const d = Math.hypot(path[k + 1].x - path[k].x, path[k + 1].y - path[k].y, path[k + 1].z - path[k].z);
          segs.push([path[k], path[k + 1]]); len.push(d); total += d;
        }
        if (total > 0.5) {
          const count = Math.max(2, Math.min(9, Math.round(total / 16)));
          const speed = l.kind === 'net' ? 0.32 : l.kind === 'power' ? 0.2 : 0.13;
          for (let q = 0; q < count; q++) {
            let u = ((time * speed + q / count) % 1) * total, k = 0;
            while (k < len.length - 1 && u > len[k]) { u -= len[k]; k++; }
            const t = len[k] ? u / len[k] : 0, p0 = segs[k][0], p1 = segs[k][1];
            addDot({ x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t, z: p0.z + (p1.z - p0.z) * t },
              base, l.kind === 'net' ? 1.3 : 1.8);
          }
        }
      }
    });
  }

  /* ------------------------------------------------------------ วาด */
  function draw(time) {
    list = []; labels = []; picks = [];
    updateBounds();
    const rt = SIM.rt || SIM.compute();
    buildFloor();
    SIM.model.nodes.forEach(n => { if (n.type !== 'containment') buildNode(n, rt); });
    SIM.model.nodes.forEach(n => { if (n.type === 'containment') buildNode(n, rt); });
    buildLinks(rt, time);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0d1428'); bg.addColorStop(1, '#070b16');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    list.sort((a, b) => b.z - a.z);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const it of list) {
      if (it.t === 'q') {
        ctx.beginPath(); ctx.moveTo(it.p[0].x, it.p[0].y);
        for (let i = 1; i < it.p.length; i++) ctx.lineTo(it.p[i].x, it.p[i].y);
        ctx.closePath(); ctx.fillStyle = it.fill; ctx.fill();
        if (it.stroke) { ctx.strokeStyle = it.stroke; ctx.lineWidth = it.lw || 0.7; ctx.stroke(); }
      } else if (it.t === 'l') {
        ctx.globalAlpha = it.alpha === undefined ? 1 : it.alpha;
        ctx.strokeStyle = it.color; ctx.lineWidth = Math.max(0.5, it.w);
        if (it.dash) ctx.setLineDash([4, 5]); else ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(it.a.x, it.a.y); ctx.lineTo(it.b.x, it.b.y); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
      } else {
        ctx.beginPath(); ctx.arc(it.p.x, it.p.y, it.r, 0, 6.2832);
        ctx.fillStyle = it.color; ctx.shadowColor = it.color; ctx.shadowBlur = 6;
        ctx.fill(); ctx.shadowBlur = 0;
      }
    }

    // ป้ายชื่อวาดทับทีหลัง: เรียงจากใกล้ไปไกล แล้วข้ามอันที่ทับกับที่วางไปแล้ว
    const lkey = L => L.sel ? -1e9 : L.hov ? -5e8 : (L.node && L.node.type === 'rack' ? L.z - 45 : L.z);
    labels.sort((a, b) => lkey(a) - lkey(b));
    ctx.textBaseline = 'middle';
    const placed = [];
    for (const L of labels) {
      if (L.zone) {
        ctx.font = '600 11px "Leelawadee UI",Tahoma,sans-serif';
        ctx.fillStyle = 'rgba(168,188,232,.9)'; ctx.textAlign = 'left';
        ctx.fillText(L.text, L.x, L.y); continue;
      }
      const big = L.sel || L.hov;
      ctx.font = (big ? '700 12px ' : '600 11px ') + '"Leelawadee UI",Tahoma,sans-serif';
      const w1 = ctx.measureText(L.text).width;
      ctx.font = '10px "Leelawadee UI",Tahoma,sans-serif';
      const w2 = L.sub ? ctx.measureText(L.sub).width : 0;
      const bw = Math.max(w1, w2) + 12, bh = L.sub ? 28 : 17;
      const x = L.x - bw / 2, y = L.y - bh;
      if (x + bw < 0 || x > W || y + bh < 0 || y > H) continue;
      if (placed.some(r => x < r.x + r.w + 3 && x + bw + 3 > r.x && y < r.y + r.h + 2 && y + bh + 2 > r.y)) continue;
      placed.push({ x, y, w: bw, h: bh });
      ctx.globalAlpha = big ? 1 : 0.88;
      ctx.fillStyle = L.sel ? 'rgba(30,58,138,.96)' : 'rgba(13,19,38,.86)';
      ctx.strokeStyle = L.sel ? 'rgba(125,211,252,.95)' : 'rgba(70,86,130,.8)';
      roundRect(x, y, bw, bh, 5); ctx.fill(); ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(L.x, y + bh); ctx.lineTo(L.x, L.y + 5);
      ctx.strokeStyle = 'rgba(110,130,180,.6)'; ctx.stroke();
      ctx.textAlign = 'center';
      ctx.font = (big ? '700 12px ' : '600 11px ') + '"Leelawadee UI",Tahoma,sans-serif';
      ctx.fillStyle = '#e8ecf7'; ctx.fillText(L.text, L.x, y + 9);
      if (L.sub) {
        ctx.font = '10px "Leelawadee UI",Tahoma,sans-serif';
        ctx.fillStyle = '#9fb0d8'; ctx.fillText(L.sub, L.x, y + 21);
      }
      ctx.globalAlpha = 1;
    }

    // คำอธิบายสีมุมล่างซ้าย
    ctx.textAlign = 'left'; ctx.font = '11px "Leelawadee UI",Tahoma,sans-serif';
    const leg = [['สายไฟฟ้า (รางเพดาน)', DC.LINK_KINDS.power.color],
    ['ท่อน้ำเย็น (ใต้พื้น)', DC.LINK_KINDS.cool.color],
    ['สายสัญญาณ (รางบน)', DC.LINK_KINDS.net.color]];
    leg.forEach(([t, c], i) => {
      const y = H - 56 + i * 17;
      ctx.strokeStyle = c; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(14, y); ctx.lineTo(36, y); ctx.stroke();
      ctx.fillStyle = 'rgba(190,203,232,.85)'; ctx.fillText(t, 42, y);
    });
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  /* --------------------------------------------------------- ลูปวาด */
  function loop() {
    if (!V3D.visible) { raf = 0; return; }
    draw(performance.now() / 1000);
    raf = requestAnimationFrame(loop);
  }
  V3D.kick = function () { if (V3D.visible && !raf) raf = requestAnimationFrame(loop); };

  /* ------------------------------------------------------ ปฏิสัมพันธ์ */
  function pickAt(mx, my) {
    let best = null;
    for (const p of picks) {
      const d = p.n.type === 'containment' ? p.z + 60 : p.z;   // กล่องกระจกให้ความสำคัญท้ายสุด
      if (mx >= p.x0 && mx <= p.x1 && my >= p.y0 && my <= p.y1 && (!best || d < best.d)) best = { n: p.n, d };
    }
    return best ? best.n : null;
  }
  V3D.pickAt = pickAt;

  function bind() {
    let drag = null;
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, moved: 0, pan: e.shiftKey || e.button === 1 || e.button === 2 };
    });
    cv.addEventListener('pointermove', e => {
      const r = cv.getBoundingClientRect();
      if (!drag) {
        const h = pickAt(e.clientX - r.left, e.clientY - r.top);
        if (h !== hover) { hover = h; cv.style.cursor = h ? 'pointer' : 'grab'; }
        return;
      }
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.pan) {
        const k = cam.dist / cam.fov;
        const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
        cam.tx -= (dx * cy + dy * sy * Math.sin(cam.pitch)) * k;
        cam.tz -= (-dx * sy + dy * cy * Math.sin(cam.pitch)) * k;
        cam.ty += dy * k * Math.cos(cam.pitch) * 0;
      } else {
        cam.yaw -= dx * 0.006;
        cam.pitch = Math.max(0.06, Math.min(1.45, cam.pitch + dy * 0.005));
      }
    });
    cv.addEventListener('pointerup', e => {
      const moved = drag && drag.moved > 6; drag = null;
      if (moved) return;
      const r = cv.getBoundingClientRect();
      const n = pickAt(e.clientX - r.left, e.clientY - r.top);
      if (window.UI && window.onPick3D) window.onPick3D(n);
    });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      cam.dist = Math.max(70, Math.min(620, cam.dist * Math.exp(e.deltaY * 0.0011)));
    }, { passive: false });

    // รองรับการลากวางจากคลังองค์ประกอบลงบนพื้นห้อง
    cv.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    cv.addEventListener('drop', e => {
      e.preventDefault();
      const type = e.dataTransfer.getData('text/plain'); if (!DC.get(type)) return;
      const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      if (window.onDrop3D) window.onDrop3D(type, mx, my, screenToFloor(mx, my), pickAt(mx, my));
    });
  }

  V3D.worldToLayout = function (p) {
    return { x: (p.x + RW / 2) / S + BX0 - 61, y: (p.z + RD / 2) / S + BZ0 - 39 };
  };

  // จัดกล้องให้เห็นทั้งห้องพอดีจอ โดยลองฉายมุมห้องทั้ง 8 จุดแล้วปรับระยะ
  V3D.fit = function () {
    updateBounds();
    cam.tx = 0; cam.tz = 0; cam.ty = 11;
    cam.dist = Math.max(RW, RD) * 1.7;
    for (let k = 0; k < 6; k++) {
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, ok = true;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const hh of [0, Y_NET + 6]) {
        const p = proj({ x: sx * RW / 2, y: hh, z: sz * RD / 2 });
        if (!p) { ok = false; break; }
        x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
        y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
      }
      if (!ok) { cam.dist *= 1.5; continue; }
      const need = Math.max((x1 - x0) / (W * 0.90), (y1 - y0) / (H * 0.82));
      if (Math.abs(need - 1) < 0.02) break;
      cam.dist = Math.max(70, Math.min(900, cam.dist * need));
    }
  };

  // เลื่อนกล้องไปยังกลุ่มอุปกรณ์ที่สนใจ
  function focusOn(types, yaw, pitch, zoom) {
    updateBounds();
    const ns = SIM.model.nodes.filter(n => types.indexOf(n.type) >= 0);
    if (!ns.length) { V3D.fit(); return; }
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    ns.forEach(n => {
      const w = nodeW(n);
      x0 = Math.min(x0, w.x); x1 = Math.max(x1, w.x);
      z0 = Math.min(z0, w.z); z1 = Math.max(z1, w.z);
    });
    cam.yaw = yaw; cam.pitch = pitch; cam.ty = 11;
    cam.tx = (x0 + x1) / 2; cam.tz = (z0 + z1) / 2;
    cam.dist = Math.max(80, Math.min(600, Math.max(x1 - x0 + 55, (z1 - z0 + 55) * 1.5) * zoom));
  }

  V3D.setView = function (name) {
    updateBounds();
    if (name === 'iso') { V3D.fit(); cam.yaw = -0.62; cam.pitch = 0.52; }
    else if (name === 'front') { V3D.fit(); cam.yaw = 0; cam.pitch = 0.17; cam.ty = 14; }
    else if (name === 'top') { V3D.fit(); cam.yaw = -0.04; cam.pitch = 1.4; cam.ty = 0; cam.dist *= 1.05; }
    else if (name === 'white') focusOn(['rack'], -0.5, 0.36, 1.45);
    else if (name === 'plant') focusOn(['chiller', 'crah', 'cdu', 'pump', 'coolingTower'], -0.72, 0.42, 1.2);
  };

  V3D.resize = function () {
    if (!cv) return;
    const r = cv.parentElement.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(200, r.width); H = Math.max(200, r.height);
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
  };

  V3D.mount = function (canvasEl) {
    cv = canvasEl; ctx = cv.getContext('2d');
    V3D.resize(); bind();
    window.addEventListener('resize', () => { V3D.resize(); if (V3D.visible) draw(performance.now() / 1000); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) V3D.kick(); });
  };

  let firstShow = true;
  V3D.show = function (on) {
    V3D.visible = on;
    if (on) {
      V3D.resize();
      if (firstShow) { firstShow = false; V3D.fit(); }
      draw(performance.now() / 1000); V3D.kick();
    }
  };
  // วาดหนึ่งเฟรมทันที (ใช้เมื่อหน้าเว็บถูกซ่อนจน requestAnimationFrame ไม่ทำงาน)
  V3D.drawOnce = function () { if (cv && ctx) draw(performance.now() / 1000); };
})();
