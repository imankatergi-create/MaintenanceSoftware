export const chk = t => ({ t, type: 'check' });
export const rd = (t, unit, nominal, min, max) => ({ t, type: 'reading', unit, nominal, min, max });

const ELEC = {
  title: 'Electrical Safety — IEC 62353',
  items: [
    rd('Protective earth resistance', 'Ω', 0.08, 0, 0.2),
    rd('Equipment leakage current', 'mA', 0.12, 0, 0.5),
    rd('Touch / enclosure leakage', 'µA', 48, 0, 100),
  ],
};

const VISUAL = {
  title: 'Visual & Physical Inspection',
  items: [
    chk('Housing, casing & mounting free of damage'),
    chk('Cables, connectors & accessories intact'),
    chk('Cleaning & disinfection verified'),
    chk('Warning labels & markings legible'),
  ],
};

export const CHECKLISTS = {
  generic: {
    sections: [VISUAL, ELEC, {
      title: 'Functional Test',
      items: [
        chk('Power-on self-test passes'),
        chk('Alarms audible & visible'),
        chk('Battery backup operational'),
        chk('Controls & display operate correctly'),
      ],
    }],
  },
  ventilator: {
    sections: [VISUAL, {
      title: 'Functional Performance',
      items: [
        rd('Delivered tidal volume', 'mL', 500, 450, 550),
        rd('Airway pressure', 'cmH₂O', 20, 18, 22),
        rd('FiO₂ accuracy', '%', 21, 19, 23),
        rd('Respiratory rate', 'bpm', 12, 11, 13),
        chk('Apnoea & disconnect alarms operate'),
        chk('O₂ cell calibrated'),
      ],
    }, ELEC],
  },
  defib: {
    sections: [VISUAL, {
      title: 'Energy & Function',
      items: [
        rd('Delivered energy @ 200 J', 'J', 200, 190, 210),
        rd('Charge time to 200 J', 's', 7, 0, 10),
        chk('ECG display accurate & clear'),
        chk('Pacing function operational'),
        chk('Battery fully charged & holds'),
        chk('Self-test log reviewed'),
      ],
    }, ELEC],
  },
  anesthesia: {
    sections: [VISUAL, {
      title: 'Gas & Function',
      items: [
        rd('O₂ concentration delivered', '%', 100, 95, 100),
        rd('Vaporizer output', '%', 2, 1.8, 2.2),
        chk('Circuit leak < 200 mL/min'),
        chk('Scavenging system functional'),
        chk('O₂ failure alarm operates'),
        chk('Ventilator mode functional'),
      ],
    }, ELEC],
  },
  imaging: {
    sections: [VISUAL, {
      title: 'Performance & Radiation Safety',
      items: [
        chk('Image-quality phantom test passes'),
        rd('kVp accuracy', 'kVp', 80, 76, 84),
        rd('Radiation output', 'mGy', 5, 4.5, 5.5),
        chk('Emergency stop functional'),
        chk('Interlocks & warning lights operational'),
      ],
    }, ELEC],
  },
  posttest: {
    sections: [{
      title: 'Post-Repair Verification',
      items: [
        chk('Repair action verified effective'),
        chk('Functional test passes'),
        rd('Electrical safety — earth leakage', 'mA', 0.12, 0, 0.5),
        chk('Performance within specification'),
        chk('Equipment cleaned & ready for service'),
      ],
    }],
  },
};

export function tplTotal(tpl) {
  return tpl.sections.reduce((s, x) => s + x.items.length, 0);
}

export function progressOf(checklist, tplKey) {
  const tpl = CHECKLISTS[tplKey];
  if (!tpl) return { done: 0, fails: 0, failItems: [], total: 0 };
  let done = 0, fails = 0;
  const failItems = [];
  tpl.sections.forEach((sec, si) => {
    sec.items.forEach((it, ii) => {
      const r = checklist[si + '-' + ii];
      if (r && r.result) {
        done++;
        if (r.result === 'fail') {
          fails++;
          if (it.type === 'reading') {
            failItems.push({ title: it.t, val: r.val, unit: it.unit, min: it.min, max: it.max });
          } else {
            failItems.push({ title: it.t, val: '—', unit: '', min: '', max: '' });
          }
        }
      }
    });
  });
  return { done, fails, failItems, total: tplTotal(tpl) };
}

export const CORR_STEPS = ['Reported', 'Triaged', 'Assigned', 'Accepted', 'Diagnosis', 'Repair', 'Post-Repair Testing', 'Verification', 'Closed'];

export function corrStepFromStatus(s) {
  return { triaged: 1, assigned: 2, accepted: 3, inprogress: 5, awaitparts: 5, onhold: 5, closed: 8 }[s] ?? 1;
}

export function addInterval(d, freq) {
  const dt = new Date(d);
  const m = { Quarterly: 3, 'Semi-annual': 6, Annual: 12, Monthly: 1, Weekly: 0 }[freq] ?? 3;
  dt.setMonth(dt.getMonth() + m);
  return dt.toISOString().slice(0, 10);
}
