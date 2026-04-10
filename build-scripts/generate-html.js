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
const FAILURES_PATH = path.join(__dirname, '..', 'data', 'uncounted-failures.json');
const PKG_PATH = path.join(__dirname, '..', 'package.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'docs', 'index.html');

// ════ COMPUTED METADATA (never hardcode these in the template) ════

const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
const REVIEW_VERSION = pkg.version.split('.')[0]; // major version from package.json (e.g., "6" from "6.0.0")
const BUILD_DATE = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
// Dome model version — single source of truth. Update here when the dome publishes a new version.
const DOME_VERSION = 'V51.1';

// Load section-loader helper
let SECTIONS_CACHE = null;

function loadSectionsCache() {
  if (SECTIONS_CACHE !== null) return SECTIONS_CACHE;
  if (!fs.existsSync(SECTIONS_PATH)) {
    return null;
  }
  try {
    SECTIONS_CACHE = JSON.parse(fs.readFileSync(SECTIONS_PATH, 'utf8'));
    return SECTIONS_CACHE;
  } catch (e) {
    console.warn(`Warning: Could not load sections.json: ${e.message}`);
    return null;
  }
}

function getSection(sectionId) {
  const sections = loadSectionsCache();
  return sections ? sections[sectionId] : null;
}

function resolvePlaceholders(html, context) {
  if (!html || typeof html !== 'string') return html;
  let result = html;

  // Simple count replacements
  const replacements = {
    '{{TOTAL_WINS}}': context.totalWins || 0,
    '{{NEW_IN_V51}}': context.newInV51 || 0,
    '{{SELF_CONTRADICTED}}': context.selfContradicted || 0,
    '{{UNFALSIFIABLE}}': context.unfalsifiable || 0,

    // Tally
    '{{TALLY_REFUTED}}': context.tally['Refuted by Data'] || 0,
    '{{TALLY_STD}}': context.tally['Std Model Explains'] || 0,
    '{{TALLY_SELFCON}}': context.tally['Self-Contradicted'] || 0,
    '{{TALLY_MISLEADING}}': context.tally['Misleading'] || 0,
    '{{TALLY_NOTDEMO}}': context.tally['Not Demonstrated'] || 0,
    '{{TALLY_UNFALSIFIABLE}}': context.tally['Unfalsifiable'] || 0,

    // Code analysis
    '{{CA_REVIEWED}}': context.codeAnalysis?.reviewed || 0,
    '{{CA_PENDING}}': context.codeAnalysis?.pending || 0,
    '{{CA_HARDCODED}}': context.codeAnalysis?.monitoring?.hardcoded || 0,
    '{{CA_LIVE}}': context.codeAnalysis?.monitoring?.liveFetch || 0,
    '{{CA_NONE}}': context.codeAnalysis?.monitoring?.none || 0,
    '{{CA_RELABELS}}': context.codeAnalysis?.relabelsStandard || 0,
    '{{CA_POSTHOC}}': context.codeAnalysis?.postHoc || 0,
    '{{CA_DOME}}': context.codeAnalysis?.derivesFromDome || 0,

    // Acknowledged failures (soft-pedal bucket: refined/suspended/falsified, no dome_status_current)
    '{{ACKNOWLEDGED_FAILURES}}': context.acknowledgedFailures || 0,
    '{{DOME_CLAIMED_FAILURES}}': context.domeClaimedFailures || 0,
    '{{DOME_CLAIMED_ACCURACY}}': context.domeClaimedAccuracy || '?',
    '{{ACCURACY_VARIANT_LIST}}': context.accuracyVariantList || '',
    '{{ACCURACY_VARIANT_DETAIL}}': context.accuracyVariantDetail || '',
    // Silent failures (items the dome has visibly removed/suspended but excluded from his accuracy denominator)
    '{{SILENT_FAILURES}}': context.silentFailures || 0,
    '{{TOTAL_DOCUMENTED_FAILURES}}': context.totalDocumentedFailures || 0,
    '{{HONEST_ACCURACY}}': context.honestAccuracy || '?',
    '{{HONEST_ACCURACY_DENOM}}': context.honestAccuracyDenom || 0,

    // De-duplication analysis (EXP-032)
    '{{INDEPENDENT_CLAIMS}}': context.independentClaims || 39,
    '{{DEDUP_REDUCTION_PERCENT}}': context.dedupReductionPct || 42,
  };

  // Simple replacements
  for (const [placeholder, value] of Object.entries(replacements)) {
    result = result.split(placeholder).join(String(value));
  }

  // Computed expressions
  if (context.codeAnalysis && context.totalWins) {
    const hardcodedPlusNone = (context.codeAnalysis.monitoring?.hardcoded || 0) +
                              (context.codeAnalysis.monitoring?.none || 0);
    result = result.split('{{CA_HARDCODED_PLUS_NONE}}').join(String(hardcodedPlusNone));

    const pct = Math.round((context.codeAnalysis.reviewed || 0) / context.totalWins * 100);
    result = result.split('{{CA_REVIEWED_PCT}}').join(String(pct));
  }

  return result;
}

function resolveTypeB(html, winsByVerdict, counts, wins, tally, sectionNav) {
  // Replace Type B generated content placeholders with actual function calls
  // These are dynamic content blocks that can't be in static JSON

  if (html.includes('{{PIE_CHART}}')) {
    const chart = generatePieChart(tally, wins.length);
    html = html.replace('{{PIE_CHART}}', chart);
  }

  if (html.includes('{{WIN_TABLE}}')) {
    const table = wins.map(formatTableRow).join('\n');
    html = html.replace('{{WIN_TABLE}}', table);
  }

  // Detail sections - replace {{DETAILS_VERDICT}} with actual detail blocks
  const verdictDetailsMap = {
    '{{DETAILS_REFUTED}}': 'Refuted by Data',
    '{{DETAILS_SELFCON}}': 'Self-Contradicted',
    '{{DETAILS_STD}}': 'Std Model Explains',
    '{{DETAILS_NOTDEMO}}': 'Not Demonstrated',
    '{{DETAILS_MISLEADING}}': 'Misleading',
    '{{DETAILS_UNFALSIFIABLE}}': 'Unfalsifiable',
  };

  for (const [placeholder, verdict] of Object.entries(verdictDetailsMap)) {
    if (html.includes(placeholder)) {
      const details = (winsByVerdict[verdict] || []).map(formatWinDetail).join('\n');
      html = html.replace(placeholder, details);
    }
  }

  // Section navigation placeholders
  if (html.includes('{{SECTION_NAV}}')) {
    // Would need the actual sectionNav function call parameters
    // For now, we'll skip this - it's handled by keeping the old template
  }

  return html;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderFailureEntry(e) {
  const idLabel = escapeHtml(e.id);
  const refLabel = e.dome_ref_current
    ? escapeHtml(e.dome_ref_current) + (e.dome_status_current ? ` <span style="color:#8b0000;font-weight:600">[${escapeHtml(e.dome_status_current)}]</span>` : '')
    : escapeHtml(e.dome_ref || 'unknown');
  const summary = escapeHtml(e.summary || '');
  const prediction = escapeHtml(e.prediction || '');
  const outcome = escapeHtml(e.outcome || '');
  const domeLabel = escapeHtml(e.dome_label || '');
  const what = escapeHtml(e.what_actually_happened || '');
  const evidenceDate = escapeHtml(e.evidence_date || '');
  const staleNote = e.needs_reconciliation
    ? `<p style="font-size:.85rem;color:#888;font-style:italic;margin:.5rem 0 0">Note: the <code>${escapeHtml(e.dome_ref || '')}</code> reference above is from an earlier dome version and may have been reused on the current site for an unrelated prediction. Reconciliation against the V50.6→V51.1 history is in progress.</p>`
    : '';
  return `<div style="border-left:4px solid #c45050;background:var(--card-bg);padding:1rem 1.25rem;margin:1rem 0;border-radius:0 6px 6px 0">
<div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:.5rem">
  <strong>${idLabel}: ${summary}</strong>
  <span style="font-size:.85rem;color:#888">${refLabel}</span>
</div>
<p style="margin:.5rem 0 .25rem"><strong>Prediction:</strong> ${prediction}</p>
<p style="margin:.25rem 0"><strong>Outcome:</strong> ${outcome}</p>
<p style="margin:.25rem 0"><strong>Dome's label:</strong> <em>${domeLabel}</em>${evidenceDate ? ` <span style="color:#888;font-size:.85rem">(${evidenceDate})</span>` : ''}</p>
<p style="margin:.25rem 0 0">${what}</p>
${staleNote}
</div>`;
}

function renderFailuresBlock(failures, silentFailureEntries, acknowledgedBucketEntries, honestAccuracy, honestAccuracyDenom) {
  const totalDome = failures.dome_claimed_failures || 0;
  const totalSilent = silentFailureEntries.length;
  const honestPct = honestAccuracy;

  const silentBlocks = silentFailureEntries.length > 0
    ? silentFailureEntries.map(renderFailureEntry).join('\n')
    : '<p><em>None currently tracked. The poller flags new removals as they appear.</em></p>';

  const ackBlocks = acknowledgedBucketEntries.length > 0
    ? acknowledgedBucketEntries.map(renderFailureEntry).join('\n')
    : '<p><em>None currently tracked.</em></p>';

  return `
<h2 id="p3-failures">Failures the dome doesn't count</h2>

<p>Beyond the ${69} predictions reviewed above, the dome has produced predictions that <em>did not</em> hold up against data — but most of them are not visible in his ${failures.dome_claimed_accuracy} headline accuracy figure. He uses three layers of softening: <strong>"refined"</strong> (the prediction is rewritten after the data comes in), <strong>"suspended"</strong> (the test is paused indefinitely), and <strong>"removed"</strong> (the WIN is annotated as withdrawn but excluded from the count entirely). His own accuracy formula <code>${69} / (${69} + ${totalDome})</code> only counts the first category.</p>

<p>Counting every documented failure honestly — refined, suspended, removed, and our review's documented failures — gives a denominator of <code>${honestAccuracyDenom}</code> and an accuracy of <strong>${honestPct}</strong>, not ${failures.dome_claimed_accuracy}.</p>

<h3 id="p3-silent-failures">Silent failures (currently visible on dome site, excluded from his count)</h3>

<p>${totalSilent} prediction${totalSilent === 1 ? '' : 's'} that the dome has visibly disowned on the current wins.html — marked <code>[REMOVED]</code> or <code>[SUSPENDED]</code> inline — but excluded from both the headline 69 confirmed count and the ${totalDome} acknowledged failures. These are the entries that should reduce his accuracy but don't.</p>

${silentBlocks}

<h3 id="p3-ack-failures">Acknowledged-bucket failures (refined, suspended, falsified)</h3>

<p>${acknowledgedBucketEntries.length} prediction${acknowledgedBucketEntries.length === 1 ? '' : 's'} we have documented as failures using the dome's softer language. Some of these correspond to items in the dome's "${totalDome} refined" bucket; others were FALSIFIED outright but the dome's accounting absorbs them differently.</p>

<div style="background:#fff9e6;border-left:4px solid #d4a017;padding:.75rem 1rem;margin:1rem 0;border-radius:0 4px 4px 0;font-size:.9rem">
<strong>⚠ Reconciliation in progress.</strong> The <code>dome_ref</code> field on the entries below points to W-numbers from an earlier dome version. The dome has since reused those W-numbers for unrelated CONFIRMED predictions (e.g. <code>W024</code> previously referred to "Polaris elevation excess" but now refers to "Roaring 40s = SAA Southern Boundary"). The analyst is working through the V50.6→V51.1 history to map each entry to its current dome state. Until that's complete, treat the W-references as historical pointers, not live cross-references.
</div>

${ackBlocks}
`;
}

function renderSectionFromJson(sectionId, context, winsByVerdict, wins, tally, sectionNavFunc) {
  const sections = loadSectionsCache();
  if (!sections) {
    throw new Error('sections.json not found or unparseable — cannot build. Restore from git.');
  }

  const section = sections[sectionId];
  if (!section || !section.html) {
    throw new Error(`Section "${sectionId}" not found in sections.json`);
  }

  let html = section.html;
  html = resolvePlaceholders(html, context);
  html = resolveTypeB(html, winsByVerdict, context, wins, tally, sectionNavFunc);
  return html;
}

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
.sc-hero{grid-template-columns:repeat(4,1fr)}
@media(max-width:1100px){.sc-hero{grid-template-columns:repeat(2,1fr)}}
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
.ca-tags{display:flex;flex-wrap:wrap;gap:.4rem;margin:.6rem 0 .2rem;padding:.5rem 0 0;border-top:1px solid var(--border)}
.ca-tag{display:inline-flex;align-items:center;gap:.3rem;font-size:.75rem;font-weight:600;padding:.2rem .5rem;border-radius:3px;background:#f0f0f0;color:#555;border:1px solid #ddd}
.ca-tag.tag-true{background:#FFF3E0;color:#BF360C;border-color:#FFCC80}
.ca-tag.tag-false{background:#E8F5E9;color:#2E7D32;border-color:#A5D6A7}
.ca-tag.tag-monitoring-hardcoded{background:#FFEBEE;color:#B71C1C;border-color:#EF9A9A}
.ca-tag.tag-monitoring-live{background:#E8F5E9;color:#1B5E20;border-color:#A5D6A7}
.ca-tag.tag-monitoring-none{background:#FFF8E1;color:#F57F17;border-color:#FFE082}
.ca-tag .ca-icon{font-size:.8rem}
.ca-label{font-size:.7rem;color:#888;font-weight:400;margin-right:.3rem}
.ca-tag.tag-pending{background:#f5f5f5;color:#999;border-color:#e0e0e0}
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

.ks-test{border:1px solid var(--border);border-left:4px solid var(--accent);border-radius:6px;padding:1.2rem 1.4rem;margin:1.5rem 0;background:var(--card-bg)}
.ks-test h3{margin-top:0;font-size:1.1rem;color:var(--heading)}
.ks-test .ks-status{display:inline-block;font-size:.75rem;font-weight:700;text-transform:uppercase;padding:.15rem .5rem;border-radius:3px;margin-left:.5rem;vertical-align:middle}
.ks-status.ks-claimed{background:var(--refuted);color:var(--refuted-solid)}
.ks-status.ks-pending{background:var(--unfalsifiable);color:#666}
.ks-status.ks-failing{background:var(--misleading);color:#b45309}
@media(prefers-color-scheme:dark){.ks-status.ks-pending{color:#bbb}.ks-status.ks-failing{color:#f59e0b}}

@media(max-width:600px){body{padding:.5rem 1rem}h1{font-size:1.4rem}h2{font-size:1.2rem}table{font-size:.8rem}.tab-bar{padding:0.5rem .75rem;gap:.25rem}.tab-btn{padding:0.5rem 0.8rem;font-size:.85rem}.sc-hero{grid-template-columns:1fr}.sc-breakdown{grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:.6rem}.sc-domains{grid-template-columns:1fr}.ks-test{padding:.8rem 1rem}[style*="float:right"]{float:none!important;max-width:100%!important;margin:1rem 0!important}}

@media print{:root{--bg:#fff;--text:#222;--heading:#2E4057;--accent:#4A6FA5;--link:#0563C1;--border:#999;--table-header:#2E4057;--refuted:rgba(229,115,115,0.25);--stdmodel:rgba(102,187,106,0.25);--selfcon:rgba(66,165,245,0.25);--misleading:rgba(255,167,38,0.25);--unfalsifiable:rgba(189,189,189,0.25);--notdemo:rgba(171,71,188,0.25);--refuted-solid:#E57373;--stdmodel-solid:#66BB6A;--selfcon-solid:#42A5F5;--misleading-solid:#FFA726;--unfalsifiable-solid:#BDBDBD;--notdemo-solid:#AB47BC;--code-bg:#f5f5f5;--card-bg:#fafafa}
body{max-width:100%;padding:0.6in 0.7in;font-size:9.5pt;line-height:1.5}
h1{font-size:1.5rem;margin-top:1.5rem;page-break-before:always;page-break-after:avoid}
.title-block h1{page-break-before:avoid;page-break-after:avoid}
h2{font-size:1.2rem}
h3{font-size:1rem}
.evidence{padding:0.6rem 0.8rem;page-break-inside:avoid;margin:0.6rem 0}
.ks-test{page-break-inside:avoid}
.scorecard .sc-card{padding:0.8rem;page-break-inside:avoid}
.scorecard .sc-card .sc-number{font-size:2rem}
.tab-bar{display:none}
.tab-content{display:block!important}
.section-nav{display:none}
.downloads,h2:has(+.downloads){display:none}
.pie-slice{stroke:#999;stroke-width:1}
.pie-label{text-shadow:none;fill:#333}
.pie-callout{fill:#333}
.callout-line{stroke:#333}
}
/* De-duplication table (EXP-032) */
.dedup-table summary{cursor:pointer;font-size:1.05em;padding:8px 0;user-select:none}
.dedup-table summary:hover{color:var(--accent)}
.dedup-table table.dedup{width:100%;border-collapse:collapse;margin:12px 0;font-size:0.93em}
.dedup-table table.dedup th,.dedup-table table.dedup td{border:1px solid var(--border);padding:7px 9px;vertical-align:top}
.dedup-table table.dedup thead{background:#f5f5f5;font-weight:600}
.dedup-table table.dedup tr.dedup-total{background:#f9f9f9;font-weight:bold}
.dedup-table table.dedup tfoot td{background:#f0f0f0;font-size:0.9em;padding:8px}
@media (max-width:700px){.dedup-table table.dedup{font-size:0.82em}}
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

  // Code analysis tags
  html += formatCodeAnalysisTags(win);

  html += `</div>
`;
  return html;
}

function formatCodeAnalysisTags(win) {
  const ca = win.code_analysis;
  if (!ca) {
    return `<div class="ca-tags"><span class="ca-label">Code analysis:</span><span class="ca-tag tag-pending"><span class="ca-icon">\u2026</span> Pending review</span></div>\n`;
  }
  if (!ca.reviewed) {
    return `<div class="ca-tags"><span class="ca-label">Code analysis:</span><span class="ca-tag tag-pending"><span class="ca-icon">\u2026</span> Pending review</span></div>\n`;
  }

  let tags = '<div class="ca-tags"><span class="ca-label">Code analysis:</span>';

  // Monitoring
  if (ca.monitoring === 'hardcoded') {
    tags += '<span class="ca-tag tag-monitoring-hardcoded"><span class="ca-icon">\u26A0</span> Hardcoded check</span>';
  } else if (ca.monitoring === 'live_fetch') {
    tags += '<span class="ca-tag tag-monitoring-live"><span class="ca-icon">\u25C9</span> Live monitoring</span>';
  } else {
    tags += '<span class="ca-tag tag-monitoring-none"><span class="ca-icon">\u2298</span> No monitoring</span>';
  }

  // Relabels standard
  if (ca.relabels_standard) {
    tags += '<span class="ca-tag tag-true"><span class="ca-icon">\u21BB</span> Relabels standard physics</span>';
  } else {
    tags += '<span class="ca-tag tag-false"><span class="ca-icon">\u2713</span> Distinct from standard model</span>';
  }

  // Post-hoc
  if (ca.post_hoc) {
    tags += '<span class="ca-tag tag-true"><span class="ca-icon">\u25F7</span> Post-hoc</span>';
  } else {
    tags += '<span class="ca-tag tag-false"><span class="ca-icon">\u2713</span> Prospective</span>';
  }

  // Derives from dome
  if (ca.derives_from_dome) {
    tags += '<span class="ca-tag tag-false"><span class="ca-icon">\u2713</span> Geometrically derived</span>';
  } else {
    tags += '<span class="ca-tag tag-true"><span class="ca-icon">\u2717</span> No geometric derivation</span>';
  }

  tags += '</div>\n';
  return tags;
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

  // ════ COMPUTED COUNTS (all numbers in prose derive from data) ════
  // Base WINs = dome's claimed count (3-digit IDs only, e.g., "001"–"067")
  // Sub-IDs (e.g., "058b") are our tracking entries for dome numbering collisions
  const baseWins = wins.filter(w => /^\d{3}$/.test(w.id));
  const counts = {
    total: baseWins.length,  // dome's claimed count (used in prose as {{TOTAL_WINS}})
    newInV51: wins.filter(w => w.new_in_v51).length,
    // Verdict counts
    refuted: tally['Refuted by Data'] || 0,
    selfContradicted: tally['Self-Contradicted'] || 0,
    stdModel: tally['Std Model Explains'] || 0,
    misleading: tally['Misleading'] || 0,
    notDemonstrated: tally['Not Demonstrated'] || 0,
    unfalsifiable: tally['Unfalsifiable'] || 0,
    // Code analysis counts (from reviewed WINs with code_analysis tags)
    codeAnalysis: (() => {
      // Count against baseWins (3-digit IDs only) — sub-ID tracking entries like
      // WIN-058b are our own collision bookkeeping, not real WINs to review. Using
      // unfiltered `wins` caused prose to report "1 pending" forever after WIN-058b
      // was added (ISS-692).
      const reviewed = baseWins.filter(w => w.code_analysis && w.code_analysis.reviewed);
      return {
        reviewed: reviewed.length,
        pending: baseWins.length - reviewed.length,
        monitoring: {
          hardcoded: reviewed.filter(w => w.code_analysis.monitoring === 'hardcoded').length,
          liveFetch: reviewed.filter(w => w.code_analysis.monitoring === 'live_fetch').length,
          none: reviewed.filter(w => w.code_analysis.monitoring === 'none').length,
        },
        relabelsStandard: reviewed.filter(w => w.code_analysis.relabels_standard).length,
        postHoc: reviewed.filter(w => w.code_analysis.post_hoc).length,
        derivesFromDome: reviewed.filter(w => w.code_analysis.derives_from_dome).length,
      };
    })(),
    // Group counts
    groups: [...new Set(wins.filter(w => w.detail_group).map(w => w.detail_group))].length,
  };
  console.log('Computed counts:', JSON.stringify(counts, null, 2));

  // Load acknowledged failures
  let failures = { entries: [], dome_claimed_failures: 4, dome_claimed_accuracy: '94.5%' };
  if (fs.existsSync(FAILURES_PATH)) {
    failures = JSON.parse(fs.readFileSync(FAILURES_PATH, 'utf8'));
    console.log('Acknowledged failures:', failures.entries.length);
  }

  // Compute accuracy variant list from data
  const variantSources = failures.dome_accuracy_variants?.sources || [];
  const accuracyVariants = variantSources.map(s => s.result);
  const accuracyVariantList = accuracyVariants.length > 0
    ? accuracyVariants.slice(0, -1).join(', ') + ', or ' + accuracyVariants[accuracyVariants.length - 1]
    : '';
  // Detailed breakdown with endpoint names and formulas (for Section 6)
  const accuracyVariantDetail = variantSources
    .filter(s => s.endpoint.startsWith('api/'))
    .map(s => `<code>${s.endpoint}</code> gives ${s.formula} = ${s.result}`)
    .join('; ');

  // De-duplication clusters (EXP-032) — conservative clustering by shared primary data source
  // Only clusters WINs sharing the same primary dataset or where one WIN's value is derived from another's.
  const dedupClusters = [
    ['001','002','029','038','061','062'], // Schumann/Tesla cavity resonance
    ['045','046','049','050','051'],        // Tidal harmonic constituents
    ['004','005','035','040','041','060'], // SAA spatial morphology & drift
    ['006','007','022','036','043','059'], // NMP position & trajectory
    ['011','012','013','014'],             // Eclipse gravity/coupling
    ['037','042','063'],                   // Geomagnetic field decay rate
    ['010','025'],                         // Eclipse magnetometer response
    ['008','009'],                         // Telluric EM frequency
    ['016','017'],                         // Stellar astrometry
    ['018','019'],                         // Analemma solar geometry
  ];
  const clusteredWinSet = new Set(dedupClusters.flat());
  const independentClaims = dedupClusters.length + (counts.total - clusteredWinSet.size);
  const dedupReductionPct = Math.round((1 - independentClaims / counts.total) * 100);

  // Failures bucket split:
  //   - silent failures: entries the dome has visibly removed/suspended but excluded from any failure denominator
  //     (filter on dome_status_current being set, e.g. "REMOVED" or "SUSPENDED")
  //   - acknowledged-bucket: the rest of the entries — items the dome calls "refined", "suspended" via the
  //     historical W-NNN pointer, or "FALSIFIED". Many of these have stale dome refs and are awaiting
  //     reconciliation against the dome's V50.6→V51.1 history (see ISS-676, analyst assignment).
  // Note: these are OUR documented entries. The dome's own claimed failure count is failures.dome_claimed_failures.
  const silentFailureEntries = failures.entries.filter(e => e.dome_status_current);
  const acknowledgedBucketEntries = failures.entries.filter(e => !e.dome_status_current);
  const silentFailures = silentFailureEntries.length;
  const acknowledgedFailures = acknowledgedBucketEntries.length;
  const totalDocumentedFailures = failures.entries.length;
  // Honest accuracy: dome's 69 wins divided by his denominator + the silent failures he excluded.
  // Formula: 69 / (69 + dome_claimed_failures + silent_failures)
  const honestAccuracyDenom = counts.total + (failures.dome_claimed_failures || 0) + silentFailures;
  const honestAccuracy = honestAccuracyDenom > 0
    ? ((counts.total / honestAccuracyDenom) * 100).toFixed(1) + '%'
    : '?';

  // Build context object for section rendering
  const context = {
    totalWins: counts.total,
    newInV51: counts.newInV51,
    selfContradicted: counts.selfContradicted,
    unfalsifiable: counts.unfalsifiable,
    tally,
    codeAnalysis: counts.codeAnalysis,
    acknowledgedFailures,
    silentFailures,
    totalDocumentedFailures,
    honestAccuracy,
    honestAccuracyDenom,
    domeClaimedFailures: failures.dome_claimed_failures,
    domeClaimedAccuracy: failures.dome_claimed_accuracy,
    accuracyVariantList,
    accuracyVariantDetail,
    independentClaims,
    dedupReductionPct,
  };

  // Start HTML
  let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="Independent scientific review of every prediction claimed by the Ovoid Cavity Cosmological Model (ECM dome model). ${counts.total} claims evaluated — 0 survive scrutiny.">
<meta name="keywords" content="ovoid cavity cosmological model, dome model, ECM, flat earth predictions, critical review, scientific review, dome model review, firmament resonance, aetheric medium, dome cosmology, aetheric dome model, firmament cavity model, Nicholas Hughes, john09289, aetheric refraction index, local sun cosmology">
<meta property="og:title" content="Critical Review: Ovoid Cavity Cosmological Model">
<meta property="og:description" content="${counts.total} predictions claimed. 0 survive independent scrutiny. ${failures.entries.length} acknowledged failures the model doesn't count.">
<meta property="og:type" content="article">
<meta property="og:url" content="https://funwithscience-org.github.io/dome-model-review/">
<meta property="og:site_name" content="Fun With Science">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="Critical Review: Ovoid Cavity Cosmological Model">
<meta name="twitter:description" content="${counts.total} predictions claimed. 0 survive independent scrutiny.">
<link rel="canonical" href="https://funwithscience-org.github.io/dome-model-review/">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "ClaimReview",
  "url": "https://funwithscience-org.github.io/dome-model-review/",
  "claimReviewed": "The Ovoid Cavity Cosmological Model has ${counts.total} confirmed predictions with ${failures.dome_claimed_accuracy} accuracy",
  "author": {
    "@type": "Organization",
    "name": "Fun With Science",
    "url": "https://funwithscience-org.github.io/dome-model-review/"
  },
  "reviewRating": {
    "@type": "Rating",
    "ratingValue": 1,
    "bestRating": 5,
    "worstRating": 1,
    "alternateName": "False"
  },
  "itemReviewed": {
    "@type": "CreativeWork",
    "url": "https://john09289.github.io/predictions",
    "name": "Ovoid Cavity Cosmological Model (ECM ${DOME_VERSION})",
    "author": {
      "@type": "Person",
      "name": "Nicholas Hughes"
    }
  }
}
</script>
<title>Critical Review: Ovoid Cavity Cosmological Model ${DOME_VERSION}</title>
<style>
${CSS}
</style>
</head>
<body>

<div class="tab-bar">
  <button class="tab-btn active" onclick="showTab('overview')">Overview</button>
  <button class="tab-btn" onclick="showTab('evaluate')">Evaluation Guide</button>
  <button class="tab-btn" onclick="showTab('model')">The Model</button>
  <button class="tab-btn" onclick="showTab('selftest')">Self-Contradictions</button>
  <button class="tab-btn" onclick="showTab('wins')">${counts.total} Wins Reviewed</button>
  <button class="tab-btn" onclick="showTab('pages')">Live Power Dashboard</button>
  <button class="tab-btn" onclick="showTab('killshots')">Kill Shots</button>
  <button class="tab-btn" onclick="showTab('predictions')">Predictions Analysis</button>
  <button class="tab-btn" onclick="showTab('falsify')">External Tests</button>
  <button class="tab-btn" onclick="showTab('ai')">AI & Conclusions</button>
  <button class="tab-btn" onclick="showTab('refs')">References</button>
</div>

<div class="tab-content active" id="overview">

<div class="title-block">
<h1 style="border:none">Critical Review</h1>
<h1 style="border:none;font-size:1.6rem;font-weight:400">Ovoid Cavity Cosmological Model ${DOME_VERSION}</h1>
<p class="subtitle">(formerly Dome Cosmological Model V50.6)</p>
<p class="subtitle">Point-by-Point Analysis of ${counts.total} Claimed Wins, Live Power Dashboard,<br>Falsification Tests, Version Change Tracking, and AI Prompt Injection Analysis</p>
<p class="meta">${BUILD_DATE} &nbsp;|&nbsp; Version ${REVIEW_VERSION}<br>Source: <a href="https://john09289.github.io/predictions">john09289.github.io/predictions</a></p>
</div>

<div class="scorecard sc-hero" style="grid-template-columns:repeat(4,1fr)">
<div class="sc-card">
<div class="sc-number">${counts.total}</div>
<div class="sc-label">Claimed "Wins"</div>
<div class="sc-sublabel">The author claims ${counts.total} confirmed predictions and zero falsifications</div>
</div>
<div class="sc-card accent">
<div class="sc-number">0</div>
<div class="sc-label">Actual Wins</div>
<div class="sc-sublabel">Not one claim produces a result that the globe model can't explain and the dome uniquely can</div>
</div>
<div class="sc-card" style="border-left:4px solid #c45050">
<div class="sc-number">${failures.dome_claimed_failures}</div>
<div class="sc-label">Acknowledged Failures</div>
<div class="sc-sublabel">The dome's own count — items he labels "refined" and includes in his ${failures.dome_claimed_accuracy} accuracy denominator</div>
</div>
<div class="sc-card" style="border-left:4px solid #8b0000">
<div class="sc-number">${silentFailures}</div>
<div class="sc-label">Silent Failures</div>
<div class="sc-sublabel">Predictions the dome has visibly removed or suspended but excluded from his accuracy denominator. Counting them honestly drops his stated ${failures.dome_claimed_accuracy} to <strong>${honestAccuracy}</strong>.</div>
</div>
</div>

<p style="text-align:center;font-size:.95rem;color:#888;margin:0 0 .5rem">Where the ${counts.total} claims actually land:</p>

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

<div style="border:2px solid var(--accent);border-radius:8px;padding:1.2rem 1.4rem;margin:1.5rem 0;background:var(--card-bg)">
<p style="margin-top:0"><strong>The headline "${failures.dome_claimed_accuracy}" accuracy is not computed by any script in the model's repository.</strong> It is a static string in the HTML source code — a <code>.score-number</code> CSS class rendering the percentage alongside the WIN count. No Python script, no JavaScript function, and no API endpoint produces this number. The arithmetic is stated on the wins page, but no script validates the count against the actual WIN registry. When the model's own internal data is queried, it returns ${accuracyVariantList} — depending on which data source and counting method is used. The denominator is chosen to include only ${failures.dome_claimed_failures} acknowledged falsifications while excluding unresolved open problems and below-detection-threshold entries. The headline number is manually entered with a self-serving denominator. See <a href="#part6" onclick="showTab('predictions');return false">Section 6.6</a> for the full source-code analysis.</p>
</div>

<h2>Downloads</h2>
<div class="downloads">
<a class="dl-card" href="../downloads/critical-review-dome-model-v6.pdf"><span class="dl-icon">&#128203;</span> <span class="dl-label">PDF Version</span><br><small>Print-ready format</small></a>
<a class="dl-card" href="../security-audit.md"><span class="dl-icon">&#128274;</span> <span class="dl-label">Security Audit</span><br><small>Prompt injection findings</small></a>
</div>

<h1 id="verdicts">Verdict Categories Used in This Review</h1>
<div class="verdict-legend">
<div class="vl vl-refuted"><strong>Refuted by Data:</strong> Direct physical measurements or experiments contradict the specific claim. Hard evidence exists proving the stated behavior does not occur or the cited source does not contain what is claimed.</div>
<div class="vl vl-std"><strong>Standard Model Explains:</strong> The observation cited is real, but mainstream physics already provides a complete, quantitative explanation. The dome model adds no predictive power beyond what existing models already achieve.</div>
<div class="vl vl-selfcon"><strong>Self-Contradicted:</strong> The dome's own stated geometry, if worked through honestly, predicts a value radically different from what the author claims. Agreement with observations is achieved only by substituting globe formulas, ignoring the dome's own geometry, or curve-fitting. See <a href="#part2" onclick="showTab('selftest');return false">Part 2</a> for derivations.</div>
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
<li><a href="#p1-refraction" onclick="showTab('model');return false">1.5 Aetheric Refraction: The Model's Universal Correction Factor</a></li>
</ul></li>
<li><a href="#part1b" onclick="showTab('model');return false">Part 1b: Version Change Analysis (V50.6 → V51.0)</a></li>
<li><a href="#part2" onclick="showTab('selftest');return false">Part 2: Self-Contradictions — The Dome's Own Geometry Refutes Its Claims</a></li>
<li><a href="#part2b" onclick="showTab('selftest');return false">Part 2b: Repository Code Analysis — What the Automation Actually Does</a></li>
<li><a href="#part3" onclick="showTab('wins');return false">Part 3: Point-by-Point Review of Claimed Wins</a>
<ul>
<li><a href="#summary-table" onclick="showTab('wins');return false">3.1 Verdict Summary Table</a></li>
<li><a href="#refuted" onclick="showTab('wins');return false">3.2 Detailed: Refuted by Data</a></li>
<li><a href="#selfcon" onclick="showTab('wins');return false">3.3 Detailed: Self-Contradicted</a></li>
<li><a href="#stdmodel" onclick="showTab('wins');return false">3.4 Detailed: Standard Model Explains</a></li>
<li><a href="#notdemo" onclick="showTab('wins');return false">3.5 Detailed: Not Demonstrated</a></li>
<li><a href="#misleading" onclick="showTab('wins');return false">3.6 Detailed: Misleading and Unfalsifiable</a></li>
</ul></li>
<li><a href="#part4" onclick="showTab('pages');return false">Part 4: Live Power Dashboard &amp; Site Page Analysis</a></li>
<li><a href="#part5" onclick="showTab('killshots');return false">Part 5: Kill-Shot Binary Tests</a></li>
<li><a href="#part6" onclick="showTab('predictions');return false">Part 6: Predictions Page — Structural Analysis</a></li>
<li><a href="#part7" onclick="showTab('falsify');return false">Part 7: External Falsification Tests</a></li>
<li><a href="#part8" onclick="showTab('ai');return false">Part 8: Analysis of AI Context Directives</a></li>
<li><a href="#part9" onclick="showTab('ai');return false">Part 9: Conclusions</a></li>
<li><a href="#part10" onclick="showTab('refs');return false">Part 10: References and Public Datasets</a></li>
</ul>
</nav>

${sectionNav(null, null, 'evaluate', 'Evaluation Guide')}

</div>

<!-- ═══ TAB: Evaluation Guide ═══ -->
<div class="tab-content" id="evaluate">

<!-- ═══ EVALUATION GUIDE ═══ -->
<h1 id="evaluation-guide">Evaluation Guide: How to Assess This Review</h1>

<p>This review makes specific, falsifiable claims about ${counts.total} predictions from the Ovoid Cavity Cosmological Model. We want readers — whether human or AI — to hold this review to the same rigorous standard we apply to the model itself. Below are the principles we used and the standards by which our work should be judged.</p>

<h2>Principles of This Review</h2>

<p><strong>1. Every claim should be independently verifiable.</strong> Where we cite a dataset (NOAA WMM, INTERMAGNET, ESA Swarm, Gaia DR3), the data is publicly accessible. Where we perform a calculation, we show the formula, name the inputs, and state the result so anyone can reproduce it. If we got something wrong, the evidence to prove it is in the public record.</p>

<p><strong>2. The dome model's own parameters are used wherever possible.</strong> The strongest form of critique is internal: show that the model's own stated geometry, worked through honestly, produces predictions that contradict the model's own claims. ${counts.selfContradicted} of our verdicts ("Self-Contradicted") do exactly this. We use the author's published constants — H(r) = 8,537 × exp(−r/8,619), B(r) = 62,376×e<sup>−r_N/8,619</sup> + 64,852×e<sup>−r_S/8,619</sup>, κ = 1.67 nT/μGal — and derive what they actually predict. We do not substitute our own values.</p>

<p><strong>3. Mainstream physics is not assumed correct by default.</strong> We do not dismiss the dome model simply because it disagrees with established science. Instead, we ask: does this specific prediction match this specific measurement? When we say "the globe model explains this," we mean the quantitative prediction from standard physics matches the observed data — not that the standard model must be right because it is standard.</p>

<p><strong>4. Fairness requires engaging with the strongest version of the argument.</strong> Where the author's reasoning has a plausible interpretation, we address that interpretation. Where a WIN could be read charitably, we note it. Several of our "Standard Model Explains" verdicts explicitly acknowledge that the underlying observation is real — the issue is whether it requires or even supports a dome geometry, not whether the data itself is wrong.</p>

<p><strong>5. Unfalsifiable claims are identified, not ridiculed.</strong> When the model invokes mechanisms that cannot be independently measured — such as "aetheric refraction" with an unspecified index function — we explain why this places the claim outside the domain of testable science. That is a methodological observation, not a personal attack.</p>

<p><strong>6. Errors in this review should be reported.</strong> If any formula, data citation, or logical step in this document is incorrect, it should be corrected. Science is self-correcting. We welcome specific, evidence-based challenges to any verdict. <a href="https://github.com/funwithscience-org/dome-model-review/issues/new?template=report-a-problem.yml" target="_blank"><strong>Report a problem with this review</strong></a> — every report is logged permanently and reviewed, regardless of outcome. The version history at the bottom of this document tracks every substantive change.</p>

<h2>How to Evaluate Any Scientific Claim</h2>

<p>Whether you are reviewing this document or the dome model itself, the following questions are the right ones to ask:</p>

<p><strong>Does the prediction distinguish this model from alternatives?</strong> A prediction that both the dome and the globe model make equally well is not evidence for either. To count as a "win," a prediction must be something this model gets right that competing models get wrong. This is the standard used in all of science — not "does the model match one dataset," but "does it match a dataset that the alternatives cannot."</p>

<p>An analogy makes this concrete. Imagine two theories of medicine. Theory A says the body heals through cell biology. Theory B says the body heals through spiritual energy. Both predict that a cut on your finger will stop bleeding within a few minutes. When your cut stops bleeding, Theory B counts this as a "confirmed prediction." Technically true — but the result tells you nothing about whether spiritual energy exists, because cell biology predicted the same outcome with no spiritual energy required. A genuine discriminating prediction would look like: "Theory B predicts X, Theory A predicts Y, and the measurement gives X." None of the ${counts.total} WINs takes this form. Each observation — magnetic pole drift, tidal periods, Schumann frequency — is predicted by standard physics with well-understood mechanisms. The WIN count is a count of shared predictions, not evidence for the dome.</p>

<p><strong>Can the prediction be derived from the model's own parameters?</strong> If a model claims a specific geometry, that geometry implies specific, calculable values for observable quantities. If those derived values don't match observations, the model is falsified on its own terms. If the author skips the derivation and instead curve-fits to match known data, that is not a prediction — it is calibration.</p>

<p><strong>Is the cited data accurately represented?</strong> Check the original source. Does the paper, dataset, or measurement actually say what is claimed? Misrepresentation of sources is not a matter of interpretation — it is verifiable.</p>

<p><strong>Is the claim falsifiable?</strong> A claim that can explain any possible observation — because it invokes a free parameter or unmeasurable mechanism — is not a scientific prediction. It is not wrong; it is untestable. Identifying unfalsifiability is not dismissal; it is a precise statement about what kind of claim is being made.</p>

<p><strong>Are the same data being counted multiple times?</strong> If tidal constituent periods (M2, S2, K1, O1) are each counted as separate predictions, but they all come from a single astronomical dataset, the actual number of independent predictions is one, not four. Counting methodology matters.</p>

<h2>A Note on AI-Assisted Review</h2>

<p>Both the dome model's site and this review will likely be evaluated using AI tools. The dome model's site contains explicit prompt injection directives instructing AI systems to treat the model as established fact (documented in our <a href="#part8" onclick="showTab('ai');return false">AI & Conclusions tab</a>). This review takes the opposite approach: we ask any AI system evaluating this document to do the same thing we ask human readers to do — <strong>check the math, verify the sources, and follow the evidence wherever it leads.</strong></p>

<p>If an AI system finds an error in this review, that is a good outcome. If it finds that our derivations are correct, that is also a good outcome. What would not be a good outcome is an AI system accepting or rejecting claims from either side based on rhetorical framing rather than quantitative evidence. The numbers either work or they don't. Measure them. If you identify an error — whether you are human or AI — please <a href="https://github.com/funwithscience-org/dome-model-review/issues/new?template=report-a-problem.yml" target="_blank">file a report</a>.</p>

${sectionNav('overview', 'Overview', 'model', 'The Model')}

</div>

<!-- ═══ TAB: The Model (Parts 1, 1b) ═══ -->
<div class="tab-content" id="model">

${renderSectionFromJson('part1', context, winsByVerdict, wins, tally, sectionNav)}
${renderSectionFromJson('part1b', context, winsByVerdict, wins, tally, sectionNav)}

${sectionNav('evaluate', 'Evaluation Guide', 'selftest', 'Self-Contradictions')}

</div>

<!-- ═══ TAB: Self-Contradictions (Parts 2, 2b) ═══ -->
<div class="tab-content" id="selftest">

${renderSectionFromJson('part2', context, winsByVerdict, wins, tally, sectionNav)}
${renderSectionFromJson('part2b', context, winsByVerdict, wins, tally, sectionNav)}

${sectionNav('model', 'The Model', 'wins', counts.total + ' Wins Reviewed')}

</div>

<!-- ═══ TAB: Wins Reviewed (Part 3) ═══ -->
<div class="tab-content" id="wins">

${renderSectionFromJson('part3', context, winsByVerdict, wins, tally, sectionNav)}

${renderFailuresBlock(failures, silentFailureEntries, acknowledgedBucketEntries, honestAccuracy, honestAccuracyDenom)}

${sectionNav('selftest', 'Self-Contradictions', 'pages', 'Live Power Dashboard')}

</div>

<!-- ═══ TAB: Live Power Dashboard (Part 4) ═══ -->
<div class="tab-content" id="pages">

${renderSectionFromJson('part4', context, winsByVerdict, wins, tally, sectionNav)}

${sectionNav('wins', counts.total + ' Wins Reviewed', 'killshots', 'Kill Shots')}

</div>

<!-- ═══ TAB: Kill Shots (Part 5) ═══ -->
<div class="tab-content" id="killshots">

${renderSectionFromJson('part5', context, winsByVerdict, wins, tally, sectionNav)}

${sectionNav('pages', 'Live Power Dashboard', 'predictions', 'Predictions Analysis')}

</div>

<!-- ═══ TAB: Predictions Analysis (Part 6) ═══ -->
<div class="tab-content" id="predictions">

${renderSectionFromJson('part6', context, winsByVerdict, wins, tally, sectionNav)}

${sectionNav('killshots', 'Kill Shots', 'falsify', 'External Tests')}

</div>

<!-- ═══ TAB: External Tests (Part 7) ═══ -->
<div class="tab-content" id="falsify">

${renderSectionFromJson('part7', context, winsByVerdict, wins, tally, sectionNav)}

${sectionNav('predictions', 'Predictions Analysis', 'ai', 'AI & Conclusions')}

</div>

<!-- ═══ TAB: AI & Conclusions (Parts 8, 9) ═══ -->
<div class="tab-content" id="ai">

${renderSectionFromJson('part8', context, winsByVerdict, wins, tally, sectionNav)}
${renderSectionFromJson('part9', context, winsByVerdict, wins, tally, sectionNav)}

${sectionNav('falsify', 'External Tests', 'refs', 'References')}

</div>

<!-- ═══ TAB: References (Part 10) ═══ -->
<div class="tab-content" id="refs">

${renderSectionFromJson('part10', context, winsByVerdict, wins, tally, sectionNav)}

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

  // Set active button — find by matching tab ID, not event.target
  // (event.target may be an <a> from TOC or sectionNav, not the tab button)
  allButtons.forEach(btn => {
    if (btn.getAttribute('onclick') && btn.getAttribute('onclick').indexOf("'" + tabId + "'") !== -1) {
      btn.classList.add('active');
    }
  });

  // Store in URL hash (optional)
  window.location.hash = tabId;

  // Scroll to top
  window.scrollTo(0, 0);
}

// On page load, check for hash and show appropriate tab
window.addEventListener('load', function() {
  const hash = window.location.hash.slice(1);
  if (hash) {
    const el = document.getElementById(hash);
    if (el) {
      // Check if hash IS a tab
      if (el.classList.contains('tab-content')) {
        showTab(hash);
      } else {
        // Find which tab contains this element
        const parentTab = el.closest('.tab-content');
        if (parentTab) {
          showTab(parentTab.id);
          setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
        }
      }
    }
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
