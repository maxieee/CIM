// Chart rendering — hand-drawn inline SVG, zero external dependencies
// Extracted from original CIM.html

import {
  CHART_COLORS,
  BENGALURU_DATA,
  PAN_INDIA_DATA,
  ASTRA_DATA,
  INDUSTRY_DATA,
  TECH_ADOPTION_DATA,
  SERVICES_DATA
} from './data.js';

export const BAR_DEPTH = 9;

function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

function wrapLabel(str, maxCharsPerLine) {
  const words = str.split(' ');
  const lines = [];
  let cur = '';
  words.forEach(w => {
    const test = cur ? cur + ' ' + w : w;
    if (test.length > maxCharsPerLine && cur) { lines.push(cur); cur = w; }
    else { cur = test; }
  });
  if (cur) lines.push(cur);
  return lines;
}

function addMultilineText(svg, x, y, lines, attrs, lineHeight) {
  const t = svgEl('text', Object.assign({ x, y }, attrs));
  lines.forEach((line, i) => {
    const tspan = svgEl('tspan', { x, dy: i === 0 ? 0 : lineHeight });
    tspan.textContent = line;
    t.appendChild(tspan);
  });
  svg.appendChild(t);
  return t;
}

function shadeColor(hex, percent) {
  const num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) & 0xFF, g = (num >> 8) & 0xFF, b = num & 0xFF;
  const adj = (c) => Math.min(255, Math.max(0, Math.round(c + (percent < 0 ? c * percent : (255 - c) * percent))));
  r = adj(r); g = adj(g); b = adj(b);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function vBar3D(svg, x, y, w, h, color, titleText) {
  const d = BAR_DEPTH;
  const topColor = shadeColor(color, 0.32);
  const sideColor = shadeColor(color, -0.32);
  const g = svgEl('g', {});
  const side = svgEl('polygon', { points: `${x+w},${y} ${x+w+d},${y-d} ${x+w+d},${y+h-d} ${x+w},${y+h}`, fill: sideColor });
  const top = svgEl('polygon', { points: `${x},${y} ${x+d},${y-d} ${x+w+d},${y-d} ${x+w},${y}`, fill: topColor });
  const front = svgEl('rect', { x, y, width: w, height: h, fill: color });
  g.appendChild(side); g.appendChild(top); g.appendChild(front);
  if (titleText) { const t = svgEl('title', {}); t.textContent = titleText; g.appendChild(t); }
  svg.appendChild(g);
}

function hBar3D(svg, x, y, w, h, color, titleText) {
  const d = BAR_DEPTH;
  const topColor = shadeColor(color, 0.32);
  const capColor = shadeColor(color, -0.32);
  const g = svgEl('g', {});
  const top = svgEl('polygon', { points: `${x},${y} ${x+d},${y-d} ${x+w+d},${y-d} ${x+w},${y}`, fill: topColor });
  const cap = svgEl('polygon', { points: `${x+w},${y} ${x+w+d},${y-d} ${x+w+d},${y+h-d} ${x+w},${y+h}`, fill: capColor });
  const front = svgEl('rect', { x, y, width: w, height: h, fill: color });
  g.appendChild(top); g.appendChild(cap); g.appendChild(front);
  if (titleText) { const t = svgEl('title', {}); t.textContent = titleText; g.appendChild(t); }
  svg.appendChild(g);
}

export function renderBengaluruChart(hostId) {
  const host = document.getElementById(hostId);
  if (!host) return;
  host.innerHTML = '';

  // Use BENGALURU_DATA from imports
  const data = BENGALURU_DATA;
  const W = 640 + BAR_DEPTH, H = 340 + BAR_DEPTH;
  const padL = 54, padR = 24 + BAR_DEPTH, padT = 30 + BAR_DEPTH, padB = 74;
  const chartW = W - padL - padR, chartH = H - padT - padB - BAR_DEPTH;
  const maxV = Math.max(...data.values) * 1.2;
  const gap = 70;
  const barW = (chartW - gap * (data.values.length - 1)) / data.values.length;
  const colors = [CHART_COLORS.rust, CHART_COLORS.teal];

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: 'auto', role: 'img', 'aria-label': 'Bengaluru weekly email volume bar chart' });

  for (let i = 0; i <= 4; i++) {
    const y = padT + chartH - (chartH * i / 4);
    const val = Math.round(maxV * i / 4);
    svg.appendChild(svgEl('line', { x1: padL, x2: padL + chartW, y1: y, y2: y, stroke: CHART_COLORS.grid, 'stroke-width': 1 }));
    const t = svgEl('text', { x: padL - 10, y: y + 4, 'text-anchor': 'end', 'font-size': 11, fill: CHART_COLORS.inkSoft });
    t.textContent = val;
    svg.appendChild(t);
  }

  data.values.forEach((v, i) => {
    const x = padL + i * (barW + gap);
    const h = chartH * v / maxV;
    const y = padT + chartH - h;
    vBar3D(svg, x, y, barW, h, colors[i % colors.length], data.labels[i] + ': ' + v + '+ emails in one week');
    const vt = svgEl('text', { x: x + barW / 2 + BAR_DEPTH / 2, y: y - BAR_DEPTH - 8, 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 700, fill: CHART_COLORS.ink });
    vt.textContent = v + '+';
    svg.appendChild(vt);
    const lines = wrapLabel(data.labels[i], 18);
    addMultilineText(svg, x + barW / 2, padT + chartH + 20, lines, { 'text-anchor': 'middle', 'font-size': 11.5, fill: CHART_COLORS.inkSoft }, 14);
  });

  host.appendChild(svg);
}

export function renderPanIndiaChart(hostId) {
  const host = document.getElementById(hostId);
  if (!host) return;
  host.innerHTML = '';

  // Use PAN_INDIA_DATA from imports
  const data = PAN_INDIA_DATA;
  const seriesKeys = ['emails', 'newReq', 'followUp'];
  const seriesColors = [CHART_COLORS.teal, CHART_COLORS.gold, CHART_COLORS.rust];
  const groupW = 92, seriesGap = 4, catGap = 22;
  const padL = 50, padR = 20 + BAR_DEPTH, padT = 20 + BAR_DEPTH, padB = 92;
  const barW = (groupW - seriesGap * (seriesKeys.length - 1)) / seriesKeys.length;
  const chartW = data.length * groupW + (data.length - 1) * catGap;
  const chartH = 340;
  const W = padL + chartW + padR, H = padT + chartH + padB;
  const maxV = Math.max(...data.map(d => Math.max(d.emails, d.newReq, d.followUp))) * 1.15;

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, style: 'min-width:' + W + 'px', role: 'img', 'aria-label': 'Pan-India daily request load by branch, grouped bar chart' });

  for (let i = 0; i <= 4; i++) {
    const y = padT + chartH - (chartH * i / 4);
    const val = Math.round(maxV * i / 4);
    svg.appendChild(svgEl('line', { x1: padL, x2: padL + chartW, y1: y, y2: y, stroke: CHART_COLORS.grid, 'stroke-width': 1 }));
    const t = svgEl('text', { x: padL - 10, y: y + 4, 'text-anchor': 'end', 'font-size': 10.5, fill: CHART_COLORS.inkSoft });
    t.textContent = val;
    svg.appendChild(t);
  }

  data.forEach((d, gi) => {
    const groupX = padL + gi * (groupW + catGap);
    seriesKeys.forEach((key, si) => {
      const v = d[key];
      const h = Math.max(chartH * v / maxV, 1.5);
      const x = groupX + si * (barW + seriesGap);
      const y = padT + chartH - h;
      const label = key === 'emails' ? 'Daily emails' : key === 'newReq' ? 'New requests/day' : 'Follow-ups/day';
      vBar3D(svg, x, y, barW, h, seriesColors[si], d.location + ' — ' + label + ': ' + v);
    });
    const labelText = svgEl('text', { x: groupX + groupW / 2, y: padT + chartH + 18, 'text-anchor': 'end', 'font-size': 11.5, fill: CHART_COLORS.inkSoft, transform: `rotate(-40 ${groupX + groupW / 2} ${padT + chartH + 18})` });
    labelText.textContent = d.location;
    svg.appendChild(labelText);
  });

  host.appendChild(svg);
}

export function renderAstraChart(hostId) {
  const host = document.getElementById(hostId);
  if (!host) return;
  host.innerHTML = '';

  // Use ASTRA_DATA from imports
  const data = ASTRA_DATA;
  const W = 640 + BAR_DEPTH, H = 240 + BAR_DEPTH;
  const padL = 130, padR = 60 + BAR_DEPTH, padT = 24 + BAR_DEPTH, padB = 20;
  const chartW = W - padL - padR, chartH = H - padT - padB;
  const barGap = 22;
  const barH = (chartH - barGap * (data.labels.length - 1)) / data.labels.length;
  const colors = [CHART_COLORS.gold, CHART_COLORS.rust, CHART_COLORS.ok];

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: 'auto', role: 'img', 'aria-label': 'Astra adoption by market horizontal bar chart' });

  [0, 25, 50, 75, 100].forEach(v => {
    const x = padL + chartW * v / 100;
    svg.appendChild(svgEl('line', { x1: x, x2: x, y1: padT, y2: padT + chartH - BAR_DEPTH, stroke: CHART_COLORS.grid, 'stroke-width': 1 }));
    const t = svgEl('text', { x, y: padT + chartH + 4, 'text-anchor': 'middle', 'font-size': 10.5, fill: CHART_COLORS.inkSoft });
    t.textContent = v + '%';
    svg.appendChild(t);
  });

  data.labels.forEach((label, i) => {
    const v = data.values[i];
    const y = padT + i * (barH + barGap);
    const w = chartW * v / 100;
    hBar3D(svg, padL, y, Math.max(w, 2), barH, colors[i % colors.length], label + ': ' + data.notes[i]);
    const lt = svgEl('text', { x: padL - 12, y: y + barH / 2 + 4, 'text-anchor': 'end', 'font-size': 13, 'font-weight': 600, fill: CHART_COLORS.ink });
    lt.textContent = label;
    svg.appendChild(lt);
    const vt = svgEl('text', { x: padL + w + BAR_DEPTH + 10, y: y + barH / 2 + 4, 'text-anchor': 'start', 'font-size': 13, 'font-weight': 700, fill: CHART_COLORS.ink });
    vt.textContent = v + '%';
    svg.appendChild(vt);
  });

  host.appendChild(svg);
}

export function renderGenericHBar(hostId, items, opts = {}) {
  const host = document.getElementById(hostId);
  if (!host) return;
  host.innerHTML = '';

  const suffix = opts.suffix || '';
  const maxV = opts.max || Math.max(...items.map(d => d.value)) * 1.18;
  const barH = 30, barGap = 16;
  const chartH = items.length * (barH + barGap) - barGap;
  const padL = opts.padL || 190, padR = 70 + BAR_DEPTH, padT = 10 + BAR_DEPTH, padB = 10;
  const chartW = opts.chartW || 500;
  const W = padL + chartW + padR, H = padT + chartH + padB;
  const colors = opts.colors || [CHART_COLORS.teal, CHART_COLORS.gold, CHART_COLORS.rust, CHART_COLORS.ok];

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: 'auto', role: 'img', 'aria-label': opts.ariaLabel || 'bar chart' });

  items.forEach((d, i) => {
    const y = padT + i * (barH + barGap);
    const w = chartW * d.value / maxV;
    hBar3D(svg, padL, y, Math.max(w, 2), barH, colors[i % colors.length], d.label + ': ' + d.value + suffix);
    const lt = svgEl('text', { x: padL - 12, y: y + barH / 2 + 4, 'text-anchor': 'end', 'font-size': 12.5, 'font-weight': 600, fill: CHART_COLORS.ink });
    lt.textContent = d.label;
    svg.appendChild(lt);
    const vt = svgEl('text', { x: padL + w + BAR_DEPTH + 10, y: y + barH / 2 + 4, 'text-anchor': 'start', 'font-size': 13, 'font-weight': 700, fill: CHART_COLORS.ink });
    vt.textContent = d.value + suffix;
    svg.appendChild(vt);
  });

  host.appendChild(svg);
}

export function renderAllCharts() {
  try {
    renderBengaluruChart('chart-bengaluru');
    renderPanIndiaChart('chart-panindia');
    renderAstraChart('chart-astra');
  } catch (e) {
    console.error('Chart render failed', e);
  }
}

export function renderAllChartsP2() {
  try {
    renderGenericHBar('chart-industry', INDUSTRY_DATA, {
      suffix: ' companies', padL: 250, ariaLabel: 'Industry concentration among 38 evaluated prospects'
    });
    renderGenericHBar('chart-techadopt', TECH_ADOPTION_DATA, {
      suffix: '%', max: 100, padL: 150, colors: [CHART_COLORS.teal, CHART_COLORS.gold, CHART_COLORS.rust],
      ariaLabel: 'ERP, DMS and CRM technology adoption rates'
    });
    renderGenericHBar('chart-services', SERVICES_DATA, {
      suffix: ' accts', padL: 150, ariaLabel: 'Recommended service frequency across evaluated prospects'
    });
  } catch (e) {
    console.error('Project Two chart render failed', e);
  }
}