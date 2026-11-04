/* =====================================================================
   catalog.js — ฐานข้อมูลองค์ประกอบของ Data Center
   ใช้สอนวิชา Data Center & Cloud Computing
   ทุกตัวเลขเป็นค่าโดยประมาณจากอุปกรณ์จริงในตลาด (ปี 2024-2026)
   ===================================================================== */
(function () {
  'use strict';

  const DC = (window.DC = window.DC || {});

  /* ---------- ค่าคงที่ของสภาพแวดล้อม ---------- */
  DC.ENV = {
    tariff: 4.2,            // บาท / kWh (อัตราธุรกิจขนาดใหญ่ของไทยโดยประมาณ)
    setpoint: 24,           // อุณหภูมิ cold aisle เป้าหมาย (°C) ตาม ASHRAE A1
    ashraeMax: 27,          // ขอบบนของ ASHRAE recommended
    tempAlarm: 32,          // เริ่มเตือน
    tempTrip: 45,           // อุปกรณ์ตัดตัวเองเพื่อกันความเสียหาย
    ambient: 35,            // อุณหภูมิภายนอก (กรุงเทพฯ ช่วงบ่าย)
    ancillaryKw: 4,         // ไฟแสงสว่าง + ปลั๊กทั่วไป (ฐาน) — เพิ่มตามจำนวนตู้
    usdThb: 36
  };

  /* ---------- หมวดหมู่ ---------- */
  DC.CATS = [
    { id: 'power',   name: 'ระบบไฟฟ้า',        en: 'Power',        color: '#f59e0b' },
    { id: 'cooling', name: 'ระบบทำความเย็น',   en: 'Cooling',      color: '#22d3ee' },
    { id: 'it',      name: 'อุปกรณ์ IT',       en: 'IT Equipment', color: '#a78bfa' },
    { id: 'network', name: 'เครือข่าย',         en: 'Network',      color: '#34d399' },
    { id: 'support', name: 'ความปลอดภัย/จัดการ', en: 'Safety & Mgmt', color: '#fb7185' }
  ];

  /* ---------- โซนในอาคาร ---------- */
  DC.ZONES = [
    { id: 'yard',       name: 'Utility Yard — ลานหม้อแปลง / เครื่องกำเนิดไฟฟ้า', y: 0,    h: 150 },
    { id: 'electrical', name: 'Electrical Room — ห้องไฟฟ้า (MDB / ATS / UPS / PDU)', y: 150,  h: 160 },
    { id: 'plant',      name: 'Mechanical Plant — ห้องเครื่องทำความเย็น', y: 310,  h: 170 },
    { id: 'white',      name: 'White Space — ห้องเซิร์ฟเวอร์ (Hot / Cold Aisle)', y: 480,  h: 250 },
    { id: 'mmr',        name: 'MMR — ห้องสื่อสารและเครือข่ายหลัก', y: 730,  h: 160 },
    { id: 'support',    name: 'Support — ระบบดับเพลิง / รักษาความปลอดภัย / DCIM', y: 890,  h: 150 }
  ];

  /* ---------- ชนิดของการเชื่อมโยง ---------- */
  DC.LINK_KINDS = {
    power: { name: 'สายไฟฟ้า',        en: 'Power',   color: '#f59e0b', unit: 'kW' },
    cool:  { name: 'ท่อน้ำเย็น/ลมเย็น', en: 'Cooling', color: '#22d3ee', unit: 'kW' },
    net:   { name: 'สายสัญญาณ',        en: 'Network', color: '#34d399', unit: 'Gbps' }
  };

  /* =====================================================================
     กฎการเชื่อมต่อ: จาก type -> ต่อไปยัง type ใดได้
     นี่คือ "critical path" ที่นักศึกษาต้องเข้าใจ
     ===================================================================== */
  DC.RULES = {
    power: {
      utility:     ['transformer'],
      transformer: ['switchgear', 'ats'],
      generator:   ['ats'],
      ats:         ['switchgear'],
      switchgear:  ['ups', 'chiller', 'coolingTower', 'pump', 'crah', 'cdu', 'fire', 'security', 'dcim'],
      ups:         ['pdu'],
      pdu:         ['rack', 'switchCore', 'router', 'firewall', 'crah', 'cdu']
    },
    cool: {
      coolingTower: ['chiller'],
      pump:         ['chiller'],
      chiller:      ['crah', 'cdu'],
      crah:         ['rack'],
      cdu:          ['rack']
    },
    net: {
      internet:   ['router'],
      router:     ['firewall'],
      firewall:   ['switchCore'],
      switchCore: ['rack']
    }
  };

  /* =====================================================================
     CATALOG
     specs  = ค่าทางวิศวกรรมที่ engine ใช้คำนวณ
     desc   = อุปกรณ์นี้คืออะไร
     role   = ทำหน้าที่อะไรใน critical path
     teach  = ประเด็นที่นักศึกษาควรจำ
     ===================================================================== */
  DC.CATALOG = {

    /* ---------------- ระบบไฟฟ้า ---------------- */
    utility: {
      name: 'Utility Feed', th: 'ไฟจากการไฟฟ้า', cat: 'power', zone: 'yard', glyph: '⚡',
      specs: { capacityKw: 300, availability: 0.9990, capex: 900000 },
      desc: 'จุดรับไฟแรงสูง (22–115 kV) จากการไฟฟ้า เป็นต้นทางของพลังงานทั้งหมดใน Data Center',
      role: 'แหล่งพลังงานหลัก — ต้นทางของ critical power path',
      teach: [
        'Data Center ระดับ Tier III/IV มักขอไฟ 2 feeder จากสถานีจ่ายไฟต่างกัน (dual utility)',
        'ความพร้อมใช้ของไฟบ้านอยู่ราว 99.9% = ไฟดับประมาณ 8.8 ชั่วโมง/ปี ซึ่งไม่พอสำหรับ Data Center',
        'ค่าไฟคิดทั้งหน่วยพลังงาน (kWh) และค่าความต้องการพลังไฟฟ้าสูงสุด (Peak Demand, kW)'
      ]
    },
    transformer: {
      name: 'Transformer', th: 'หม้อแปลงไฟฟ้า', cat: 'power', zone: 'yard', glyph: '🔌',
      specs: { capacityKw: 200, efficiency: 0.985, availability: 0.99990, capex: 650000 },
      desc: 'แปลงแรงดันสูงจากการไฟฟ้าลงเป็น 400/230 V เพื่อจ่ายเข้าระบบภายในอาคาร',
      role: 'แปลงแรงดัน — มีการสูญเสียเป็นความร้อนประมาณ 1.5%',
      teach: [
        'ประสิทธิภาพ 98.5% หมายถึงที่โหลด 150 kW จะสูญเสียเป็นความร้อน 2.3 kW',
        'การสูญเสียในหม้อแปลงและ UPS คือส่วนสำคัญที่ทำให้ PUE สูงกว่า 1.0',
        'ควรเดินโหลดประมาณ 70–80% ของพิกัด เพื่อให้มีที่เผื่อและประสิทธิภาพสูงสุด'
      ]
    },
    generator: {
      name: 'Diesel Generator', th: 'เครื่องกำเนิดไฟฟ้า', cat: 'power', zone: 'yard', glyph: '🛢️',
      specs: { capacityKw: 150, startSec: 10, fuelHours: 8, fuelLph: 40, availability: 0.995, capex: 1900000 },
      desc: 'เครื่องยนต์ดีเซลปั่นไฟ ใช้จ่ายไฟต่อเนื่องเมื่อไฟการไฟฟ้าดับนานกว่าที่แบตเตอรี่ UPS รองรับได้',
      role: 'แหล่งไฟสำรองระยะยาว — สตาร์ทและรับโหลดภายในราว 10 วินาที',
      teach: [
        'UPS ซื้อเวลาเป็นนาที แต่ Generator ซื้อเวลาเป็นชั่วโมง ต้องมีทั้งคู่',
        'ความเสี่ยงที่แท้จริงคือ "สตาร์ทไม่ติด" จึงต้องทดสอบเดินเครื่องมีโหลดทุกเดือน',
        'ต้องสำรองน้ำมันอย่างน้อย 8–72 ชั่วโมง และทำสัญญาเติมน้ำมันฉุกเฉินไว้ล่วงหน้า'
      ]
    },
    ats: {
      name: 'ATS / STS', th: 'สวิตช์สลับแหล่งจ่ายไฟ', cat: 'power', zone: 'electrical', glyph: '🔀',
      specs: { capacityKw: 200, switchSec: 0.5, availability: 0.99990, capex: 240000 },
      desc: 'Automatic / Static Transfer Switch สลับแหล่งจ่ายไฟระหว่างการไฟฟ้ากับเครื่องกำเนิดไฟฟ้าโดยอัตโนมัติ',
      role: 'จุดรวมแหล่งจ่ายไฟ 2 ทาง — ต้องต่อทั้ง Utility และ Generator เข้าที่นี่',
      teach: [
        'ATS ใช้เวลาสลับหลักวินาที (เหมาะกับโหลดเครื่องกล) ขณะที่ STS สลับในระดับมิลลิวินาที',
        'ถ้าไม่มี ATS การสลับไปใช้ Generator ต้องทำด้วยมือ ซึ่งช้าเกินไปสำหรับงาน production',
        'ATS ตัวเดียวคือ single point of failure — Tier IV จึงใช้สองชุดแยกอิสระ'
      ]
    },
    switchgear: {
      name: 'MDB / Switchgear', th: 'ตู้สวิตช์ไฟฟ้าหลัก', cat: 'power', zone: 'electrical', glyph: '🗄️',
      specs: { capacityKw: 200, efficiency: 0.998, availability: 0.99995, capex: 500000 },
      desc: 'ตู้เมนจ่ายไฟหลัก (Main Distribution Board) กระจายไฟไปยัง UPS และระบบทำความเย็น',
      role: 'จุดกระจายไฟหลัก — แยกโหลด IT (ผ่าน UPS) ออกจากโหลดเครื่องกล',
      teach: [
        'โหลดเครื่องทำความเย็นมักไม่ต่อผ่าน UPS แต่ต่อตรงจาก MDB เพราะกินไฟมากและทนไฟกระพริบได้',
        'แต่ Tier III/IV ต้องให้ปั๊มน้ำเย็นมีไฟสำรองด้วย ไม่งั้นห้องร้อนทันทีที่ไฟดับ',
        'ต้องมี breaker coordination เพื่อให้ตัดเฉพาะวงจรที่มีปัญหา ไม่ตัดทั้งอาคาร'
      ]
    },
    ups: {
      name: 'UPS + Battery', th: 'เครื่องสำรองไฟ', cat: 'power', zone: 'electrical', glyph: '🔋',
      specs: { capacityKw: 100, efficiency: 0.95, batteryMin: 10, availability: 0.9995, capex: 900000 },
      desc: 'Uninterruptible Power Supply พร้อมแบตเตอรี่ จ่ายไฟให้โหลด IT แบบไม่สะดุดและกรองคุณภาพไฟ',
      role: 'ไฟต่อเนื่องสำหรับโหลด IT — ครอบช่วงรอยต่อก่อน Generator รับโหลด',
      teach: [
        'หน้าที่จริงของ UPS คือ "ซื้อเวลา 10–15 นาที" ไม่ใช่จ่ายไฟแทนการไฟฟ้า',
        'ประสิทธิภาพ 95% หมายถึงสูญเสีย 5% เป็นความร้อนตลอดเวลา ซึ่งนับรวมใน PUE',
        'โหมด Eco / Line-interactive ให้ประสิทธิภาพสูงกว่า Double-conversion แต่ป้องกันน้อยกว่า',
        'แบตเตอรี่เป็นอุปกรณ์ที่เสียบ่อยที่สุดในระบบไฟ ต้องทดสอบและเปลี่ยนตามอายุ 3–5 ปี'
      ]
    },
    pdu: {
      name: 'PDU / RPP', th: 'ตู้จ่ายไฟย่อย', cat: 'power', zone: 'electrical', glyph: '🔳',
      specs: { capacityKw: 60, efficiency: 0.99, availability: 0.99998, capex: 140000 },
      desc: 'Power Distribution Unit กระจายไฟจาก UPS ไปยังตู้ Rack แต่ละตู้ และวัดการใช้ไฟรายวงจร',
      role: 'ปลายทางการกระจายไฟก่อนเข้าตู้ Rack',
      teach: [
        'Rack ในระบบ Tier III/IV ต้องรับไฟจาก PDU สองตัวที่มาจาก UPS ต่างชุด (A-side / B-side)',
        'อุปกรณ์ IT ที่มี Power Supply สองชุด (dual-corded) จึงจะใช้ประโยชน์จาก 2N ได้จริง',
        'Intelligent PDU วัดไฟรายช่องได้ ใช้ทำ billing และหาตู้ที่โหลดเกิน'
      ]
    },

    /* ---------------- ระบบทำความเย็น ---------------- */
    coolingTower: {
      name: 'Cooling Tower', th: 'หอผึ่งเย็น', cat: 'cooling', zone: 'plant', glyph: '🌬️',
      specs: { rejectKw: 140, fanKw: 3, waterLph: 320, availability: 0.9990, capex: 350000 },
      desc: 'ระบายความร้อนจากน้ำหล่อเย็นของ Chiller ออกสู่บรรยากาศด้วยการระเหยของน้ำ',
      role: 'ปลายทางการทิ้งความร้อน — ไม่มีหอผึ่งเย็น Chiller ก็ทำงานไม่ได้',
      teach: [
        'ใช้น้ำมาก จึงมีตัวชี้วัด WUE (Water Usage Effectiveness) ควบคู่กับ PUE',
        'ประสิทธิภาพลดลงเมื่ออากาศภายนอกชื้น — สำคัญมากกับสภาพอากาศเมืองไทย',
        'ทางเลือกคือ Air-cooled chiller ที่ไม่ใช้น้ำ แต่กินไฟมากกว่าประมาณ 20–30%'
      ]
    },
    pump: {
      name: 'Chilled Water Pump', th: 'ปั๊มน้ำเย็น', cat: 'cooling', zone: 'plant', glyph: '🔄',
      specs: { powerKw: 2.8, availability: 0.9995, capex: 140000 },
      desc: 'ปั๊มหมุนเวียนน้ำเย็นระหว่าง Chiller กับ CRAH ในห้องเซิร์ฟเวอร์',
      role: 'ขับเคลื่อนวงจรน้ำเย็น — ต้องมีไฟสำรองเสมอ',
      teach: [
        'ปั๊มกินไฟน้อยแต่สำคัญสูงสุด: ปั๊มหยุด = น้ำเย็นไม่ไหล = Chiller ผลิตความเย็นไม่ได้ = ห้องร้อนในไม่กี่นาที',
        'การใช้ VFD (Variable Frequency Drive) ปรับรอบตามโหลด ช่วยลดไฟได้มาก',
        'มักติดตั้งแบบ N+1 เพราะราคาถูกเทียบกับความเสี่ยง'
      ]
    },
    chiller: {
      name: 'Chiller', th: 'เครื่องทำน้ำเย็น', cat: 'cooling', zone: 'plant', glyph: '❄️',
      specs: { coolKw: 90, cop: 4.5, availability: 0.9980, capex: 1600000 },
      desc: 'ผลิตน้ำเย็น (7–12 °C) ส่งให้ CRAH / CDU เป็นหัวใจของระบบทำความเย็นแบบน้ำ',
      role: 'ผลิตความเย็น — กินไฟ = ความเย็นที่ผลิต ÷ COP',
      teach: [
        'COP 4.5 หมายถึงใช้ไฟ 1 kW ได้ความเย็น 4.5 kW → ทำความเย็น 90 kW ใช้ไฟ ~20 kW',
        'ค่าความเย็นมักระบุเป็น "ตันความเย็น" (1 RT ≈ 3.52 kW)',
        'ระบบทำความเย็นคือผู้ใช้ไฟอันดับสองรองจาก IT จึงเป็นเป้าหลักในการลด PUE',
        'Free cooling (ใช้อากาศเย็นภายนอก) ลดไฟได้มากในเขตหนาว แต่ใช้ได้จำกัดในไทย'
      ]
    },
    crah: {
      name: 'CRAH / CRAC', th: 'เครื่องปรับอากาศห้องเซิร์ฟเวอร์', cat: 'cooling', zone: 'plant', glyph: '🧊',
      specs: { coolKw: 50, fanKw: 2.2, availability: 0.9990, capex: 320000 },
      desc: 'Computer Room Air Handler เป่าลมเย็นเข้า cold aisle และดูดลมร้อนจาก hot aisle กลับมาแลกเปลี่ยนความร้อน',
      role: 'ส่งความเย็นถึงตู้ Rack — ต้องรับน้ำเย็นจาก Chiller และต่อกับ Rack ที่ต้องการระบายความร้อน',
      teach: [
        'CRAH ใช้น้ำเย็นจาก Chiller ส่วน CRAC มีคอมเพรสเซอร์ในตัว (ใช้ในห้องเล็ก)',
        'เป่าลมเย็นสวนทางกับทิศทางลมของเซิร์ฟเวอร์จะทำให้เกิด hot spot',
        'ความหนาแน่นที่ระบายด้วยลมได้จริงอยู่ราว 10–15 kW/rack เท่านั้น',
        'การทำ Hot/Cold Aisle Containment เพิ่มประสิทธิภาพได้ 20–30% โดยไม่ใช้ไฟเพิ่ม'
      ]
    },
    cdu: {
      name: 'Liquid Cooling CDU', th: 'ชุดจ่ายน้ำเย็นถึงชิป', cat: 'cooling', zone: 'plant', glyph: '💧',
      specs: { coolKw: 100, pumpKw: 2.2, availability: 0.9990, capex: 1100000 },
      desc: 'Coolant Distribution Unit สำหรับ Direct-to-Chip liquid cooling พาน้ำเย็นไปแลกเปลี่ยนความร้อนที่ CPU/GPU โดยตรง',
      role: 'ระบายความร้อนตู้ความหนาแน่นสูง (30–130 kW/rack) ที่ลมเย็นทำไม่ได้',
      teach: [
        'เป็นเทคโนโลยีบังคับสำหรับ AI cluster เพราะ GPU rack กินไฟ 40–130 kW/ตู้',
        'ประหยัดไฟกว่าลมมาก เพราะน้ำพาความร้อนได้ดีกว่าอากาศประมาณ 3,000 เท่าต่อปริมาตร',
        'ใช้น้ำอุ่นกว่า (30–45 °C) ได้ ทำให้ Chiller ทำงานที่ COP สูงขึ้นราว 45% และไม่ต้องใช้พัดลม CRAH',
        'ความเสี่ยงใหม่คือการรั่วของน้ำ ต้องมี leak detection ทุกตู้'
      ]
    },
    containment: {
      name: 'Aisle Containment', th: 'ระบบกั้นช่องลมร้อน-เย็น', cat: 'cooling', zone: 'white', glyph: '🚧',
      specs: { efficiencyGain: 0.22, availability: 1, capex: 400000 },
      desc: 'แผงกั้นและประตูปิดช่องทางเดินเพื่อไม่ให้ลมเย็นผสมกับลมร้อน (ไม่ใช้ไฟฟ้า)',
      role: 'เพิ่มประสิทธิภาพการทำความเย็นของทุก CRAH ในห้องราว 22%',
      teach: [
        'เป็นการลงทุนที่คืนทุนเร็วที่สุดในการลด PUE เพราะไม่กินไฟเลย',
        'ของคู่กันคือ blanking panel ปิดช่อง U ที่ว่างในตู้ เพื่อกันลมร้อนไหลย้อน',
        'ไม่มี containment ลมเย็นจะถูกใช้ไปโดยเปล่าประโยชน์ 20–40%'
      ]
    },

    /* ---------------- อุปกรณ์ IT (ติดตั้งในตู้ Rack) ---------------- */
    rack: {
      name: 'Server Rack', th: 'ตู้แร็ค 42U', cat: 'it', zone: 'white', glyph: '🗃️',
      specs: { ru: 42, maxKw: 15, availability: 1, capex: 85000 },
      desc: 'ตู้มาตรฐาน 19 นิ้ว สูง 42U สำหรับติดตั้งเซิร์ฟเวอร์ สตอเรจ และสวิตช์',
      role: 'หน่วยพื้นฐานของ White Space — ต้องมีทั้งไฟ (PDU) ความเย็น (CRAH/CDU) และเครือข่าย (Core Switch)',
      teach: [
        '1U = 44.45 มม. ตู้ 42U จึงสูงประมาณ 2 เมตร',
        'ข้อจำกัดจริงมักเป็น "กำลังไฟต่อตู้" และ "ความเย็นต่อตู้" ไม่ใช่พื้นที่ U',
        'ความหนาแน่นทั่วไป 5–10 kW/ตู้, HPC 20–30 kW/ตู้, AI 40–130 kW/ตู้',
        'ลากอุปกรณ์ IT จาก palette มาวางบนตู้นี้เพื่อติดตั้ง'
      ],
      intoRack: false
    },
    server: {
      name: 'Rack Server', th: 'เซิร์ฟเวอร์ 2U', cat: 'it', zone: 'white', glyph: '🖥️',
      specs: { ru: 2, idleW: 120, maxW: 420, vcpu: 64, ramGb: 256, availability: 0.995, capex: 180000 },
      desc: 'เซิร์ฟเวอร์ x86 สองซ็อกเก็ต เป็นหน่วยประมวลผลหลักที่ใช้รัน VM และคอนเทนเนอร์',
      role: 'สร้างโหลด IT และความร้อน — กินไฟตามระดับการใช้งาน (utilization)',
      teach: [
        'เครื่องที่ไม่มีงานทำยังกินไฟ ~30% ของพิกัด → เครื่องว่างคือเงินที่เสียเปล่า',
        'นี่คือเหตุผลทางเศรษฐศาสตร์ของ Virtualization และ Cloud: รวมงานให้เครื่องน้อยลง',
        'ไฟฟ้าที่เซิร์ฟเวอร์ใช้เกือบ 100% แปลงเป็นความร้อนที่ต้องระบายออก',
        'ควรมี Power Supply สองชุดต่อเข้า PDU คนละฝั่งเพื่อรองรับ 2N'
      ],
      intoRack: true
    },
    gpuServer: {
      name: 'GPU / AI Server', th: 'เซิร์ฟเวอร์ GPU 4U', cat: 'it', zone: 'white', glyph: '🧠',
      specs: { ru: 4, idleW: 700, maxW: 3600, vcpu: 112, ramGb: 1024, gpu: 8, availability: 0.993, capex: 3200000 },
      desc: 'เซิร์ฟเวอร์ติดตั้ง GPU 8 ตัวสำหรับงาน AI Training / Inference กินไฟสูงมาก',
      role: 'โหลดความหนาแน่นสูง — มักต้องใช้ liquid cooling',
      teach: [
        'เครื่องเดียวกินไฟได้ถึง 3.6 kW เทียบเท่าเซิร์ฟเวอร์ธรรมดา 9 เครื่อง',
        'ตู้ที่ใส่ GPU server 8 เครื่องจะกินไฟเกิน 28 kW ซึ่งเกินกำลังระบายความร้อนด้วยลม',
        'นี่คือสาเหตุที่ Data Center ยุค AI ต้องออกแบบใหม่ทั้งระบบไฟและความเย็น',
        'ค่าความหนาแน่นนี้ทำให้ต้นทุนต่อตู้สูงขึ้น แต่ต้นทุนต่อหน่วยประมวลผลถูกลง'
      ],
      intoRack: true
    },
    storage: {
      name: 'Storage Array', th: 'ระบบจัดเก็บข้อมูล 4U', cat: 'it', zone: 'white', glyph: '💾',
      specs: { ru: 4, idleW: 500, maxW: 900, tb: 300, availability: 0.9995, capex: 950000 },
      desc: 'All-flash / Hybrid storage array ให้บริการ block หรือ object storage แก่เซิร์ฟเวอร์',
      role: 'เก็บข้อมูลถาวร — โหลดไฟค่อนข้างคงที่ ไม่ขึ้นกับ utilization มากนัก',
      teach: [
        'สตอเรจกินไฟค่อนข้างคงที่ เพราะดิสก์ต้องหมุน/พร้อมใช้ตลอดเวลา',
        'ต้องมี RAID หรือ erasure coding — ความทนทานของข้อมูลต่างจากความพร้อมใช้ของระบบ',
        'หลัก 3-2-1 backup: 3 สำเนา 2 สื่อ 1 สำเนาอยู่นอกสถานที่'
      ],
      intoRack: true
    },
    switchTor: {
      name: 'ToR Switch', th: 'สวิตช์ประจำตู้', cat: 'network', zone: 'white', glyph: '🔗',
      specs: { ru: 1, idleW: 130, maxW: 220, ports: 48, availability: 0.9990, capex: 420000 },
      desc: 'Top-of-Rack switch รวมสายจากเซิร์ฟเวอร์ในตู้ขึ้นไปยัง Core / Spine switch',
      role: 'จุดเชื่อมเครือข่ายของตู้ — ไม่มี ToR เซิร์ฟเวอร์ในตู้ก็ให้บริการไม่ได้',
      teach: [
        'สถาปัตยกรรม Spine-Leaf ให้ latency สม่ำเสมอกว่าแบบ 3 ชั้นเดิม',
        'ToR ตัวเดียวคือ single point of failure ของทั้งตู้ — จึงมักใส่ 2 ตัวและทำ MC-LAG',
        'Oversubscription ratio เช่น 3:1 หมายถึงแบนด์วิดท์ขึ้นข้างบนน้อยกว่าผลรวมของพอร์ตเซิร์ฟเวอร์'
      ],
      intoRack: true
    },

    /* ---------------- เครือข่ายระดับห้อง ---------------- */
    internet: {
      name: 'Carrier / ISP', th: 'ผู้ให้บริการอินเทอร์เน็ต', cat: 'network', zone: 'mmr', glyph: '🌐',
      specs: { gbps: 100, availability: 0.9990, capex: 0, opexMonth: 180000 },
      desc: 'วงจรสื่อสารจากผู้ให้บริการภายนอกเข้าสู่ Meet-Me Room',
      role: 'ทางเข้า-ออกของทราฟฟิกทั้งหมด',
      teach: [
        'ต้องใช้ผู้ให้บริการ 2 รายและเดินสายเข้าอาคาร 2 เส้นทางแยกกัน (diverse entry)',
        'สายเข้าอาคารทางเดียวคือความเสี่ยงที่ถูกมองข้ามบ่อยที่สุด (รถขุดตัดสาย)',
        'ใช้ BGP ประกาศเส้นทางเพื่อสลับผู้ให้บริการอัตโนมัติ'
      ]
    },
    router: {
      name: 'Border Router', th: 'เราเตอร์ขอบเครือข่าย', cat: 'network', zone: 'mmr', glyph: '📡',
      specs: { powerW: 350, gbps: 100, availability: 0.9990, capex: 1500000 },
      desc: 'เราเตอร์เชื่อมต่อเครือข่ายภายในกับผู้ให้บริการภายนอกด้วย BGP',
      role: 'ประตูเชื่อมโลกภายนอก',
      teach: [
        'ทำ BGP multi-homing เพื่อสลับเส้นทางเมื่อผู้ให้บริการรายหนึ่งล่ม',
        'เป็นจุดที่ใช้ป้องกัน DDoS ชั้นแรกและทำ traffic engineering'
      ]
    },
    firewall: {
      name: 'Firewall', th: 'ไฟร์วอลล์', cat: 'support', zone: 'mmr', glyph: '🛡️',
      specs: { powerW: 250, gbps: 40, availability: 0.9990, capex: 1200000 },
      desc: 'อุปกรณ์ตรวจสอบและกรองทราฟฟิกตามนโยบายความปลอดภัย (Next-Gen Firewall)',
      role: 'ควบคุมการเข้าถึงระหว่างโลกภายนอกกับเครือข่ายภายใน',
      teach: [
        'ปริมาณทราฟฟิกที่เกินพิกัดของไฟร์วอลล์จะทำให้เกิดคอขวดทั้งระบบ',
        'ติดตั้งเป็นคู่แบบ Active-Passive หรือ Active-Active เพื่อไม่ให้เป็นจุดล้มเหลวจุดเดียว',
        'แนวคิด Zero Trust: ตรวจสอบทุกการเชื่อมต่อ ไม่เชื่อถือแม้ทราฟฟิกภายใน'
      ]
    },
    switchCore: {
      name: 'Core / Spine Switch', th: 'สวิตช์แกนหลัก', cat: 'network', zone: 'mmr', glyph: '🕸️',
      specs: { powerW: 500, gbps: 400, ports: 64, availability: 0.9995, capex: 2800000 },
      desc: 'สวิตช์แกนหลักความเร็วสูง เชื่อมทุกตู้ Rack เข้าด้วยกันตามสถาปัตยกรรม Spine-Leaf',
      role: 'แกนกลางของเครือข่าย — ตู้ Rack ต้องเชื่อมถึงตัวนี้เพื่อให้บริการได้',
      teach: [
        'ต้องมีอย่างน้อย 2 ตัว (two spines) ทราฟฟิกตะวันออก-ตะวันตกจึงไม่หยุดเมื่อตัวหนึ่งล่ม',
        'ทราฟฟิก East-West (ภายใน Data Center) มีปริมาณมากกว่า North-South หลายเท่า',
        'กินไฟสูงเพราะต้องขับ optic จำนวนมาก — optic 400G ตัวเดียวใช้ไฟ 10–20 W'
      ]
    },

    /* ---------------- ความปลอดภัยและการจัดการ ---------------- */
    fire: {
      name: 'Fire Suppression', th: 'ระบบดับเพลิง', cat: 'support', zone: 'support', glyph: '🧯',
      specs: { powerW: 300, availability: 0.9999, capex: 1500000 },
      desc: 'ระบบตรวจจับควันแบบ VESDA พร้อมถังแก๊สดับเพลิงชนิดไม่ทำลายอุปกรณ์ (FM-200 / Novec 1230)',
      role: 'ป้องกันอัคคีภัย — ข้อบังคับทางกฎหมายและเงื่อนไขประกันภัย',
      teach: [
        'ห้ามใช้สปริงเกอร์น้ำแบบธรรมดาในห้องเซิร์ฟเวอร์ เพราะน้ำทำลายอุปกรณ์',
        'VESDA ดูดอากาศมาตรวจ จับควันได้ก่อนเกิดเปลวไฟ ทำให้มีเวลาเข้าแก้ไข',
        'ถ้าไม่มีระบบนี้ Data Center ไม่ผ่านการตรวจมาตรฐานและประกันภัยไม่คุ้มครอง'
      ]
    },
    security: {
      name: 'Physical Security', th: 'ระบบรักษาความปลอดภัย', cat: 'support', zone: 'support', glyph: '🔐',
      specs: { powerW: 1200, availability: 0.9995, capex: 800000 },
      desc: 'กล้อง CCTV, ระบบควบคุมการเข้าออกด้วยคีย์การ์ดและชีวมาตร, ห้อง Mantrap',
      role: 'ควบคุมและบันทึกการเข้าถึงทางกายภาพ',
      teach: [
        'ความปลอดภัยทางกายภาพคือชั้นแรกของ Cybersecurity — เข้าถึงเครื่องได้คือยึดเครื่องได้',
        'หลักการ 5 ชั้น: รั้ว → อาคาร → ห้องโถง → Mantrap → ตู้ Rack ที่ล็อก',
        'มาตรฐาน ISO 27001 และ SOC 2 บังคับให้มีบันทึกการเข้าออกที่ตรวจสอบย้อนหลังได้'
      ]
    },
    dcim: {
      name: 'DCIM / BMS / NMS', th: 'ระบบบริหารจัดการ', cat: 'support', zone: 'support', glyph: '📊',
      specs: { powerW: 600, availability: 0.9990, capex: 1100000 },
      desc: 'ซอฟต์แวร์และเซ็นเซอร์ที่ติดตามพลังงาน ความเย็น พื้นที่ และสถานะอุปกรณ์ทั้งหมด',
      role: 'ทำให้มองเห็นสถานะระบบ — คำนวณ PUE และแจ้งเตือนก่อนเกิดเหตุ',
      teach: [
        'PUE วัดได้ก็ต้องมีมิเตอร์: วัดไฟขาเข้าอาคารและไฟขาเข้าโหลด IT แยกกัน',
        'DCIM ดูแลโครงสร้าง, BMS ดูแลงานอาคาร, NMS ดูแลเครือข่าย — คนละชั้นกัน',
        'สิ่งที่วัดไม่ได้ ปรับปรุงไม่ได้ — การลด PUE เริ่มจากการติดมิเตอร์'
      ]
    }
  };

  /* ---------- ประเภทของ Workload สำหรับชั้น Cloud ---------- */
  DC.WORKLOADS = {
    web:   { name: 'Web / App VM',  glyph: '🌍', vcpu: 2,  ramGb: 4,   gpu: 0, priceMonth: 1200,  desc: 'VM ขนาดเล็กสำหรับเว็บหรือ API ขยายตัวตามทราฟฟิก' },
    db:    { name: 'Database VM',   glyph: '🗄️', vcpu: 8,  ramGb: 64,  gpu: 0, priceMonth: 9800,  desc: 'VM ฐานข้อมูล ต้องการ RAM สูงและย้ายเครื่องยาก (stateful)' },
    k8s:   { name: 'Container Pod', glyph: '📦', vcpu: 1,  ramGb: 2,   gpu: 0, priceMonth: 450,   desc: 'คอนเทนเนอร์บน Kubernetes เริ่มและย้ายได้เร็ว (stateless)' },
    ai:    { name: 'AI Training Job', glyph: '🤖', vcpu: 32, ramGb: 256, gpu: 4, priceMonth: 210000, desc: 'งานฝึกโมเดล AI ต้องใช้ GPU และกินไฟสูงสุด' }
  };

  /* ---------- ยูทิลิตี ---------- */
  DC.get = (type) => DC.CATALOG[type];
  DC.catOf = (type) => (DC.CATALOG[type] ? DC.CATALOG[type].cat : 'support');
  DC.num = (v, d = 1) => (v === undefined || v === null || isNaN(v) ? '-' :
    Number(v).toLocaleString('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d }));
  DC.int = (v) => (v === undefined || v === null || isNaN(v) ? '-' : Math.round(v).toLocaleString('th-TH'));
  DC.money = (v) => {
    if (v === undefined || v === null || isNaN(v)) return '-';
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + ' ล้านบาท';
    if (Math.abs(v) >= 1e3) return Math.round(v / 1e3).toLocaleString('th-TH') + ' พันบาท';
    return Math.round(v).toLocaleString('th-TH') + ' บาท';
  };
  DC.clock = (sec) => {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  };
})();
