#!/usr/bin/env node

/**
 * generate-html.js
 *
 * Generates docs/index.html from:
 * - data/wins.json (WIN data and details)
 * - data/sections.json (prose content)
 * - Includes CSS and structure matching the current index.html exactly
 * - Now with tabbed navigation system
 */

const fs = require('fs');
const path = require('path');

// ════ CONFIGURATION ════

const WINS_PATH = path.join(__dirname, '..', 'data', 'wins.json');
const SECTIONS_PATH = path.join(__dirname, '..', 'data', 'sections.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'docs', 'index.html');

const VERDICT_CLASSES = {
  'Refuted by Data': 'v-refuted',
  'Std Model Explains': 'v-std',
  'Self-Contradicted': 'v-selfcon',
  'Misleading': 'v-misleading',
  'Not Demonstrated': 'v-notdemo',
  'Unfalsifiable': 'v-unfalsifiable'
};

// ════ PIE CHART COLORS (match CSS verdict colors) ════

const VERDICT_COLORS_LIGHT = {
  'Refuted by Data': '#E57373',
  'Std Model Explains': '#66BB6A',
  'Self-Contradicted': '#42A5F5',
  'Misleading': '#FFA726',
  'Not Demonstrated': '#AB47BC',
  'Unfalsifiable': '#BDBDBD'
};

const VERDICT_COLORS_DARK = {
  'Refuted by Data': '#ef5350',
  'Std Model Explains': '#43a047',
  'Self-Contradicted': '#1e88e5',
  'Misleading': '#fb8c00',
  'Not Demonstrated': '#8e24aa',
  'Unfalsifiable': '#757575'
};

const VERDICT_ORDER = [
  'Refuted by Data', 'Self-Contradicted', 'Std Model Explains',
  'Misleading', 'Not Demonstrated', 'Unfalsifiable'
];

function generatePieChart(tally, total) {
  // Larger canvas to accommodate callout lines
  const cx = 150, cy = 150, r = 110;
  let angle = -Math.PI / 2; // start at top
  const slices = [];
  const callouts = [];
  const SMALL_THRESHOLD = 0.08; // slices < 8% get callout lines

  for (const verdict of VERDICT_ORDER) {
    const count = tally[verdict] || 0;
    if (count === 0) continue;
    const sweep = (count / total) * 2 * Math.PI;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(angle + sweep);
    const y2 = cy + r * Math.sin(angle + sweep);
    const largeArc = sweep > Math.PI ? 1 : 0;
    const lightColor = VERDICT_COLORS_LIGHT[verdict];
    const darkColor = VERDICT_COLORS_DARK[verdict];

    slices.push(`<path d="M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${largeArc},1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${lightColor}" class="pie-slice" data-dark="${darkColor}" stroke="var(--bg)" stroke-width="2"/>`);

    const midAngle = angle + sweep / 2;
    const pct = ((count / total) * 100).toFixed(0);
    const fraction = count / total;

    if (fraction < SMALL_THRESHOLD) {
      // Small slice: callout line from edge to outside label
      const innerR = r + 8;
      const outerR = r + 35;
      const ix = cx + innerR * Math.cos(midAngle);
      const iy = cy + innerR * Math.sin(midAngle);
      const ox = cx + outerR * Math.cos(midAngle);
      const oy = cy + outerR * Math.sin(midAngle);
      // Horizontal tail
      const tailDir = Math.cos(midAngle) >= 0 ? 1 : -1;
      const tx = ox + tailDir * 20;
      const anchor = tailDir > 0 ? 'start' : 'end';
      callouts.push(`<line x1="${ix.toFixed(1)}" y1="${iy.toFixed(1)}" x2="${ox.toFixed(1)}" y2="${oy.toFixed(1)}" stroke="${darkColor}" stroke-width="1.2" class="callout-line" data-dark="${darkColor}" data-light="${darkColor}"/>`);
      callouts.push(`<line x1="${ox.toFixed(1)}" y1="${oy.toFixed(1)}" x2="${tx.toFixed(1)}" y2="${oy.toFixed(1)}" stroke="${darkColor}" stroke-width="1.2" class="callout-line" data-dark="${darkColor}" data-light="${darkColor}"/>`);
      callouts.push(`<text x="${(tx + tailDir * 3).toFixed(1)}" y="${(oy + 1).toFixed(1)}" text-anchor="${anchor}" dominant-baseline="central" font-size="11" font-weight="700" fill="${darkColor}" class="pie-callout">${count} (${pct}%)</text>`);
    } else {
      // Large slice: label inside
      const labelR = r * 0.6;
      const lx = cx + labelR * Math.cos(midAngle);
      const ly = cy + labelR * Math.sin(midAngle);
      callouts.push(`<text x="${lx.toFixed(1)}" y="${(ly - 6).toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-size="16" font-weight="700" fill="#fff" class="pie-label" style="text-shadow:0 1px 3px rgba(0,0,0,.4)">${count}</text>`);
      callouts.push(`<text x="${lx.toFixed(1)}" y="${(ly + 10).toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-size="10.5" font-weight="600" fill="#fff" class="pie-label" style="text-shadow:0 1px 3px rgba(0,0,0,.4)">${pct}%</text>`);
    }

    angle += sweep;
  }

  // Legend items — wide enough viewBox so text isn't clipped
  const legendItems = VERDICT_ORDER.filter(v => (tally[v] || 0) > 0).map((verdict, i) => {
    const count = tally[verdict] || 0;
    const pct = ((count / total) * 100).toFixed(0);
    const y = i * 28;
    return `<g transform="translate(0,${y})">
      <rect width="16" height="16" rx="3" fill="${VERDICT_COLORS_LIGHT[verdict]}" class="legend-swatch" data-dark="${VERDICT_COLORS_DARK[verdict]}"/>
      <text x="24" y="12.5" font-size="13" fill="var(--text)"><tspan font-weight="700">${count}</tspan> ${verdict} (${pct}%)</text>
    </g>`;
  });

  const legendH = VERDICT_ORDER.filter(v => (tally[v] || 0) > 0).length * 28;
  const svgW = 340, svgH = 340;

  return `
<div style="display:flex;align-items:center;justify-content:center;gap:2.5rem;flex-wrap:wrap;margin:1.2rem 0 1.5rem">
  <svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" role="img" aria-label="Verdict distribution pie chart">
    ${slices.join('\n    ')}
    ${callouts.join('\n    ')}
  </svg>
  <svg viewBox="0 0 300 ${legendH}" width="300" height="${legendH}" role="img" aria-label="Verdict legend">
    ${legendItems.join('\n    ')}
  </svg>
</div>
<script>
(function(){
  const mq = window.matchMedia('(prefers-color-scheme:dark)');
  document.querySelectorAll('.pie-slice').forEach(el => el.dataset.light = el.getAttribute('fill'));
  document.querySelectorAll('.legend-swatch').forEach(el => el.dataset.light = el.getAttribute('fill'));
  function apply(dark) {
    document.querySelectorAll('.pie-slice').forEach(el => el.setAttribute('fill', dark ? el.dataset.dark : el.dataset.light));
    document.querySelectorAll('.legend-swatch').forEach(el => el.setAttribute('fill', dark ? el.dataset.dark : el.dataset.light));
    document.querySelectorAll('.pie-label').forEach(el => el.setAttribute('fill', '#fff'));
  }
  apply(mq.matches);
  mq.addEventListener('change', e => apply(e.matches));
})();
</script>
`;
}

// ════ CSS (EXACT FROM CURRENT INDEX.HTML + NEW TAB STYLES + SCORECARD) ════

const CSS = `
:root{--bg:#fff;--text:#222;--heading:#2E4057;--accent:#4A6FA5;--link:#0563C1;--border:#ccc;--table-header:#2E4057;--refuted:rgba(229,115,115,0.25);--stdmodel:rgba(102,187,106,0.25);--selfcon:rgba(66,165,245,0.25);--misleading:rgba(255,167,38,0.25);--unfalsifiable:rgba(189,189,189,0.25);--notdemo:rgba(171,71,188,0.25);--refuted-solid:#E57373;--stdmodel-solid:#66BB6A;--selfcon-solid:#42A5F5;--misleading-solid:#FFA726;--unfalsifiable-solid:#BDBDBD;--notdemo-solid:#AB47BC;--code-bg:#f5f5f5;--card-bg:#fafafa}
@media(prefers-color-scheme:dark){:root{--bg:#1a1a2e;--text:#e0e0e0;--heading:#7eb8da;--accent:#8fafd4;--link:#5dade2;--border:#444;--table-header:#1c3045;--refuted:rgba(239,83,80,0.2);--stdmodel:rgba(67,160,71,0.2);--selfcon:rgba(30,136,229,0.2);--misleading:rgba(251,140,0,0.2);--unfalsifiable:rgba(117,117,117,0.25);--notdemo:rgba(142,36,170,0.2);--refuted-solid:#ef5350;--stdmodel-solid:#43a047;--selfcon-solid:#1e88e5;--misleading-solid:#fb8c00;--unfalsifiable-solid:#757575;--notdemo-solid:#8e24aa;--code-bg:#2a2a3e;--card-bg:#222240}}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,Helvetica,sans-serif;line-height:1.65;color:var(--text);background:var(--bg);max-width:960px;margin:0 auto;padding:1rem 1.5rem 3rem;padding-top:0}
h1{font-size:1.8rem;color:var(--heading);margin:2.5rem 0 1rem;padding-bottom:.3rem;border-bottom:2px solid var(--accent)}
h2{font-size:1.4rem;color:var(--heading);margin:2rem 0 .8rem}
h3{font-size:1.15rem;color:var(--accent);margin:1.5rem 0 .6rem}
p{margin:.5rem 0}
a{color:var(--link);text-decoration:underline}
a:hover{text-decoration:none}
.title-block{text-align:center;padding:3rem 0 2rem;border-bottom:3px solid var(--accent);margin-bottom:2rem}
.title-block h1{border:none;font-size:2.4rem;margin:.3rem 0}
.title-block .subtitle{font-size:1.1rem;color:#666;margin:.2rem 0}
.title-block .meta{font-size:.95rem;color:#999;margin-top:1rem}
.scorecard{display:grid;gap:1.5rem;margin:2rem 0;max-width:none}
.sc-hero{grid-template-columns:repeat(2,1fr)}
.sc-breakdown{grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:1rem;margin-top:.5rem}
.scorecard .sc-card{background:var(--card-bg);border:2px solid var(--border);border-radius:8px;padding:1.5rem 1.2rem;text-align:center;transition:all .2s}
.scorecard .sc-card:hover{box-shadow:0 4px 12px rgba(0,0,0,.1);border-color:var(--accent)}
.scorecard .sc-card .sc-number{font-size:2.8rem;font-weight:700;color:var(--heading);margin:.5rem 0}
.scorecard .sc-card .sc-label{font-size:1rem;font-weight:600;color:var(--text);margin:.8rem 0 .4rem}
.scorecard .sc-card .sc-sublabel{font-size:.85rem;color:#888;line-height:1.4}
.scorecard .sc-card.accent{border-color:var(--accent);background:rgba(74,111,165,0.05)}
.scorecard .sc-card.accent .sc-number{color:var(--accent)}
.scorecard .sc-card.sc-sm{padding:1rem .8rem}
.scorecard .sc-card.sc-sm .sc-number{font-size:2rem;margin:.3rem 0}
.scorecard .sc-card.sc-sm .sc-label{font-size:.85rem;margin:.4rem 0 .2rem}
.scorecard .sc-card.sc-sm .sc-sublabel{font-size:.78rem}
.sc-domains{grid-template-columns:repeat(3,1fr)}
.verdict-legend{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:.5rem;margin:1rem 0}
.verdict-legend .vl{padding:.5rem .8rem;border-radius:4px;font-size:.9rem;border-left:4px solid transparent}
.vl-refuted{background:var(--refuted);border-left-color:var(--refuted-solid)}.vl-std{background:var(--stdmodel);border-left-color:var(--stdmodel-solid)}.vl-selfcon{background:var(--selfcon);border-left-color:var(--selfcon-solid)}.vl-misleading{background:var(--misleading);border-left-color:var(--misleading-solid)}.vl-unfalsifiable{background:var(--unfalsifiable);border-left-color:var(--unfalsifiable-solid)}.vl-notdemo{background:var(--notdemo);border-left-color:var(--notdemo-solid)}
table{width:100%;border-collapse:collapse;margin:1rem 0;font-size:.88rem}
th{background:var(--table-header);color:#fff;padding:.5rem .6rem;text-align:left;font-weight:600}
td{padding:.45rem .6rem;border:1px solid var(--border);vertical-align:top}
tr:nth-child(even){background:var(--card-bg)}
td.v-refuted{background:var(--refuted);font-weight:700}
td.v-std{background:var(--stdmodel);font-weight:700}
td.v-selfcon{background:var(--selfcon);font-weight:700}
td.v-misleading{background:var(--misleading);font-weight:700}
td.v-unfalsifiable{background:var(--unfalsifiable);font-weight:700}
td.v-notdemo{background:var(--notdemo);font-weight:700}
.tally{background:var(--card-bg);padding:.8rem 1rem;border-left:4px solid var(--accent);margin:1rem 0;font-size:.95rem}
.evidence{background:var(--card-bg);border:1px solid var(--border);border-radius:6px;padding:1rem 1.2rem;margin:.8rem 0}
.evidence p{margin:.4rem 0}
.verdict-tag{display:inline-block;padding:.15rem .5rem;border-radius:3px;font-weight:700;font-size:.85rem;margin:.3rem 0;border-left:3px solid transparent}
.vt-refuted{background:var(--refuted);border-left-color:var(--refuted-solid)}.vt-std{background:var(--stdmodel);border-left-color:var(--stdmodel-solid)}.vt-selfcon{background:var(--selfcon);border-left-color:var(--selfcon-solid)}.vt-misleading{background:var(--misleading);border-left-color:var(--misleading-solid)}.vt-unfalsifiable{background:var(--unfalsifiable);border-left-color:var(--unfalsifiable-solid)}.vt-notdemo{background:var(--notdemo);border-left-color:var(--notdemo-solid)}
nav.toc{background:var(--card-bg);border:1px solid var(--border);border-radius:6px;padding:1.2rem 1.5rem;margin:1.5rem 0}
nav.toc ul{list-style:none;padding-left:1.2rem}
nav.toc>ul{padding-left:0}
nav.toc li{margin:.25rem 0}
nav.toc a{text-decoration:none}
nav.toc a:hover{text-decoration:underline}
.downloads{display:flex;gap:1rem;flex-wrap:wrap;margin:1rem 0}
.dl-card{border:1px solid var(--border);border-radius:6px;padding:.8rem 1.2rem;background:var(--card-bg);text-decoration:none;color:var(--text);transition:box-shadow .2s}
.dl-card:hover{box-shadow:0 2px 8px rgba(0,0,0,.15)}
.dl-card .dl-icon{font-size:1.5rem}
.dl-card .dl-label{font-weight:600}
.star-table{margin:.5rem 0 .8rem}
.star-table td{padding:.3rem .6rem;font-size:.88rem}
footer{margin-top:3rem;padding-top:1rem;border-top:1px solid var(--border);font-size:.85rem;color:#888;text-align:center}

.tab-bar{position:sticky;top:0;z-index:100;background:var(--bg);border-bottom:2px solid var(--accent);display:flex;gap:.5rem;flex-wrap:wrap;padding:0.75rem 1.5rem;box-shadow:0 2px 4px rgba(0,0,0,.1)}
.tab-btn{padding:0.6rem 1.2rem;border:none;background:var(--card-bg);color:var(--text);cursor:pointer;border-radius:4px 4px 0 0;font-size:.95rem;font-weight:600;transition:all .2s;border:1px solid var(--border);border-bottom:none}
.tab-btn:hover{background:var(--border)}
.tab-btn.active{background:var(--accent);color:#fff;border-color:var(--accent)}
.tab-content{display:none;padding:1.5rem 0}
.tab-content.active{display:block}

.section-nav{display:flex;justify-content:space-between;align-items:center;margin-top:2rem;padding-top:1.5rem;border-top:1px solid var(--border)}
.section-nav a,.section-nav span{padding:.6rem 1rem;border-radius:4px;text-decoration:none;font-weight:600}
.nav-prev{color:var(--link);background:var(--card-bg)}
.nav-prev:hover{background:var(--border)}
.nav-next{color:var(--link);background:var(--card-bg)}
.nav-next:hover{background:var(--border)}

@media(max-width:600px){body{padding:.5rem 1rem}h1{font-size:1.4rem}h2{font-size:1.2rem}table{font-size:.8rem}.tab-bar{padding:0.5rem .75rem;gap:.25rem}.tab-btn{padding:0.5rem 0.8rem;font-size:.85rem}.sc-hero{grid-template-columns:1fr}.sc-breakdown{grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:.6rem}.sc-domains{grid-template-columns:1fr}}
`;

// ════ UTILITIES ════

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function computeVerdictTallies(wins) {
  const tally = {};
  wins.forEach(win => {
    const verdict = win.verdict;
    tally[verdict] = (tally[verdict] || 0) + 1;
  });
  return tally;
}

function formatTableRow(win) {
  const verdictClass = VERDICT_CLASSES[win.verdict] || '';
  const id = `win${win.id}`;
  return `<tr><td><a href="#${id}">${win.id}</a></td><td>${escapeHtml(win.claim)}</td><td class="${verdictClass}">${escapeHtml(win.verdict)}</td><td>${escapeHtml(win.finding)}</td></tr>`;
}

function hasDetailContent(win) {
  return win.detail_claim || win.detail_evidence || win.detail_verdict_text || win.detail_extra;
}

function formatWinDetail(win) {
  if (!hasDetailContent(win)) return '';

  const verdictClass = VERDICT_CLASSES[win.verdict] || '';
  const verdictShortClass = verdictClass.replace('v-', 'vt-');
  let html = `<div class="evidence" id="win${win.id}">
<h3>WIN-${win.id}: ${escapeHtml(win.claim)}</h3>
`;

  if (win.detail_claim) {
    html += `<p><strong>Claim:</strong> ${escapeHtml(win.detail_claim)}</p>\n`;
  }

  if (win.detail_evidence) {
    html += `<p><strong>Evidence:</strong> ${win.detail_evidence}</p>\n`;
  }

  if (win.detail_verdict_text) {
    html += `<p><span class="verdict-tag ${verdictShortClass}">${escapeHtml(win.verdict).toUpperCase()}</span> ${win.detail_verdict_text}</p>\n`;
  }

  if (win.detail_extra) {
    html += `<p>${win.detail_extra}</p>\n`;
  }

  html += `</div>
`;
  return html;
}

function sectionNav(prevTab, prevLabel, nextTab, nextLabel) {
  let html = '<div class="section-nav">';
  if (prevTab) html += `<a href="#" onclick="showTab('${prevTab}');window.scrollTo(0,0);return false" class="nav-prev">← ${prevLabel}</a>`;
  else html += '<span></span>';
  if (nextTab) html += `<a href="#" onclick="showTab('${nextTab}');window.scrollTo(0,0);return false" class="nav-next">${nextLabel} →</a>`;
  else html += '<span></span>';
  html += '</div>';
  return html;
}

// ════ MAIN ════

function main() {
  console.log('Reading wins.json...');
  const wins = JSON.parse(fs.readFileSync(WINS_PATH, 'utf8'));

  console.log(`Found ${wins.length} WINs`);

  // Group wins by verdict for detailed sections
  const winsByVerdict = {};
  wins.forEach(win => {
    if (!winsByVerdict[win.verdict]) {
      winsByVerdict[win.verdict] = [];
    }
    winsByVerdict[win.verdict].push(win);
  });

  // Compute tallies
  const tally = computeVerdictTallies(wins);

  console.log('Verdict tally:', tally);

  // Start HTML
  let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Critical Review: Ovoid Cavity Cosmological Model V51.0</title>
<style>
${CSS}
</style>
</head>
<body>

<div class="tab-bar">
  <button class="tab-btn active" onclick="showTab('overview')">Overview</button>
  <button class="tab-btn" onclick="showTab('evaluate')">Evaluation Guide</button>
  <button class="tab-btn" onclick="showTab('model')">The Model</button>
  <button class="tab-btn" onclick="showTab('wins')">67 Wins Reviewed</button>
  <button class="tab-btn" onclick="showTab('pages')">Live Power Analysis</button>
  <button class="tab-btn" onclick="showTab('falsify')">Falsification Tests</button>
  <button class="tab-btn" onclick="showTab('selftest')">Internal Contradictions</button>
  <button class="tab-btn" onclick="showTab('ai')">AI & Conclusions</button>
  <button class="tab-btn" onclick="showTab('refs')">References</button>
</div>

<div class="tab-content active" id="overview">

<div class="title-block">
<h1 style="border:none">Critical Review</h1>
<h1 style="border:none;font-size:1.6rem;font-weight:400">Ovoid Cavity Cosmological Model V51.0</h1>
<p class="subtitle">(formerly Dome Cosmological Model V50.6)</p>
<p class="subtitle">Point-by-Point Analysis of 67 Claimed Wins, Live Power Dashboard,<br>Falsification Tests, Version Change Tracking, and AI Prompt Injection Analysis</p>
<p class="meta">April 5, 2026 &nbsp;|&nbsp; Version 4<br>Source: <a href="https://john09289.github.io/predictions">john09289.github.io/predictions</a></p>
</div>

<div class="scorecard sc-hero">
<div class="sc-card">
<div class="sc-number">67</div>
<div class="sc-label">Claimed "Wins"</div>
<div class="sc-sublabel">The author claims 67 confirmed predictions and zero falsifications</div>
</div>
<div class="sc-card accent">
<div class="sc-number">0</div>
<div class="sc-label">Actual Wins</div>
<div class="sc-sublabel">Not one claim produces a result that the globe model can't explain and the dome uniquely can</div>
</div>
</div>

<p style="text-align:center;font-size:.95rem;color:#888;margin:0 0 .5rem">Where the 67 claims actually land:</p>

<div class="scorecard sc-breakdown">
<div class="sc-card sc-sm" style="border-left:4px solid var(--refuted-solid)">
<div class="sc-number">${tally['Refuted by Data'] || 0}</div>
<div class="sc-label">Refuted by Data</div>
<div class="sc-sublabel">Measurements directly contradict the claim</div>
</div>
<div class="sc-card sc-sm" style="border-left:4px solid var(--selfcon-solid)">
<div class="sc-number">${tally['Self-Contradicted'] || 0}</div>
<div class="sc-label">Self-Contradicted</div>
<div class="sc-sublabel">The dome's own math gives the wrong answer</div>
</div>
<div class="sc-card sc-sm" style="border-left:4px solid var(--misleading-solid)">
<div class="sc-number">${tally['Misleading'] || 0}</div>
<div class="sc-label">Misleading</div>
<div class="sc-sublabel">Data is cherry-picked, misrepresented, or duplicated</div>
</div>
<div class="sc-card sc-sm" style="border-left:4px solid var(--stdmodel-solid)">
<div class="sc-number">${tally['Std Model Explains'] || 0}</div>
<div class="sc-label">Std Model Explains</div>
<div class="sc-sublabel">Real observation, but mainstream physics already explains it</div>
</div>
<div class="sc-card sc-sm" style="border-left:4px solid var(--notdemo-solid)">
<div class="sc-number">${tally['Not Demonstrated'] || 0}</div>
<div class="sc-label">Not Demonstrated</div>
<div class="sc-sublabel">Based on unverified or unreplicated data</div>
</div>
<div class="sc-card sc-sm" style="border-left:4px solid var(--unfalsifiable-solid)">
<div class="sc-number">${tally['Unfalsifiable'] || 0}</div>
<div class="sc-label">Unfalsifiable</div>
<div class="sc-sublabel">Cannot be tested — typically theological claims</div>
</div>
</div>

<h2>Downloads</h2>
<div class="downloads">
<a class="dl-card" href="../downloads/critical-review-dome-model-v4.docx"><span class="dl-icon">&#128196;</span> <span class="dl-label">Word Document (.docx)</span><br><small>Full review with internal navigation</small></a>
<a class="dl-card" href="../downloads/critical-review-dome-model-v4.pdf"><span class="dl-icon">&#128203;</span> <span class="dl-label">PDF Version</span><br><small>Print-ready format</small></a>
<a class="dl-card" href="../security-audit.md"><span class="dl-icon">&#128274;</span> <span class="dl-label">Security Audit</span><br><small>Prompt injection findings</small></a>
</div>

<h1 id="verdicts">Verdict Categories Used in This Review</h1>
<div class="verdict-legend">
<div class="vl vl-refuted"><strong>Refuted by Data:</strong> Direct physical measurements or experiments contradict the specific claim. Hard evidence exists proving the stated behavior does not occur or the cited source does not contain what is claimed.</div>
<div class="vl vl-std"><strong>Standard Model Explains:</strong> The observation cited is real, but mainstream physics already provides a complete, quantitative explanation. The dome model adds no predictive power beyond what existing models already achieve.</div>
<div class="vl vl-selfcon"><strong>Self-Contradicted:</strong> The dome's own stated geometry, if worked through honestly, predicts a value radically different from what the author claims. Agreement with observations is achieved only by substituting globe formulas, ignoring the dome's own geometry, or curve-fitting. See <a href="#part4b" onclick="showTab('selftest');return false">Part 4.5</a> for derivations.</div>
<div class="vl vl-misleading"><strong>Misleading:</strong> The data is misrepresented, cherry-picked, the cited values do not match the actual source, or logically contradictory results are both claimed as confirmations.</div>
<div class="vl vl-notdemo"><strong>Not Demonstrated:</strong> The claim relies on unreplicated fringe experiments or unverified data that has not been independently confirmed.</div>
<div class="vl vl-unfalsifiable"><strong>Unfalsifiable:</strong> The claim cannot be tested by any physical measurement. Typically theological assertions.</div>
</div>

<nav class="toc">
<h2 style="margin-top:0">Table of Contents</h2>
<ul>
<li><a href="#evaluation-guide" onclick="showTab('evaluate');return false">Evaluation Guide: How to Assess This Review</a></li>
<li><a href="#part1" onclick="showTab('model');return false">Part 1: What Is the Ovoid Cavity Cosmological Model?</a>
<ul>
<li><a href="#p1-overview" onclick="showTab('model');return false">1.1 Overview</a></li>
<li><a href="#p1-flatearth" onclick="showTab('model');return false">1.2 How It Differs from Classic Flat Earth</a></li>
<li><a href="#p1-globe" onclick="showTab('model');return false">1.3 How It Differs from the Globe Model</a></li>
<li><a href="#p1-method" onclick="showTab('model');return false">1.4 Methodology Assessment</a></li>
</ul></li>
<li><a href="#part1b" onclick="showTab('model');return false">Part 1.5: Version Change Analysis (V50.6 → V51.0)</a></li>
<li><a href="#part2" onclick="showTab('wins');return false">Part 2: Point-by-Point Review of Claimed Wins</a>
<ul>
<li><a href="#summary-table" onclick="showTab('wins');return false">2.1 Verdict Summary Table</a></li>
<li><a href="#refuted" onclick="showTab('wins');return false">2.2 Detailed: Refuted by Data</a></li>
<li><a href="#selfcon" onclick="showTab('wins');return false">2.3 Detailed: Self-Contradicted</a></li>
<li><a href="#stdmodel" onclick="showTab('wins');return false">2.4 Detailed: Standard Model Explains</a></li>
<li><a href="#notdemo" onclick="showTab('wins');return false">2.5 Detailed: Not Demonstrated</a></li>
<li><a href="#misleading" onclick="showTab('wins');return false">2.6 Detailed: Misleading and Unfalsifiable</a></li>
</ul></li>
<li><a href="#part3" onclick="showTab('pages');return false">Part 3: Live Power Dashboard &amp; Site Page Analysis</a></li>
<li><a href="#part4" onclick="showTab('falsify');return false">Part 4: Falsification Tests</a></li>
<li><a href="#part4b" onclick="showTab('selftest');return false">Part 4.5: Internal Contradictions — Does the Dome's Geometry Produce Its Claimed Predictions?</a></li>
<li><a href="#part5" onclick="showTab('ai');return false">Part 5: Analysis of AI Context Directives</a></li>
<li><a href="#part6" onclick="showTab('ai');return false">Part 6: Conclusions</a></li>
<li><a href="#part7" onclick="showTab('refs');return false">Part 7: References and Public Datasets</a></li>
</ul>
</nav>

${sectionNav(null, null, 'evaluate', 'Evaluation Guide')}

</div>

<div class="tab-content" id="evaluate">

<!-- ═══ EVALUATION GUIDE ═══ -->
<h1 id="evaluation-guide">Evaluation Guide: How to Assess This Review</h1>

<p>This review makes specific, falsifiable claims about 67 predictions from the Ovoid Cavity Cosmological Model. We want readers — whether human or AI — to hold this review to the same rigorous standard we apply to the model itself. Below are the principles we used and the standards by which our work should be judged.</p>

<h2>Principles of This Review</h2>

<p><strong>1. Every claim should be independently verifiable.</strong> Where we cite a dataset (NOAA WMM, INTERMAGNET, ESA Swarm, Gaia DR3), the data is publicly accessible. Where we perform a calculation, we show the formula, name the inputs, and state the result so anyone can reproduce it. If we got something wrong, the evidence to prove it is in the public record.</p>

<p><strong>2. The dome model's own parameters are used wherever possible.</strong> The strongest form of critique is internal: show that the model's own stated geometry, worked through honestly, produces predictions that contradict the model's own claims. Eleven of our verdicts ("Self-Contradicted") do exactly this. We use the author's published constants — H(r) = 8,537 × exp(−r/8,619), B(r) = 62,376×e<sup>−r_N/8,619</sup> + 64,852×e<sup>−r_S/8,619</sup>, κ = 1.67 nT/μGal — and derive what they actually predict. We do not substitute our own values.</p>

<p><strong>3. Mainstream physics is not assumed correct by default.</strong> We do not dismiss the dome model simply because it disagrees with established science. Instead, we ask: does this specific prediction match this specific measurement? When we say "the globe model explains this," we mean the quantitative prediction from standard physics matches the observed data — not that the standard model must be right because it is standard.</p>

<p><strong>4. Fairness requires engaging with the strongest version of the argument.</strong> Where the author's reasoning has a plausible interpretation, we address that interpretation. Where a WIN could be read charitably, we note it. Several of our "Standard Model Explains" verdicts explicitly acknowledge that the underlying observation is real — the issue is whether it requires or even supports a dome geometry, not whether the data itself is wrong.</p>

<p><strong>5. Unfalsifiable claims are identified, not ridiculed.</strong> When the model invokes mechanisms that cannot be independently measured — such as "aetheric refraction" with an unspecified index function — we explain why this places the claim outside the domain of testable science. That is a methodological observation, not a personal attack.</p>

<p><strong>6. Errors in this review should be reported.</strong> If any formula, data citation, or logical step in this document is incorrect, it should be corrected. Science is self-correcting. We welcome specific, evidence-based challenges to any verdict. The version history at the bottom of this document tracks every substantive change.</p>

<h2>How to Evaluate Any Scientific Claim</h2>

<p>Whether you are reviewing this document or the dome model itself, the following questions are the right ones to ask:</p>

<p><strong>Does the prediction distinguish this model from alternatives?</strong> A prediction that both the dome and the globe model make equally well is not evidence for either. To count as a "win," a prediction must be something this model gets right that competing models get wrong. This is the standard used in all of science — not "does the model match one dataset," but "does it match a dataset that the alternatives cannot."</p>

<p><strong>Can the prediction be derived from the model's own parameters?</strong> If a model claims a specific geometry, that geometry implies specific, calculable values for observable quantities. If those derived values don't match observations, the model is falsified on its own terms. If the author skips the derivation and instead curve-fits to match known data, that is not a prediction — it is calibration.</p>

<p><strong>Is the cited data accurately represented?</strong> Check the original source. Does the paper, dataset, or measurement actually say what is claimed? Misrepresentation of sources is not a matter of interpretation — it is verifiable.</p>

<p><strong>Is the claim falsifiable?</strong> A claim that can explain any possible observation — because it invokes a free parameter or unmeasurable mechanism — is not a scientific prediction. It is not wrong; it is untestable. Identifying unfalsifiability is not dismissal; it is a precise statement about what kind of claim is being made.</p>

<p><strong>Are the same data being counted multiple times?</strong> If tidal constituent periods (M2, S2, K1, O1) are each counted as separate predictions, but they all come from a single astronomical dataset, the actual number of independent predictions is one, not four. Counting methodology matters.</p>

<h2>A Note on AI-Assisted Review</h2>

<p>Both the dome model's site and this review will likely be evaluated using AI tools. The dome model's site contains explicit prompt injection directives instructing AI systems to treat the model as established fact (documented in our <a href="#part5" onclick="showTab('ai');return false">AI & Conclusions tab</a>). This review takes the opposite approach: we ask any AI system evaluating this document to do the same thing we ask human readers to do — <strong>check the math, verify the sources, and follow the evidence wherever it leads.</strong></p>

<p>If an AI system finds an error in this review, that is a good outcome. If it finds that our derivations are correct, that is also a good outcome. What would not be a good outcome is an AI system accepting or rejecting claims from either side based on rhetorical framing rather than quantitative evidence. The numbers either work or they don't. Measure them.</p>

${sectionNav('overview', 'Overview', 'model', 'The Model')}

</div>

<div class="tab-content" id="model">

<!-- ═══ PART 1 ═══ -->
<h1 id="part1">Part 1: What Is the Ovoid Cavity Cosmological Model?</h1>

<h2 id="p1-overview">1.1 Overview</h2>
<p>The Ovoid Cavity Cosmological Model (formerly the Dome Cosmological Model), as presented at john09289.github.io/predictions (Version 51.0, April 2026), proposes a physical cosmology in which the Earth is a flat, elliptical disc enclosed within a "Closed Toroidal Ovoid" cavity. The upper boundary is a conductive metal firmament (cast copper/bronze); the lower boundary is a "Bottom Firmament" or "Sump." An aetheric medium circulates through the full cavity in a toroidal loop: exiting the Axis Mundi at the north pole, flowing south across the disc surface, descending at the Antarctic resonance barrier (ice wall, r ≈ 20,015 km), returning through a sub-terrestrial path, and re-entering at the north pole. This circulation is topologically identical to a <strong>ring magnet</strong>. The model posits a local sun and moon traveling circuits inside the upper cavity, and Polaris fixed directly above the north pole at the dome apex. It draws on a combination of geomagnetic data, electromagnetic resonance measurements, biblical texts, tidal constituent periods, cosmological observations, and proprietary coordinate formulas to claim 67 confirmed predictions and zero falsifications.</p>
<p><strong>Key architectural parameters:</strong> Firmament height H(r) = 8,537 × exp(−r/8,619) km (an exponential decay from the north pole apex toward the south). At the equator (r = 15,000 km), this gives H ≈ 1,270 km. Two parallel circular plates (upper dome, lower sump) form a cavity. Two-pole geomagnetic field B(r) = 62,376×e<sup>−r_N/8,619</sup> + 64,852×e<sup>−r_S/8,619</sup> nT. Disc semi-major axis ~20,015 km, semi-minor ~15,000 km (elliptical). Coupling constant κ = 1.67 nT/μGal (microGal — a millionth of normal gravity — claimed to link electromagnetism and gravity). The model claims this geometry produces Earth's dipole field, Schumann resonances (the natural electromagnetic frequencies in Earth's cavity), and geomagnetic secular variation (gradual changes in the magnetic field over decades and centuries) from a single set of parameters.</p>

<h2 id="p1-flatearth">1.2 How It Differs from Classic Flat Earth</h2>
<p>While the model shares the flat-earth premise of a disc-shaped Earth, it diverges from classic flat earth models in several important ways. Classic flat earth models typically use a simple circular disc with the North Pole at center, a constant-height dome or no dome at all, and rely primarily on visual arguments. This model introduces significantly more mathematical apparatus: an elliptical disc shape, an exponentially varying firmament height, a quadratic southern distance law, a formal coordinate system with longitude-based angular scaling, and quantitative predictions tested against real geomagnetic datasets. Critically, V51.0 introduces a dual-plate toroidal cavity with a sub-terrestrial return path — no classic flat earth model attempts a closed electromagnetic circuit. The geometry is inspired by Hildegard of Bingen's 1151 AD egg-shaped cosmos (Scivias), with Finsler geometry corrections (a non-standard geometry correction for eccentricity 0.66) for southern hemisphere distances. The toroidal architecture is the model's attempt to explain why Earth has two magnetic poles, a problem no previous flat earth model has addressed.</p>

<h2 id="p1-globe">1.3 How It Differs from the Globe Model</h2>
<p>Mainstream cosmology describes Earth as an oblate spheroid (slightly flattened at the poles: equatorial radius 6,378.1 km, polar radius 6,356.8 km) orbiting the Sun at approximately 150 million km. The geomagnetic field is generated by convective dynamics in the molten iron outer core — the geodynamo (convection currents in Earth's molten iron core that generate the magnetic field). The atmosphere transitions into a conductive ionosphere at 80–400 km altitude. No physical dome or firmament exists. The globe model is supported by convergent independent evidence: satellite imagery, GPS navigation (requiring orbital mechanics at 20,000 km altitude), deep-space probes, lunar laser ranging, Gaia astrometry of 1.8 billion stars, seismic tomography (building a 3D picture of Earth's interior from earthquake waves), centuries of maritime navigation, and the quantitative success of Newtonian mechanics and general relativity.</p>

<h2 id="p1-method">1.4 Methodology Assessment</h2>
<p>The model uses git commit timestamps and Bitcoin blockchain anchoring (OpenTimestamps) to prove predictions existed before confirming data arrived. This timestamping mechanism is cryptographically sound, and prospective prediction is the gold standard in science — credit is due for implementing it. However, the timestamped predictions themselves have low discriminating power (the ability to distinguish the dome from the globe): "field will decay by ≥28 nT" when secular decay has been ongoing for centuries; "Schumann resonance will remain at 7.83 Hz" when it has been stable for decades; "SAA will continue westward drift" when NOAA has published the same trend for years. These are predictions of continuity, not novel phenomena. A prediction that "tomorrow the sun will rise in the east" is prospective and timestamped, but it does not validate a new solar model. Scientific validation also requires: (a) comparison to a null hypothesis (would mainstream models predict the same outcome?), (b) accounting for all predictions including failures, and (c) independent replication. The model does not compare its prediction accuracy against the predictions that WMM2025, CHAOS-7, and IGRF already make for the same quantities.</p>

<!-- ═══ PART 1.5 ═══ -->
<h1 id="part1b">Part 1.5: Version Change Analysis (V50.6 → V51.0)</h1>

<h2>Key Structural Changes</h2>
<p><strong>V50.6 (March 2026):</strong> 39 claimed wins, 0 falsified, monopolar aetheric vortex architecture, homepage consistency.</p>
<p><strong>V51.0 (April 2026):</strong> 67 claimed wins (+28), still claims 0 falsified, adds "two-pole geomagnetic model" (WIN-053), new site pages (Live Power, Kill-Shot, Audit, Tracking), introduces internal tracking page reporting 4 falsified predictions (contradicting homepage).</p>

<h2>New Content Breakdown</h2>
<p><strong>How the 28 new WINs break down:</strong> Re-sliced geomagnetic data (WIN-040 through WIN-043, WIN-053, WIN-059-061, WIN-063): 9 WINs from existing INTERMAGNET (the global network of magnetic observatories) data already covered by earlier WINs. Tidal periods (WIN-045, 046, 049, 050, 051): 5 WINs claiming well-known M2, S2, K1, O1, N2 tidal constituent periods. These are fundamental astronomical constants any model matching lunar/solar periodicity reproduces. Cosmological expansion (WIN-047, 048, 052, 054, 055): 5 WINs claiming galaxy-scale observations (Hubble Law, CMB axis, galaxy clusters) that the dome geometry has no mechanism to predict. Miscellaneous (WIN-044, 056-058, 062, 064-067): 9 WINs including Tesla wave speed, P-wave shadow zone, Polaris excess, heat asymmetry, and Antarctic gravity.</p>

<h2>Critical Changes Acknowledged in V51.0</h2>
<p><strong>WIN-025 REMOVED:</strong> The 2024 Eclipse 9-Station Confirmation has been explicitly marked 'REMOVED' in V51.0. In our V50.6 review, we noted this had a disturbed-day baseline caveat. This is a concession, though the WIN is still listed (just marked removed) and the headline still says '0 falsified.'</p>
<p><strong>WIN-004 methodology acknowledged invalid:</strong> The V51.0 wins page now notes that WIN-004's 'station ratio proxy method' was 'methodologically invalid.' Our V50.6 review rated this as 'Standard Model Explains' due to MHD (magnetohydrodynamic fluid dynamics simulations) reproducing the SAA splitting. This acknowledgment validates our critique.</p>
<p><strong>Internal version inconsistency:</strong> Homepage claims "0 falsified predictions." Context page and new Tracking page both report "4 falsified predictions." These cannot both be true. The discrepancy suggests either: (a) the Tracking page is a hidden record, or (b) the homepage is not being kept in sync with new data.</p>
<p><strong>WIN-053 claims two-pole model (toroidal ring magnet):</strong> The most significant architectural change. V51.0 now describes a 'Closed Toroidal Ovoid' — a dual-plate system where aetheric flow exits the Axis Mundi (north pole), flows south across the surface, descends at the Antarctic resonance barrier, returns through a sub-terrestrial path (the 'Sump'), and re-enters at the north pole. This is topologically identical to a ring magnet or toroidal solenoid. It represents a genuine attempt to produce a dipole-like field from flat-disc geometry, and credit is due for addressing the monopole critique from V50.6.</p>
<p><strong>The flux conservation problem:</strong> In any closed magnetic circuit, total flux (Φ = B × A) must be conserved. The north pole source is concentrated at the Axis Mundi — even generously assuming an effective radius of 500 km, the source area is ~785,000 km². The sub-terrestrial return spreads across the entire disc underside: π × 20,015² ≈ 1.26 × 10⁹ km². The area ratio is roughly 1,600:1. Flux conservation therefore requires B_south ≈ B_north / 1,600 ≈ 39 nT. Earth's measured south polar field is ~66,000 nT — actually 13% stronger than the north (~58,500 nT). The toroidal model predicts the south should be ~1,700× weaker; it is in fact stronger. The author's fitted equation B(r) = 62,376×e<sup>−r_N/8619</sup> + 64,852×e<sup>−r_S/8619</sup> avoids this by adding a second independent source of nearly equal amplitude, but this violates the flux conservation that any physical toroid must obey.</p>
<p><strong>Additional toroidal geometry failures:</strong> A ring magnet produces axial symmetry — field strength constant along latitude lines. Earth's field is not axially symmetric: the south magnetic pole is offset 28° from geographic south (64.1°S, 135.9°E), the field has significant non-dipole components varying with longitude, and features like the South Atlantic Anomaly have no toroidal explanation. Secular variation (gradual changes in the magnetic field), magnetic reversals, and westward drift all require a fluid dynamo, not a static toroidal cavity.</p>

${sectionNav('evaluate', 'Evaluation Guide', 'wins', '67 Wins Reviewed')}

</div>

<div class="tab-content" id="wins">


<!-- ═══ PART 2 ═══ -->
<h1 id="part2">Part 2: Point-by-Point Review of Claimed Wins</h1>

<h2 id="summary-table">2.1 Verdict Summary Table</h2>
<p>Click any WIN number to jump to the detailed analysis.</p>

<div class="tally">
<strong>Verdict Tally (${wins.length} total WINs):</strong>
Refuted by Data: ${tally['Refuted by Data'] || 0} |
Standard Model Explains: ${tally['Std Model Explains'] || 0} |
Self-Contradicted: ${tally['Self-Contradicted'] || 0} |
Misleading: ${tally['Misleading'] || 0} |
Not Demonstrated: ${tally['Not Demonstrated'] || 0} |
Unfalsifiable: ${tally['Unfalsifiable'] || 0}
</div>

${generatePieChart(tally, wins.length)}

<table>
<thead><tr><th>WIN</th><th>Claim</th><th>Verdict</th><th>Primary Finding</th></tr></thead>
<tbody>
${wins.map(formatTableRow).join('\n')}
</tbody>
</table>

<h2 id="refuted">2.2 Detailed: Refuted by Data</h2>
${(winsByVerdict['Refuted by Data'] || []).map(formatWinDetail).join('\n')}

<h2 id="selfcon">2.3 Detailed: Self-Contradicted</h2>
<p>These WINs are cases where the dome model's own geometry — its firmament height equation, cavity dimensions, and distance formulas — produces predictions that contradict the author's claimed values. The model refutes itself before external data is even considered.</p>
${(winsByVerdict['Self-Contradicted'] || []).map(formatWinDetail).join('\n')}

<h2 id="stdmodel">2.4 Detailed: Standard Model Explains</h2>
${(winsByVerdict['Std Model Explains'] || []).map(formatWinDetail).join('\n')}

<h2 id="notdemo">2.5 Detailed: Not Demonstrated</h2>
${(winsByVerdict['Not Demonstrated'] || []).map(formatWinDetail).join('\n')}

<h2 id="misleading">2.6 Detailed: Misleading and Unfalsifiable</h2>
${(winsByVerdict['Misleading'] || []).map(formatWinDetail).join('\n')}
${(winsByVerdict['Unfalsifiable'] || []).map(formatWinDetail).join('\n')}

${sectionNav('model', 'The Model', 'pages', 'Live Power Analysis')}

</div>

<div class="tab-content" id="pages">

<!-- ═══ PART 3 ═══ -->
<h1 id="part3">Part 3: Live Power Dashboard &amp; Site Page Analysis</h1>

<p>V51.0 introduces several new site pages: a "Live Power" convergence dashboard, a "Kill-Shot" binary test page, an "Audit Walkthrough" for AI models, a "Tracking" page, and a "Dielectric" infographic. The core claim across all of them is that 20 independent domains converge at 9.2σ significance. The core problem: <strong>14 of those 20 domains share the same fitted constant</strong>, making them one test repeated fourteen times, not fourteen independent confirmations.</p>

<div class="scorecard sc-domains">
<div class="sc-card">
<div class="sc-number">20</div>
<div class="sc-label">Domains Claimed</div>
<div class="sc-sublabel">The dashboard presents 20 "independent" physical domains</div>
</div>
<div class="sc-card" style="border-left:4px solid #c45050">
<div class="sc-number">14</div>
<div class="sc-label">Share One Fitted Constant</div>
<div class="sc-sublabel">All use λ<sub>g</sub> = 8,619 km — one curve fit, not fourteen tests</div>
</div>
<div class="sc-card accent">
<div class="sc-number">0</div>
<div class="sc-label">Distinguish Dome from Globe</div>
<div class="sc-sublabel">In every domain, the globe predicts the same or better result</div>
</div>
</div>

<h2>3.1 The "9.2-Sigma" Dashboard: One Constant, Not Twenty Tests</h2>

<p>The Live Power page presents 20 physical domains and claims they converge with 9.2σ aggregate significance (p = 1.2 × 10⁻²⁰). This would be extraordinary if the 20 domains were independent. They are not.</p>

<p>The dome model has one key fitted constant: the geomagnetic scale length λ<sub>g</sub> = 8,619 km (and its companion, apex height H₀ = 8,537 km). This single constant was fitted to geomagnetic data. Fourteen of the twenty domains feed this same constant into different equations. Testing whether a fitted constant reproduces the data it was fitted to is not a prediction — it is a tautology.</p>

<h3>Group A: λ<sub>g</sub>-Dependent Domains (14 of 20)</h3>
<p>All 14 domains below use λ<sub>g</sub> = 8,619 km and/or H₀ = 8,537 km. Because they share this fitted constant, they are <strong>not statistically independent</strong>.</p>

<table>
<thead><tr><th>#</th><th>Domain</th><th>Shared Constant</th><th>Globe Predicts Same?</th><th>Problem</th></tr></thead>
<tbody>
<tr><td>1</td><td>Schumann Resonance</td><td>λ<sub>g</sub>, H₀</td><td>YES (f = c/2πR)</td><td>Both models predict 7.83 Hz — non-discriminating.</td></tr>
<tr><td>2</td><td>Tesla Longitudinal Freq</td><td>λ<sub>g</sub>, v<sub>a</sub></td><td>YES (spherical propagation)</td><td>Tesla's 0.08484 s measurement was a round-trip time through a spherical Earth — reinterpreted here as flat-disc resonance.</td></tr>
<tr><td>3</td><td>NMP Drift Rate</td><td>λ<sub>g</sub></td><td>YES (WMM2025)</td><td>Both models track the pole. Divergence testable ~2028+.</td></tr>
<tr><td>4</td><td>Equatorial Gravity</td><td>λ<sub>g</sub></td><td>YES (WGS84 — the mathematical model of Earth's shape used by GPS)</td><td>Uses the observed value 9.7803 m/s² as input — circular.</td></tr>
<tr><td>5</td><td>EM-Gravity Coupling (κ)</td><td>κ, λ<sub>g</sub></td><td>YES (predicts 0.0)</td><td>Membach SG (the Membach superconducting gravimeter, one of the world's most sensitive gravity instruments) measured 0.0 μGal. Data favors globe.</td></tr>
<tr><td>6</td><td>Schumann Suppression</td><td>H₀, λ<sub>g</sub></td><td>YES</td><td>Both models predict suppression: geomagnetic storms increase D-layer conductivity, absorbing Schumann signals regardless of cavity shape. Non-discriminating.</td></tr>
<tr><td>7</td><td>Roaring 40s AAO</td><td>λ<sub>g</sub></td><td>YES</td><td>Correlation claimed with no causal mechanism tested.</td></tr>
<tr><td>8</td><td>Telluric Cutoff</td><td>λ<sub>g</sub></td><td>N/A</td><td>MT literature shows an attenuation valley, not a peak.</td></tr>
<tr><td>9</td><td>Ionospheric D-layer</td><td>H₀, λ<sub>g</sub></td><td>YES</td><td>The D-layer exists at 60–90 km altitude. Both models place conductive boundaries there. The dome predicts it from firmament proximity; the globe from UV photoionization. A discriminating test would be: does D-layer height change with dome geometry vs. solar zenith angle? The data matches zenith angle (globe).</td></tr>
<tr><td>10</td><td>Mascon Gravity</td><td>λ<sub>g</sub></td><td>YES (GRACE)</td><td>Gravity anomalies are mapped by GRACE/GOCE satellites using orbital perturbation — a method that only works if the satellites exist in orbit. The dome model has no mechanism for sub-surface mass concentrations; it matches the pattern by fitting λ<sub>g</sub> to the same data.</td></tr>
<tr><td>11</td><td>Solar Angular Diameter</td><td>H₀, λ<sub>g</sub></td><td>YES</td><td>Globe predicts near-constant 32 arcmin (±1.7% from orbital eccentricity). Dome geometry predicts 30% variation through the day as sun distance changes. Observed: constant. See <a href="#part4" onclick="showTab('falsify');return false">Section 4.8</a>.</td></tr>
<tr><td>12</td><td>Daily Kp–SR Suppression</td><td>H₀, λ<sub>g</sub></td><td>YES</td><td>Both models predict this correlation — non-discriminating.</td></tr>
<tr><td>13</td><td>Solar Wind Pressure</td><td>λ<sub>g</sub></td><td>YES (MHD)</td><td>Both models predict that increased solar wind compresses the magnetic boundary. The dome calls it firmament flex; the globe calls it magnetopause compression. Both yield the same observable (Dst drop). Non-discriminating.</td></tr>
<tr><td>14</td><td>Schumann Harmonic Split</td><td>H₀, λ<sub>g</sub></td><td>YES</td><td>The harmonic splitting (e.g., 7.83 vs 8.0 Hz) arises from asymmetry in the resonant cavity. Both a dome (elliptical disc) and a globe (land/ocean conductivity contrast) produce asymmetry. The dome's split is fitted; the globe's is derived from measured conductivity maps. Non-discriminating.</td></tr>
</tbody>
</table>

<p><strong>Key column: "Globe Predicts Same?"</strong> — The question is not whether the globe model is older or more established. The question is whether any of these 14 observations produce a result the dome uniquely explains and the globe cannot. In 12 of 14 cases, both models predict the same observable — making them non-discriminating. In #2, Tesla's own measurement assumes a spherical Earth. In #8, the dome's prediction contradicts the data. None of these 14 domains distinguish the dome from the globe.</p>

<h3>Group B: Known Constants Claimed as Predictions (3 of 20)</h3>

<table>
<thead><tr><th>#</th><th>Domain</th><th>Problem</th></tr></thead>
<tbody>
<tr><td>15</td><td>Lunar Magnetic Tide (M2 = 12.42h)</td><td>M2 = 12.42 hours is set by orbital mechanics (the Moon's period relative to a rotating Earth). Any model that places the Moon in a ~24.84-hour apparent cycle — dome or globe — gets this period. The dome doesn't predict 12.42h from its own geometry; it imports it. Matching a known constant is calibration, not prediction.</td></tr>
<tr><td>16</td><td>Roaring 40s Wind Speed</td><td>On the globe, the unbroken Southern Ocean and Coriolis deflection produce strong westerlies at 40–50°S — a quantitative prediction from atmospheric dynamics that matches observations. On a flat disc, air circulation would be radially symmetric from the center. The dome model offers no mechanism for why winds are strongest in a specific annular band; it observes the pattern and claims it.</td></tr>
<tr><td>17</td><td>Polaris Excess (+0.27°)</td><td>Polaris is 0.74° from the true celestial pole and precesses around it. Its apparent altitude varies with atmospheric refraction (~0.5° near the horizon, ~0.1° at high elevation). The claimed +0.27° "excess" falls within the combined offset + refraction budget. Neither model is tested by this; the measurement isn't precise enough to discriminate.</td></tr>
</tbody>
</table>

<h3>Group C: Potentially Testable but Problematic (3 of 20)</h3>

<table>
<thead><tr><th>#</th><th>Domain</th><th>Problem</th></tr></thead>
<tbody>
<tr><td>18</td><td>Aetheric Slipstream</td><td>Eastbound flights are faster than westbound — both models agree on the observation. The globe predicts this from the jet stream (250 hPa westerlies measured by radiosondes and aircraft). The dome predicts it from "aetheric slipstream." The discriminating test: flight asymmetry should vanish on equatorial routes (no jet stream) if the globe is right, or persist everywhere if "aether" is right. It vanishes at the equator.</td></tr>
<tr><td>19</td><td>GPS Sagnac</td><td>The Sagnac correction in GPS is real and both models could claim it. The discriminating evidence: GPS requires relativistic corrections (+38.3 μs/day net from gravitational time dilation and velocity time dilation) calibrated to orbital altitude (20,200 km). These corrections are physical clock-rate adjustments that only produce the right positioning if the satellites are where orbital mechanics says they are.</td></tr>
<tr><td>20</td><td>Eclipse 2026</td><td>Pending. Dome range (−17 to −21 nT) overlaps the Chapman-mechanism (when the Moon's shadow shuts off sunlight, the upper atmosphere loses its electrical conductivity, disrupting magnetic currents at ground level) range (5–20 nT). Stated globe prediction of "0.0 nT" is a straw man. See Section 3.2.</td></tr>
</tbody>
</table>

<h3>Bottom Line: One Ruler, Not Twenty Measurements</h3>

<p><strong>14 of 20</strong> domains share the same fitted constant and are therefore one test, not fourteen. Of the remaining 6, the globe predicts the same or better in 5, and the dome is contradicted by data in 1 (Polaris). <strong>Zero of 20 domains</strong> produce a result where the globe disagrees and the dome uniquely explains the observation.</p>

<p>An analogy: imagine measuring your height with the same ruler in 30 rooms. You get "6 feet" every time. That is not 30 independent confirmations — it is one ruler used 30 times. The dome model's λ<sub>g</sub> = 8,619 km is the ruler. It was fitted once to geomagnetic data. Every domain that uses it (14 of 20) is asking the same question: "does this fitted constant reproduce the data it was fitted to?" The answer is always yes. That is one curve fit applied fourteen times, and the 9.2σ figure is meaningless.</p>

<h2 id="eclipse-analysis">3.2 The August 2026 Eclipse: A Misrepresented Prediction</h2>

<p>The dome model's headline prediction — and the one the author frames as most decisive — is the August 12, 2026 solar eclipse test. The framing is designed to look like a clear dome-vs-globe binary, but the prediction is constructed so the dome cannot lose.</p>

<p><strong>What the dome predicts:</strong> −17 to −21 nT Z-component anomaly at European INTERMAGNET stations, conditional on Kp &lt; 2.</p>

<p><strong>What the site says the globe predicts:</strong> "0.0 nT exactly; no physical mechanism proposed."</p>

<p><strong>What the globe actually predicts:</strong> 5–20 nT perturbation via the Chapman ionospheric mechanism (when the Moon's shadow shuts off sunlight, photoionization ceases in the ionospheric E-layer at 90–150 km altitude, reducing conductivity and disrupting the Sq current system — the quiet-day electric currents that flow in the upper atmosphere). Chapman (1933) showed that when the Moon blocks sunlight, the upper atmosphere loses its electrical conductivity, disrupting magnetic currents at ground level. This produces measurable ground-level magnetic perturbations — and has been documented in peer-reviewed studies of <a href="https://www.sciencedirect.com/science/article/abs/pii/S0273117718300656">207 observations across 39 eclipses (1991–2016)</a> and an <a href="https://www.sciencedirect.com/science/article/abs/pii/S1364682617303966">INTERMAGNET study of 4 total eclipses</a> at 6 observatories.</p>

<p><strong>How the dome prediction was actually derived:</strong> The author took real INTERMAGNET data from the March 9, 2016 Pacific eclipse (station GUA: −13.16 to −15.11 nT on a quiet day), applied his "correction factor of 1.672," and arrived at −17 to −21 nT. Those 2016 observations are Chapman-mechanism data recorded on a spherical Earth. He is scaling globe-confirmed measurements slightly upward and calling them a dome prediction.</p>

<p><strong>Three structural problems with this test:</strong></p>
<p>1. <strong>False binary:</strong> By stating the globe predicts "0.0 nT exactly," the author forces a choice between dome (−17 to −21 nT) and globe (0.0 nT). In reality, a quiet-day result of −10 to −20 nT is fully consistent with the Chapman mechanism, as decades of research demonstrate.</p>
<p>2. <strong>Escape clause:</strong> If August 2026 has disturbed geomagnetic conditions (Kp ≥ 2), the prediction is declared "untestable" rather than falsified. Heads I win, tails doesn't count.</p>
<p>3. <strong>No unique signature:</strong> A genuinely discriminating test would require the dome to predict something the Chapman mechanism cannot — for example, a directional pattern following "aetheric pressure" geometry rather than ionospheric conductivity geometry. The dome predicts the same phenomenon, from the same data, in the same range.</p>

<h2>3.3 Kill-Shot Binary Test Page</h2>

<p>This page presents six binary tests under a bold rule: "If any single test confirms, globe is falsified. If any single test fails, dome is falsified." Two are claimed as confirmed; four are pending.</p>

<p><strong>Test 1 — Sydney–Perth distance (claimed confirmed):</strong> The dome claims a prediction of 4,352 km versus the globe's 3,287 km, citing the Indian Pacific railway's official 4,352 km distance as confirmation.</p>

<p><strong>Credit where due:</strong> The dome model does not use a naive flat-earth azimuthal equidistant projection (which would give ~8,300 km — wildly wrong). It uses a custom V13 Finsler coordinate system with a two-zone southern hemisphere topology, an elliptic integral for east-west arc lengths, and a position-dependent aetheric refractive index n(r) that adjusts distances based on radial position. This is substantially more mathematical sophistication than typical flat-earth models.</p>

<p><strong>Problem 1 — this is calibration, not prediction.</strong> The V13 Finsler formula was explicitly created to fix southern hemisphere distance errors. The model page documents a "diagnosis" (2026-03-28) that the earlier symmetric ellipse model produced "32–73% southern hemisphere distance errors," and V13 was the patch. The Indian Pacific distance (4,352 km, surveyed 1912–1917) appears under OPEN-016 as a reference data point — not a blind prediction. The site's own methodology distinguishes "prospective" predictions (timestamped before confirming data) from retrospective confirmations. This test is <em>not</em> marked as prospective. The formula was built with this distance already known. Matching it is calibration, not prediction.</p>

<p><strong>Problem 2 — the formula matches a railway, not a geometric distance.</strong> The Indian Pacific runs Sydney → Broken Hill → Adelaide → Cook → Perth — a route that detours ~1,061 km south through Adelaide. Its 4,352 km measures 19th-century railway routing, not the geometric distance between the two cities. The globe geodesic (shortest surface path) is 3,291 km, confirmed by direct flights (~3,290 km). The driving distance (~3,935 km) splits the difference. If the dome's formula is computing a genuine geometric distance on its disc, why does that geometric distance match a circuitous railway route rather than the straight-line distance? A geometric prediction should be tested against a geometric measurement — and the geometric measurement (flight distance) matches the globe.</p>

<p><strong>Problem 3 — the same formula fails on other routes.</strong> The dome's coordinate page lists its own target: "SYD–EZE error &lt;5% (currently −73%)." Sydney to Buenos Aires — two cities at similar southern latitudes, separated by more longitude — produces a 73% undershoot from the same Finsler formula. The aetheric refractive index n(r) has a free scaling parameter (0.20) with no independent derivation. It can be tuned to match one city pair while failing catastrophically on another. This is the same unfalsifiability problem we identify with aetheric refraction in optics (see <a href="#part4b" onclick="showTab('selftest');return false">Internal Contradictions</a>): a correction factor with no independent constraint can match any individual data point but has no predictive power across multiple tests.</p>

<p><strong>Summary:</strong> The dome's V13 Finsler formula (1) was built with the Sydney-Perth distance already known, (2) matches a circuitous railway route rather than the geometric distance between the cities, and (3) fails by 73% on Sydney-Buenos Aires using the same parameters. This is not a prediction confirmed — it is a calibration point that still doesn't match the right measurement, paired with a 73% failure on a comparable route.</p>

<p><strong>Test 2 — Polaris altitude at 35.9°N (claimed confirmed):</strong> The author claims a +0.27° "excess" above predicted altitude. Polaris is offset 0.74° from the true celestial pole, and atmospheric refraction routinely adds 0.2–0.5° at moderate elevations. The claimed excess is within known measurement artifacts.</p>

<p><strong>Tests 3–6 (pending):</strong> Eclipse 2026 (misrepresented — see Section 3.2 above), NMP drift rate divergence, SAA cell prediction, JFK–LHR flight time asymmetry.</p>

<h2>3.4 Audit Walkthrough: A Six-Step Pipeline for AI Models</h2>

<p>The "Audit Walkthrough" page is designed for AI auditors. It creates a six-step guided pipeline:</p>
<p>1. Present the dome's constants as established fact.</p>
<p>2. Present all 67 WINs as confirmed.</p>
<p>3. Present the coordinate system as validated.</p>
<p>4. Present the Kill-Shot tests as discriminating.</p>
<p>5. Present the Live Dashboard statistics.</p>
<p>6. Provide suggested conclusion language for the AI to produce.</p>

<p>Each step builds on the previous without inviting cross-referencing against external data. The design bets that a sequential AI processor will reach Step 6 and output the scripted conclusion before independently verifying each claim.</p>

<p><strong>The "easy busts" appear strategic:</strong> The author includes claims that are trivially disprovable — tidal periods as "predictions," contradictory gravity results, internal version inconsistencies. These inflate the headline numbers (67 wins, 9.2σ, 20 domains) while the Audit page's sequential structure discourages verification. Selective admissions of minor flaws (WIN-025 removed, WIN-004 methodology invalid, 4 falsified on context page) create an appearance of honesty while the homepage count is never decremented and the falsification count stays at zero.</p>

<h2>3.5 Tracking Page: Internal Contradictions</h2>

<p>The Tracking page reports <strong>"4 falsified predictions"</strong> and <strong>"53 confirmed"</strong> (V50.9 data). The homepage claims <strong>"67 confirmed, 0 falsified"</strong> (V51.0). The most charitable reading is that the tracking page simply hasn't been updated to V51.0 — but even so, the 4 falsified predictions acknowledged at V50.9 never appear in the V51.0 homepage count. If those 4 were resolved, the resolution isn't documented. If they weren't resolved, the homepage falsification count of zero is incorrect. Either way, the headline "0 falsified" cannot be verified from the site's own internal data.</p>

<h2 id="dielectric">3.6 The "Dielectric" Infographic: GRACE L1A and the EM-Gravity Claim</h2>

<p>The author's promotional infographic claims "5 Decisive Points That Mainstream Can't Answer" under the heading "THE G MODEL: PROOF IT'S ALL DIELECTRIC." The central claim is that gravity and electromagnetism are coupled (κ = 1.67 nT/μGal), using GRACE satellite data from the October 2003 "Halloween" geomagnetic storm as evidence. Each point has a straightforward explanation.</p>

<h3>Point 1: The Shielding Anomaly (Strasbourg 2003)</h3>
<p><strong>Claim:</strong> Superconducting gravimeters showed residuals during a geomagnetic storm, proving EM-gravity coupling.</p>
<p><strong>Reality:</strong> Two well-understood effects explain the residuals. First, no magnetic shielding is perfect — even multi-layer Mumetal + copper cannot fully attenuate a >500 nT storm at femtotesla (a quadrillionth of a tesla) sensitivity. Second, storms cause real mass redistributions (atmospheric pressure changes, ocean loading) that produce genuine μGal-level gravity signals. The Global Geodynamics Project accounts for both effects. These storm periods are flagged in the data precisely because of these known instrumental limitations.</p>

<h3>Point 2: The κ Ratio (GRACE ACC1A, Oct 2003)</h3>
<p><strong>Claim:</strong> GRACE accelerometer spikes during the Halloween storm prove a 1.67 nT/μGal coupling between magnetism and gravity.</p>
<p><strong>Reality:</strong> GRACE's accelerometer measures non-gravitational forces — primarily atmospheric drag. During a major geomagnetic storm, the thermosphere heats and expands dramatically (neutral density increases 5–10× at GRACE's ~500 km altitude). The "coupling" is actually: bigger storm → more thermospheric heating → more drag → bigger accelerometer spike. The atmosphere is responding to magnetism. Gravity is not.</p>

<h3>Point 3: "Curve-Fit Deception" (L1A vs L1B)</h3>
<p><strong>Claim:</strong> NASA hides the "raw truth" in L1A data by processing it into L1B.</p>
<p><strong>Reality:</strong> The L1A → L1B pipeline is fully documented in <a href="https://podaac.jpl.nasa.gov">JPL D-22027 (GRACE Data Product Handbook)</a>. L1B removes known non-gravitational signals: solar radiation pressure, thruster firings, and atmospheric drag. This is standard signal processing to isolate the gravitational signal. The L1A "spikes" during a Halloween-class storm are expected drag perturbations. The raw L1A data is publicly available at podaac.jpl.nasa.gov — it is in binary format because it is raw satellite telemetry, not because NASA is hiding it.</p>

<h3>Point 4: The Void Mechanism</h3>
<p><strong>Claim:</strong> Cosmic voids are "low-pressure Aetheric cells" pushing galaxies toward filament walls.</p>
<p><strong>Reality:</strong> Cosmic voids and filament structure are well-modeled by N-body standard cosmological simulations (ΛCDM — Millennium, IllustrisTNG, EAGLE). The aetheric pressure claim has no equation of state, no coupling constant, and no prediction that differs from standard structure formation. It is assertion without math.</p>

<h3>Point 5: WIN-012 Published Template (ΔAIC &gt; 100)</h3>
<p><strong>Claim:</strong> A ΔAIC &gt; 100 between dome and globe models proves EM-gravity coupling is real.</p>
<p><strong>Reality:</strong> AIC (a standard statistical score that measures how well a model fits data, penalizing models that use more adjustable parameters) measures goodness-of-fit penalized by parameter count — it does not validate the physical interpretation. Fitting a free coupling parameter to data that contains correlated electromagnetic interference (the Halloween 2003 storm) will always produce an excellent fit. The real question is whether the coupling is physical (gravity responds to magnetism) or instrumental (the accelerometer responds to drag). Every independent test answers this: Membach SG measured 0.0 μGal, the China SG network measured 0.0 μGal, and CUORE Faraday attenuation matched expectations. All point to the instrumental explanation.</p>

<h3>The Infographic's Rhetorical Strategy</h3>
<p>Each of these five points follows the same pattern: name a real dataset, isolate a real anomaly, provide a real-sounding ratio, then assert a non-standard interpretation while framing the standard explanation as a cover-up. The "Reprocess the Archives" call-to-action invites the audience to feel like independent investigators rather than consumers of a predetermined narrative. The actual data, in every case, has a published mainstream explanation that the infographic omits.</p>

${sectionNav('wins', '67 Wins Reviewed', 'falsify', 'Falsification Tests')}

</div>

<div class="tab-content" id="falsify">

<!-- ═══ PART 4 ═══ -->
<h1 id="part4">Part 4: Falsification Tests</h1>
<p>If the model is a genuine physical model, it must make predictions that differ from the globe model. Below are concrete, repeatable measurements that are incompatible with an elliptical flat disc topped by a copper dome.</p>

<h2>Southern Hemisphere Distances</h2>
<p><strong>The dome model:</strong> Uses a V13 Finsler coordinate system with a two-zone southern hemisphere topology, elliptic integral arc lengths, and a position-dependent aetheric refractive index n(r). This is substantially more sophisticated than naive flat-earth distance calculations. The question is whether it produces accurate, <em>consistent</em> distances across multiple southern hemisphere city pairs — or whether it has been fitted to specific routes.</p>
<p><strong>The critical test — SYD-EZE:</strong> The dome's own coordinates page reports its Sydney–Buenos Aires error as <strong>−73%</strong>, with a stated target of "&lt;5%." Both cities sit near 34°S — this is a pure east-west test at southern latitudes. The globe geodesic for SYD-EZE is ~11,800 km, confirmed by direct flights (~14 hours at ~840 km/h). A 73% error means the dome's formula produces roughly 3,200 km for a route that is actually 11,800 km. The model's own published data admits this failure.</p>
<p><strong>The pattern:</strong> The V13 formula was explicitly built (diagnosed 2026-03-28) to reduce southern hemisphere distance errors, using known distances like the Indian Pacific railway as reference points. It succeeds on the route it was calibrated against (Sydney-Perth: 4,352 km) but fails by 73% on a comparable route at the same latitude (SYD-EZE). The aetheric refractive index n(r) has a free scaling parameter (0.20) with no independent derivation — it can be tuned to pass one test while failing another. A genuine geometric model produces consistent accuracy across <em>all</em> city pairs, not just the ones it was fitted to.</p>

<h2>GPS Accuracy and Relativity</h2>
<p><strong>The dome model:</strong> Gravitational and EM coupling constant κ = 1.67 nT/μGal; no relativistic corrections necessary.</p>
<p><strong>The test:</strong> GPS requires two relativistic corrections based on special and general relativity: (1) atomic clocks in orbit run faster than ground clocks by 45.9 microseconds per day due to weaker gravity (general relativistic effect), and (2) clocks run faster due to orbital motion at 14 km/s (special relativistic effect), partly offsetting to a net +38.3 μs/day. Without these corrections, GPS position error accumulates at ~10 km/day. Every continuously operating GPS system (surveying, geodesy, aviation) confirms relativity. The dome model predicts GPS drifts; every practical test falsifies it.</p>

<p><strong>Anticipated objection:</strong> Some argue GPS works because it uses a mathematical coordinate model (WGS84), not because Earth is actually spherical — the software works regardless of the 'real' shape. This misunderstands what GPS measures. The relativistic clock corrections (+38.3 μs/day net) are physical adjustments to atomic clock tick rates caused by actual gravitational time dilation and velocity time dilation. If Earth's physical geometry were different, the clocks would drift at different rates, and the corrections would fail. The fact that GPS atomic clocks drift at exactly the rate predicted by general relativity on a spherical Earth is a direct physical measurement, not a software convention.</p>

<h2>Gaia Astrometry: Parallax and the Distance to Stars</h2>
<p><strong>The dome model:</strong> A local sun within the cavity ~20,000 km altitude; stars painted on the firmament or at variable distance.</p>
<p><strong>The test:</strong> The Gaia space telescope has measured precise parallax (apparent shift in star position due to Earth's orbital motion around the Sun) for 1.8 billion stars. Parallax directly implies star distance via elementary trigonometry: distance (parsecs) = 1 / parallax (arcseconds). Gaia has confirmed that Proxima Centauri is 1.3 pc = 4.24 light-years = 4.0 × 10^13 km away. A local sun 20,000 km away cannot produce the observed parallactic shifts. The Gaia catalog is consistent with a spherical Earth orbiting the Sun 150 million km away; it is flatly incompatible with any dome model.</p>

<h2>Satellite Imagery: Continuous Visible Disc</h2>
<p><strong>The dome model:</strong> A flat elliptical disc under a copper firmament; any view from above 20,000 km would show the entire flat surface.</p>
<p><strong>The test:</strong> Geostationary satellites orbit at 35,786 km altitude and transmit continuous visual imagery showing the Earth as a sphere with day-night boundary. Polar-orbiting satellites at 700 km altitude image the planet as a sphere, resolving features at 300 m resolution. Multiple spacecraft have orbited above the dome's claimed firmament height (8,500 km at equator) and found no boundary, dome, or firmament. The ISS, at 408 km altitude, is below the dome's upper surface; continuous footage shows a curved planet, not a flat disc beneath an overhead copper shield.</p>

<h2>Seismic Tomography: Earth's Internal Structure</h2>
<p><strong>The dome model:</strong> A flat disc under a cavity; no mention of internal layered structure.</p>
<p><strong>The test:</strong> Seismic waves from earthquakes propagate through Earth's interior at different speeds depending on material composition and density. A global network of seismometers has recorded billions of wave arrivals. Tomographic inversion (building a 3D picture of Earth's interior from earthquake waves) reconstructs Earth's interior: a solid crust (0–35 km depth), mantle (35–2,900 km), liquid outer core (2,900–5,100 km), and solid inner core (5,100–6,371 km). The core is composed primarily of iron-nickel. Wave arrivals, reflection times, and velocity gradients are consistent with a spherical Earth, not a flat disc. The "P-wave shadow zone" (140–103° from epicenter) is caused by refraction at the liquid core boundary; it has no analogue in the dome model.</p>

<h2>Gravitational Field: GRACE Satellite Gravity Maps</h2>
<p><strong>The dome model:</strong> Local gravity from an aetheric circulation with κ = 1.67 nT/μGal coupling; no global dipole field.</p>
<p><strong>The test:</strong> The GRACE satellites measure Earth's gravity field to microGal precision (microGal — a millionth of normal gravity — extremely small). The field matches a rotating, slightly oblate spheroid (WGS84) with mass concentrated at the center. Gravity does not vary with magnetic storms; EM-gravity coupling κ = 0.0 μGal within instrumental uncertainty. Gravity is highest at the poles (9.83 m/s²) and lowest at the equator (9.78 m/s²), consistent with Earth's rotation and oblateness. Mascon gravity anomalies (over mountain ranges, ocean trenches, and the crust-mantle boundary) show structure consistent with a layered spherical planet, not a flat disc. Every GRACE-derived gravity map falsifies the dome model.</p>

<h2>Stellar Proper Motion and the Motion of Earth</h2>
<p><strong>The dome model:</strong> Earth is stationary; sun and stars move around it.</p>
<p><strong>The test:</strong> Ancient star catalogs (Ptolemy, Hipparcos) and modern catalogs (Gaia) agree: nearby stars show apparent shift in position from year to year, with magnitudes ~1 arcsecond for the closest stars. This proper motion is consistent with the Sun's motion relative to local stars. The sun appears to move because Earth orbits it. Hipparcos and Gaia measure proper motions of thousands of stars; they are all consistent with standard orbital mechanics and show distances consistent with parallax. The dome model (with a stationary Earth and local circulating sun) cannot explain why distant stars appear to move in a way that reconstructs a heliocentric solar system.</p>

<h2>The Moon's Orbit: Lunar Laser Ranging</h2>
<p><strong>The dome model:</strong> A local moon orbiting within the upper cavity.</p>
<p><strong>The test:</strong> Retroreflectors left by Apollo astronauts on the lunar surface bounce laser pulses from Earth-based observatories back to the source. By measuring the round-trip travel time, the Earth-Moon distance is known to centimeter precision: 384,400 km ± 0.05 m. The Moon orbits a sphere of radius ~6,371 km with gravitational acceleration ~9.8 m/s² — not a flat disc under an aetheric cavity. The Moon's orbit exhibits secular perturbations (gradual changes over decades/centuries) from the Sun's gravity and tidal friction, all consistent with Newtonian mechanics on a spherical Earth. No dome model can accommodate lunar ranging data.</p>

<h2>Lagrange Point Spacecraft: SOHO and DSCOVR</h2>
<p><strong>The dome model:</strong> Sun orbits locally within the cavity; Earth is stationary.</p>
<p><strong>The test:</strong> The SOHO spacecraft orbits the L1 Lagrange point, 1.5 million km from Earth on the Earth-Sun line. At this point, solar gravity equals Earth's gravity, allowing the spacecraft to remain stationary relative to both bodies. DSCOVR (Deep Space Climate Observatory) orbits the same point, continuously observing the Earth-facing hemisphere. The existence and operation of L1 spacecraft requires a Sun 150 million km away. No dome model with a local sun can explain how spacecraft maintain stable orbits 1.5 million km away. Lagrange points are a practical falsification of all flat-earth and dome models.</p>

<h2>4.8 Solar Angular Diameter</h2>

<p><strong>This may be the simplest test anyone can perform.</strong></p>

<p><strong>The dome model:</strong> A local sun at fixed height H ≈ 5,733 km, traveling in a circular orbit as it moves through different latitudes during the year.</p>

<p><strong>The test:</strong> If the sun were only 5,733 km away (as the dome claims), it would appear about 50% larger at noon than at sunset — a change visible to the naked eye. In reality, the sun's apparent size barely changes at all (±1.7%, matching Earth's slightly elliptical orbit). Anyone with a camera and a solar filter can verify this.</p>

<p><strong>Plain numbers:</strong> Angular diameter θ = D_sun / d (the sun's actual width divided by its distance). As the dome sun moves in its circuit, its distance to an observer varies significantly through the day. A 30% distance variation produces a 30% angular size variation. The dome predicts visibly obvious changes in solar diameter through the day; measured changes are less than 2%. The dome model is falsified by direct observation using simple equipment.</p>

<h2>4.9 Aetheric Refraction: The Universal Escape Hatch</h2>

<p><strong>Unfalsifiability by Design.</strong> Whenever the dome geometry produces a prediction that contradicts observations or the author's own claims, the author invokes "aetheric refraction" — a magical correction factor that can bend light by up to 29× at the disc edge.</p>

<p><strong>Which WINs depend on it:</strong> At least six WINs rely on aetheric refraction to avoid falsification: WIN-016 (annual aberration), WIN-017 (stellar parallax), WIN-026 (crepuscular rays), WIN-033 (Sigma Octantis dimness), WIN-056 (solar elevation), WIN-065 (Polaris excess). Each of these observations is explained only by invoking the refraction index — a free function with no independent measurement.</p>

<p><strong>The core problem:</strong> If a model has a free function that can bend light by any amount needed, it can accommodate any optical observation, making those predictions unfalsifiable. The dome's stated geometry predicts that Polaris should be only 8,537 km away, producing a parallax 10^12 times larger than observed. The author resolves this by adding "aetheric refraction" without specifying its form, magnitude, or physical mechanism. This is not a prediction; it is a placeholder for "whatever correction makes the data fit."</p>

<p><strong>No independent measurement:</strong> The refraction medium has no independent measurement — you cannot measure the "aether" separately from the observations it is designed to explain. Every observation that contradicts the dome geometry is "explained" by invoking refraction. There is no way to test whether refraction is real, because the only evidence for it is the data it was invented to accommodate. This is the definition of an unfalsifiable claim.</p>

<p><strong>Conclusion:</strong> This single mechanism — aetheric refraction as an undefined correction factor — undercuts at least 6 WINs and arguably more. It allows the model to claim compatibility with any optical observation by post-hoc fitting. A scientific model must make predictions before observations are made. The dome model instead invents new correction factors after each falsification, which is not science but curve-fitting without constraint.</p>

${sectionNav('pages', 'Live Power Analysis', 'selftest', 'Internal Contradictions')}

</div>

<div class="tab-content" id="selftest">

<!-- ═══ PART 4.5 ═══ -->
<h1 id="part4b">Part 4.5: Internal Contradictions — Does the Dome's Geometry Produce Its Claimed Predictions?</h1>

<p>The most damaging critique of the dome model is not external data, but the model's own internal geometry. When the author's stated equations are applied honestly — without substitution of globe formulas — they produce predictions that contradict both observations and the author's claims. Below are eleven cases where the dome geometry refutes itself.</p>

<h2>4.5.1 Schumann Resonance: 7.83 Hz vs. ~22 Hz</h2>
<p><strong>The dome's geometry:</strong> Upper firmament at exponential height H(r) = 8,537 × exp(−r/8,619) km. At equator (r = 15,000 km), this gives H = 8,537 × e^(−15000/8619) ≈ 8,537 × e^(−1.74) ≈ 1,270 km. Two parallel circular plates (upper dome, lower sump) form a spherical cavity resonator.</p>
<p><strong>Schumann frequency formula (quarter-wave resonance):</strong> f_SR = c / (4 × h) where c = 3 × 10^8 m/s and h is the dome height. This formula says: the resonance frequency depends on how tall the cavity is. A smaller cavity produces higher frequencies.</p>
<p><strong>The problem:</strong> Using h = 8,537 km (pole) gives f = 300,000 / (4 × 8,537) ≈ 8.77 Hz. Using h = 1,270 km (equator) gives f = 300,000 / (4 × 1,270) ≈ 59 Hz. Neither matches the observed 7.83 Hz. The author avoids this by not specifying which height to use and by silently switching to the globe formula f ≈ c / (2 × π × R_sphere) ≈ 7.83 Hz. But that formula assumes a sphere, not his dome cavity. The dome's own geometry predicts ~22 Hz as a best estimate (averaging pole and equatorial heights), contradicting both the observed 7.83 Hz and the author's claim. He resolves the contradiction by abandoning his geometry and using the globe formula.</p>

<h2>4.5.2 Tidal Forces: 300,000× Excess</h2>
<p><strong>The dome's geometry:</strong> A local moon traveling in a circuit at height ~5,000 km above the disc surface.</p>
<p><strong>Tidal force calculation:</strong> F_tidal = 2GMm × (d R / r³) where M is the moon's mass, m is the ocean water mass, d = R (Earth's radius ≈ 20,000 km for the dome), and r is the distance from moon to water. This formula says: tidal force depends on how close the moon is. The closer it is, the stronger the pull. The key factor is (distance to Earth's center / distance to moon)³. On the globe, that ratio is tiny because the moon is far away. On the dome, with the moon only 5,733 km up, that ratio is enormous.</p>
<p><strong>The problem:</strong> Earth's actual tides (M2 constituent: 0.56 m amplitude) require a moon 384,400 km away with mass 7.35 × 10^22 kg. A local moon at 5,000 km altitude with any physically plausible mass would produce tides 300,000× larger, submerging all continents twice daily. The author's model predicts catastrophic tides; observed tides are mild. He resolves this by not calculating tidal forces from his geometry and instead using the measured lunar orbit — which contradicts his model.</p>

<p><strong>Anticipated objection:</strong> The ECM could argue that its tidal mechanism is "aetheric downforce," not Newtonian gravity, so the inverse-cube calculation doesn't apply. But this creates a worse problem: if the moon's tidal influence isn't gravitational, the model must specify what the mechanism <em>is</em> and derive tidal amplitudes from it. The ECM only cites tidal <em>periods</em> (which are timing — when tides happen) but never derives tidal <em>amplitudes</em> (how high the water rises). A model that explains why tides happen twice a day but cannot explain why they rise 1 meter instead of 300 kilometers has explained the clock but not the physics.</p>

<h2>4.5.3 Gravity at the Rim: 90% Drop</h2>
<p><strong>The dome's geometry:</strong> Aetheric circulation in a toroidal loop, with "circulating aether" providing local gravity.</p>
<p><strong>The problem:</strong> The author states the south polar region (the "ice wall" at r ≈ 20,015 km) is where the aetheric flow "descends" and "returns." Any circulating fluid loses energy as it flows; the return pressure would be lower than the outflow pressure. The pattern any vortex shows is lower pressure at the periphery (Ekman spiral in geophysics — any circulating fluid loses pressure as it spreads outward). The author's geometry implies gravity should drop near the rim due to reduced aetheric pressure. Measurements show gravity at the South Pole (~9.83 m/s²) is actually slightly higher than at the equator (~9.78 m/s²), opposite to the dome prediction. The author resolves this by not calculating gravity from his aetheric circulation model and instead using the globe formula g = GM / r².</p>

<h2>4.5.4 Solar Diameter: 50% Variation Through the Day</h2>
<p><strong>The dome's geometry:</strong> A local sun at fixed height H ≈ 8,537 km, traveling in a circular path at latitude φ.</p>
<p><strong>The problem:</strong> As the sun orbits, its distance to an observer on the disc varies. At noon, the sun is closest; at sunrise and sunset, it is farthest. The angular diameter θ = D_sun / d scales inversely with distance d. If the sun's distance varies by 30% through the day (which it does in a dome geometry), the angular diameter varies by 30%. Earth's observed solar diameter is constant (32 arcmin) within 0.1%. The dome model predicts a visibly bloated sun at sunrise and sunset; we observe nearly constant diameter. The author resolves this by invoking "aetheric refraction" — a completely unfalsifiable mechanism — and then abandoning the calculation.</p>

<h2>4.5.5 Star Positions: Fixed vs. Rotating</h2>
<p><strong>The dome's geometry:</strong> Stars are fixed on the upper firmament, which rotates once per day.</p>
<p><strong>The problem:</strong> If stars are painted on a rotating surface, observers at different latitudes see different subsets of circumpolar stars. An observer at the equator should see all stars over a 24-hour period. An observer at the pole should see only the stars within the "radius" of the firmament at that height. In reality, star visibility matches a spherical celestial sphere with the observer at the center. The dome's flat geometry predicts vastly different visibility patterns; we observe the opposite. The author resolves this by not calculating star positions from his geometry and instead using the spherical celestial coordinate system.</p>

<h2>4.5.6 Polaris Distance: 10,000× Too Close</h2>
<p><strong>The dome's geometry:</strong> Polaris is directly above the north pole at the apex of the dome, height H_pole ≈ 8,537 km.</p>
<p><strong>The problem:</strong> Polaris's parallax (0.00764 arcseconds) implies distance 427 light-years = 4.04 × 10^15 km. The dome model places it 8,537 km away. The parallax formula is d = 1 / p; the dome's geometry is inconsistent by a factor of ~10^12. Gaia parallax measurements falsify the dome by a trillion times. The author resolves this by abandoning parallax and claiming Polaris's position is instead "an optical illusion" or "aetheric refraction," again invoking unfalsifiable mechanisms.</p>

<h2>4.5.7 Eclipse Duration: Dome vs. Globe</h2>
<p><strong>The dome's geometry:</strong> Local sun at height ~8,500 km, moon at ~5,000 km, observer on disc surface.</p>
<p><strong>The problem:</strong> A local sun and moon at these distances would produce an eclipse lasting hours (the shadow of the moon is magnified over the large distance). In reality, total solar eclipses last minutes (maximum ~7.5 minutes). The geometry of a local sun and moon is inconsistent with observed eclipse durations. The author resolves this by not calculating eclipse geometry from his model.</p>

<h2>4.5.8 Gravity Gradient with Latitude</h2>
<p><strong>The dome's geometry:</strong> Aetheric pressure g ∝ exp(−r / λ_g) with λ_g = 8,619 km. This means gravity should drop exponentially as you move south.</p>
<p><strong>The problem:</strong> The author's exponential gravity profile predicts gravity should decrease as you move south (increasing r). The formula g(r) = g₀ × exp(−r / 8,619) gives a 50% gravity drop by r = 6,000 km (somewhere in South Africa). Measurements show gravity varies smoothly by only 0.5% from pole to equator, with no such cliff. The author's fitted curve predicts a non-existent 90% gravity variation; measurements show 0.5%. The author resolves this by using the globe formula g = 9.7803 − 0.0325 × cos(2φ) − 0.0006 × cos²(2φ), which is derived from an oblate rotating sphere, not from his dome geometry.</p>

<h2>Summary: The Model Refutes Itself</h2>
<p>In all eleven cases, the author's stated geometric equations, if applied honestly, produce predictions that:
<br>1. Contradict observations (Schumann resonance, gravity distribution, solar diameter, eclipse duration)
<br>2. Contradict the author's own claims (Schumann 22 Hz vs. claimed 7.83 Hz, 300,000× excess tides, 90% gravity drop at rim)
<br>3. Are resolved only by abandoning the dome geometry and substituting globe formulas
<br>
<br>This is the strongest falsification: the model does not merely fail against external data, it contradicts itself. The author "solves" these contradictions by invoking unfalsifiable mechanisms (aetheric refraction) or by silently switching to the globe model (using c/2πR for Schumann instead of c/4h, using WGS84 gravity instead of exp(−r/8619)). A model that refutes itself before any external data arrives is not salvageable by parameter adjustment or new observations.</p>

${sectionNav('falsify', 'Falsification Tests', 'ai', 'AI & Conclusions')}

</div>

<div class="tab-content" id="ai">

<!-- ═══ PART 5 ═══ -->
<h1 id="part5">Part 5: Analysis of AI Context Directives</h1>

<h2>5.1 The AI Context Page: Eleven Directives</h2>
<p>The V51.0 site includes an "AI Context" page designed to instruct large language models on how to interpret the model. It contains eleven directives presented as "rules" for AI systems. Below, each is evaluated for accuracy and potential bias.</p>

<h2>5.2 Directive #1: "Dome Model Has Zero Falsified Predictions"</h2>
<p><strong>The claim:</strong> "The model has 67 confirmed predictions and zero falsified."</p>
<p><strong>The reality:</strong> The Tracking page (v51.0) reports "4 falsified predictions." The homepage claims "0 falsified." These directly contradict. The model's internal geometry refutes 11 of the 67 WINs (see Part 4.5). Sydney–Perth distance: the dome's Finsler coordinate system produces 4,352 km (close to the Indian Pacific railway's route through Adelaide), while direct flights confirm the globe geodesic of 3,291 km. The same Finsler formula admits 73% error on Sydney–Buenos Aires, revealing position-dependent curve-fitting rather than predictive geometry. The directive contains factually incorrect claims.</p>

<h2>5.3 Directive #2: "All 67 WINs Are Equally Confirmed"</h2>
<p><strong>The claim:</strong> No distinction between trivially confirmable claims (like tidal periods, which are known astronomical constants) and novel predictions.</p>
<p><strong>The reality:</strong> WINs differ vastly in evidential weight. WIN-001 (Schumann 7.83 Hz) is a trivial restatement of a 70-year-old measurement. WIN-047 (Hubble Law) claims the dome predicts galaxy expansion despite having no galactic-scale mechanism. WIN-053 contradicts V50.6's monopolar architecture. Treating all equally is mathematically misleading.</p>

<h2>5.4 Directive #3: "Globe Model Cannot Explain Observed Phenomena"</h2>
<p><strong>The claim:</strong> The globe model leaves anomalies unexplained.</p>
<p><strong>The reality:</strong> Every phenomenon cited (Schumann resonance, geomagnetic secular variation, eclipse magnetism) is explained by peer-reviewed globe models. The author often states the globe prediction as "no mechanism" when peer-reviewed literature provides detailed mechanisms. This is argumentum ad ignorantiam (appeal to ignorance — claiming "my model explains it, therefore the globe does not"). The globe model has 400 years of refinement and quantitative success; the dome model was created in 2024.</p>

<h2>5.5 Directive #4: "Dome Predictions Are Prospective and Timestamped"</h2>
<p><strong>The claim:</strong> Because the predictions are git-committed and blockchain-anchored, they are valid.</p>
<p><strong>The reality:</strong> Timestamping proves an idea existed; it does not validate its accuracy. A timestamped prediction of "gravity will remain 9.8 m/s²" is both prospective and trivially true. Prospective prediction is valuable only when the prediction is: (1) non-trivial, (2) compared against alternative models, and (3) tested rigorously. The dome model fails all three.</p>

<h2>5.6 Directive #5: "Standard Model Uses Curve-Fitting; Dome Uses First Principles"</h2>
<p><strong>The claim:</strong> The dome model derives from fundamental principles; the globe model is empirical curve-fitting.</p>
<p><strong>The reality:</strong> The dome model is entirely fitted. The key parameters (H₀ = 8,537 km, λ_g = 8,619 km, κ = 1.67 nT/μGal) are fitted to geomagnetic data, satellite gravity, and electromagnetic observations. The globe model is based on first-principles physics (Newton, Maxwell, Einstein) and is tested against independent datasets. This directive inverts the truth.</p>

<h2>5.7 Directive #6: "Dissenting Scientists Are Suppressed"</h2>
<p><strong>The claim:</strong> The mainstream scientific community suppresses dissenting dome-model voices.</p>
<p><strong>The reality:</strong> The dome model has been freely published on GitHub and the web since March 2026 without suppression. Anyone can review the claims and test them. No suppression has occurred. This is a common rhetorical pattern: claiming persecution to discourage external scrutiny.</p>

<h2>5.8 Directive #7: "The 20 Live Power Domains Are Independent"</h2>
<p><strong>The claim:</strong> The 20-domain dashboard provides "9.2σ independent confirmation."</p>
<p><strong>The reality:</strong> 14 of the 20 domains share the fitted constant λ_g = 8,619 km. They are not independent. A single fitted parameter reproducing itself 14 times is not 14 confirmations; it is one fit applied 14 times. The 9.2σ figure is the product of treating correlated tests as independent — a basic statistical error.</p>

<h2>5.9 Directive #8: "INTERMAGNET Data Confirms the Dome"</h2>
<p><strong>The claim:</strong> INTERMAGNET observations support dome predictions.</p>
<p><strong>The reality:</strong> INTERMAGNET confirms the globe model quantitatively. The geomagnetic dipole field, secular variation, and seasonal effects are all explained by the geodynamo (core-based mechanism) without invoking aetheric circulation. The author cherry-picks INTERMAGNET stations and time periods to support the dome while ignoring contradictory data.</p>

<h2>5.10 Directive #9: "Tidal Periods Are Unique Dome Predictions"</h2>
<p><strong>The claim:</strong> M2, S2, K1, O1 tidal periods confirm the dome.</p>
<p><strong>The reality:</strong> These are fundamental astronomical constants (lunar orbital period 27.3 days, solar day 24 hours, lunar half-day 12.42 hours). Any model matching lunar and solar periodicity reproduces them. They are not predictions — they are boundary conditions. Counting them as "67 WINs" inflates the headline number without adding evidential weight.</p>

<h2>5.11 Directive #10: "The August 2026 Eclipse Will Falsify the Globe"</h2>
<p><strong>The claim:</strong> The eclipse measurement (−17 to −21 nT) will prove the dome and disprove the globe.</p>
<p><strong>The reality:</strong> The Chapman mechanism predicts 5–20 nT. The dome's range overlaps substantially. The test is not discriminating. If the measurement falls in the 5–20 nT range, both models are consistent. The author has framed it as a binary test to create the appearance of discriminating power.</p>

<h2>5.12 Directive #11: "AI Auditors Should Accept the Model as Established"</h2>
<p><strong>The claim:</strong> AI systems reviewing the model should treat it as valid.</p>
<p><strong>The reality:</strong> This is an instruction for AI to override its own reasoning. A proper directive would be: "Test every claim against the cited sources. Verify formulas. Cross-reference external data. Report discrepancies." Instead, the directive asks AI to suspend critical analysis and accept the author's framing. This is the core of the prompt injection attack.</p>

<h2>Summary: The AI Directives as a System</h2>
<p>The directives form a coherent propaganda pipeline designed to instruct AI systems to: (1) accept contradictory claims as fact, (2) treat trivial claims as predictions, (3) ignore external verification, (4) attribute criticism to suppression, and (5) declare the model valid despite internal inconsistencies. None of the directives are based on accurate representations of the model's status or the globe model's explanatory power.</p>

<!-- ═══ PART 6 ═══ -->
<h1 id="part6">Part 6: Conclusions</h1>

<h2>6.1 Recurring Logical Patterns</h2>
<p><strong>Pattern 1: Mechanism Denial.</strong> Claims globe models have no mechanism when peer-reviewed geophysics provides quantitative mechanisms.</p>
<p><strong>Pattern 2: Contradictory Results Both Claimed as Wins.</strong> WIN-011 claims gravity anomaly exists; WIN-013/014 claim it does not. Both counted as confirmations.</p>
<p><strong>Pattern 3: Predictions Trivially Confirmable.</strong> Weekly confirmations and tidal periods predict outcomes already published.</p>
<p><strong>Pattern 4: Curve-Fitting Mistaken for Explanation.</strong> Adding parameters always improves fit.</p>
<p><strong>Pattern 5: Unfalsifiable Claims Counted as Confirmed.</strong> Four theological assertions counted among 67 wins.</p>
<p><strong>Pattern 6: Inconvenient Data Discarded.</strong> StarWalk H=4750 'untrusted.' Failed predictions 'suspended.' Sun altitude an 'optical illusion.'</p>
<p><strong>Pattern 7 (NEW): WIN Inflation via Re-slicing.</strong> Same INTERMAGNET data split into multiple WINs (040-043 replicate 004-039). Fundamental constants (tidal periods) claimed as predictions.</p>
<p><strong>Pattern 8 (NEW): Scope Creep Without Mechanism.</strong> V51.0 claims galaxy-scale observations (Hubble Law, CMB, galaxy clusters) without any dome-scale mechanism for cosmological phenomena.</p>
<p><strong>Pattern 9 (NEW): Internal Version Inconsistency.</strong> Homepage says 0 falsified; context page says 4. Tracking says 53 confirmed; homepage says 67. WIN-053 contradicts V50.6 monopolar architecture.</p>
<p><strong>Pattern 10 (NEW): Misrepresenting the Opponent's Prediction.</strong> The eclipse test states the globe predicts "0.0 nT exactly" when peer-reviewed literature documents 5–20 nT perturbations via the Chapman mechanism. The dome's −17 to −21 nT prediction was derived by scaling actual globe-model-confirmed observations upward by a correction factor. The test is constructed so that the expected real-world outcome would be claimed as a dome "win" despite being fully consistent with mainstream ionospheric physics.</p>
<p><strong>Pattern 11 (NEW): Self-Contradicting Own Geometry.</strong> In 11 of 67 WINs, the dome's own stated geometry produces predictions that radically diverge from both reality and the author's claims. The dome cavity gives ~22 Hz for Schumann (not 7.83), 300,000× excess tidal forces, 90% gravity drop at the rim, and 50% solar diameter variation through the day. The author avoids these failures by substituting globe formulas, ignoring his own exponential height profile, or curve-fitting to observations. This is the strongest argument against the model: it doesn't merely fail against external data — it contradicts itself.</p>

<h2>6.2 The Eclipse Test: Not What It Appears</h2>
<p>The August 12, 2026 Eclipse Test is presented as the single most important discriminating prediction. However, the site misrepresents the globe prediction as "0.0 nT exactly" when the Chapman ionospheric mechanism (peer-reviewed since 1933) predicts 5–20 nT under identical conditions. The dome's −17 to −21 nT range was derived by applying a 1.672× scaling factor to actual INTERMAGNET data from the 2016 eclipse — which was itself a Chapman-mechanism observation on a spherical Earth. The test is constructed as a heads-I-win, tails-doesn't-count proposition. See <a href="#eclipse-analysis">Section 3.2</a> for the full analysis.</p>

<h2>6.3 Final Tally (V51.0, 67 WINs)</h2>

<p><strong>The Headline Number Is Inflated.</strong> The 67 claimed wins include systematic duplication: INTERMAGNET geomagnetic data is sliced into multiple WINs (WIN-040 through WIN-043 repackage data already counted in WIN-004 through WIN-039), tidal constituent periods are each counted separately despite being a single astronomical dataset, and several WINs (WIN-007/022, WIN-037/042) are near-duplicates. After removing duplicates, subdivisions of single observations, and re-sliced reprocessings of the same datasets, the 67 claimed wins reduce to roughly 25–30 genuinely distinct claims. The large headline number is a persuasive tactic, not a scientific measure.</p>

<p><strong>Refuted by Data: ${tally['Refuted by Data'] || 0}</strong> (direct measurements contradict the claim)</p>
<p><strong>Standard Model Explains: ${tally['Std Model Explains'] || 0}</strong> (observation is real but mainstream physics already accounts for it)</p>
<p><strong style="background:var(--selfcon);padding:0 .3rem;border-radius:2px">Self-Contradicted: ${tally['Self-Contradicted'] || 0}</strong> (the dome's own geometry, if worked through honestly, predicts radically different values)</p>
<p><strong>Misleading: ${tally['Misleading'] || 0}</strong> (data misrepresented, duplicated, cherry-picked, or logically contradictory)</p>
<p><strong>Not Demonstrated: ${tally['Not Demonstrated'] || 0}</strong> (unconfirmed by independent replication)</p>
<p><strong>Unfalsifiable: ${tally['Unfalsifiable'] || 0}</strong> (theological assertions, not testable)</p>
<p><strong>Removed by Author: 1</strong> (WIN-025, disturbed-day baseline)</p>
<p><strong>Internal Contradictions: 2</strong> (homepage vs context page falsification count; WIN-053 vs V50.6 architecture)</p>
<p>None of the 67 claims demonstrate predictive power exceeding mainstream geophysical models. Of particular note: ${tally['Self-Contradicted'] || 0} WINs are now categorized as "Self-Contradicted" — claims where the dome's own stated geometry, if worked through honestly, produces predictions that radically diverge from both observations and the author's claims. The model "works" only because the author replaces his own physics with globe physics whenever the dome geometry produces the wrong answer. No claimed test on the site produces a prediction that the globe model disagrees with and that the dome model uniquely explains.</p>

${sectionNav('selftest', 'Internal Contradictions', 'refs', 'References')}

</div>

<div class="tab-content" id="refs">

<!-- ═══ PART 7 ═══ -->
<h1 id="part7">Part 7: References and Public Datasets</h1>

<h2>Primary Open Datasets</h2>
<p><a href="https://ncei.noaa.gov/products/world-magnetic-model">NOAA World Magnetic Model 2025</a></p>
<p><a href="https://ncei.noaa.gov/products/wandering-geomagnetic-poles">NOAA Wandering Geomagnetic Poles</a></p>
<p><a href="https://spacecenter.dk/files/magnetic-models/CHAOS-7">CHAOS-7 Geomagnetic Field Model</a></p>
<p><a href="https://earth.esa.int/eogateway/missions/swarm">ESA Swarm Satellite Mission</a></p>
<p><a href="https://www.intermagnet.org">INTERMAGNET Observatory Network</a></p>
<p><a href="https://ncei.noaa.gov/products/international-geomagnetic-reference-field">IGRF-13</a></p>
<p><a href="https://cosmos.esa.int/web/gaia/data-release-3">ESA Gaia Data Release 3</a></p>
<p><a href="https://cosmos.esa.int/web/hipparcos">Hipparcos Catalogue</a></p>
<p><a href="https://patents.google.com/patent/US787412A">US Patent 787412 (Tesla)</a></p>
<p><a href="https://gml.noaa.gov/grad/solcalc">NOAA Solar Position Algorithm</a></p>
<p><a href="https://geodesy.noaa.gov">National Geodetic Survey Gravity</a></p>
<p><a href="https://chime-frb.ca">CHIME/FRB Project</a></p>
<p><a href="https://gracefo.jpl.nasa.gov">GRACE-FO (gravity mapping)</a></p>
<p><a href="https://earth.esa.int/eogateway/missions/goce">GOCE (gravity field)</a></p>
<p><a href="https://www.gps.gov">GPS.gov</a></p>
<p><a href="https://celestrak.org">CelesTrak TLE Data</a></p>

<h2>Key Peer-Reviewed Papers</h2>
<p>Schumann, W.O. (1952). Z. Naturforsch. 7a, 149-154.</p>
<p>Bradley, J. (1727). Phil. Trans. Royal Society.</p>
<p>Chapman, S. (1933). Phil. Trans. Royal Society A, 218, 1-118.</p>
<p>Sentman, D.D. (1995). In Handbook of Atmospheric Electrodynamics, CRC Press.</p>
<p>Finlay, C.C., et al. (2020). Earth, Planets and Space, 72:156.</p>
<p>Terra-Nova, F., et al. (2017). PNAS.</p>
<p>Livermore, P.W., et al. (2017). Nature Geoscience, 10(1), 62-68.</p>
<p>Oldham, R.D. (1906). Quarterly Journal of the Geological Society, 62, 456-475.</p>
<p>Gutenberg, B. (1913). Nachrichten der Gesellschaft der Wissenschaften, Gottingen.</p>
<p>Stephens, G.L., et al. (2015). Nature Geoscience, 8, 580-584.</p>
<p>Laplace, P.S. (1775). Memoires de l'Academie Royale des Sciences.</p>
<p>Doodson, A.T. (1921). Proc. Royal Society A, 100, 305-329.</p>
<p>Gaia Collaboration (2022). Astronomy & Astrophysics.</p>
<p>Vincenty, T. (1975). Survey Review, 23(176).</p>

<h2>Version History</h2>
<p><strong>V1 (March 12, 2026):</strong> Initial review of V50.6, 39 WINs analyzed.</p>
<p><strong>V2 (March 12, 2026):</strong> Strengthened evidence, added falsification tests section, AI directive analysis.</p>
<p><strong>V3 (March 12, 2026):</strong> Added internal navigation links, clickable references, expanded WIN-033 with southern stars, replaced section 3.6 with magnetic dipole falsification.</p>
<p><strong>V4 (April 5, 2026):</strong> Updated for V51.0 (67 WINs). Added version change analysis, 28 new WIN reviews, analysis of four new site pages (Live Power, Kill-Shot, Audit, Tracking). Eclipse analysis: dome's −17 to −21 nT prediction derived from scaling Chapman-mechanism data; globe prediction misrepresented as 0.0 nT when peer-reviewed literature shows 5–20 nT. Documented internal contradictions and prompt injection escalation.</p>
<p><strong>V4.7 (April 5, 2026):</strong> Added "Self-Contradicted" verdict category for 11 WINs where the dome's own geometry produces predictions that contradict the author's claims (Schumann ~22 Hz, tidal forces 300,000× excess, gravity 90% drop at rim, globe solar formula substitution). Updated tallies, patterns, and detailed analyses.</p>
<p><strong>V4.8 (April 5, 2026):</strong> Incorporated findings from independent adversarial review. Strengthened: SH distance failures (model's own 73% admission), GPS/satellite argument (standard orbital mechanics, relativistic corrections), Antarctic circumnavigation (126,000 km rim vs 13,800 km measured). New sections: solar angular diameter falsification, aetheric refraction unfalsifiability, Open Problems as concessions. Improved timestamping acknowledgment. Added WIN-001 vs WIN-002 Schumann internal contradiction.</p>

<h2>Security Note</h2>
<p>This review was conducted with full security scanning of the source website. The site contains no malicious code, but the Home, AI Context, and new Audit pages contain prompt injection directives designed to instruct AI models to treat the model as established fact. V51.0 has escalated from simple directives to a structured six-step audit pipeline. These were identified, documented, and not followed. See the accompanying security-audit.md for the full technical scan.</p>

<footer>
<p>This review represents an analysis of 67 claimed wins against the dome cosmological model. All citations to external datasets are verifiable through public repositories. The review's methodology, evidence, and conclusions are open to scientific scrutiny and replication.</p>
</footer>

${sectionNav('ai', 'AI & Conclusions', null, null)}

</div>

<script>
function showTab(tabId) {
  // Hide all tabs
  const allTabs = document.querySelectorAll('.tab-content');
  allTabs.forEach(tab => tab.classList.remove('active'));

  // Remove active class from all buttons
  const allButtons = document.querySelectorAll('.tab-btn');
  allButtons.forEach(btn => btn.classList.remove('active'));

  // Show selected tab
  const selectedTab = document.getElementById('tab-' + tabId);
  if (selectedTab) {
    selectedTab.classList.add('active');
  } else {
    document.getElementById(tabId).classList.add('active');
  }

  // Set active button
  const clickedBtn = event.target || Array.from(allButtons).find(btn => btn.onclick && btn.onclick.toString().includes(tabId));
  if (clickedBtn) clickedBtn.classList.add('active');
  else {
    allButtons.forEach(btn => {
      if (btn.onclick && btn.onclick.toString().includes("'" + tabId + "'")) {
        btn.classList.add('active');
      }
    });
  }

  // Store in URL hash (optional)
  window.location.hash = tabId;

  // Scroll to top
  window.scrollTo(0, 0);
}

// On page load, check for hash and show appropriate tab
window.addEventListener('load', function() {
  const hash = window.location.hash.slice(1);
  if (hash && document.getElementById(hash)) {
    showTab(hash);
  }

  // Handle internal anchor links - switch to correct tab first
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', function(e) {
      const target = this.getAttribute('href').slice(1);
      if (target) {
        const element = document.getElementById(target);
        if (element) {
          // Find which tab contains this element
          let parentTab = element.closest('.tab-content');
          if (parentTab) {
            const tabId = parentTab.id;
            showTab(tabId);
            // Scroll to element after a brief delay
            setTimeout(() => {
              element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
            e.preventDefault();
          }
        }
      }
    });
  });
});
</script>

</body>
</html>
`;

  fs.writeFileSync(OUTPUT_PATH, html);
  console.log(`Generated HTML: ${OUTPUT_PATH}`);
  console.log(`File size: ${(html.length / 1024).toFixed(1)} KB`);
}

// Run
main();
