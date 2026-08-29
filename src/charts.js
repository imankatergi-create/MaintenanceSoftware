export function donut(segs, size = 132, thick = 17, centerTop = '', centerBot = '') {
  const r = (size - thick) / 2, c = size / 2, circ = 2 * Math.PI * r;
  const total = segs.reduce((s, x) => s + x.value, 0) || 1; let off = 0;
  const arcs = segs.map(s => {
    const len = s.value / total * circ;
    const dash = `${len} ${circ - len}`;
    const el = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${thick}" stroke-dasharray="${dash}" stroke-dashoffset="${-off}" transform="rotate(-90 ${c} ${c})" stroke-linecap="butt"/>`;
    off += len;
    return el;
  }).join('');
  return `<svg viewBox="0 0 ${size} ${size}" style="width:${size}px;height:${size}px;max-width:100%;height:auto" preserveAspectRatio="xMidYMid meet">
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="${thick}"/>${arcs}
    ${centerTop ? `<text x="${c}" y="${c - 2}" text-anchor="middle" font-family="Sora" font-weight="700" font-size="26" fill="var(--text)">${centerTop}</text>` : ''}
    ${centerBot ? `<text x="${c}" y="${c + 16}" text-anchor="middle" font-family="IBM Plex Sans" font-size="10.5" fill="var(--text-3)" letter-spacing=".5">${centerBot}</text>` : ''}
  </svg>`;
}

export function areaChart(data, w = 560, h = 170, color = 'var(--primary)', fill = 'var(--primary)') {
  const pad = { l: 34, r: 12, t: 14, b: 24 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const max = Math.max(...data.map(d => d.v)) * 1.12, min = Math.min(...data.map(d => d.v)) * .9;
  const X = i => pad.l + i * (iw / (data.length - 1));
  const Y = v => pad.t + ih - ((v - min) / (max - min)) * ih;
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(d.v).toFixed(1)}`).join(' ');
  const area = `${line} L${X(data.length - 1)} ${pad.t + ih} L${pad.l} ${pad.t + ih} Z`;
  const grid = [0, .25, .5, .75, 1].map(g => {
    const y = pad.t + ih - g * ih;
    return `<line x1="${pad.l}" y1="${y}" x2="${w - pad.r}" y2="${y}" stroke="var(--border)" stroke-width="1" ${g ? 'stroke-dasharray="3 4"' : ''}/>`;
  }).join('');
  const gid = 'ag' + Math.random().toString(36).slice(2, 7);
  const labels = data.map((d, i) => i % 2 === 0 ? `<text x="${X(i)}" y="${h - 6}" text-anchor="middle" font-size="10" fill="var(--text-3)">${d.l}</text>` : '').join('');
  const yl = [min, (min + max) / 2, max].map(v => {
    const y = Y(v);
    return `<text x="${pad.l - 8}" y="${y + 3}" text-anchor="end" font-size="9.5" fill="var(--text-3)">${Math.round(v)}</text>`;
  }).join('');
  const dot = `<circle cx="${X(data.length - 1)}" cy="${Y(data[data.length - 1].v)}" r="4.5" fill="${color}" stroke="var(--surface)" stroke-width="2.5"/>`;
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto" preserveAspectRatio="none">
    <defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${fill}" stop-opacity=".22"/><stop offset="1" stop-color="${fill}" stop-opacity="0"/></linearGradient></defs>
    ${grid}${yl}<path d="${area}" fill="url(#${gid})"/><path d="${line}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>${dot}${labels}
  </svg>`;
}

export function barChart(data, w = 560, h = 170) {
  const pad = { l: 30, r: 10, t: 14, b: 24 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const max = Math.max(...data.map(d => d.a + d.b)) * 1.15;
  const bw = iw / data.length * .5, step = iw / data.length;
  const Y = v => pad.t + ih - (v / max) * ih;
  const grid = [0, .5, 1].map(g => {
    const y = pad.t + ih - g * ih;
    return `<line x1="${pad.l}" y1="${y}" x2="${w - pad.r}" y2="${y}" stroke="var(--border)" stroke-width="1" ${g ? 'stroke-dasharray="3 4"' : ''}/>`;
  }).join('');
  const bars = data.map((d, i) => {
    const x = pad.l + i * step + step / 2 - bw / 2;
    const ha = (d.a / max) * ih, hb = (d.b / max) * ih;
    return `<rect x="${x}" y="${pad.t + ih - ha}" width="${bw}" height="${ha}" rx="2.5" fill="var(--primary)"/>
    <rect x="${x}" y="${pad.t + ih - ha - hb}" width="${bw}" height="${hb}" rx="2.5" fill="var(--warn)" opacity=".9"/>
    <text x="${x + bw / 2}" y="${h - 7}" text-anchor="middle" font-size="10" fill="var(--text-3)">${d.l}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto">${grid}${bars}</svg>`;
}

export function meter(pct, color) {
  const c = color || (pct >= 90 ? 'var(--ok)' : pct >= 75 ? 'var(--warn)' : 'var(--crit)');
  return `<div class="meter-lbl"><div class="meter" style="flex:1"><i style="width:${pct}%;background:${c}"></i></div><span class="pct">${pct}%</span></div>`;
}
